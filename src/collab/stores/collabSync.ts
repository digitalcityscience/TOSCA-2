import { acceptHMRUpdate, defineStore } from "pinia";
import { onScopeDispose, ref, watch } from "vue";
import { BroadcastCollabChannel, COLLAB_CHANNEL_NAME, type CollabChannel } from "../helpers/collabChannel";
import { reportDeveloperError } from "@helpers/userFacingError";
import {
    useCollabSessionStore,
    type CollabBaseCityState,
    type CollabCalibrationState,
    type CollabTableRenderState,
    type CollabTrackedBuildingsState,
    type CollabTrackingObjectState,
} from "./collabSession";

/**
 * The broadcastable slice of {@link useCollabSessionStore} (plan §10/§11): every slice except
 * `view`, which ticket 04 pins as per-window/local-only and never broadcast.
 */
export interface CollabSessionSnapshot {
    base: CollabBaseCityState;
    tracking: Record<string, CollabTrackingObjectState>;
    tableRender: CollabTableRenderState;
    calibration: CollabCalibrationState;
    trackedBuildings: CollabTrackedBuildingsState;
}

const SNAPSHOT_SLICES = [
    "base",
    "tracking",
    "tableRender",
    "calibration",
    "trackedBuildings",
] as const;
type SnapshotSlice = (typeof SNAPSHOT_SLICES)[number];

/**
 * Control → Table wire messages (plan §11), plus one Table → Control message (grilling doc Q1).
 * `patch` carries only the slices that changed. `tableStatus` is deliberately NOT one of
 * {@link SNAPSHOT_SLICES}/{@link CollabSessionSnapshot} — it flows the opposite direction (Table
 * publishes, Control subscribes) and is never written into `session.calibration`, since that
 * slice's own contract says Control is its only writer. Control forwards a received `tableStatus`
 * into a Control-local ref in `collabTrackingRender.ts`, next to `mapCalibrationMarkerHealth`.
 */
export type CollabSyncMessage =
    | { kind: "hello" }
    | { kind: "snapshot"; version: number; state: CollabSessionSnapshot }
    | { kind: "patch"; version: number; state: Partial<CollabSessionSnapshot> }
    | { kind: "heartbeat"; version: number }
    | { kind: "tableStatus"; ready: boolean; markerPositions: Record<number, [number, number]> };

/** localStorage key a (re)opened Table reads before it has heard from Control (plan §11). */
export const COLLAB_SNAPSHOT_STORAGE_KEY = "tosca-collab-session-snapshot";

/** Table shows "disconnected — recalibrate" once this many ms pass with no message (plan §11). */
const HEARTBEAT_INTERVAL_MS = 2000;
const DISCONNECT_THRESHOLD_MS = 5000;

/**
 * One clone function per slice — the single place each slice's copy semantics live, shared by
 * {@link currentSnapshot} (session → snapshot) and {@link applySnapshot} (snapshot → session) so
 * a shape change touches one function instead of both directions independently (plan §10/§11).
 */
function cloneBase(value: CollabBaseCityState): CollabBaseCityState {
    return { loaded: value.loaded, objects: [...value.objects] };
}

function cloneTracking(value: Record<string, CollabTrackingObjectState>): Record<string, CollabTrackingObjectState> {
    return { ...value };
}

function cloneTableRender(value: CollabTableRenderState): CollabTableRenderState {
    return { visibleLayerIds: [...value.visibleLayerIds] };
}

function cloneCalibration(value: CollabCalibrationState): CollabCalibrationState {
    return {
        rotationOffsetDeg: value.rotationOffsetDeg,
        aoi: value.aoi === null ? null : { corners: [...value.aoi.corners] as typeof value.aoi.corners },
        phase: value.phase,
        revision: value.revision,
        mapCalibrationMarkerIdsSeen: [...value.mapCalibrationMarkerIdsSeen],
        resetPositionsToken: value.resetPositionsToken,
    };
}

function cloneTrackedBuildings(value: CollabTrackedBuildingsState): CollabTrackedBuildingsState {
    return {
        footprints: { type: "FeatureCollection", features: [...value.footprints.features] },
        ids: { type: "FeatureCollection", features: [...value.ids.features] },
        registrationTarget: {
            type: "FeatureCollection",
            features: [...value.registrationTarget.features],
        },
        revision: value.revision,
    };
}

function slicesEqual(a: CollabSessionSnapshot, slice: SnapshotSlice, b: CollabSessionSnapshot): boolean {
    return JSON.stringify(a[slice]) === JSON.stringify(b[slice]);
}

function diffSnapshot(previous: CollabSessionSnapshot | undefined, next: CollabSessionSnapshot): Partial<CollabSessionSnapshot> {
    const patch: Partial<CollabSessionSnapshot> = {};
    for (const slice of SNAPSHOT_SLICES) {
        if (previous === undefined || !slicesEqual(previous, slice, next)) {
            (patch as Record<SnapshotSlice, unknown>)[slice] = next[slice];
        }
    }
    return patch;
}

function readStoredSnapshot(): CollabSessionSnapshot | undefined {
    try {
        const raw = localStorage.getItem(COLLAB_SNAPSHOT_STORAGE_KEY);
        return raw === null ? undefined : (JSON.parse(raw) as CollabSessionSnapshot);
    } catch (error) {
        reportDeveloperError("Reading Collab session snapshot from localStorage", error);
        return undefined;
    }
}

function writeStoredSnapshot(snapshot: CollabSessionSnapshot): void {
    try {
        localStorage.setItem(COLLAB_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot));
    } catch (error) {
        // Best-effort persistence only; a full Table resync still arrives over the channel.
        reportDeveloperError("Writing Collab session snapshot to localStorage", error);
    }
}

/**
 * Drives the Control ⇄ Table sync over a {@link CollabChannel} (plan §11): Control publishes a
 * versioned snapshot + incremental patches and mirrors the latest snapshot to `localStorage`;
 * Table applies them, recovers from `localStorage` on (re)load, and reports `connected` so the UI
 * can show "disconnected — recalibrate" once the heartbeat goes quiet. Never mutates `view`
 * (per-window/local-only, plan §10).
 */
export const useCollabSyncStore = defineStore("collabSync", () => {
    const session = useCollabSessionStore();
    const connected = ref(true);

    let channel: CollabChannel<CollabSyncMessage> | undefined;
    let unsubscribe: (() => void) | undefined;
    let stopWatch: (() => void) | undefined;
    let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
    let disconnectTimer: ReturnType<typeof setInterval> | undefined;
    let lastPublished: CollabSessionSnapshot | undefined;
    let lastMessageAt = Date.now();
    let version = 0;
    /** Control-side listeners for an incoming `tableStatus` message (grilling doc Q1) — registered by `collabTrackingRender.ts`. */
    const tableStatusListeners: Array<(ready: boolean, markerPositions: Record<number, [number, number]>) => void> = [];

    function currentSnapshot(): CollabSessionSnapshot {
        return {
            base: cloneBase(session.base),
            tracking: cloneTracking(session.tracking),
            tableRender: cloneTableRender(session.tableRender),
            calibration: cloneCalibration(session.calibration),
            trackedBuildings: cloneTrackedBuildings(session.trackedBuildings),
        };
    }

    function applySnapshot(snapshot: CollabSessionSnapshot): void {
        Object.assign(session.base, cloneBase(snapshot.base));
        for (const key of Object.keys(session.tracking)) {
            delete session.tracking[key];
        }
        Object.assign(session.tracking, cloneTracking(snapshot.tracking));
        Object.assign(session.tableRender, cloneTableRender(snapshot.tableRender));
        Object.assign(session.calibration, cloneCalibration(snapshot.calibration));
        Object.assign(session.trackedBuildings, cloneTrackedBuildings(snapshot.trackedBuildings));
    }

    function applyPatch(patch: Partial<CollabSessionSnapshot>): void {
        const merged = currentSnapshot();
        applySnapshot({ ...merged, ...patch });
    }

    /** Control side: publish an initial snapshot, then a versioned patch on every session change, plus a heartbeat. */
    function startAsControl(transport: CollabChannel<CollabSyncMessage> = new BroadcastCollabChannel(COLLAB_CHANNEL_NAME)): void {
        stop();
        channel = transport;

        function publishFullSnapshot(): void {
            const snapshot = currentSnapshot();
            version += 1;
            lastPublished = snapshot;
            channel?.publish({ kind: "snapshot", version, state: snapshot });
            writeStoredSnapshot(snapshot);
        }

        unsubscribe = channel.subscribe((message) => {
            if (message.kind === "hello") {
                publishFullSnapshot();
            } else if (message.kind === "tableStatus") {
                for (const listener of tableStatusListeners) {
                    listener(message.ready, message.markerPositions);
                }
            }
        });

        publishFullSnapshot();

        stopWatch = watch(currentSnapshot, (snapshot) => {
            const patch = diffSnapshot(lastPublished, snapshot);
            if (Object.keys(patch).length === 0) {
                return;
            }
            version += 1;
            lastPublished = snapshot;
            channel?.publish({ kind: "patch", version, state: patch });
            writeStoredSnapshot(snapshot);
        });

        heartbeatTimer = setInterval(() => {
            channel?.publish({ kind: "heartbeat", version });
        }, HEARTBEAT_INTERVAL_MS);
    }

    /** Table side: recover from `localStorage`, subscribe, say hello, and watch the heartbeat. */
    function startAsTable(transport: CollabChannel<CollabSyncMessage> = new BroadcastCollabChannel(COLLAB_CHANNEL_NAME)): void {
        stop();
        channel = transport;

        const stored = readStoredSnapshot();
        if (stored !== undefined) {
            applySnapshot(stored);
        }

        lastMessageAt = Date.now();
        connected.value = true;

        unsubscribe = channel.subscribe((message) => {
            lastMessageAt = Date.now();
            connected.value = true;
            if (message.kind === "snapshot") {
                applySnapshot(message.state);
            } else if (message.kind === "patch") {
                applyPatch(message.state);
            }
        });

        channel.publish({ kind: "hello" });

        disconnectTimer = setInterval(() => {
            if (Date.now() - lastMessageAt > DISCONNECT_THRESHOLD_MS) {
                connected.value = false;
            }
        }, HEARTBEAT_INTERVAL_MS);
    }

    /**
     * Table side: reports drag-override readiness/positions back to Control (grilling doc Q1) —
     * a no-op if this store hasn't been started (as either role) yet, i.e. no channel is open.
     */
    function publishTableStatus(ready: boolean, markerPositions: Record<number, [number, number]>): void {
        channel?.publish({ kind: "tableStatus", ready, markerPositions });
    }

    /** Control side: registers a listener for an incoming `tableStatus` message (grilling doc Q1). */
    function onTableStatus(listener: (ready: boolean, markerPositions: Record<number, [number, number]>) => void): void {
        tableStatusListeners.push(listener);
    }

    /** Tears down subscriptions/timers/transport. Idempotent — safe on unmount and HMR. */
    function stop(): void {
        stopWatch?.();
        stopWatch = undefined;
        unsubscribe?.();
        unsubscribe = undefined;
        if (heartbeatTimer !== undefined) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = undefined;
        }
        if (disconnectTimer !== undefined) {
            clearInterval(disconnectTimer);
            disconnectTimer = undefined;
        }
        channel?.close();
        channel = undefined;
        lastPublished = undefined;
    }

    onScopeDispose(stop);

    return {
        connected,
        startAsControl,
        startAsTable,
        publishTableStatus,
        onTableStatus,
        stop,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useCollabSyncStore, import.meta.hot));
}

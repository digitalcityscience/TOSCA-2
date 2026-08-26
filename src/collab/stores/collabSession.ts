import { acceptHMRUpdate, defineStore } from "pinia";
import { reactive } from "vue";
import type { FeatureCollection } from "@helpers/geojson";
import type { AOIExtent } from "./collabCalibration";

/**
 * One object in the Base City dataset. Only `id` is meaningful to the store itself; geometry/
 * attributes are opaque here — the loader owns its concrete shape.
 */
export interface CollabSceneObject {
    id: string;
    [key: string]: unknown;
}

/** Immutable Hamburg source dataset (ALKIS/buildings), scoped to the confirmed AOI. Written only by the base-city loader. */
export interface CollabBaseCityState {
    loaded: boolean;
    objects: CollabSceneObject[];
}

/**
 * One physically-tracked object's last-known pose, keyed by tracker-assigned object id. Shape
 * matches the (future) `TrackingEvent.pose` contract (plan §14) so ticket 05's adapter drops in
 * without reshaping this slice.
 */
export interface CollabTrackingObjectState {
    pose: { lng: number; lat: number; rotation: number };
    confidence: number;
    lastSeen: number;
}

/** Per-window UI state (selection/camera/panels). Local only — never broadcast between windows. */
export interface CollabViewState {
    selection: string | null;
}

/** Derived: which layers/masks the projector (Table view) currently shows. */
export interface CollabTableRenderState {
    visibleLayerIds: string[];
}

/**
 * Whether the Table window is presenting the four map-calibration reference markers (ticket 11,
 * fix-tickets). `"idle"` — normal Table rendering (scenario/tracked footprints etc.); `"presenting"`
 * — Table shows only the `200`-`203` marker images at the AOI corners so the cameras can read them,
 * with everything else hidden. A future ticket (real four-marker calibration) is expected to add
 * further phases (e.g. `"calibrated"`) once it lands — kept to these two for now (YAGNI).
 */
export type CollabCalibrationPhase = "idle" | "presenting";

/**
 * Derived calibration values both windows need but only Control can compute (plan §5b/§13):
 * the table→AOI rotation offset and the AOI itself (A1/A2), from Control's locally-selected AOI
 * (`collabScenario.aoi`). Broadcast like any other session slice (ticket 08) so the Table window
 * — which never runs AOI selection itself — renders tracked headings with the same offset Control
 * does, and fits its viewport to the same AOI Control selected rather than an independent one.
 *
 * `phase` and `revision` (ticket 11, fix-tickets): Control is the only writer for this whole slice
 * — Table only ever reads it. `revision` is a monotonically increasing counter Control bumps on
 * every write here (AOI change, phase change), so Table's watchers always have something to react
 * to even on a write that happens to leave `aoi`/`phase`'s own values structurally unchanged (e.g.
 * re-confirming the same AOI) — Control and Table must never disagree about what the projector is
 * currently showing.
 */
export interface CollabCalibrationState {
    rotationOffsetDeg: number;
    aoi: AOIExtent | null;
    phase: CollabCalibrationPhase;
    revision: number;
}

/**
 * The authoritative tracked-building collection (ticket 13, plan §5e/§7.4/Phase 4): every currently
 * tracked object's known footprint, translated/rotated onto its detected pose, plus its centre
 * point — computed exactly once, in Control's tracking adapter (`collabTrackingRender.ts`'s
 * `trackedRenderState`), and broadcast here. Table reads `footprints`/`ids` straight off this
 * slice to render `trackedFootprint`/`trackedId`; it never calls `deriveTrackedFootprint` itself.
 * `revision` is bumped on every Control-side (re)derivation, like `CollabCalibrationState.revision`
 * — a simple presence check ("has `revision` changed since I last rendered?") is cheap for either
 * window even though `footprints`/`ids` are also deep-equatable.
 */
export interface CollabTrackedBuildingsState {
    footprints: FeatureCollection;
    ids: FeatureCollection;
    revision: number;
}

/**
 * Shared Collab session state: base city (scoped to the confirmed AOI), live tracking, per-view
 * state, derived table render state, calibration, and the broadcast tracked-buildings collection.
 * Composes existing TOSCA stores (map/geoserver/backend) from within actions added by later
 * tickets (plan §10).
 */
export const useCollabSessionStore = defineStore("collabSession", () => {
    const base = reactive<CollabBaseCityState>({ loaded: false, objects: [] });
    const tracking = reactive<Record<string, CollabTrackingObjectState>>({});
    const view = reactive<CollabViewState>({ selection: null });
    const tableRender = reactive<CollabTableRenderState>({ visibleLayerIds: [] });
    const calibration = reactive<CollabCalibrationState>({ rotationOffsetDeg: 0, aoi: null, phase: "idle", revision: 0 });
    const trackedBuildings = reactive<CollabTrackedBuildingsState>({
        footprints: { type: "FeatureCollection", features: [] },
        ids: { type: "FeatureCollection", features: [] },
        revision: 0,
    });

    return {
        base,
        tracking,
        view,
        tableRender,
        calibration,
        trackedBuildings,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useCollabSessionStore, import.meta.hot));
}

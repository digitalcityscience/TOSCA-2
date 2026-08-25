import { acceptHMRUpdate, defineStore } from "pinia";
import { computed, reactive } from "vue";
import type { AOIExtent } from "./collabCalibration";

/**
 * One object in the Base City / Scenario dataset. Only `id` is meaningful to the store itself
 * (delta composition matches on it); geometry/attributes are opaque here — the loader (base) and
 * Control View (scenario) own their concrete shape.
 */
export interface CollabSceneObject {
    id: string;
    [key: string]: unknown;
}

/** Immutable Hamburg source dataset (ALKIS/buildings). Written only by the base-city loader. */
export interface CollabBaseCityState {
    loaded: boolean;
    objects: CollabSceneObject[];
}

/** Control-View-authored delta against the base city; never mutates the base dataset. */
export interface CollabScenarioState {
    removedBuildings: string[];
    addedObjects: CollabSceneObject[];
    modifiedObjects: Record<string, Partial<CollabSceneObject>>;
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
 * One simulation result attached to a scenario object (ticket 11, plan §20 M4). `metric` is a
 * generic numeric result placeholder — TOSCA's real simulation client (not yet shipped, see
 * `collabSimulation.ts`) determines the actual result schema; this shape only needs to be enough
 * to prove the "run → populate → render via layer policy" wiring end to end with a mock client.
 */
export interface CollabSimulationResultObject {
    objectId: string;
    metric: number;
}

/** Simulation State slice (ticket 04 placeholder, filled in by ticket 11's `collabSimulation.ts`). */
export interface CollabSimulationState {
    running: boolean;
    results: CollabSimulationResultObject[];
    lastRunAt: number | null;
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
 * Logical Collab layers the per-view layer-policy matrix governs (plan §13, ticket 08): the
 * scenario/tracked footprints both views can show, `trackedId` (also shown on both — see
 * {@link DEFAULT_COLLAB_LAYER_POLICY}), plus the remaining technical tracking overlays that stay
 * Control-only spill (B4) — bbox/orientation/confidence, mirroring the Vanilla reference (§5e).
 */
export type CollabLayerId =
    | "scenarioFootprint"
    | "trackedFootprint"
    | "trackedBbox"
    | "trackedOrientation"
    | "trackedId"
    | "trackedConfidence"
    | "simulationResult";

/**
 * Whether a logical layer renders in the Control View / Table View (plan §13). `table: "mask"`
 * is reserved for the M3 subtract-mask option (plan §13 option 2); M1 only implements "don't
 * render" (`false`) for the technical overlays.
 */
export interface CollabLayerPolicyEntry {
    control: boolean;
    table: boolean | "mask";
}

export type CollabLayerPolicy = Record<CollabLayerId, CollabLayerPolicyEntry>;

/**
 * M1 default (plan §13): Control sees every technical overlay; the Table/projector only ever
 * sees footprints — "don't render" is the M1 masking strategy for bbox/orientation/confidence
 * (plan §13 option 1, B4). `trackedId` (each tracked building's centre point) is the exception:
 * shown on both views so the projector also displays building centroid data, not just footprints.
 */
export const DEFAULT_COLLAB_LAYER_POLICY: CollabLayerPolicy = {
    scenarioFootprint: { control: true, table: true },
    trackedFootprint: { control: true, table: true },
    trackedBbox: { control: true, table: false },
    trackedOrientation: { control: true, table: false },
    trackedId: { control: true, table: true },
    trackedConfidence: { control: true, table: false },
    // Simulation results are projector-appropriate (ticket 11 acceptance) — shown on both views.
    simulationResult: { control: true, table: true },
};

/**
 * Shared Collab session state: base city, scenario delta, live tracking, per-view state,
 * derived table render state, a simulation placeholder, and the per-view layer-policy matrix.
 * Composes existing TOSCA stores (map/geoserver/backend) from within actions added by later
 * tickets — this ticket only establishes the six state slices (plan §10).
 */
export const useCollabSessionStore = defineStore("collabSession", () => {
    const base = reactive<CollabBaseCityState>({ loaded: false, objects: [] });
    const scenario = reactive<CollabScenarioState>({
        removedBuildings: [],
        addedObjects: [],
        modifiedObjects: {},
    });
    const tracking = reactive<Record<string, CollabTrackingObjectState>>({});
    const view = reactive<CollabViewState>({ selection: null });
    const tableRender = reactive<CollabTableRenderState>({ visibleLayerIds: [] });
    const simulation = reactive<CollabSimulationState>({ running: false, results: [], lastRunAt: null });
    const layerPolicy = reactive<CollabLayerPolicy>({ ...DEFAULT_COLLAB_LAYER_POLICY });
    const calibration = reactive<CollabCalibrationState>({ rotationOffsetDeg: 0, aoi: null, phase: "idle", revision: 0 });

    /** Whether `layerId` should render for `windowKind`, per the current layer-policy matrix (plan §13). */
    function isLayerVisible(layerId: CollabLayerId, windowKind: "control" | "table"): boolean {
        const entry = layerPolicy[layerId];
        return windowKind === "control" ? entry.control : entry.table !== false;
    }

    /**
     * Sets `layerId`'s Table-view policy at runtime (ticket 10, OD-2): lets an operator switch
     * between the M1 "hide-layer" masking option and the M3 "mask" (subtract-physical-footprints)
     * option live, on the real projector, without a code change — the additive mechanism the OD-2
     * sufficiency evaluation needs, since only that evaluation can decide which option to keep.
     */
    function setLayerTableMode(layerId: CollabLayerId, mode: boolean | "mask"): void {
        layerPolicy[layerId].table = mode;
    }

    /**
     * `Base City ⊖ removed ⊕ added ⊕ modified` — the scenario both windows render from. Reads
     * `base`/`scenario` only; never writes back to `base`, so the source dataset stays immutable.
     */
    const currentScenario = computed<CollabSceneObject[]>(() => {
        const removed = new Set(scenario.removedBuildings);
        const kept = base.objects
            .filter((object) => !removed.has(object.id))
            .map((object) => {
                const modification = scenario.modifiedObjects[object.id];
                return modification ? { ...object, ...modification } : object;
            });
        return [...kept, ...scenario.addedObjects];
    });

    return {
        base,
        scenario,
        tracking,
        view,
        tableRender,
        simulation,
        layerPolicy,
        calibration,
        currentScenario,
        isLayerVisible,
        setLayerTableMode,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useCollabSessionStore, import.meta.hot));
}

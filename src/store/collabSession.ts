import { acceptHMRUpdate, defineStore } from "pinia";
import { computed, reactive } from "vue";

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

/** Placeholder for jobs/results once a TOSCA simulation client exists to wire against. */
export interface CollabSimulationState {
    jobs: unknown[];
}

/**
 * Derived calibration values both windows need but only Control can compute (plan §5b/§13):
 * the table→AOI rotation offset, from Control's locally-selected AOI (`collabScenario.aoi`).
 * Broadcast like any other session slice (ticket 08) so the Table window — which never runs AOI
 * selection itself — renders tracked headings with the same offset Control does.
 */
export interface CollabCalibrationState {
    rotationOffsetDeg: number;
}

/**
 * Logical Collab layers the per-view layer-policy matrix governs (plan §13, ticket 08): the
 * scenario footprint both views can show, plus the technical tracking overlays that are
 * Control-only spill (B4) — footprint/bbox/orientation/id/confidence, mirroring the Vanilla
 * reference (§5e).
 */
export type CollabLayerId =
    | "scenarioFootprint"
    | "trackedFootprint"
    | "trackedBbox"
    | "trackedOrientation"
    | "trackedId"
    | "trackedConfidence";

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
 * sees footprints — "don't render" is the M1 masking strategy for bbox/id/orientation/confidence
 * (plan §13 option 1, B4).
 */
export const DEFAULT_COLLAB_LAYER_POLICY: CollabLayerPolicy = {
    scenarioFootprint: { control: true, table: true },
    trackedFootprint: { control: true, table: true },
    trackedBbox: { control: true, table: false },
    trackedOrientation: { control: true, table: false },
    trackedId: { control: true, table: false },
    trackedConfidence: { control: true, table: false },
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
    const simulation = reactive<CollabSimulationState>({ jobs: [] });
    const layerPolicy = reactive<CollabLayerPolicy>({ ...DEFAULT_COLLAB_LAYER_POLICY });
    const calibration = reactive<CollabCalibrationState>({ rotationOffsetDeg: 0 });

    /** Whether `layerId` should render for `windowKind`, per the current layer-policy matrix (plan §13). */
    function isLayerVisible(layerId: CollabLayerId, windowKind: "control" | "table"): boolean {
        const entry = layerPolicy[layerId];
        return windowKind === "control" ? entry.control : entry.table !== false;
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
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useCollabSessionStore, import.meta.hot));
}

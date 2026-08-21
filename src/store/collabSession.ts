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
 * Shared Collab session state: base city, scenario delta, live tracking, per-view state,
 * derived table render state, and a simulation placeholder. Composes existing TOSCA stores
 * (map/geoserver/backend) from within actions added by later tickets — this ticket only
 * establishes the six state slices (plan §10).
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
        currentScenario,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useCollabSessionStore, import.meta.hot));
}

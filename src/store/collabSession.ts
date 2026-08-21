import { acceptHMRUpdate, defineStore } from "pinia";
import { reactive } from "vue";

/** Immutable Hamburg source dataset (ALKIS/buildings). Written only by the base-city loader. */
export interface CollabBaseCityState {
    loaded: boolean;
}

/** Control-View-authored delta against the base city; never mutates the base dataset. */
export interface CollabScenarioState {
    removedBuildings: string[];
    addedObjects: unknown[];
    modifiedObjects: Record<string, unknown>;
}

/** One physically-tracked object's last-known pose, keyed by tracker-assigned object id. */
export interface CollabTrackingObjectState {
    pose: { x: number; y: number; rotation: number };
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
    const base = reactive<CollabBaseCityState>({ loaded: false });
    const scenario = reactive<CollabScenarioState>({
        removedBuildings: [],
        addedObjects: [],
        modifiedObjects: {},
    });
    const tracking = reactive<Record<string, CollabTrackingObjectState>>({});
    const view = reactive<CollabViewState>({ selection: null });
    const tableRender = reactive<CollabTableRenderState>({ visibleLayerIds: [] });
    const simulation = reactive<CollabSimulationState>({ jobs: [] });

    return {
        base,
        scenario,
        tracking,
        view,
        tableRender,
        simulation,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useCollabSessionStore, import.meta.hot));
}

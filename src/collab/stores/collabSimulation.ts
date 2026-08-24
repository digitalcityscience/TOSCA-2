import { acceptHMRUpdate, defineStore } from "pinia";
import { reportDeveloperError } from "@helpers/userFacingError";
import { useCollabSessionStore, type CollabSceneObject, type CollabSimulationResultObject } from "./collabSession";

/**
 * Transport-agnostic simulation boundary (plan §20 M4), mirroring `collabTracking.ts`'s
 * `TrackingSource`. **Ticket 11 is blocked**: no TOSCA simulation client/service exists in code
 * (verified — zero WebSocket/simulation client in TOSCA-2 as of 2026-08-22), and Collab must
 * never implement its own simulation engine (plan §15 "DO NOT DUPLICATE", ticket 11 "Excluded").
 *
 * `MockSimulationClient` below is a **stand-in only**, so the "Run Simulation" control, the
 * Simulation State slice, and per-view rendering can be wired and tested now. When TOSCA ships a
 * real client, swap it in behind {@link SimulationClient} — the same pure-transport-swap shape
 * ticket 09's `RealTrackingSource` used for `TrackingSource` — with no changes to the session
 * store, the renderer, or the UI.
 */
export interface SimulationRequest {
    scenario: readonly CollabSceneObject[];
}

export interface SimulationResult {
    objects: CollabSimulationResultObject[];
}

export interface SimulationClient {
    run(request: SimulationRequest): Promise<SimulationResult>;
}

/**
 * MOCK ONLY (see module doc) — not TOSCA's simulation client, which does not exist yet. Produces a
 * deterministic placeholder `metric` per scenario object so downstream wiring is exercisable and
 * testable ahead of that client shipping.
 */
export class MockSimulationClient implements SimulationClient {
    async run(request: SimulationRequest): Promise<SimulationResult> {
        return {
            objects: request.scenario.map((object, index) => ({
                objectId: object.id,
                metric: (index + 1) * 10,
            })),
        };
    }
}

/**
 * Owns the "Run Simulation" action (ticket 11 scope): calls the configured {@link SimulationClient}
 * (mock today, plan §20 M4) with the current scenario and feeds the results into
 * `collabSession.simulation`, from where the layer policy renders them on both views
 * (`collabTrackingRender.ts`).
 */
export const useCollabSimulationStore = defineStore("collabSimulation", () => {
    const session = useCollabSessionStore();
    const client: SimulationClient = new MockSimulationClient();

    /** Runs the simulation over the current scenario and populates `collabSession.simulation`. */
    async function runSimulation(): Promise<void> {
        session.simulation.running = true;
        try {
            const result = await client.run({ scenario: session.currentScenario });
            session.simulation.results = result.objects;
            session.simulation.lastRunAt = Date.now();
        } catch (error) {
            reportDeveloperError("collabSimulation.runSimulation", error);
        } finally {
            session.simulation.running = false;
        }
    }

    return {
        runSimulation,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useCollabSimulationStore, import.meta.hot));
}

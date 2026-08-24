import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@helpers/toast", () => ({
    useToast: () => ({ add: vi.fn() }),
}));

import { useCollabSessionStore } from "./collabSession";
import { MockSimulationClient, useCollabSimulationStore } from "./collabSimulation";

describe("MockSimulationClient", () => {
    test("returns a deterministic mock metric per scenario object", async () => {
        const client = new MockSimulationClient();
        const result = await client.run({ scenario: [{ id: "b1" }, { id: "b2" }] });

        expect(result.objects).toEqual([
            { objectId: "b1", metric: 10 },
            { objectId: "b2", metric: 20 },
        ]);
    });
});

describe("useCollabSimulationStore", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    test("runSimulation populates collabSession.simulation from the mock client", async () => {
        const session = useCollabSessionStore();
        session.base.objects = [{ id: "b1" }, { id: "b2" }];
        const simulationStore = useCollabSimulationStore();

        expect(session.simulation.running).toBe(false);
        expect(session.simulation.lastRunAt).toBeNull();

        const run = simulationStore.runSimulation();
        expect(session.simulation.running).toBe(true);
        await run;

        expect(session.simulation.running).toBe(false);
        expect(session.simulation.results).toEqual([
            { objectId: "b1", metric: 10 },
            { objectId: "b2", metric: 20 },
        ]);
        expect(session.simulation.lastRunAt).not.toBeNull();
    });

    test("runSimulation respects the scenario delta (removed/added), not just the base city", async () => {
        const session = useCollabSessionStore();
        session.base.objects = [{ id: "b1" }, { id: "b2" }];
        session.scenario.removedBuildings.push("b2");
        session.scenario.addedObjects.push({ id: "new1" });
        const simulationStore = useCollabSimulationStore();

        await simulationStore.runSimulation();

        expect(session.simulation.results).toEqual([
            { objectId: "b1", metric: 10 },
            { objectId: "new1", metric: 20 },
        ]);
    });
});

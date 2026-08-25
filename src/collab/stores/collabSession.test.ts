import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test } from "vitest";
import { useCollabSessionStore } from "./collabSession";

describe("collabSession store", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    test("currentScenario mirrors the base city when there is no delta", () => {
        const store = useCollabSessionStore();
        store.base.objects = [{ id: "b1" }, { id: "b2" }];

        expect(store.currentScenario).toEqual([{ id: "b1" }, { id: "b2" }]);
    });

    test("currentScenario excludes removed buildings without mutating base", () => {
        const store = useCollabSessionStore();
        store.base.objects = [{ id: "b1" }, { id: "b2" }];
        store.scenario.removedBuildings.push("b1");

        expect(store.currentScenario).toEqual([{ id: "b2" }]);
        expect(store.base.objects).toEqual([{ id: "b1" }, { id: "b2" }]);
    });

    test("currentScenario appends added objects without mutating base", () => {
        const store = useCollabSessionStore();
        store.base.objects = [{ id: "b1" }];
        store.scenario.addedObjects.push({ id: "new1", kind: "custom" });

        expect(store.currentScenario).toEqual([{ id: "b1" }, { id: "new1", kind: "custom" }]);
        expect(store.base.objects).toEqual([{ id: "b1" }]);
    });

    test("currentScenario overlays modified fields onto the matching base object without mutating base", () => {
        const store = useCollabSessionStore();
        store.base.objects = [{ id: "b1", height: 10 }];
        store.scenario.modifiedObjects.b1 = { height: 25 };

        expect(store.currentScenario).toEqual([{ id: "b1", height: 25 }]);
        expect(store.base.objects).toEqual([{ id: "b1", height: 10 }]);
    });

    test("currentScenario composes remove + add + modify together", () => {
        const store = useCollabSessionStore();
        store.base.objects = [
            { id: "b1", height: 10 },
            { id: "b2", height: 5 },
        ];
        store.scenario.removedBuildings.push("b2");
        store.scenario.modifiedObjects.b1 = { height: 12 };
        store.scenario.addedObjects.push({ id: "new1" });

        expect(store.currentScenario).toEqual([{ id: "b1", height: 12 }, { id: "new1" }]);
    });

    test("tracking slice pose shape matches the TrackingEvent contract (lng/lat/rotation)", () => {
        const store = useCollabSessionStore();
        store.tracking["marker-1"] = {
            pose: { lng: 10.0, lat: 53.55, rotation: 45 },
            confidence: 0.9,
            lastSeen: Date.now(),
        };

        expect(store.tracking["marker-1"].pose).toEqual({ lng: 10.0, lat: 53.55, rotation: 45 });
    });

    test("all six slices are present with their documented ownership", () => {
        const store = useCollabSessionStore();

        expect(store.base).toBeDefined();
        expect(store.scenario).toBeDefined();
        expect(store.tracking).toBeDefined();
        expect(store.view).toBeDefined();
        expect(store.tableRender).toBeDefined();
        expect(store.simulation).toBeDefined();
    });

    test("calibration defaults to idle/no-AOI/revision 0 (ticket 11)", () => {
        const store = useCollabSessionStore();

        expect(store.calibration.phase).toBe("idle");
        expect(store.calibration.aoi).toBeNull();
        expect(store.calibration.revision).toBe(0);
    });
});

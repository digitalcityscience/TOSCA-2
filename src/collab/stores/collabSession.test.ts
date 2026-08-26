import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test } from "vitest";
import { useCollabSessionStore } from "./collabSession";

describe("collabSession store", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    test("base city objects load without a scenario-editing delta layer (ticket 15)", () => {
        const store = useCollabSessionStore();
        store.base.objects = [{ id: "b1" }, { id: "b2" }];

        expect(store.base.objects).toEqual([{ id: "b1" }, { id: "b2" }]);
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

    test("every slice is present with its documented ownership (ticket 15)", () => {
        const store = useCollabSessionStore();

        expect(store.base).toBeDefined();
        expect(store.tracking).toBeDefined();
        expect(store.view).toBeDefined();
        expect(store.tableRender).toBeDefined();
        expect(store.calibration).toBeDefined();
        expect(store.trackedBuildings).toBeDefined();
    });

    test("calibration defaults to idle/no-AOI/revision 0 (ticket 11)", () => {
        const store = useCollabSessionStore();

        expect(store.calibration.phase).toBe("idle");
        expect(store.calibration.aoi).toBeNull();
        expect(store.calibration.revision).toBe(0);
    });
});

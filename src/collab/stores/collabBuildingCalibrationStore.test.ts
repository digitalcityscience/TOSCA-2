/**
 * The building-calibration panel's behaviour, at the store seam rather than through the DOM: the
 * component only routes key presses and buttons into these calls, so this is where the behaviour
 * that could actually be wrong lives.
 */
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test, vi } from "vitest";

const toastAdd = vi.hoisted(() => vi.fn());
vi.mock("@helpers/toast", () => ({ useToast: () => ({ add: toastAdd }) }));
const reportDeveloperError = vi.hoisted(() => vi.fn());
vi.mock("@helpers/userFacingError", () => ({ reportDeveloperError }));

import { useCollabSessionStore } from "./collabSession";
import { useCollabScenarioStore } from "./collabScenario";
import { useCollabTrackingRenderStore } from "./collabTrackingRender";
import { TrackingFeedNormalizer, createMarkerObjectRegistry } from "./collabTracking";
import type { AOIExtent } from "./collabCalibration";
import { BUILDING_CALIBRATION_ROTATE_STEP_DEG, BUILDING_CALIBRATION_SCALE_STEP } from "./collabBuildingCalibration";

/**
 * The 2026-08-31 AOI. Its corners share latitudes, so its top edge is very nearly due east and
 * the table's axes very nearly the compass's -- but only nearly: a geodesic bearing along a
 * constant-latitude line is not exactly 90 degrees, so `tableToAoiRotationOffsetDeg` returns a
 * few thousandths of a degree here. Assertions below are toleranced accordingly rather than
 * pretending the offset is exactly zero.
 */
const AOI: AOIExtent = {
    corners: [
        [10.027891448941773, 53.57073154051318],
        [10.033103979838955, 53.57073154051318],
        [10.033103979838955, 53.569183833647685],
        [10.027891448941773, 53.569183833647685],
    ],
};

function trackedBuilding(overrides: Record<string, unknown> = {}) {
    return {
        pose: { lng: 10.03, lat: 53.57, rotation: 0 },
        confidence: 1,
        lastSeen: 0,
        markerId: 12,
        tableXPx: 700,
        tableYPx: 400,
        ...overrides,
    };
}

describe("selecting a building to calibrate", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        toastAdd.mockClear();
        reportDeveloperError.mockClear();
    });

    test("nothing is selected until the operator picks a building", () => {
        expect(useCollabTrackingRenderStore().buildingCalibration).toBeNull();
    });

    test("picking a tracked building starts it from neutral, not from what Python already stored", () => {
        // The panel shows what is being *added*, so one nudge always means one nudge. Seeding it
        // with the accumulated total would make the readout drift further from zero every session
        // while the visible correction stayed the same size.
        const session = useCollabSessionStore();
        session.tracking.G07 = trackedBuilding();
        const store = useCollabTrackingRenderStore();

        store.startBuildingCalibration("G07");

        expect(store.buildingCalibration).toEqual({
            buildingId: "G07",
            markerId: 12,
            draft: { offsetEastMm: 0, offsetNorthMm: 0, rotationOffsetDeg: 0, scaleResidual: 1 },
        });
    });

    test("a building Python has never reported a marker for cannot be calibrated", () => {
        // Python refuses such a measurement anyway (there is no table position to file it at);
        // failing here says so where the operator is, instead of on the server's console.
        const session = useCollabSessionStore();
        session.tracking.G07 = trackedBuilding({ markerId: undefined });
        const store = useCollabTrackingRenderStore();

        store.startBuildingCalibration("G07");

        expect(store.buildingCalibration).toBeNull();
        expect(reportDeveloperError).toHaveBeenCalled();
    });

    test("cancelling throws the draft away and nothing was ever sent", () => {
        const session = useCollabSessionStore();
        session.tracking.G07 = trackedBuilding();
        const store = useCollabTrackingRenderStore();
        store.startBuildingCalibration("G07");
        store.nudgeBuildingCalibration({ eastMm: 5, northMm: 0 });

        store.cancelBuildingCalibration();

        expect(store.buildingCalibration).toBeNull();
    });
});

describe("adjusting the draft", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        reportDeveloperError.mockClear();
    });

    function started(rotation = 0) {
        const session = useCollabSessionStore();
        session.tracking.G07 = trackedBuilding({ pose: { lng: 10.03, lat: 53.57, rotation } });
        const scenario = useCollabScenarioStore();
        scenario.aoi = AOI;
        const store = useCollabTrackingRenderStore();
        store.startBuildingCalibration("G07");
        return store;
    }

    test("an upright block's nudge is stored exactly as pushed", () => {
        const store = started(0);

        store.nudgeBuildingCalibration({ eastMm: 3, northMm: 0 });

        expect(store.buildingCalibration?.draft.offsetEastMm).toBeCloseTo(3, 3);
        expect(store.buildingCalibration?.draft.offsetNorthMm).toBeCloseTo(0, 3);
    });

    test("the same push on a turned block is stored in the block's own frame", () => {
        // This is the whole reason the offset is a local-frame quantity: the operator pushes the
        // same way whatever the block's heading, and the stored constant has to keep meaning the
        // same thing after the block is picked up and put back at a different angle.
        const store = started(90);

        store.nudgeBuildingCalibration({ eastMm: 3, northMm: 0 });

        expect(store.buildingCalibration?.draft.offsetEastMm).toBeCloseTo(0, 3);
        expect(store.buildingCalibration?.draft.offsetNorthMm).toBeCloseTo(-3, 3);
    });

    test("Q and E turn, plus and minus resize, and neither touches the offset", () => {
        const store = started(0);
        store.nudgeBuildingCalibration({ eastMm: 2, northMm: 0 });

        store.rotateBuildingCalibration(1);
        store.resizeBuildingCalibration(-1);

        expect(store.buildingCalibration?.draft.rotationOffsetDeg).toBeCloseTo(BUILDING_CALIBRATION_ROTATE_STEP_DEG, 6);
        expect(store.buildingCalibration?.draft.scaleResidual).toBeCloseTo(1 - BUILDING_CALIBRATION_SCALE_STEP, 6);
        expect(store.buildingCalibration?.draft.offsetEastMm).toBeCloseTo(2, 3);
    });

    test("a drag is converted through the AOI's ground scale, not the map's zoom", () => {
        // ~345 m of AOI across a 1.6 m table is roughly 1:216, so a 2.16 m drag is about 1 table cm.
        const store = started(0);

        store.dragBuildingCalibration({ eastM: 2.16, northM: 0 });

        expect(store.buildingCalibration?.draft.offsetEastMm).toBeGreaterThan(5);
        expect(store.buildingCalibration?.draft.offsetEastMm).toBeLessThan(20);
    });

    test("resetting puts the draft back to neutral without closing the panel", () => {
        const store = started(0);
        store.nudgeBuildingCalibration({ eastMm: 4, northMm: 4 });
        store.rotateBuildingCalibration(3);

        store.resetBuildingCalibrationDraft();

        expect(store.buildingCalibration?.draft).toEqual({
            offsetEastMm: 0,
            offsetNorthMm: 0,
            rotationOffsetDeg: 0,
            scaleResidual: 1,
        });
        expect(store.buildingCalibration?.buildingId).toBe("G07");
    });

    test("adjusting with nothing selected is a no-op, not a crash", () => {
        setActivePinia(createPinia());
        const store = useCollabTrackingRenderStore();

        store.nudgeBuildingCalibration({ eastMm: 1, northMm: 0 });
        store.rotateBuildingCalibration(1);
        store.resizeBuildingCalibration(1);
        store.resetBuildingCalibrationDraft();

        expect(store.buildingCalibration).toBeNull();
    });
});

describe("saving", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        reportDeveloperError.mockClear();
    });

    test("with no transport, saving reports failure rather than pretending it worked", () => {
        // The operator is about to walk away believing the building is calibrated. A silent
        // success here is the single worst outcome available.
        const session = useCollabSessionStore();
        session.tracking.G07 = trackedBuilding();
        const store = useCollabTrackingRenderStore();
        store.startBuildingCalibration("G07");

        expect(store.saveBuildingCalibration()).toBe(false);
        expect(store.buildingCalibration).not.toBeNull();
    });

    test("saving with nothing selected reports failure and touches nothing", () => {
        const store = useCollabTrackingRenderStore();

        expect(store.saveBuildingCalibration()).toBe(false);
        expect(store.savedCalibrationSamples).toEqual([]);
    });
});

describe("the coverage grid", () => {
    beforeEach(() => setActivePinia(createPinia()));

    test("an untouched session reports every region unsampled", () => {
        const coverage = useCollabTrackingRenderStore().buildingCalibrationCoverage();

        expect(coverage.cells).toHaveLength(9);
        expect(coverage.sampledCellCount).toBe(0);
    });
});

describe("holding the footprint while calibrating", () => {
    /**
     * The operator seats a building by leaning over the table, which occludes the very marker
     * keeping its footprint alive. Without this hold, the thing being aimed at vanishes a second
     * into every adjustment.
     */
    const registry = createMarkerObjectRegistry([]);

    function snapshotWith(buildingId: string | undefined) {
        return {
            type: "FeatureCollection" as const,
            features:
                buildingId === undefined
                    ? []
                    : [
                        {
                            type: "Feature" as const,
                            geometry: { type: "Point" as const, coordinates: [10, 53.5] },
                            properties: { marker_id: 12, building_id: buildingId, rotation: 0 },
                        },
                    ],
        };
    }

    test("absence still disappears a building when nothing is being calibrated", () => {
        const normalizer = new TrackingFeedNormalizer(registry);
        normalizer.applySnapshot(snapshotWith("G07"), 0);

        const events = normalizer.applySnapshot(snapshotWith(undefined), 5000);

        expect(events.map((event) => event.type)).toContain("disappeared");
    });

    test("while held, an occluded marker never becomes a disappearance", () => {
        const normalizer = new TrackingFeedNormalizer(registry);
        normalizer.applySnapshot(snapshotWith("G07"), 0);
        normalizer.setPresenceHold(true);

        const events = normalizer.applySnapshot(snapshotWith(undefined), 5000);

        expect(events).toEqual([]);
    });

    test("releasing the hold does not immediately dump every building that was held", () => {
        // Presence keeps being observed during the hold, so a building the cameras *did* see
        // throughout is not stale the instant the panel closes.
        const normalizer = new TrackingFeedNormalizer(registry);
        normalizer.applySnapshot(snapshotWith("G07"), 0);
        normalizer.setPresenceHold(true);
        normalizer.applySnapshot(snapshotWith("G07"), 5000);
        normalizer.setPresenceHold(false);

        const events = normalizer.applySnapshot(snapshotWith("G07"), 5100);

        expect(events.map((event) => event.type)).not.toContain("disappeared");
    });
});

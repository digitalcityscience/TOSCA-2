import { polygon } from "@turf/helpers";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@helpers/toast", () => ({
    useToast: () => ({ add: vi.fn() }),
}));
import type { Feature, Polygon } from "@helpers/geojson";
import { DEFAULT_COLLAB_TABLE_CONFIG, type AOIExtent, type CollabTableConfig, type MapCalibrationMessage } from "./collabCalibration";
import { useCollabSessionStore } from "./collabSession";
import {
    canOpenTableWindow,
    canStartTracking,
    extentFromPolygon,
    footprintsWithinAoi,
    isAspectRatioValid,
    toFeature,
    toSceneObject,
    useCollabScenarioStore,
    viewfinderScreenCorners,
} from "./collabScenario";
import type { CollabBuildingProperties } from "../data/collabBuildingData";

function buildingFeature(
    id: string,
    ring: Array<[number, number]>,
    markerId: number
): Feature<Polygon, CollabBuildingProperties> {
    return {
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [ring] },
        properties: {
            id,
            building_id: id,
            city_scope_id: `B-${id}`,
            marker_id: markerId,
            building_height: 10,
            floor_area: 100,
            number_of_stories: 3,
            land_use_suggested: "residential",
        },
    };
}

describe("extentFromPolygon", () => {
    test("orders bbox corners top-left, top-right, bottom-right, bottom-left", () => {
        const drawn = polygon([
            [
                [9.98, 53.54],
                [10.0, 53.54],
                [10.0, 53.56],
                [9.98, 53.56],
                [9.98, 53.54],
            ],
        ]);

        expect(extentFromPolygon(drawn)).toEqual({
            corners: [
                [9.98, 53.56],
                [10.0, 53.56],
                [10.0, 53.54],
                [9.98, 53.54],
            ],
        });
    });
});

describe("isAspectRatioValid", () => {
    const config: CollabTableConfig = DEFAULT_COLLAB_TABLE_CONFIG; // 160x80 -> 2:1

    test("accepts an AOI whose geodesic ratio matches the table's 2:1", () => {
        const aoi: AOIExtent = {
            corners: [
                [9.98, 53.56],
                [10.0114, 53.56],
                [10.0114, 53.55],
                [9.98, 53.55],
            ],
        };
        expect(isAspectRatioValid(aoi, config)).toBe(true);
    });

    test("rejects a near-square AOI far from 2:1", () => {
        const aoi: AOIExtent = {
            corners: [
                [9.98, 53.56],
                [9.99, 53.56],
                [9.99, 53.55],
                [9.98, 53.55],
            ],
        };
        expect(isAspectRatioValid(aoi, config)).toBe(false);
    });
});

describe("viewfinderScreenCorners", () => {
    const config: CollabTableConfig = DEFAULT_COLLAB_TABLE_CONFIG; // 160x80 -> 2:1

    test("locks the rectangle's screen aspect ratio to the table's, regardless of canvas shape", () => {
        const corners = viewfinderScreenCorners(1200, 800, config);
        const [topLeft, topRight, bottomRight] = corners;
        const width = topRight[0] - topLeft[0];
        const height = bottomRight[1] - topRight[1];
        expect(width / height).toBeCloseTo(2, 5);
    });

    test("centres the rectangle on the canvas", () => {
        const canvasWidth = 1200;
        const canvasHeight = 800;
        const corners = viewfinderScreenCorners(canvasWidth, canvasHeight, config);
        const [topLeft, topRight, bottomRight] = corners;
        const centerX = (topLeft[0] + topRight[0]) / 2;
        const centerY = (topLeft[1] + bottomRight[1]) / 2;
        expect(centerX).toBeCloseTo(canvasWidth / 2, 5);
        expect(centerY).toBeCloseTo(canvasHeight / 2, 5);
    });

    test("shrinks to fit whichever canvas dimension is the binding constraint", () => {
        // A tall, narrow canvas: width is the binding constraint for a 2:1 rectangle.
        const corners = viewfinderScreenCorners(400, 1000, config);
        const [topLeft, topRight] = corners;
        const width = topRight[0] - topLeft[0];
        expect(width).toBeLessThanOrEqual(400);
    });
});

describe("canStartTracking", () => {
    const calibration: MapCalibrationMessage = { type: "map_calibration", points: [] };

    test("disabled while mapCalibration is null, even with footprints loaded", () => {
        expect(canStartTracking(true, null)).toBe(false);
    });

    test("disabled while footprints aren't loaded, even with mapCalibration confirmed", () => {
        expect(canStartTracking(false, calibration)).toBe(false);
    });

    test("disabled when neither footprints nor mapCalibration are ready", () => {
        expect(canStartTracking(false, null)).toBe(false);
    });

    test("enabled once footprints are loaded and mapCalibration becomes non-null (AOI confirmed)", () => {
        expect(canStartTracking(true, calibration)).toBe(true);
    });
});

describe("canOpenTableWindow", () => {
    test("disabled with no AOI confirmed", () => {
        expect(canOpenTableWindow(null)).toBe(false);
    });

    test("enabled once an AOI is confirmed", () => {
        const aoi: AOIExtent = {
            corners: [
                [9.98, 53.56],
                [10.0114, 53.56],
                [10.0114, 53.55],
                [9.98, 53.55],
            ],
        };
        expect(canOpenTableWindow(aoi)).toBe(true);
    });
});

describe("footprintsWithinAoi", () => {
    const aoi: AOIExtent = {
        corners: [
            [9.98, 53.56],
            [10.02, 53.56],
            [10.02, 53.53],
            [9.98, 53.53],
        ],
    };

    test("keeps only footprints fully inside the AOI polygon", () => {
        const inside = buildingFeature(
            "inside",
            [
                [9.99, 53.545],
                [9.991, 53.545],
                [9.991, 53.546],
                [9.99, 53.546],
                [9.99, 53.545],
            ],
            1
        );
        const outside = buildingFeature(
            "outside",
            [
                [10.1, 53.545],
                [10.101, 53.545],
                [10.101, 53.546],
                [10.1, 53.546],
                [10.1, 53.545],
            ],
            2
        );

        expect(footprintsWithinAoi([inside, outside], aoi)).toEqual([inside]);
    });
});

describe("toSceneObject / toFeature round trip", () => {
    test("preserves id, geometry, and properties", () => {
        const feature = buildingFeature(
            "b1",
            [
                [9.99, 53.545],
                [9.991, 53.545],
                [9.991, 53.546],
                [9.99, 53.546],
                [9.99, 53.545],
            ],
            42
        );

        const sceneObject = toSceneObject(feature);
        expect(sceneObject.id).toBe("b1");
        expect(sceneObject.geometry).toEqual(feature.geometry);

        const roundTripped = toFeature(sceneObject);
        expect(roundTripped.id).toBe("b1");
        expect(roundTripped.geometry).toEqual(feature.geometry);
        expect(roundTripped.properties).toEqual(feature.properties);
    });
});

describe("collabScenario store", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    test("removeBuilding records a scenario delta without mutating base", () => {
        const session = useCollabSessionStore();
        const scenario = useCollabScenarioStore();
        session.base.objects = [{ id: "b1" }, { id: "b2" }];

        scenario.removeBuilding("b1");

        expect(session.scenario.removedBuildings).toEqual(["b1"]);
        expect(session.base.objects).toEqual([{ id: "b1" }, { id: "b2" }]);
        expect(session.currentScenario).toEqual([{ id: "b2" }]);
    });

    test("removeBuilding is idempotent", () => {
        const session = useCollabSessionStore();
        const scenario = useCollabScenarioStore();
        session.base.objects = [{ id: "b1" }];

        scenario.removeBuilding("b1");
        scenario.removeBuilding("b1");

        expect(session.scenario.removedBuildings).toEqual(["b1"]);
    });

    test("restoreBuilding reverses removeBuilding", () => {
        const session = useCollabSessionStore();
        const scenario = useCollabScenarioStore();
        session.base.objects = [{ id: "b1" }];

        scenario.removeBuilding("b1");
        scenario.restoreBuilding("b1");

        expect(session.scenario.removedBuildings).toEqual([]);
        expect(session.currentScenario).toEqual([{ id: "b1" }]);
    });

    test("selectableBuildings falls back to the full fixture before an AOI is chosen", () => {
        const scenario = useCollabScenarioStore();
        expect(scenario.aoi).toBeNull();
        expect(scenario.selectableBuildings.length).toBeGreaterThan(0);
    });

    test("loadFixtureFootprints refuses to load base without an AOI selected", async () => {
        const session = useCollabSessionStore();
        const scenario = useCollabScenarioStore();

        await scenario.loadFixtureFootprints();

        expect(session.base.loaded).toBe(false);
        expect(session.base.objects).toEqual([]);
    });

    test("loadFixtureFootprints scopes base.objects to the selected AOI's buildings", async () => {
        const session = useCollabSessionStore();
        const scenario = useCollabScenarioStore();
        scenario.aoi = {
            corners: [
                [9.98, 53.56],
                [10.02, 53.56],
                [10.02, 53.53],
                [9.98, 53.53],
            ],
        };
        const expectedIds = scenario.selectableBuildings.map((f) => f.properties.building_id);

        await scenario.loadFixtureFootprints();

        expect(session.base.loaded).toBe(true);
        expect(session.base.objects.map((o) => o.id)).toEqual(expectedIds);
    });

    test("finishAoiSelection confirms the AOI as an explicit GeoJSON feature, not just corner values (ticket 09)", () => {
        const scenario = useCollabScenarioStore();
        expect(scenario.aoiFeature).toBeNull();

        scenario.viewfinderExtent = {
            corners: [
                [9.98, 53.56],
                [10.0114, 53.56],
                [10.0114, 53.55],
                [9.98, 53.55],
            ],
        };
        scenario.viewfinderValid = true;

        expect(scenario.finishAoiSelection()).toBe(true);

        expect(scenario.aoiFeature).not.toBeNull();
        expect(scenario.aoiFeature?.type).toBe("Feature");
        expect(scenario.aoiFeature?.geometry).toEqual({
            type: "Polygon",
            coordinates: [[...scenario.aoi!.corners, scenario.aoi!.corners[0]]],
        });
    });

    test("confirming an AOI automatically loads and filters the Collab-owned footprints (ticket 10)", () => {
        const session = useCollabSessionStore();
        const scenario = useCollabScenarioStore();
        scenario.viewfinderExtent = {
            corners: [
                [9.98, 53.56],
                [10.0114, 53.56],
                [10.0114, 53.55],
                [9.98, 53.55],
            ],
        };
        scenario.viewfinderValid = true;

        expect(scenario.finishAoiSelection()).toBe(true);
        expect(session.base.loaded).toBe(true);
        expect(session.base.objects.map((object) => object.id)).toEqual(
            scenario.selectableBuildings.map((feature) => feature.properties.building_id)
        );
    });

    test("confirming a different AOI invalidates any previous calibration (ticket 09)", () => {
        const scenario = useCollabScenarioStore();
        const extentA: AOIExtent = {
            corners: [
                [9.98, 53.56],
                [10.0114, 53.56],
                [10.0114, 53.55],
                [9.98, 53.55],
            ],
        };
        // Same shape/latitude, shifted east only — the geodesic width/height distances (and so the
        // aspect ratio `isAspectRatioValid` checks) are unchanged, so this is valid too.
        const extentB: AOIExtent = {
            corners: extentA.corners.map(([lng, lat]) => [lng + 0.5, lat]) as AOIExtent["corners"],
        };

        scenario.viewfinderExtent = extentA;
        scenario.viewfinderValid = true;
        expect(scenario.finishAoiSelection()).toBe(true);
        expect(scenario.aoi).toEqual(extentA);
        expect(scenario.calibrated).toBe(false);

        // Simulate a calibration having been established for the current AOI (ticket 12's real
        // four-marker flow, not yet built — set directly here exactly as `mapCalibration` is set
        // directly elsewhere in this file, standing in for that future mechanism).
        scenario.calibrated = true;

        scenario.viewfinderExtent = extentB;
        scenario.viewfinderValid = true;
        expect(scenario.finishAoiSelection()).toBe(true);
        expect(scenario.aoi).toEqual(extentB);
        expect(scenario.calibrated).toBe(false);
    });
});

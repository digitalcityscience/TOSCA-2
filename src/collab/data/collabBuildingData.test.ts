import bbox from "@turf/bbox";
import { describe, expect, test } from "vitest";
import type { AOIExtent } from "../stores/collabCalibration";
import {
    collabBuildingDataset,
    collabFootprintsWithinAoi,
    markerRegistryForBuildings,
    validateCollabBuildingDataset,
} from "./collabBuildingData";

function feature(buildingId?: string, offset = 0): unknown {
    return {
        type: "Feature",
        properties: buildingId === undefined ? {} : { building_id: buildingId, city_scope_id: `B-${buildingId}` },
        geometry: {
            type: "Polygon",
            coordinates: [[
                [offset, 0],
                [offset + 0.1, 0],
                [offset + 0.1, 0.1],
                [offset, 0.1],
                [offset, 0],
            ]],
        },
    };
}

function collection(features: unknown[]): unknown {
    return { type: "FeatureCollection", features };
}

describe("Collab-owned building dataset validation (ticket 10)", () => {
    test("rejects missing and duplicate building_id with the offending feature named", () => {
        expect(() => validateCollabBuildingDataset(collection([feature()]), [])).toThrow("feature 0: missing building_id");
        expect(() => validateCollabBuildingDataset(collection([feature("G01"), feature("G01", 1)]), [])).toThrow(
            "Building G01: duplicate building_id"
        );
    });

    test("rejects non-numeric, duplicate, and map-calibration-reserved marker IDs", () => {
        const footprints = collection([feature("G01")]);
        expect(() => validateCollabBuildingDataset(footprints, [{ marker_id: "1", building_id: "G01" }])).toThrow(
            "marker_id must be numeric"
        );
        expect(() => validateCollabBuildingDataset(footprints, [
            { marker_id: 1, building_id: "G01" },
            { marker_id: 1, building_id: "G01" },
        ])).toThrow("duplicate marker_id 1");
        expect(() => validateCollabBuildingDataset(footprints, [{ marker_id: 200, building_id: "G01" }])).toThrow(
            "reserved for map calibration"
        );
    });

    test("filters valid out-of-AOI footprints without treating them as errors", () => {
        const dataset = validateCollabBuildingDataset(collection([feature("inside"), feature("outside", 2)]), []);
        const aoi: AOIExtent = { corners: [[-0.1, 0.2], [0.2, 0.2], [0.2, -0.1], [-0.1, -0.1]] };
        expect(collabFootprintsWithinAoi(dataset.footprints.features, aoi).map((item) => item.properties.building_id)).toEqual(["inside"]);
    });

    test("loads all 78 real footprints and resolves the Collab-owned marker mapping", () => {
        const dataset = collabBuildingDataset();
        expect(dataset.footprints.features).toHaveLength(78);
        const g28 = dataset.footprints.features.find((item) => item.properties.building_id === "G28");
        expect(g28).toBeDefined();

        const [minX, minY, maxX, maxY] = bbox(g28!);
        const aoi: AOIExtent = { corners: [[minX - 0.001, maxY + 0.001], [maxX + 0.001, maxY + 0.001], [maxX + 0.001, minY - 0.001], [minX - 0.001, minY - 0.001]] };
        const active = collabFootprintsWithinAoi(dataset.footprints.features, aoi);
        const registry = markerRegistryForBuildings(active.map((item) => item.properties.building_id));
        expect(registry.get(182)).toBe("G28");
        expect(registry.get(35)).toBe("G28");
        expect(registry.get(9999)).toBeUndefined();
    });
});

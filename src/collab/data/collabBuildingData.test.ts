import bbox from "@turf/bbox";
import { describe, expect, test } from "vitest";
import type { AOIExtent } from "../stores/collabCalibration";
import {
    classifyBuildingMarker,
    collabBuildingDataset,
    collabFootprintsWithinAoi,
    markerRegistryForBuildings,
    validateCollabBuildingDataset,
    type MarkerBuildingMapping,
} from "./collabBuildingData";
import { createMarkerObjectRegistry, MAP_CALIBRATION_MARKERS, REFERENCE_MARKERS } from "../stores/collabTracking";

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
        const g12 = dataset.footprints.features.find((item) => item.properties.building_id === "G12");
        expect(g12).toBeDefined();

        const [minX, minY, maxX, maxY] = bbox(g12!);
        const aoi: AOIExtent = { corners: [[minX - 0.001, maxY + 0.001], [maxX + 0.001, maxY + 0.001], [maxX + 0.001, minY - 0.001], [minX - 0.001, minY - 0.001]] };
        const active = collabFootprintsWithinAoi(dataset.footprints.features, aoi);
        const registry = markerRegistryForBuildings(active.map((item) => item.properties.building_id));
        expect(registry.get(12)).toBe("G12");
        expect(registry.get(9999)).toBeUndefined();
    });

    test("every declared mapping names a real building, and covers the marker ids the live rig reports", () => {
        const { footprints, markerMappings } = collabBuildingDataset();
        const buildingIds = new Set(footprints.features.map((item) => item.properties.building_id));
        for (const mapping of markerMappings) {
            expect(buildingIds.has(mapping.building_id)).toBe(true);
        }
        // The building markers observed on the 2026-08-31 :8053 feed. `193` arrived in the same
        // snapshot and is deliberately absent — no building has been identified for it, and
        // guessing one would silently move the wrong footprint.
        expect(markerMappings.map((mapping) => mapping.marker_id).sort((a, b) => a - b)).toEqual([12, 18, 24, 27, 47]);
    });
});

describe("classifyBuildingMarker", () => {
    const mappings: readonly MarkerBuildingMapping[] = [
        { marker_id: 12, building_id: "G12" },
        { marker_id: 18, building_id: "G18" },
    ];
    // Only G12's footprint has been loaded into the session, so only its mapping is active.
    const activeRegistry = createMarkerObjectRegistry([{ markerId: 12, objectId: "G12" }]);

    test("a mapped marker whose building is active in the AOI is tracked", () => {
        expect(classifyBuildingMarker(12, mappings, activeRegistry)).toEqual({ status: "tracked", buildingId: "G12" });
    });

    test("a mapped marker whose building is not loaded yet is reported as such, not as unmapped", () => {
        // The distinction the operator needs: the mapping is fine, the base city just isn't loaded.
        expect(classifyBuildingMarker(18, mappings, activeRegistry)).toEqual({ status: "not-loaded", buildingId: "G18" });
    });

    test("a marker no mapping mentions is unmapped and names no building", () => {
        // 193 is the live-rig case: Python reports it every snapshot, nothing moves, and the
        // tracking normalizer drops it without a word.
        expect(classifyBuildingMarker(193, mappings, activeRegistry)).toEqual({ status: "unmapped" });
    });

    test("camera-reference and map-calibration ids are reserved, never building markers", () => {
        expect(classifyBuildingMarker(REFERENCE_MARKERS[0]!.id, mappings, activeRegistry).status).toBe("reserved");
        expect(classifyBuildingMarker(MAP_CALIBRATION_MARKERS[0]!.id, mappings, activeRegistry).status).toBe("reserved");
    });

    test("a reserved id wins even if a mapping somehow claims it", () => {
        const claimed: readonly MarkerBuildingMapping[] = [{ marker_id: REFERENCE_MARKERS[0]!.id, building_id: "G12" }];
        expect(classifyBuildingMarker(REFERENCE_MARKERS[0]!.id, claimed, activeRegistry).status).toBe("reserved");
    });
});

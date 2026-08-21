import distance from "@turf/distance";
import { point, polygon } from "@turf/helpers";
import { describe, expect, test } from "vitest";
import type { AOIExtent, CollabTableConfig } from "./collabCalibration";
import {
    DEFAULT_COLLAB_TABLE_CONFIG,
    buildMapCalibration,
    deriveGroundScale,
    placeFootprintAt,
    tablePixelCorners,
} from "./collabCalibration";

const hamburgAOI: AOIExtent = {
    corners: [
        [9.98, 53.56],
        [10.0, 53.56],
        [10.0, 53.54],
        [9.98, 53.54],
    ],
};

describe("tablePixelCorners", () => {
    test("reads width/height/inset from config, not from a fixed constant", () => {
        const config: CollabTableConfig = {
            physicalTable: { widthCm: 200, heightCm: 100 },
            tablePixelSpace: { pixelsPerCm: 5 },
            projectionInset: { insetCm: 10 },
        };
        expect(tablePixelCorners(config)).toEqual([
            [50, 50],
            [950, 50],
            [950, 450],
            [50, 450],
        ]);
    });

    test("defaults have zero inset (no border baked in)", () => {
        expect(tablePixelCorners(DEFAULT_COLLAB_TABLE_CONFIG)).toEqual([
            [0, 0],
            [1600, 0],
            [1600, 800],
            [0, 800],
        ]);
    });
});

describe("buildMapCalibration", () => {
    test("pairs table-pixel corners with the AOI's geographic corners, >= 4 points", () => {
        const message = buildMapCalibration(hamburgAOI, DEFAULT_COLLAB_TABLE_CONFIG);

        expect(message.type).toBe("map_calibration");
        expect(message.points.length).toBeGreaterThanOrEqual(4);

        for (const p of message.points) {
            expect(p.pixel_position).toHaveLength(2);
            expect(p.lat_lon_position).toHaveLength(2);
        }

        // pixel_position matches table-pixel space; lat_lon_position is [lat, lon]
        // (protocol field name), flipped from the AOI's GeoJSON [lon, lat] corners.
        expect(message.points[0]).toEqual({
            pixel_position: [0, 0],
            lat_lon_position: [53.56, 9.98],
        });
        expect(message.points[2]).toEqual({
            pixel_position: [1600, 800],
            lat_lon_position: [53.54, 10.0],
        });
    });
});

describe("deriveGroundScale", () => {
    test("is derived from AOI width and usable table width, not hardcoded", () => {
        const config: CollabTableConfig = {
            physicalTable: { widthCm: 160, heightCm: 80 },
            tablePixelSpace: { pixelsPerCm: 10 },
            projectionInset: { insetCm: 0 },
        };
        const groundWidthMeters = distance(
            point(hamburgAOI.corners[0]),
            point(hamburgAOI.corners[1]),
            { units: "meters" }
        );
        const expectedScale = groundWidthMeters / 1.6; // 160cm usable width in metres

        expect(deriveGroundScale(hamburgAOI, config)).toBeCloseTo(expectedScale, 6);
    });

    test("changes when projection inset changes (nothing fixed)", () => {
        const noInset: CollabTableConfig = {
            ...DEFAULT_COLLAB_TABLE_CONFIG,
            projectionInset: { insetCm: 0 },
        };
        const withInset: CollabTableConfig = {
            ...DEFAULT_COLLAB_TABLE_CONFIG,
            projectionInset: { insetCm: 20 },
        };

        expect(deriveGroundScale(hamburgAOI, withInset)).toBeGreaterThan(
            deriveGroundScale(hamburgAOI, noInset)
        );
    });
});

describe("placeFootprintAt", () => {
    // A 10x10 metre-ish square footprint near [9.99, 53.55], well inside the Hamburg AOI.
    const footprint = polygon([
        [
            [9.9899, 53.5499],
            [9.9901, 53.5499],
            [9.9901, 53.5501],
            [9.9899, 53.5501],
            [9.9899, 53.5499],
        ],
    ]);

    test("translates the footprint centre to the target centre", () => {
        const targetCentre: [number, number] = [10.0, 53.56];
        const placed = placeFootprintAt(footprint, targetCentre, 0);

        const ring = placed.geometry.coordinates[0];
        const lons = ring.map((c) => c[0]);
        const lats = ring.map((c) => c[1]);
        const placedCentre: [number, number] = [
            (Math.min(...lons) + Math.max(...lons)) / 2,
            (Math.min(...lats) + Math.max(...lats)) / 2,
        ];

        expect(distance(point(placedCentre), point(targetCentre), { units: "meters" })).toBeLessThan(0.5);
    });

    test("preserves true-metric edge lengths (no flat-earth distortion)", () => {
        const originalRing = footprint.geometry.coordinates[0];
        const originalEdgeMeters = distance(
            point(originalRing[0]),
            point(originalRing[1]),
            { units: "meters" }
        );

        const placed = placeFootprintAt(footprint, [10.0, 53.56], 0);
        const placedRing = placed.geometry.coordinates[0];
        const placedEdgeMeters = distance(
            point(placedRing[0]),
            point(placedRing[1]),
            { units: "meters" }
        );

        expect(placedEdgeMeters).toBeCloseTo(originalEdgeMeters, 1);
    });

    test("rotates the footprint around the target centre", () => {
        const targetCentre: [number, number] = [10.0, 53.56];
        const unrotated = placeFootprintAt(footprint, targetCentre, 0);
        const rotated = placeFootprintAt(footprint, targetCentre, 90);

        const unrotatedFirstVertex = unrotated.geometry.coordinates[0][0];
        const rotatedFirstVertex = rotated.geometry.coordinates[0][0];

        expect(rotatedFirstVertex).not.toEqual(unrotatedFirstVertex);

        // Distance from centre to the first vertex is preserved under rotation.
        const unrotatedRadius = distance(point(targetCentre), point(unrotatedFirstVertex), { units: "meters" });
        const rotatedRadius = distance(point(targetCentre), point(rotatedFirstVertex), { units: "meters" });
        expect(rotatedRadius).toBeCloseTo(unrotatedRadius, 1);
    });
});

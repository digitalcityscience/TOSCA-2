import distance from "@turf/distance";
import { point, polygon } from "@turf/helpers";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { AOIExtent, CollabTableConfig } from "./collabCalibration";
import {
    DEFAULT_COLLAB_TABLE_CONFIG,
    ROTATION_JITTER_THRESHOLD_DEG,
    angularDistanceDeg,
    aoiBoundingBox,
    buildMapCalibration,
    calibrationMarkerSizePx,
    deriveGroundScale,
    deriveTrackedFootprint,
    footprintAnchorCentre,
    isAoiZoomSufficient,
    placeFootprintAt,
    tablePixelCorners,
    tableToAoiRotationOffsetDeg,
} from "./collabCalibration";

const hamburgAOI: AOIExtent = {
    corners: [
        [9.98, 53.56],
        [10.0, 53.56],
        [10.0, 53.54],
        [9.98, 53.54],
    ],
};

describe("calibrationMarkerSizePx (ticket 11)", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    test("falls back to a documented placeholder when unset", () => {
        vi.stubEnv("VITE_COLLAB_CALIBRATION_MARKER_SIZE_PX", undefined);
        expect(calibrationMarkerSizePx()).toBe(80);
    });

    test("reads the configured value from VITE_COLLAB_CALIBRATION_MARKER_SIZE_PX", () => {
        vi.stubEnv("VITE_COLLAB_CALIBRATION_MARKER_SIZE_PX", "150");
        expect(calibrationMarkerSizePx()).toBe(150);
    });

    test("falls back for an unparsable/non-positive value rather than propagating garbage", () => {
        vi.stubEnv("VITE_COLLAB_CALIBRATION_MARKER_SIZE_PX", "not-a-number");
        expect(calibrationMarkerSizePx()).toBe(80);
        vi.stubEnv("VITE_COLLAB_CALIBRATION_MARKER_SIZE_PX", "-10");
        expect(calibrationMarkerSizePx()).toBe(80);
    });
});

describe("tablePixelCorners", () => {
    test("reads width/height/inset from config, not from a fixed constant", () => {
        const config: CollabTableConfig = {
            physicalTable: { widthCm: 200, heightCm: 100 },
            tablePixelSpace: { pixelsPerCm: 5 },
            projectionInset: { insetCm: 10 },
            aoiScaleTarget: { groundScale: 500 },
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
            aoiScaleTarget: { groundScale: 500 },
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

describe("isAoiZoomSufficient", () => {
    test("rejects an AOI zoomed out further than the configured target ground scale", () => {
        const config: CollabTableConfig = {
            ...DEFAULT_COLLAB_TABLE_CONFIG,
            aoiScaleTarget: { groundScale: 1 }, // tiny target: any real AOI is "too zoomed out"
        };
        expect(isAoiZoomSufficient(hamburgAOI, config)).toBe(false);
    });

    test("accepts an AOI at or beyond (more zoomed in than) the configured target ground scale", () => {
        const config: CollabTableConfig = {
            ...DEFAULT_COLLAB_TABLE_CONFIG,
            aoiScaleTarget: { groundScale: 1_000_000 }, // huge target: any real AOI is zoomed in enough
        };
        expect(isAoiZoomSufficient(hamburgAOI, config)).toBe(true);
    });

    test("a smaller (more zoomed-in) AOI never fails once a larger one already passes", () => {
        const config: CollabTableConfig = {
            ...DEFAULT_COLLAB_TABLE_CONFIG,
            aoiScaleTarget: { groundScale: deriveGroundScale(hamburgAOI, DEFAULT_COLLAB_TABLE_CONFIG) },
        };
        const tighterAoi: AOIExtent = {
            corners: [
                [9.985, 53.555],
                [9.995, 53.555],
                [9.995, 53.545],
                [9.985, 53.545],
            ],
        };
        expect(isAoiZoomSufficient(hamburgAOI, config)).toBe(true);
        expect(isAoiZoomSufficient(tighterAoi, config)).toBe(true);
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

describe("footprintAnchorCentre (ticket 13, plan §\"do not silently change\" item 5)", () => {
    // An L-shaped (concave) footprint near [9.99, 53.55] — the shape the ticket calls out
    // specifically, since a concave polygon is where a bbox-centre anchor and a Turf-style
    // vertex-mean centroid land in visibly different places (a convex/regular shape would not
    // expose the difference).
    const baseLng = 9.99;
    const baseLat = 53.55;
    const u = 0.0002; // ~20m/unit at this latitude — a building-scale footprint
    const lShape = polygon([
        [
            [baseLng + 0 * u, baseLat + 0 * u],
            [baseLng + 2 * u, baseLat + 0 * u],
            [baseLng + 2 * u, baseLat + 1 * u],
            [baseLng + 1 * u, baseLat + 1 * u],
            [baseLng + 1 * u, baseLat + 2 * u],
            [baseLng + 0 * u, baseLat + 2 * u],
            [baseLng + 0 * u, baseLat + 0 * u],
        ],
    ]);

    /**
     * Turf's `centroid` is literally the arithmetic mean of every coordinate in the geometry
     * (including the ring's closing duplicate) — Vanilla's anchor (`moveBuilding.js`). Computed
     * here directly rather than pulling in `@turf/centroid` as a dependency for one test.
     */
    function vanillaStyleCentroid(feature: ReturnType<typeof polygon>): [number, number] {
        const ring = feature.geometry.coordinates[0]!;
        let xSum = 0;
        let ySum = 0;
        for (const coord of ring) {
            xSum += coord[0];
            ySum += coord[1];
        }
        return [xSum / ring.length, ySum / ring.length];
    }

    test("the bbox centre and Vanilla's vertex-mean centroid diverge for a concave footprint", () => {
        const bboxCentre = footprintAnchorCentre(lShape);
        const centroid = vanillaStyleCentroid(lShape);
        expect(distance(point(bboxCentre), point(centroid), { units: "meters" })).toBeGreaterThan(1);
    });

    test("placeFootprintAt anchors on the bbox centre: the placed footprint's bbox centre lands exactly on the target, its vertex-mean centroid does not", () => {
        const target: [number, number] = [10.0, 53.56];
        const placed = placeFootprintAt(lShape, target, 0);

        const placedBboxCentre = footprintAnchorCentre(placed);
        expect(distance(point(placedBboxCentre), point(target), { units: "meters" })).toBeLessThan(0.5);

        const placedCentroid = vanillaStyleCentroid(placed);
        expect(distance(point(placedCentroid), point(target), { units: "meters" })).toBeGreaterThan(1);
    });
});

describe("tableToAoiRotationOffsetDeg", () => {
    test("is zero when the AOI's top edge runs due east (aligned with the table)", () => {
        const alignedAoi: AOIExtent = {
            corners: [
                [9.98, 53.56],
                [10.0, 53.56],
                [10.0, 53.54],
                [9.98, 53.54],
            ],
        };
        expect(tableToAoiRotationOffsetDeg(alignedAoi)).toBeCloseTo(0, 1);
    });

    test("is non-zero when the AOI is rotated relative to the table", () => {
        const rotatedAoi: AOIExtent = {
            corners: [
                [9.98, 53.56],
                [10.0, 53.55],
                [9.99, 53.53],
                [9.97, 53.54],
            ],
        };
        expect(tableToAoiRotationOffsetDeg(rotatedAoi)).not.toBeCloseTo(0, 1);
    });
});

describe("angularDistanceDeg (A5)", () => {
    test("treats headings straddling the -180/+180 boundary as close, not ~360° apart", () => {
        expect(angularDistanceDeg(179.6, -179.8)).toBeCloseTo(0.6, 5);
    });

    test("matches naive absolute difference away from the wrap boundary", () => {
        expect(angularDistanceDeg(30, 45)).toBeCloseTo(15, 5);
        expect(angularDistanceDeg(45, 30)).toBeCloseTo(15, 5);
    });

    test("is zero for identical headings, including at exactly ±180°", () => {
        expect(angularDistanceDeg(180, -180)).toBeCloseTo(0, 5);
    });
});

describe("aoiBoundingBox (A1/A2)", () => {
    test("returns [minLng, minLat, maxLng, maxLat] spanning the AOI's corners", () => {
        expect(aoiBoundingBox(hamburgAOI)).toEqual([9.98, 53.54, 10.0, 53.56]);
    });
});

describe("deriveTrackedFootprint", () => {
    const footprint = polygon([
        [
            [9.9899, 53.5499],
            [9.9901, 53.5499],
            [9.9901, 53.5501],
            [9.9899, 53.5501],
            [9.9899, 53.5499],
        ],
    ]);

    test("applies the target rotation when there is no previous rotation", () => {
        const { appliedRotationDeg } = deriveTrackedFootprint(footprint, { lng: 10, lat: 53.56, rotation: 30 }, undefined, 0);
        expect(appliedRotationDeg).toBe(30);
    });

    test("adds the table→AOI rotation offset to the pose rotation", () => {
        const { appliedRotationDeg } = deriveTrackedFootprint(footprint, { lng: 10, lat: 53.56, rotation: 30 }, undefined, 15);
        expect(appliedRotationDeg).toBe(45);
    });

    test("holds the previous rotation when the change is under the jitter threshold", () => {
        const { appliedRotationDeg } = deriveTrackedFootprint(
            footprint,
            { lng: 10, lat: 53.56, rotation: 30 + (ROTATION_JITTER_THRESHOLD_DEG - 1) },
            30,
            0
        );
        expect(appliedRotationDeg).toBe(30);
    });

    test("applies the new rotation once the change meets the jitter threshold", () => {
        const { appliedRotationDeg } = deriveTrackedFootprint(
            footprint,
            { lng: 10, lat: 53.56, rotation: 30 + ROTATION_JITTER_THRESHOLD_DEG },
            30,
            0
        );
        expect(appliedRotationDeg).toBe(30 + ROTATION_JITTER_THRESHOLD_DEG);
    });

    test("A5: holds the previous rotation across the -180/+180 wrap when the true change is under the jitter threshold", () => {
        const { appliedRotationDeg } = deriveTrackedFootprint(
            footprint,
            { lng: 10, lat: 53.56, rotation: -179.8 },
            179.6,
            0
        );
        // Naive Math.abs(-179.8 - 179.6) = 359.4, which would wrongly apply; the true circular
        // distance is 0.6°, under the 5° threshold, so the previous rotation must be held.
        expect(appliedRotationDeg).toBe(179.6);
    });

    test("always translates the footprint to the pose centre, even when rotation is smoothed", () => {
        const targetCentre: [number, number] = [10.0, 53.56];
        const { feature } = deriveTrackedFootprint(footprint, { lng: targetCentre[0], lat: targetCentre[1], rotation: 30.5 }, 30, 0);

        const ring = feature.geometry.coordinates[0];
        const lons = ring.map((c) => c[0]);
        const lats = ring.map((c) => c[1]);
        const placedCentre: [number, number] = [
            (Math.min(...lons) + Math.max(...lons)) / 2,
            (Math.min(...lats) + Math.max(...lats)) / 2,
        ];
        expect(distance(point(placedCentre), point(targetCentre), { units: "meters" })).toBeLessThan(0.5);
    });
});

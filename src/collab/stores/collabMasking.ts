import type { Position } from "geojson";
import bbox from "@turf/bbox";
import flatten from "@turf/flatten";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "@helpers/geojson";

type BBox = [number, number, number, number];

/**
 * Physical-object masking escalation beyond the M1 "hide-layer" option (plan §13 option 2,
 * OD-2, ticket 10): cuts each tracked physical footprint out of any projected-context polygon it
 * overlaps, as a GeoJSON interior ring, so a filled MapLibre render of the result leaves the
 * physical model's table-space unpainted — projected context stops at its edge instead of
 * spilling onto it. This is the "dark hole" variant of plan §13 option 2: a `fill` layer with
 * holes, still pure MapLibre. `package.json` deps are reshape-protected (CLAUDE.md), so this
 * builds the hole rings by hand instead of adding a turf boolean-difference package.
 */

function outerRingsOf(feature: Feature<Polygon | MultiPolygon>): Position[][] {
    if (feature.geometry.type === "Polygon") {
        return [feature.geometry.coordinates[0]];
    }
    return flatten(feature).features.map((polygon) => polygon.geometry.coordinates[0]);
}

function bboxesOverlap(a: BBox, b: BBox): boolean {
    return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
}

/**
 * Cuts `physicalFootprints` out of every `context` polygon they overlap (bbox test, then a hole
 * ring per overlapping footprint — reversed winding per GeoJSON convention). Footprints that
 * don't overlap a given context polygon leave it untouched. Non-overlapping/empty inputs pass
 * `context` through unchanged (still split to one feature per outer ring, matching the masked
 * case's shape).
 */
export function maskContextAroundPhysicalFootprints(
    context: FeatureCollection<Polygon | MultiPolygon>,
    physicalFootprints: FeatureCollection<Polygon | MultiPolygon>
): FeatureCollection<Polygon> {
    const footprintRings = physicalFootprints.features.map((footprint) => ({
        bbox: bbox(footprint) as BBox,
        rings: outerRingsOf(footprint).map((ring) => [...ring].reverse()),
    }));

    const features: Feature<Polygon>[] = context.features.flatMap((feature) => {
        const contextBbox = bbox(feature) as BBox;
        const overlappingHoles = footprintRings
            .filter((footprint) => bboxesOverlap(contextBbox, footprint.bbox))
            .flatMap((footprint) => footprint.rings);

        return outerRingsOf(feature).map((outerRing) => ({
            type: "Feature" as const,
            id: feature.id,
            properties: feature.properties ?? {},
            geometry: { type: "Polygon" as const, coordinates: [outerRing, ...overlappingHoles] },
        }));
    });

    return { type: "FeatureCollection", features };
}

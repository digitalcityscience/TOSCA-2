import bbox from "@turf/bbox"
import { describe, expect, test } from "vitest"
import type { Feature, MultiPolygon, Polygon } from "geojson"

import {
    footprintCentre,
    registrationTargetFootprint,
} from "./collabBuildingRegistration"

/**
 * The registration target is the answer to a question no camera can answer: how the marker is
 * glued to the block. Getting it wrong is not a visual glitch — the operator aligns the block to
 * whatever is drawn, and that alignment becomes a permanent constant in the catalog. So the
 * target has to be the building's real footprint, at its real heading, at the block's size, and
 * anchored where Python anchors it.
 */

function square(centreLng: number, centreLat: number, half = 0.0001): Feature<Polygon> {
    return {
        type: "Feature",
        properties: { building_id: "G11" },
        geometry: {
            type: "Polygon",
            coordinates: [
                [
                    [centreLng - half, centreLat - half],
                    [centreLng + half, centreLat - half],
                    [centreLng + half, centreLat + half],
                    [centreLng - half, centreLat + half],
                    [centreLng - half, centreLat - half],
                ],
            ],
        },
    }
}

/** A trapezoid, like G11 actually is — a square cannot catch a shape-distorting bug. */
function trapezoid(): Feature<Polygon> {
    return {
        type: "Feature",
        properties: { building_id: "G11" },
        geometry: {
            type: "Polygon",
            coordinates: [
                [
                    [10.0, 53.0],
                    [10.0004, 53.00005],
                    [10.00035, 53.0002],
                    [10.00005, 53.00018],
                    [10.0, 53.0],
                ],
            ],
        },
    }
}

function edgeBearings(feature: Feature<Polygon>): number[] {
    const ring = feature.geometry.coordinates[0]
    const bearings: number[] = []
    for (let index = 0; index < ring.length - 1; index++) {
        const [x1, y1] = ring[index]
        const [x2, y2] = ring[index + 1]
        bearings.push((Math.atan2(x2 - x1, y2 - y1) * 180) / Math.PI)
    }
    return bearings
}

function edgeLengths(feature: Feature<Polygon>): number[] {
    const ring = feature.geometry.coordinates[0]
    const lengths: number[] = []
    for (let index = 0; index < ring.length - 1; index++) {
        const [x1, y1] = ring[index]
        const [x2, y2] = ring[index + 1]
        lengths.push(Math.hypot(x2 - x1, y2 - y1))
    }
    return lengths
}

describe("registrationTargetFootprint", () => {
    test("shrinks the footprint to the block's size", () => {
        const target = registrationTargetFootprint(square(10, 53), 0.5)

        const [minX, minY, maxX, maxY] = bbox(target)
        expect(maxX - minX).toBeCloseTo(0.0001, 9)
        expect(maxY - minY).toBeCloseTo(0.0001, 9)
    })

    test("keeps the building's real heading, which is the whole thing being aligned to", () => {
        const original = trapezoid()

        const target = registrationTargetFootprint(original, 0.5632)

        expect(edgeBearings(target)).toEqual(
            edgeBearings(original).map((bearing) => expect.closeTo(bearing, 6))
        )
    })

    test("keeps the shape, so a trapezoid stays that trapezoid", () => {
        const original = trapezoid()

        const target = registrationTargetFootprint(original, 0.25)

        const originalLengths = edgeLengths(original)
        const ratios = edgeLengths(target).map((length, index) => length / originalLengths[index])
        for (const ratio of ratios) {
            expect(ratio).toBeCloseTo(0.25, 9)
        }
    })

    test("anchors on the bounding-box centre, where Python anchors it", () => {
        // A centroid anchor would move the target off the footprint Python later draws for the
        // same building, and the operator would be aligning to something the runtime never
        // reproduces.
        const original = trapezoid()

        const target = registrationTargetFootprint(original, 0.3)

        expect(footprintCentre(target)[0]).toBeCloseTo(footprintCentre(original)[0], 12)
        expect(footprintCentre(target)[1]).toBeCloseTo(footprintCentre(original)[1], 12)
    })

    test("a factor of one changes nothing", () => {
        const original = trapezoid()

        expect(registrationTargetFootprint(original, 1).geometry).toEqual(original.geometry)
    })

    test("keeps the feature's properties, so the layer can label it", () => {
        expect(registrationTargetFootprint(trapezoid(), 0.5).properties).toEqual({
            building_id: "G11",
        })
    })

    test("handles a MultiPolygon building", () => {
        const multi: Feature<MultiPolygon> = {
            type: "Feature",
            properties: {},
            geometry: {
                type: "MultiPolygon",
                coordinates: [square(10, 53).geometry.coordinates, square(10.001, 53).geometry.coordinates],
            },
        }

        const target = registrationTargetFootprint(multi, 0.5)

        const [minX, , maxX] = bbox(target)
        expect(maxX - minX).toBeCloseTo(0.0006, 9)
    })

    test("a non-positive scale is refused rather than collapsing the target to a point", () => {
        // A target drawn as a dot is one the operator cannot align anything to, and they would
        // have no way to tell that from "this building has no footprint".
        expect(() => registrationTargetFootprint(trapezoid(), 0)).toThrow(/positive/)
        expect(() => registrationTargetFootprint(trapezoid(), -0.5)).toThrow(/positive/)
    })
})

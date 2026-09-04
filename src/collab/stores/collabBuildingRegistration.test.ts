import bbox from "@turf/bbox"
import { describe, expect, test } from "vitest"
import type { Feature, MultiPolygon, Polygon, Position } from "geojson"

import {
    footprintCentre,
    placedAtCentre,
    targetCentreOnTable,
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

describe("placedAtCentre", () => {
    test("moves the footprint onto the given centre", () => {
        const moved = placedAtCentre(trapezoid(), [10.5, 53.9]);

        expect(footprintCentre(moved)[0]).toBeCloseTo(10.5, 9);
        expect(footprintCentre(moved)[1]).toBeCloseTo(53.9, 9);
    });

    test("keeps every edge's heading, which is the only thing being aligned to", () => {
        const original = trapezoid();

        const moved = placedAtCentre(original, [10.5, 53.9]);

        expect(edgeBearings(moved)).toEqual(
            edgeBearings(original).map((bearing) => expect.closeTo(bearing, 9))
        );
    });

    test("keeps the shape and size", () => {
        const original = trapezoid();

        const moved = placedAtCentre(original, [9.0, 52.0]);

        const originalLengths = edgeLengths(original);
        edgeLengths(moved).forEach((length, index) => {
            expect(length).toBeCloseTo(originalLengths[index], 12);
        });
    });

    test("a target for a building kilometres away still lands inside the AOI", () => {
        // The bug this exists for. G11's real footprint sits ~4.4 km south of the rig's calibrated
        // AOI, so a target drawn at the building's true coordinates rendered perfectly and
        // entirely off the table — the pipeline was working and the table looked broken.
        const realG11: Feature<Polygon> = square(10.010128, 53.533889, 0.0002);
        const aoiCentre: [number, number] = [10.0107, 53.5737];

        const target = placedAtCentre(registrationTargetFootprint(realG11, 0.5632), aoiCentre);

        const [minX, minY, maxX, maxY] = bbox(target);
        expect(minY).toBeGreaterThan(53.573);
        expect(maxY).toBeLessThan(53.575);
        expect(minX).toBeGreaterThan(10.010);
        expect(maxX).toBeLessThan(10.012);
    });
})

describe("targetCentreOnTable", () => {
    /**
     * The table image is two camera frames hstacked, so there is a seam straight down its middle
     * — at table pixel ~800 of 1600. The alignment target used to be drawn at the AOI centre,
     * which lands exactly on it: a marker there is split between two frames and decodes as
     * nothing, or as a phantom id. The operator sees the block dead centre on the turquoise and
     * the server reports no marker anywhere near the target, with nothing to act on.
     */
    const square: [Position, Position, Position, Position] = [
        [10.0, 53.6], // top-left
        [10.4, 53.6], // top-right
        [10.4, 53.4], // bottom-right
        [10.0, 53.4], // bottom-left
    ];

    test("the target sits off the seam, not on it", () => {
        const centre = targetCentreOnTable(square, 160);

        // 10 cm of a 160 cm table is 1/16 of its width, east of the middle.
        expect(centre[0]).toBeCloseTo(10.2 + 0.4 / 16, 10);
        expect(centre[1]).toBeCloseTo(53.5, 10);
    });

    test("no offset puts it back at the centre, so the seam case is the deliberate one", () => {
        const centre = targetCentreOnTable(square, 160, 0);

        expect(centre[0]).toBeCloseTo(10.2, 10);
        expect(centre[1]).toBeCloseTo(53.5, 10);
    });

    test("the offset follows the table's own axis, not true east", () => {
        // An AOI the operator drew rotated is still a table with a seam down its middle, and the
        // seam runs along the table's axes. Offsetting by true east would walk along the seam
        // instead of away from it.
        const rotated: [Position, Position, Position, Position] = [
            [10.2, 53.6], // top-left
            [10.4, 53.5], // top-right
            [10.2, 53.4], // bottom-right
            [10.0, 53.5], // bottom-left
        ];

        const centre = targetCentreOnTable(rotated, 160);

        // Moved along the top-left -> top-right edge, which here runs south-east.
        expect(centre[0]).toBeGreaterThan(10.2);
        expect(centre[1]).toBeLessThan(53.5);
    });

    test("the offset stays inside the table however wide it is", () => {
        // A guard, not a nicety: an offset that walked off the AOI would put the target somewhere
        // the projector cannot draw and the cameras cannot see, which is the failure it exists to
        // prevent, reintroduced from the other side.
        const centre = targetCentreOnTable(square, 8);

        expect(centre[0]).toBeGreaterThan(10.0);
        expect(centre[0]).toBeLessThan(10.4);
    });
});

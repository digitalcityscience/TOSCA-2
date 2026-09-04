import bbox from "@turf/bbox"
import type { Feature, MultiPolygon, Polygon, Position } from "geojson"

/**
 * The alignment target a registration is done against.
 *
 * Registering a block has to establish one thing that no camera can measure: how the ArUco marker
 * is glued to the block relative to the building it stands for. The same marker fixed straight,
 * sideways or upside down produces an identical reading, so the information is simply not in the
 * data — a human supplies it once.
 *
 * The old registration tool asked for it in a terminal, which cannot show anyone which way a
 * building faces, so it recorded whatever heading the block happened to be lying at and the
 * system treated that as truth. This module is the other half of the fix: project the building's
 * own footprint onto the table at its real heading, and the operator answers the question by
 * turning the block parallel to it rather than by typing a number nobody can know.
 *
 * Parallel, not on top of — only the angle is being measured, and position comes from live
 * tracking every frame. That is what lets an operator register at the left, centre and right of
 * the table in turn to check that both cameras read the same heading.
 */

/**
 * `footprint` shrunk to the size of its physical block, about its own bounding-box centre.
 *
 * Anchored on the bbox centre and not the centroid because that is the anchor Python's catalog
 * is normalized around (`physical_building_catalog.COORDINATE_SYSTEM.anchor`). A target drawn
 * about a different point would sit a metre or so off the footprint Python later draws for the
 * same building, and the operator would be aligning to something the runtime never reproduces.
 *
 * Scaled in degrees rather than geodesically: over the few metres a 1:500 block spans, the local
 * degree-to-metre factors are constant to far below the precision of laying a block down by
 * hand, so a uniform scaling about the centre preserves the shape exactly at this size — and it
 * keeps the target a pure function of the footprint, with no projection to disagree with Python's.
 */
export function registrationTargetFootprint<T extends Polygon | MultiPolygon>(
    footprint: Feature<T>,
    modelScaleFactor: number
): Feature<T> {
    if (!(modelScaleFactor > 0)) {
        throw new Error(`model scale factor must be positive, got ${modelScaleFactor}`)
    }
    const [minX, minY, maxX, maxY] = bbox(footprint)
    const centreX = (minX + maxX) / 2
    const centreY = (minY + maxY) / 2
    const shrink = (position: Position): Position => [
        centreX + (position[0] - centreX) * modelScaleFactor,
        centreY + (position[1] - centreY) * modelScaleFactor,
    ]
    const geometry =
        footprint.geometry.type === "Polygon"
            ? {
                type: "Polygon" as const,
                coordinates: (footprint.geometry.coordinates as Position[][]).map((ring) =>
                    ring.map(shrink)
                ),
            }
            : {
                type: "MultiPolygon" as const,
                coordinates: (footprint.geometry.coordinates as Position[][][]).map((polygon) =>
                    polygon.map((ring) => ring.map(shrink))
                ),
            }
    return { ...footprint, geometry: geometry as T }
}

/**
 * `footprint` moved so its bounding-box centre lands on `centre`, keeping its heading.
 *
 * The alignment target has to be drawn *inside the calibrated AOI*, not at the building's real
 * geographic location. This is not a compromise, it is the correct place for it: the reference
 * being measured is an ANGLE, and the block's position comes from live tracking every frame, so
 * where the target sits carries no information at all. Drawing it at the building's true
 * coordinates does carry one thing — a serious bug. The rig's AOI sits 4.4 km north of G11's
 * actual footprint, so the target was rendered correctly and entirely off-screen, and the table
 * looked broken while every part of the pipeline was working.
 *
 * Moving the map to the building instead is not an option: the AOI is the calibrated mapping
 * between table pixels and the world, and panning it would break the very homography the whole
 * session is built on.
 *
 * A pure translation in degrees, so every edge keeps its bearing. Over the few kilometres this
 * can move a footprint, the longitude-to-metre factor changes by well under a tenth of a percent,
 * which works out below 0.05 degrees of heading on a 34 m building — far under the precision of
 * laying a block down by hand, and not worth a reprojection that could disagree with Python's.
 */
export function placedAtCentre<T extends Polygon | MultiPolygon>(
    footprint: Feature<T>,
    centre: Position
): Feature<T> {
    const [currentX, currentY] = footprintCentre(footprint)
    const deltaX = centre[0] - currentX
    const deltaY = centre[1] - currentY
    const move = (position: Position): Position => [position[0] + deltaX, position[1] + deltaY]
    const geometry =
        footprint.geometry.type === "Polygon"
            ? {
                type: "Polygon" as const,
                coordinates: (footprint.geometry.coordinates as Position[][]).map((ring) =>
                    ring.map(move)
                ),
            }
            : {
                type: "MultiPolygon" as const,
                coordinates: (footprint.geometry.coordinates as Position[][][]).map((polygon) =>
                    polygon.map((ring) => ring.map(move))
                ),
            }
    return { ...footprint, geometry: geometry as T }
}

/** Where a footprint's target sits, for centring the map on it. */
export function footprintCentre(footprint: Feature<Polygon | MultiPolygon>): Position {
    const [minX, minY, maxX, maxY] = bbox(footprint)
    return [(minX + maxX) / 2, (minY + maxY) / 2]
}

/** How the registration panel is doing, so it can say something other than nothing. */
export type RegistrationPhase = "idle" | "aiming" | "sending" | "registered" | "refused"

export interface BuildingRegistrationState {
    /** Which building the operator is registering, or `null` when the panel is closed. */
    buildingId: string | null
    phase: RegistrationPhase
    /** Python's word on the last attempt — the marker it chose, or why it refused. */
    message: string | null
    markerId: number | null
    /**
     * The marker the operator named outright, or `null` to let position decide.
     *
     * Distinct from `markerId`, which is Python's *answer*. This is the operator overruling the
     * question: proximity infers which block this is through the AOI-centre → projector → table
     * → camera → pixel chain, and when a link in it is off the refusal is identical whatever the
     * cause and there is nothing to act on. Naming the id needs none of that chain to be right.
     */
    chosenMarkerId: number | null
}

export const IDLE_BUILDING_REGISTRATION: BuildingRegistrationState = {
    buildingId: null,
    phase: "idle",
    message: null,
    markerId: null,
    chosenMarkerId: null,
}

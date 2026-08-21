import type { Feature, MultiPolygon, Polygon, Position } from "geojson"
import bbox from "@turf/bbox"
import bearing from "@turf/bearing"
import distance from "@turf/distance"
import { point } from "@turf/helpers"
import transformRotate from "@turf/transform-rotate"
import transformTranslate from "@turf/transform-translate"

/**
 * Physical / scale / AOI configuration model for the tangible table (plan §6, B6, M0.5).
 * `collabCalibration.ts` only models this config and produces the `map_calibration` handshake —
 * it does NOT reimplement Python's table→AOI homography or any tracking-coordinate conversion
 * (B3/OD-6). Python owns the pipeline through geographic (WGS84) output; this module only
 * (a) models scale/AOI/table config and (b) builds the correspondences TOSCA sends Python.
 */

/** The physical tangible-table hardware footprint, centimetres (measured, not app-configurable). */
export interface PhysicalTableConfig {
    widthCm: number
    heightCm: number
}

/**
 * The unified table-pixel space Python's stitched, rectified camera image reports marker
 * positions in (plan §5a: two cameras, `getPerspectiveTransform`'d + hstacked). Fixed by
 * Python's `camera_stitching.py`, not an app-level scale decision.
 */
export interface TablePixelSpaceConfig {
    pixelsPerCm: number
}

/**
 * Margin, in centimetres, kept clear at each table edge before the projectable AOI starts.
 * Explicitly configurable — B6 forbids hardcoding a fixed border size until physical testing.
 */
export interface ProjectionInsetConfig {
    insetCm: number
}

/** Full config the calibration/scale routines read from — nothing below is hardcoded in the routines themselves. */
export interface CollabTableConfig {
    physicalTable: PhysicalTableConfig
    tablePixelSpace: TablePixelSpaceConfig
    projectionInset: ProjectionInsetConfig
}

/**
 * Default config: physical table dimensions (plan §5a: 160×80 cm rig) and table-pixel density
 * (plan §5a/§5b: 10 px/cm, ~1600×800, fixed by Python's stitching pipeline) are real hardware/
 * protocol facts, not scale decisions. `projectionInset` defaults to no border — a neutral
 * placeholder, not a fixed border size (B6) — and callers are expected to override it from
 * measured/config values once physical testing (M3) picks a real one.
 */
export const DEFAULT_COLLAB_TABLE_CONFIG: CollabTableConfig = {
    physicalTable: { widthCm: 160, heightCm: 80 },
    tablePixelSpace: { pixelsPerCm: 10 },
    projectionInset: { insetCm: 0 },
}

/**
 * An operator-chosen area of interest, as four geographic corners (GeoJSON `[lon, lat]`),
 * ordered top-left, top-right, bottom-right, bottom-left — matched index-wise against the
 * table-pixel corners when building the `map_calibration` handshake.
 */
export interface AOIExtent {
    corners: [Position, Position, Position, Position]
}

/** One `pixel_position` ↔ `lat_lon_position` correspondence in the `map_calibration` handshake (plan §5b). */
export interface MapCalibrationPoint {
    pixel_position: [number, number]
    lat_lon_position: [number, number]
}

/**
 * The `map_calibration` message TOSCA sends Python at session start (plan §5b,
 * `server.py:107-145` / `client_test_web.py:10-15`). `pixel_position` is in the unified
 * table-pixel space; `lat_lon_position` is `[lat, lon]` (protocol field name, despite the
 * GeoJSON `[lon, lat]` convention used elsewhere in this module).
 */
export interface MapCalibrationMessage {
    type: "map_calibration"
    points: MapCalibrationPoint[]
}

function usableTableWidthCm(config: CollabTableConfig): number {
    return config.physicalTable.widthCm - 2 * config.projectionInset.insetCm
}

/**
 * The four corners of the projectable (inset-adjusted) area in table-pixel space, ordered
 * top-left, top-right, bottom-right, bottom-left — matching `AOIExtent.corners` ordering.
 */
export function tablePixelCorners(config: CollabTableConfig): [Position, Position, Position, Position] {
    const { pixelsPerCm } = config.tablePixelSpace
    const insetPx = config.projectionInset.insetCm * pixelsPerCm
    const widthPx = config.physicalTable.widthCm * pixelsPerCm
    const heightPx = config.physicalTable.heightCm * pixelsPerCm
    const left = insetPx
    const top = insetPx
    const right = widthPx - insetPx
    const bottom = heightPx - insetPx
    return [
        [left, top],
        [right, top],
        [right, bottom],
        [left, bottom],
    ]
}

/**
 * Builds the `map_calibration` correspondences for a chosen AOI: each table-pixel corner
 * (from config) paired with the matching geographic corner of the AOI the operator selected.
 * This is TOSCA's whole role in the calibration handshake (B3) — Python does the table→AOI
 * homography once it receives this message; this routine does not.
 */
export function buildMapCalibration(aoi: AOIExtent, config: CollabTableConfig): MapCalibrationMessage {
    const pixelCorners = tablePixelCorners(config)
    const points: MapCalibrationPoint[] = aoi.corners.map((corner, index) => ({
        pixel_position: pixelCorners[index] as [number, number],
        lat_lon_position: [corner[1], corner[0]],
    }))
    return { type: "map_calibration", points }
}

/**
 * The ratio of real-world ground distance to physical table distance for a chosen AOI —
 * derived from the AOI's true geodesic width (haversine, not the flat-earth `111320 m/deg`
 * approximation Vanilla used) and the table's usable, inset-adjusted width. Nothing here is a
 * fixed 1:500 — both inputs come from the AOI and config (B6).
 */
export function deriveGroundScale(aoi: AOIExtent, config: CollabTableConfig): number {
    const [topLeft, topRight] = aoi.corners
    const groundWidthMeters = distance(point(topLeft), point(topRight), { units: "meters" })
    const usableTableWidthMeters = usableTableWidthCm(config) / 100
    return groundWidthMeters / usableTableWidthMeters
}

function bboxCentre(feature: Feature<Polygon | MultiPolygon>): Position {
    const [minX, minY, maxX, maxY] = bbox(feature)
    return [(minX + maxX) / 2, (minY + maxY) / 2]
}

/**
 * Places a known building footprint at a detected geographic centre + rotation: translate the
 * footprint from its current (bbox) centre to `targetCentre` along the geodesic bearing/distance
 * between them, then rotate it around `targetCentre` by `rotationDeg`. Mirrors the Vanilla
 * reference behaviour (`moveBuilding.js`, plan §5e) without reimplementing any tracking-coordinate
 * pipeline — `targetCentre` and `rotationDeg` are assumed already geo-referenced by Python (B3).
 */
export function placeFootprintAt<T extends Polygon | MultiPolygon>(
    footprint: Feature<T>,
    targetCentre: Position,
    rotationDeg: number
): Feature<T> {
    const originalCentre = bboxCentre(footprint)
    const from = point(originalCentre)
    const to = point(targetCentre)
    const moveDistance = distance(from, to, { units: "meters" })
    const moveBearing = bearing(from, to)
    const translated = transformTranslate(footprint, moveDistance, moveBearing, { units: "meters" })
    return transformRotate(translated, rotationDeg, { pivot: targetCentre })
}

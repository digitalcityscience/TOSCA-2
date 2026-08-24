import type { Feature, MultiPolygon, Polygon, Position } from "geojson"
import bbox from "@turf/bbox"
import bearing from "@turf/bearing"
import distance from "@turf/distance"
import { point, polygon } from "@turf/helpers"
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

/**
 * The target real-world:table ground scale (same ratio {@link deriveGroundScale} returns —
 * real-world metres per table metre) an operator's AOI selection should be zoomed to before it's
 * accepted. Explicitly configurable, like `ProjectionInsetConfig` — B6 forbids fixing this until
 * physical-table testing (M3) picks a final number.
 */
export interface AoiScaleTargetConfig {
    groundScale: number
}

/** Full config the calibration/scale routines read from — nothing below is hardcoded in the routines themselves. */
export interface CollabTableConfig {
    physicalTable: PhysicalTableConfig
    tablePixelSpace: TablePixelSpaceConfig
    projectionInset: ProjectionInsetConfig
    aoiScaleTarget: AoiScaleTargetConfig
}

/**
 * Reads the measured projection inset from `VITE_COLLAB_PROJECTION_INSET_CM` (ticket 10, B6):
 * once edge-accuracy/seam-continuity testing on the real table picks a border size, it's set
 * there — never hardcoded in this module. Unset/unparsable falls back to `0` (no border), the
 * same neutral placeholder used before a physical measurement exists.
 */
function measuredProjectionInsetCm(): number {
    const raw = Number(import.meta.env.VITE_COLLAB_PROJECTION_INSET_CM ?? "")
    return Number.isFinite(raw) && raw >= 0 ? raw : 0
}

/**
 * Reads the target AOI ground scale from `VITE_COLLAB_TARGET_GROUND_SCALE` (B6: "do not invent a
 * fixed scale", `TOSCA-Collab-First-idea.md` §"real-world AOI size"/`Implementation-Plan.md` B6) —
 * final number is set here once M3 physical-table testing picks one, never hardcoded in the
 * validation routine itself. Unset/unparsable falls back to `500`, the same order-of-magnitude
 * placeholder already used as a non-committed reference point elsewhere in the docs (and in
 * `client_test_web.py`'s sample ~1000m×500m AOI over an ~1.6m×0.8m table) — a working default for
 * the PoC, not a scale decision.
 */
function targetGroundScale(): number {
    const raw = Number(import.meta.env.VITE_COLLAB_TARGET_GROUND_SCALE ?? "")
    return Number.isFinite(raw) && raw > 0 ? raw : 500
}

/**
 * Default config: physical table dimensions (plan §5a: 160×80 cm rig) and table-pixel density
 * (plan §5a/§5b: 10 px/cm, ~1600×800, fixed by Python's stitching pipeline) are real hardware/
 * protocol facts, not scale decisions. `projectionInset` and `aoiScaleTarget` read their measured
 * values from `VITE_COLLAB_PROJECTION_INSET_CM` / `VITE_COLLAB_TARGET_GROUND_SCALE` (falling back
 * to provisional placeholders until physical testing, M3, sets final ones) — B6 forbids hardcoding
 * either.
 */
export const DEFAULT_COLLAB_TABLE_CONFIG: CollabTableConfig = {
    physicalTable: { widthCm: 160, heightCm: 80 },
    tablePixelSpace: { pixelsPerCm: 10 },
    projectionInset: { insetCm: measuredProjectionInsetCm() },
    aoiScaleTarget: { groundScale: targetGroundScale() },
}

/**
 * An operator-chosen area of interest, as four geographic corners (GeoJSON `[lon, lat]`),
 * ordered top-left, top-right, bottom-right, bottom-left — matched index-wise against the
 * table-pixel corners when building the `map_calibration` handshake.
 */
export interface AOIExtent {
    corners: [Position, Position, Position, Position]
}

/**
 * `[minLng, minLat, maxLng, maxLat]` bounding box of an AOI's corners (A1/A2) — used by the Table
 * window to fit its viewport to the operator's selected AOI before locking it, instead of showing
 * the generic `VITE_MAP_START_*` viewport. Control remains authoritative for the AOI itself; this
 * is a pure derivation, not a second AOI-selection mechanism.
 */
export function aoiBoundingBox(aoi: AOIExtent): [number, number, number, number] {
    const ring = [...aoi.corners, aoi.corners[0]]
    return bbox(polygon([ring])) as [number, number, number, number]
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

/**
 * Whether a candidate AOI is zoomed in enough to accept: its ground scale must be at or below
 * `config.aoiScaleTarget.groundScale` (fewer real-world metres packed into each table metre than
 * the target = zoomed in enough or more). A *smaller* selected area (higher zoom, lower ground
 * scale) always passes — only "too zoomed out" (ground scale above target) is invalid, matching
 * the operator being free to pick a tighter AOI with no penalty.
 */
export function isAoiZoomSufficient(aoi: AOIExtent, config: CollabTableConfig): boolean {
    return deriveGroundScale(aoi, config) <= config.aoiScaleTarget.groundScale
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

/**
 * How far off due-east the AOI's "top" edge (`corners[0] → corners[1]`) runs — the table→AOI
 * rotation offset the frontend must add to tracked headings (plan §5b caveat: `rotation` arrives
 * in the table frame, not geo-transformed). `tablePixelCorners`' "no rotation" heading runs
 * left→right along the table's top edge (bearing 90°/due east); this is how far the AOI's
 * matching geographic edge deviates from that, so it can be added to a tracked pose's rotation
 * before rendering (plan §13).
 */
export function tableToAoiRotationOffsetDeg(aoi: AOIExtent): number {
    const [topLeft, topRight] = aoi.corners
    return bearing(point(topLeft), point(topRight)) - 90
}

/** Rotation changes under this threshold between renders are ignored (plan §5e, mirrors Vanilla `map.js:116-122,128`). */
export const ROTATION_JITTER_THRESHOLD_DEG = 5

/**
 * The shortest angular distance between two headings, in degrees, correctly handling the
 * `-180°/+180°` wrap boundary (A5) — e.g. `179.6°` and `-179.8°` are ~0.6° apart, not 359.4°.
 * A naive `Math.abs(a - b)` treats every wrap-around pair as maximally different, which would
 * defeat the jitter threshold below right at the boundary a full-rotation tracked object crosses
 * routinely.
 */
export function angularDistanceDeg(a: number, b: number): number {
    const wrapped = ((a - b + 180) % 360 + 360) % 360 - 180
    return Math.abs(wrapped)
}

/**
 * Derives a rendered footprint from a tracked pose (plan §13): places `footprint` at the pose's
 * geographic centre via {@link placeFootprintAt}, applying the table→AOI rotation offset (plan
 * §5b) and holding the previously-rendered rotation when the change is under the 5° jitter
 * threshold (plan §5e), measured as a wrap-safe circular distance (A5) — translation always
 * applies on every call; only rotation is smoothed.
 */
export function deriveTrackedFootprint<T extends Polygon | MultiPolygon>(
    footprint: Feature<T>,
    pose: { lng: number; lat: number; rotation: number },
    previousRotationDeg: number | undefined,
    rotationOffsetDeg: number
): { feature: Feature<T>; appliedRotationDeg: number } {
    const targetRotationDeg = pose.rotation + rotationOffsetDeg
    const appliedRotationDeg =
        previousRotationDeg !== undefined &&
        angularDistanceDeg(targetRotationDeg, previousRotationDeg) < ROTATION_JITTER_THRESHOLD_DEG
            ? previousRotationDeg
            : targetRotationDeg
    const feature = placeFootprintAt(footprint, [pose.lng, pose.lat], appliedRotationDeg)
    return { feature, appliedRotationDeg }
}

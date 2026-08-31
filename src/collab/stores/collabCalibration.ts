import type { Feature, MultiPolygon, Polygon, Position } from "geojson"
import bbox from "@turf/bbox"
import bearing from "@turf/bearing"
import distance from "@turf/distance"
import { point, polygon } from "@turf/helpers"
import transformRotate from "@turf/transform-rotate"

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
 * Fixed, AOI-independent calibration marker size in table CSS pixels — deliberately *not*
 * derived from the AOI's ground scale (that was Vanilla's `markers.js::updateMarkerSizes`
 * approach, a fixed real-world metre size scaled by the current zoom, which is what this
 * replaces). Whether the camera can decode a projected ArUco marker is a property of the
 * camera/table hardware, not of what real-world area the operator happens to be surveying —
 * tying marker size to AOI ground scale meant a large (zoomed-out) AOI silently shrank markers
 * below the camera's reliable-decode size in its weaker-coverage regions (live-rig diagnosis,
 * 2026-08-31: 45px marker unreadable in two of four table corners, 71-90px reliable in all four).
 * Safe because MapLibre's `anchor: "center"` positions a marker's element at its `setLngLat`
 * point regardless of the element's rendered size (CSS `translate(-50%, -50%)`) — resizing the
 * image never moves the calibration point the homography is actually built from.
 * Read from `VITE_COLLAB_CALIBRATION_MARKER_SIZE_PX` (B6: never hardcode a physically-tuned
 * number in the routine itself); unset/unparsable falls back to `90`, the largest size verified
 * reliable in that same live-rig session.
 */
export function calibrationMarkerSizePx(): number {
    const raw = Number(import.meta.env.VITE_COLLAB_CALIBRATION_MARKER_SIZE_PX ?? "")
    return Number.isFinite(raw) && raw > 0 ? raw : 90
}

/**
 * How far each calibration marker sits *inward* from its AOI corner, as a fraction of the AOI's
 * width — Vanilla's `state.js::MARKER_INSET_RATIO`, the rule this port had dropped.
 *
 * Without it a marker is centred exactly on an AOI corner, and since `buildMapCalibration` pairs
 * AOI corner *i* with table-pixel corner *i*, an AOI corner *is* a physical table corner: a
 * centre-anchored marker there has half its width hanging over the table edge before the projector
 * is even slightly out of alignment, which is what put the calibration markers off the physical
 * table (live rig, 2026-08-31). Vanilla never hit this because it inset every marker by 5% of the
 * overlay's width (`800 m × 0.05 = 40 m` on its 800×400 m overlay — 8 cm on this 160×80 cm table).
 *
 * Read from `VITE_COLLAB_CALIBRATION_MARKER_INSET_RATIO` (B6: a physically-tuned number is never
 * hardcoded in the routine itself); unset/unparsable falls back to Vanilla's proven `0.05`.
 */
export function calibrationMarkerInsetRatio(): number {
    // Read as a trimmed string first, not straight through `Number(... ?? "")` like the getters
    // above: `0` is a *meaningful* value here (deliberately no inset), and `Number("")` is also 0,
    // so an unset variable would otherwise be indistinguishable from an explicit zero and silently
    // disable the inset entirely.
    const raw = String(import.meta.env.VITE_COLLAB_CALIBRATION_MARKER_INSET_RATIO ?? "").trim()
    if (raw === "") {
        return 0.05
    }
    const parsed = Number(raw)
    return Number.isFinite(parsed) && parsed >= 0 && parsed < 0.5 ? parsed : 0.05
}

/**
 * {@link calibrationMarkerInsetRatio} expressed as a fraction of each axis of the AOI/table
 * rectangle, so the inset is the same *physical distance* on all four edges rather than the same
 * fraction (Vanilla insets by `MARKER_INSET_M` metres on both axes, not by 5% of each side): the
 * ratio is defined against the width, so the vertical fraction is scaled by the table's aspect —
 * `0.05` horizontally becomes `0.10` vertically on a 160×80 cm table, exactly as Vanilla's 40 m
 * inset was 5% of its 800 m width and 10% of its 400 m height.
 *
 * Taken from the table's aspect ratio rather than measured off the AOI, because the AOI is
 * aspect-locked to the table by construction (`collabScenario.viewfinderScreenCorners`) and degrees
 * of longitude and latitude are not the same physical length, so an AOI-measured ratio would be
 * latitude-dependent.
 */
export function calibrationMarkerInsetFractions(config: CollabTableConfig): { u: number, v: number } {
    const u = calibrationMarkerInsetRatio()
    const aspectRatio = config.physicalTable.widthCm / config.physicalTable.heightCm
    return { u, v: Math.min(u * aspectRatio, 0.5) }
}

/**
 * Bilinear interpolation inside a four-corner quad ordered top-left, top-right, bottom-right,
 * bottom-left — the ordering both {@link AOIExtent.corners} and {@link tablePixelCorners} use.
 * `(0, 0)` is the top-left corner, `(1, 1)` the bottom-right. Bilinear rather than a simple
 * axis-aligned offset so an AOI that is not perfectly axis-aligned still insets along its own
 * edges instead of along north/east.
 */
export function quadPointAt(corners: readonly Position[], u: number, v: number): Position {
    const [topLeft, topRight, bottomRight, bottomLeft] = corners
    const lerp = (from: number, to: number, t: number): number => from + (to - from) * t
    const top = [lerp(topLeft[0], topRight[0], u), lerp(topLeft[1], topRight[1], u)]
    const bottom = [lerp(bottomLeft[0], bottomRight[0], u), lerp(bottomLeft[1], bottomRight[1], u)]
    return [lerp(top[0], bottom[0], v), lerp(top[1], bottom[1], v)]
}

/**
 * The four `(u, v)` positions of the calibration markers within the AOI/table rectangle, in
 * {@link AOIExtent.corners} order (top-left, top-right, bottom-right, bottom-left) — one shared
 * definition so the geographic position a marker is *rendered* at and the table-pixel position it
 * is *paired with* in the `map_calibration` handshake can never drift apart. They are the same
 * four points expressed in two coordinate systems; a mismatch would silently skew Python's
 * homography rather than fail.
 */
export function calibrationMarkerUvs(config: CollabTableConfig): [[number, number], [number, number], [number, number], [number, number]] {
    const { u, v } = calibrationMarkerInsetFractions(config)
    return [
        [u, v],
        [1 - u, v],
        [1 - u, 1 - v],
        [u, 1 - v],
    ]
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
 *
 * `version: 2` (grilling doc Q3) is a defensive marker, not a protocol negotiation with Python —
 * it exists purely as an HMR backstop in `collabTrackingRender.ts`'s `handleTransportReconnected`,
 * in case Vite HMR ever preserves a Pinia store holding a pre-`version` cached payload across a
 * reload during development.
 */
export interface MapCalibrationMessage {
    type: "map_calibration"
    points: MapCalibrationPoint[]
    version: 2
}

/**
 * A simple, non-cryptographic checksum over an AOI's four corners (grilling doc Q3) — purely to
 * answer "is this cached calibration still for the same AOI", not for any security purpose. FNV-1a
 * over the corners' fixed-precision coordinates, so floating-point formatting noise doesn't change
 * the hash for the same practical AOI.
 */
export function aoiChecksum(aoi: AOIExtent): string {
    const FNV_OFFSET_BASIS = 0x811c9dc5
    const FNV_PRIME = 0x01000193
    let hash = FNV_OFFSET_BASIS
    const serialized = aoi.corners.map((corner) => corner.map((value) => value.toFixed(8)).join(",")).join(";")
    for (let i = 0; i < serialized.length; i++) {
        hash ^= serialized.charCodeAt(i)
        hash = Math.imul(hash, FNV_PRIME)
    }
    return (hash >>> 0).toString(16)
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
 * Builds the `map_calibration` correspondences for a chosen AOI: each of the four calibration
 * marker positions in table-pixel space (from config) paired with the same position expressed
 * geographically within the AOI the operator selected. This is TOSCA's whole role in the
 * calibration handshake (B3) — Python does the table→AOI homography once it receives this message;
 * this routine does not.
 *
 * Both sides go through the one {@link calibrationMarkerUvs} definition, so the marker inset
 * (see {@link calibrationMarkerInsetRatio}) applies identically in both coordinate systems and the
 * correspondence stays exact. Insetting only the rendered marker would leave this message claiming
 * the marker sits on the table's corner while it is projected 8 cm inside it — a homography skewed
 * by that much, with nothing failing to signal it.
 */
export function buildMapCalibration(aoi: AOIExtent, config: CollabTableConfig): MapCalibrationMessage {
    const pixelCorners = tablePixelCorners(config)
    const points: MapCalibrationPoint[] = calibrationMarkerUvs(config).map(([u, v]) => {
        const [pixelX, pixelY] = quadPointAt(pixelCorners, u, v)
        const [lng, lat] = quadPointAt(aoi.corners, u, v)
        return { pixel_position: [pixelX, pixelY] as [number, number], lat_lon_position: [lat, lng] as [number, number] }
    })
    return { type: "map_calibration", points, version: 2 }
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

/**
 * The one canonical footprint anchor TOSCA places every tracked building by (ticket 13, plan §"do
 * not silently change" item 5): a polygon's bounding-box centre. Vanilla (`moveBuilding.js`)
 * anchors on a Turf-style centroid (the arithmetic mean of every vertex) instead — for a concave
 * footprint (L-shaped, U-shaped) the two land in visibly different places, since the centroid is
 * pulled toward wherever the polygon has more vertices/mass while the bbox centre stays at the
 * geometric middle of the extent. TOSCA deliberately keeps the bbox centre (matching
 * `placeFootprintAt`'s pre-existing behaviour) rather than switching to match Vanilla. Every place
 * in this codebase that needs a footprint's centre point — `placeFootprintAt`'s translation target
 * and `collabTrackingRender.ts`'s simulation-result label anchor — calls this function rather than
 * recomputing a bbox centre inline, so a future change to the anchor convention is made once, here.
 * (The Control-View debug bbox overlay in `collabTrackingRender.ts` is a different concern — it
 * draws the already-placed footprint's bounding rectangle, not a centre point, so it calls `bbox`
 * directly and doesn't go through this function.)
 */
export function footprintAnchorCentre(feature: Feature<Polygon | MultiPolygon>): Position {
    const [minX, minY, maxX, maxY] = bbox(feature)
    return [(minX + maxX) / 2, (minY + maxY) / 2]
}

/** Metres per degree of latitude — the flat-earth constant Vanilla's `geo.js:destinationPoint` uses, at building scale. */
export const METERS_PER_DEGREE_LATITUDE = 111320

/** Metres per degree of longitude at `latitudeDeg` — shrinks toward the poles, which is the whole reason footprints are carried in metres. */
export function metersPerDegreeLongitude(latitudeDeg: number): number {
    return METERS_PER_DEGREE_LATITUDE * Math.cos((latitudeDeg * Math.PI) / 180)
}

/** A footprint's real-world extent, independent of where on Earth it is currently drawn. */
export interface FootprintMetricSize {
    widthM: number
    heightM: number
}

/**
 * A footprint's true size in metres, measured across its bounding box at its own latitude. The
 * building's identity is this shape, not the coordinates it happens to be stored at — see
 * {@link placeFootprintAt}.
 */
export function footprintMetricSize(footprint: Feature<Polygon | MultiPolygon>): FootprintMetricSize {
    const [minX, minY, maxX, maxY] = bbox(footprint)
    const midLat = (minY + maxY) / 2
    return {
        widthM: (maxX - minX) * metersPerDegreeLongitude(midLat),
        heightM: (maxY - minY) * METERS_PER_DEGREE_LATITUDE,
    }
}

/** Recursively rewrites every `Position` in a GeoJSON coordinate nest, preserving its shape. */
function mapCoordinates(coordinates: unknown, transform: (position: Position) => Position): unknown {
    const nest = coordinates as unknown[]
    return typeof nest[0] === "number" ? transform(coordinates as Position) : nest.map((child) => mapCoordinates(child, transform))
}

/**
 * Re-expresses `footprint` around `targetCentre`, carrying its shape in **metres** rather than
 * degrees: every vertex becomes an east/north offset from the footprint's own
 * {@link footprintAnchorCentre} — using that centre's latitude for the longitude scale — and is
 * then converted back to degrees using `targetCentre`'s latitude.
 *
 * This is what makes a building location-independent (2026-08-31, live rig): the Collab dataset's
 * footprints are stored at fixed Hamburg coordinates, but a physical block carries no geography —
 * it is a shape that must render at whatever pose Python reports, under whatever AOI the operator
 * chose, anywhere on Earth. A plain degree-space translation preserves the footprint's *degree*
 * dimensions, so moving it across latitudes silently stretches or squashes it east-west by
 * `cos(lat_from)/cos(lat_to)`; carrying the offsets in metres preserves the building's actual
 * dimensions instead.
 */
function reanchorFootprint<T extends Polygon | MultiPolygon>(footprint: Feature<T>, targetCentre: Position): Feature<T> {
    const [originLng, originLat] = footprintAnchorCentre(footprint)
    const [targetLng, targetLat] = targetCentre
    const originLngScale = metersPerDegreeLongitude(originLat)
    const targetLngScale = metersPerDegreeLongitude(targetLat)

    const coordinates = mapCoordinates(footprint.geometry.coordinates, ([lng, lat]) => {
        const eastM = (lng - originLng) * originLngScale
        const northM = (lat - originLat) * METERS_PER_DEGREE_LATITUDE
        return [targetLng + eastM / targetLngScale, targetLat + northM / METERS_PER_DEGREE_LATITUDE]
    })

    return {
        ...footprint,
        geometry: { ...footprint.geometry, coordinates } as T,
    }
}

/**
 * Places a known building footprint at a detected geographic centre + rotation: re-anchor the
 * footprint's metric shape onto `targetCentre` (see {@link reanchorFootprint}), then rotate it
 * around `targetCentre` by `rotationDeg`. `targetCentre` and `rotationDeg` are assumed already
 * geo-referenced by Python (B3).
 *
 * Rotation still goes through `transformRotate` with `targetCentre` as pivot, unchanged — its
 * datum and sign are calibrated against the physical rig (see {@link tableToAoiRotationOffsetDeg})
 * and are deliberately not touched by the metric-translation change.
 */
export function placeFootprintAt<T extends Polygon | MultiPolygon>(
    footprint: Feature<T>,
    targetCentre: Position,
    rotationDeg: number
): Feature<T> {
    return transformRotate(reanchorFootprint(footprint, targetCentre), rotationDeg, { pivot: targetCentre })
}

/**
 * How far off due-east the AOI's "top" edge (`corners[0] → corners[1]`) runs — the table→AOI
 * rotation offset the frontend must add to tracked headings (plan §5b caveat: `rotation` arrives
 * in the table frame, not geo-transformed). `tablePixelCorners`' "no rotation" heading runs
 * left→right along the table's top edge (bearing 90°/due east); this is how far the AOI's
 * matching geographic edge deviates from that, so it can be added to a tracked pose's rotation
 * before rendering (plan §13).
 *
 * This is the one named place the offset is computed (ticket 13, plan §"do not silently change"
 * item 4) — `collabTrackingRender.ts`'s AOI watcher calls this once and stores the result in
 * `collabSession.calibration.rotationOffsetDeg`, and `deriveTrackedFootprint` is the only consumer.
 * Its sign (the `- 90`) is pending physical verification against the real table/camera rig
 * (ticket 16); if hardware testing finds tracked buildings rotating the wrong way, flip the sign
 * here — nowhere else computes or re-derives this offset.
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

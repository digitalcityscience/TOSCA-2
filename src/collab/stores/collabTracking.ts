import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon, Position } from "geojson"
import { reportDeveloperError } from "@helpers/userFacingError"
import { DEFAULT_COLLAB_TABLE_CONFIG, calibrationMarkerUvs, quadPointAt } from "./collabCalibration"
import type { AOIExtent, CollabTableConfig, MapCalibrationMessage, MapCalibrationPoint } from "./collabCalibration"

/**
 * Transport-agnostic tracking boundary (plan §14, B1/B3). Views/stores program against
 * `TrackingEvent`/`TrackingSource` only — never pixels, cameras, or sockets. `MockTrackingSource`
 * below is the Milestone-1 implementation; `RealTrackingSource` (ticket 09) is a pure transport
 * swap that feeds the same `TrackingFeedNormalizer`.
 */
export interface TrackingEvent {
    type: "appeared" | "updated" | "disappeared"
    objectId: string
    pose: { lng: number; lat: number; rotation: number }
    confidence: number
    timestamp: number
    geometry?: Polygon | MultiPolygon
    bbox?: [number, number, number, number]
    cityScopeId?: string
    /** The ArUco id Python resolved this object from — what a `building_calibration` addresses. */
    markerId?: number
    /**
     * Where the marker was seen in Python's table-pixel space. Carried through because after
     * calibration this is the frontend's *only* view of pixel space, and the admin panel's
     * coverage grid needs to know which parts of the table a measurement has been taken on.
     */
    tableXPx?: number
    tableYPx?: number
}

/**
 * Whether the tracking feed is currently trustworthy (A3): `live` — normal marker snapshots are
 * being processed; `suppressed` — the feed is non-empty but every marker in it is Python's
 * ignored calibration marker (none resolve to a tracked object), meaning Python is momentarily
 * withholding normal object observations rather than reporting "no objects present"; `disconnected`
 * — the transport itself (e.g. the WebSocket) is down. `suppressed`/`disconnected` both mean
 * "freeze the last known poses", never "disappear everything" — only a genuine empty snapshot
 * (`features: []`) or an explicit presence timeout means an object is actually gone.
 */
export type TrackingAvailability = "live" | "suppressed" | "disconnected"

/**
 * Transport connection state to Python's `:8053` WebSocket — deliberately separate from
 * {@link TrackingAvailability} (marker-health-plan §1): a `live`/`suppressed` tracking feed
 * always implies `connected`, but `connected` does not imply `live` (Python may be connected and
 * momentarily withholding object observations). `connecting` — first attempt after `start()`;
 * `connected` — socket open; `reconnecting` — the socket dropped unexpectedly and
 * {@link RealTrackingSource} is retrying automatically; `disconnected` — no socket and no retry in
 * flight (either never started, or `stop()` was called explicitly).
 */
export type PythonConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected"

/** One of the four physical reference/corner markers a camera's calibration expects, per `calibration_markers.json`. */
export interface ReferenceMarkerConfig {
    cameraId: string
    id: number
    position: "top_left" | "top_right" | "bottom_right" | "bottom_left"
}

/**
 * The reference/corner markers `calibration_markers.json` currently configures per camera (two
 * cameras, four corners each) — mirrors the exact values in that file. Python never has to be
 * asked for this list: like the old Vanilla `MARKER_ID_TO_KEY` (`COUP-table-web-interface/js/state.js`),
 * these ids already arrive unfiltered in every ordinary tracking snapshot once the socket is open
 * (`table_to_geojson.py`/`marker.py` never strip them out) — no dedicated Python message needed to
 * see them. If the physical corner markers are ever re-taped to different ArUco ids, update this
 * list to match the new `calibration_markers.json`.
 */
export const REFERENCE_MARKERS: readonly ReferenceMarkerConfig[] = [
    { cameraId: "170", id: 72, position: "top_left" },
    { cameraId: "170", id: 63, position: "top_right" },
    { cameraId: "170", id: 62, position: "bottom_right" },
    { cameraId: "170", id: 40, position: "bottom_left" },
    { cameraId: "282", id: 60, position: "top_left" },
    { cameraId: "282", id: 52, position: "top_right" },
    { cameraId: "282", id: 48, position: "bottom_right" },
    { cameraId: "282", id: 65, position: "bottom_left" },
]

export interface TrackingSource {
    start(): void
    stop(): void
    onEvent(cb: (event: TrackingEvent) => void): void
    onAvailabilityChange(cb: (availability: TrackingAvailability) => void): void
}

/**
 * One feature of Python's post-calibration GeoJSON (`table_to_geojson.py:33-42`, plan §5b):
 * `geometry: Point [lon,lat]` (WGS84) + `properties:{ marker_id, rotation }`. `rotation` stays
 * in the table frame (not geo-transformed) — that offset is a rendering concern (plan §5e), not
 * this adapter's. `confidence` is not on the wire (Python already gates `>=1` before sending);
 * it is optional here only so the same shape can serve the mock, which does supply it.
 */
export interface TrackingMarkerFeatureProperties {
    marker_id: number
    rotation: number
    confidence?: number
    building_id?: string
    city_scope_id?: string
    center?: [number, number]
    bbox?: [number, number, number, number]
    /** Where the marker was seen in the stitched table image (`server.py`). Absent on the mock. */
    table_x_px?: number
    table_y_px?: number
    /** The blocks' milling scale, published by Python so nothing here restates 1:500. */
    model_scale?: number
    /** The session's global k times this building's scale residual, as actually drawn. */
    model_scale_factor?: number
}

export type TrackingMarkerFeatureCollection = FeatureCollection<Point | Polygon | MultiPolygon, TrackingMarkerFeatureProperties>

/** Python's ignored calibration marker (`marker.py::calibrationMarkerIds` companion, plan §17.4) — never a trackable object. */
export const IGNORED_MARKER_ID = 500

/**
 * Python's orphaned runtime corner-gate ids (plan §17.4) — dangerous if an object mapping
 * reuses them, since `toJSON` would emit *only* those ids while any is visible. Reserved here
 * for documentation/validation, not enforced against a specific object (OD-4). These are
 * ordinary building marker ids in this codebase's contract, not calibration markers — see
 * {@link IGNORED_MARKER_ID} for the id that plays that role (A3 suppression keys off it, not
 * these).
 */
export const RESERVED_BUILDING_MARKER_IDS: readonly number[] = [100, 101, 102, 103]

/** One of the four table-pixel corners `RESERVED_MARKER_REGISTRY`'s map-calibration markers occupy. */
export type MapCalibrationMarkerCorner = "top_left" | "top_right" | "bottom_left" | "bottom_right"

/** One map-calibration marker (ticket 08/12): a fixed ArUco id taped at a known table-pixel corner, read from the raw pre-calibration marker dictionary to derive `map_calibration`'s pixel corners. */
export interface MapCalibrationMarkerConfig {
    id: number
    corner: MapCalibrationMarkerCorner
}

/**
 * The four map-calibration marker ids this milestone depends on (ticket 08) — physically taped at
 * the table's projectable corners so `RealTrackingSource`'s raw pre-calibration snapshots (see
 * {@link RawMarkerReading}) can locate them without any dedicated Python message. Distinct from
 * {@link REFERENCE_MARKERS} (per-camera stitching calibration, Python-side) and from
 * {@link RESERVED_BUILDING_MARKER_IDS} (a reserved *range* for buildings, not real markers).
 */
export const MAP_CALIBRATION_MARKERS: readonly MapCalibrationMarkerConfig[] = [
    { id: 200, corner: "top_left" },
    { id: 201, corner: "top_right" },
    { id: 202, corner: "bottom_left" },
    { id: 203, corner: "bottom_right" },
]

/** Every {@link MAP_CALIBRATION_MARKERS} id, for cheap membership checks ("does this raw snapshot id matter for calibration readiness?"). */
export const MAP_CALIBRATION_MARKER_IDS: ReadonlySet<number> = new Set(MAP_CALIBRATION_MARKERS.map((marker) => marker.id))

/**
 * Resolves the geographic corner of `aoi` a given map-calibration marker's `corner` role occupies
 * (ticket 11, fix-tickets) — the deterministic AOI-corner position Table renders that marker's
 * image at. `AOIExtent.corners` is ordered top-left/top-right/bottom-right/bottom-left
 * (`collabCalibration.ts`); this maps {@link MapCalibrationMarkerCorner}'s four named roles onto
 * that fixed order rather than relying on index arithmetic at every call site.
 */
export function aoiCornerForMapMarker(aoi: AOIExtent, corner: MapCalibrationMarkerCorner): Position {
    const [topLeft, topRight, bottomRight, bottomLeft] = aoi.corners
    switch (corner) {
        case "top_left":
            return topLeft
        case "top_right":
            return topRight
        case "bottom_right":
            return bottomRight
        case "bottom_left":
            return bottomLeft
    }
}

/**
 * Where a given map-calibration marker is actually placed within `aoi` — its corner role's
 * position pulled inward by {@link calibrationMarkerInsetRatio} (Vanilla's `MARKER_INSET_RATIO`),
 * so a centre-anchored marker lands wholly on the physical table instead of straddling its edge.
 *
 * This, not {@link aoiCornerForMapMarker}, is what both the Table's marker rendering and the
 * `map_calibration` correspondence must use — they describe the same four physical points, and the
 * homography is only correct while they agree. `aoiCornerForMapMarker` remains the raw corner
 * lookup the AOI's own geometry is expressed in.
 */
export function aoiCalibrationMarkerPosition(
    aoi: AOIExtent,
    corner: MapCalibrationMarkerCorner,
    config: CollabTableConfig = DEFAULT_COLLAB_TABLE_CONFIG
): Position {
    const [topLeft, topRight, bottomRight, bottomLeft] = calibrationMarkerUvs(config)
    const uv = corner === "top_left"
        ? topLeft
        : corner === "top_right"
            ? topRight
            : corner === "bottom_right"
                ? bottomRight
                : bottomLeft
    return quadPointAt(aoi.corners, uv[0], uv[1])
}

/**
 * Builds the `map_calibration` correspondences from the four real detected map-calibration marker
 * readings (ticket 12): each marker's raw table-pixel position (from `readings`), paired with the
 * AOI's matching geographic corner via {@link aoiCornerForMapMarker}. This is the real counterpart
 * to `collabCalibration.buildMapCalibration`'s synthetic, config-derived pixel corners — that one
 * assumes the table's physical geometry matches `CollabTableConfig` exactly; this one uses what
 * the cameras actually saw. Returns `undefined` if any of the four {@link MAP_CALIBRATION_MARKERS}
 * ids has no reading in `readings` yet — calibration cannot proceed from a partial set of corners.
 */
export function buildMapCalibrationFromMarkerReadings(
    aoi: AOIExtent,
    readings: RawMarkerSnapshot,
    config: CollabTableConfig = DEFAULT_COLLAB_TABLE_CONFIG
): MapCalibrationMessage | undefined {
    const points: MapCalibrationPoint[] = []
    for (const marker of MAP_CALIBRATION_MARKERS) {
        const reading = readings.get(marker.id)
        if (reading === undefined) {
            return undefined
        }
        // The inset position, not the raw corner: this must be the geographic point the Table
        // actually projected that marker at, or the correspondence is off by the inset itself.
        const [lng, lat] = aoiCalibrationMarkerPosition(aoi, marker.corner, config)
        points.push({ pixel_position: [reading.pixelX, reading.pixelY], lat_lon_position: [lat, lng] })
    }
    return { type: "map_calibration", points, version: 2 }
}

/**
 * How long a map-calibration marker reading (grilling doc Q4) may go without a fresh, consistent
 * snapshot before it's discarded and the stability count restarts — long enough to cover normal
 * per-frame jitter, short enough that a stray reading from a half-settled rig (camera stitching
 * not yet stable, or briefly reading the wrong physical marker) can't sit "pending" indefinitely
 * and then get confirmed by an unrelated later snapshot.
 */
export const MAP_CALIBRATION_MARKER_TTL_MS = 750

/**
 * How many consecutive, mutually-consistent raw snapshots a map-calibration marker id must appear
 * in before {@link isMarkerReadingStable} accepts it (grilling doc Q4) — the actual fix for "the
 * window was only half set up and a stray/wrong-camera reading got treated as valid forever": a
 * single sighting is no longer enough.
 */
export const MAP_CALIBRATION_MARKER_STABLE_READINGS = 2

/**
 * Pixel distance under which two consecutive readings for the same marker id count as "the same"
 * (grilling doc Q4: "pixel tolerance to be picked on the physical table test, kept as an easily
 * tunable constant, not hardcoded logic" — B6). A tunable constant, not a computed value.
 */
export const MAP_CALIBRATION_MARKER_PIXEL_TOLERANCE = 4

/** One map-calibration marker's reading plus how long/consistently it's been seen (grilling doc Q4). */
export interface TrackedMarkerReading {
    reading: RawMarkerReading
    firstSeenAt: number
    lastUpdatedAt: number
    consecutiveCount: number
}

/** Whether `tracked` has been confirmed consistently enough to be trusted (grilling doc Q4). */
export function isMarkerReadingStable(tracked: TrackedMarkerReading): boolean {
    return tracked.consecutiveCount >= MAP_CALIBRATION_MARKER_STABLE_READINGS
}

/** Whether two raw readings are within {@link MAP_CALIBRATION_MARKER_PIXEL_TOLERANCE} of each other (grilling doc Q4). */
export function pixelReadingsWithinTolerance(
    a: RawMarkerReading,
    b: RawMarkerReading,
    tolerancePx = MAP_CALIBRATION_MARKER_PIXEL_TOLERANCE
): boolean {
    return Math.hypot(a.pixelX - b.pixelX, a.pixelY - b.pixelY) <= tolerancePx
}

/**
 * Static asset URL for one {@link MAP_CALIBRATION_MARKERS} id's reference-marker image (ticket 11,
 * fix-tickets). Served from `public/collab/calibration-markers/` — see that folder's `README.md`
 * for provenance (unchanged copies of `COUP-table-web-interface/4x4_1000-{id}.svg`, the exact
 * marker images/corner mapping the Vanilla system already uses). Plain public-path string, not a
 * bundled import, so no build-time asset processing is involved.
 */
export function calibrationMarkerImageUrl(markerId: number): string {
    return `/collab/calibration-markers/4x4_1000-${markerId}.svg`
}

/** The role a reserved/special marker id plays, per {@link RESERVED_MARKER_REGISTRY}. */
export type ReservedMarkerRole = "camera-reference" | "map-calibration" | "ignored" | "building-reserved"

interface ReservedMarkerRegistryEntry {
    id: number
    role: ReservedMarkerRole
}

/**
 * The one registry every reserved/special marker id in this codebase belongs to (ticket 08) — no
 * other module redeclares any of these ids or ranges. Derived from the role-specific constants
 * above/below (each keeps its own richer shape — {@link REFERENCE_MARKERS}' `cameraId`/`position`,
 * {@link MAP_CALIBRATION_MARKERS}' `corner` — since UI code needs those, not just a bare id list);
 * this flat view exists for the one thing all four roles share: "is this id reserved, and for
 * what". A future id change is made in exactly one of the constants above/below, never here.
 */
export const RESERVED_MARKER_REGISTRY: readonly ReservedMarkerRegistryEntry[] = [
    ...REFERENCE_MARKERS.map((marker) => ({ id: marker.id, role: "camera-reference" as const })),
    ...MAP_CALIBRATION_MARKERS.map((marker) => ({ id: marker.id, role: "map-calibration" as const })),
    { id: IGNORED_MARKER_ID, role: "ignored" as const },
    ...RESERVED_BUILDING_MARKER_IDS.map((id) => ({ id, role: "building-reserved" as const })),
]

/** Resolves a marker id to its reserved role via {@link RESERVED_MARKER_REGISTRY}, or `undefined` if it isn't reserved at all. */
export function reservedMarkerRole(markerId: number): ReservedMarkerRole | undefined {
    return RESERVED_MARKER_REGISTRY.find((entry) => entry.id === markerId)?.role
}

/**
 * One entry of Python's pre-calibration raw table-pixel marker dictionary (plan §5b/§5d,
 * `marker.py::printJSON`/`Marker.toJSON`): `[pixel_x, pixel_y, rotation, camera_or_tag]`, keyed by
 * marker id. Sent whenever Python has no `basemap_homography` configured yet (i.e. before
 * `map_calibration` has been sent) — the phase {@link RealTrackingSource} used to discard entirely.
 */
export interface RawMarkerReading {
    pixelX: number
    pixelY: number
    rotation: number
    cameraOrTag: string
}

/** Every marker id present in one raw pre-calibration snapshot, keyed by marker id (plan §5b/§5d). */
export type RawMarkerSnapshot = ReadonlyMap<number, RawMarkerReading>

/**
 * `marker_id` → scenario/object-id registry (OD-4). Data-driven — never hardcode a mapping in
 * adapter logic. Calibration ids (`calibration_markers.json`, operator-entered per camera) are a
 * separate concern from this registry and never appear in it.
 */
export type MarkerObjectRegistry = ReadonlyMap<number, string>

export interface MarkerObjectRegistryEntry {
    markerId: number
    objectId: string
}

/**
 * Builds a {@link MarkerObjectRegistry} from data, rejecting the one id that can never be a
 * valid object mapping: Python's ignored calibration marker `500` (plan §17.4).
 */
export function createMarkerObjectRegistry(entries: readonly MarkerObjectRegistryEntry[]): MarkerObjectRegistry {
    const registry = new Map<number, string>()
    for (const { markerId, objectId } of entries) {
        if (markerId === IGNORED_MARKER_ID) {
            throw new Error(
                `marker id ${IGNORED_MARKER_ID} is Python's ignored calibration marker and can never be registered as an object (plan §17.4)`
            )
        }
        registry.set(markerId, objectId)
    }
    return registry
}

/**
 * How long a building's footprint survives after its marker stops appearing in Python's
 * snapshots, before it is treated as gone and removed from the projection.
 *
 * Read from `VITE_COLLAB_GEOMETRY_FLASH_MS` so the rig can tune it without a rebuild; unset or
 * unparsable falls back to the 1000 ms this has always used. It is *not* raised globally to cover
 * the calibration case: while the admin panel is seating a building the operator leans across the
 * table and occludes its marker, and a footprint that blinks out mid-adjustment removes the very
 * thing being aimed at. That case is handled properly instead, by
 * {@link TrackingFeedNormalizer.setPresenceHold} — held for exactly as long as the panel is open,
 * rather than by making every building on the table linger for everyone all the time.
 */
export function geometryDisappearTimeoutMs(): number {
    const raw = Number(import.meta.env.VITE_COLLAB_GEOMETRY_FLASH_MS ?? "")
    return Number.isFinite(raw) && raw > 0 ? raw : 1000
}

const DEFAULT_DISAPPEAR_TIMEOUT_MS = 1000

/**
 * Synthesizes `disappeared` from absence + timeout, since Python never sends a disappearance
 * event (plan §17.1) — a marker just stops appearing in the snapshot. Shared shape so ticket 09's
 * `RealTrackingSource` can reuse it unchanged.
 */
class MarkerPresenceTracker {
    private readonly timeoutMs: number
    private readonly lastSeenAt = new Map<string, number>()

    constructor(timeoutMs: number) {
        this.timeoutMs = timeoutMs
    }

    /** Record which object ids were present in this snapshot; returns ids now past the timeout. */
    observe(presentObjectIds: readonly string[], timestamp: number): string[] {
        for (const objectId of presentObjectIds) {
            this.lastSeenAt.set(objectId, timestamp)
        }

        const timedOut: string[] = []
        for (const [objectId, seenAt] of this.lastSeenAt) {
            if (timestamp - seenAt > this.timeoutMs) {
                timedOut.push(objectId)
            }
        }
        for (const objectId of timedOut) {
            this.lastSeenAt.delete(objectId)
        }
        return timedOut
    }
}

/**
 * Normalizes Python's post-calibration GeoJSON `FeatureCollection` (plan §5b/B7) into
 * `TrackingEvent`s: maps `marker_id` → object id via the registry (OD-4, ignoring `500` and any
 * marker with no registry entry), diffs against last-known pose to decide appeared/updated, and
 * synthesizes `disappeared` from absence + timeout (§17.1). This is the entire adapter contract
 * (B1/B3) — it does not touch camera calibration, homography, or table→AOI georeferencing.
 */
export class TrackingFeedNormalizer {
    private readonly registry: MarkerObjectRegistry
    private readonly presence: MarkerPresenceTracker
    /** While true, absence never becomes `disappeared` — see {@link setPresenceHold}. */
    private presenceHeld = false
    private readonly lastPose = new Map<string, TrackingEvent["pose"]>()
    private availability: TrackingAvailability = "live"

    constructor(registry: MarkerObjectRegistry, disappearTimeoutMs: number = DEFAULT_DISAPPEAR_TIMEOUT_MS) {
        this.registry = registry
        this.presence = new MarkerPresenceTracker(disappearTimeoutMs)
    }

    /** The availability {@link applySnapshot} most recently determined (A3). Starts `"live"`. */
    currentAvailability(): TrackingAvailability {
        return this.availability
    }

    /**
     * Applies one snapshot (as Python would emit it) and returns the `TrackingEvent`s it produces.
     * A non-empty snapshot where every feature is Python's ignored calibration marker (A3) is
     * `suppressed`: presence is not observed at all this call, so absence during suppression can
     * never trip the disappear timeout — the last known poses stay frozen until a snapshot with at
     * least one real object resumes normal (`live`) processing. A genuinely empty snapshot
     * (`features: []`) is `live` and still runs normal presence/timeout handling — Python reporting
     * "no objects" is a real observation, not suppression.
     */
    applySnapshot(featureCollection: TrackingMarkerFeatureCollection, timestamp: number): TrackingEvent[] {
        const events: TrackingEvent[] = []
        const presentObjectIds: string[] = []

        for (const feature of featureCollection.features) {
            const objectId = this.resolveObjectId(feature)
            if (objectId === undefined) {
                continue
            }
            presentObjectIds.push(objectId)

            const pose = poseFromFeature(feature)
            const previousPose = this.lastPose.get(objectId)
            const confidence = feature.properties.confidence ?? 1
            const geometry =
                feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon"
                    ? feature.geometry
                    : undefined
            const eventData = {
                objectId,
                pose,
                confidence,
                timestamp,
                geometry,
                bbox: feature.properties.bbox,
                cityScopeId: feature.properties.city_scope_id,
                markerId: feature.properties.marker_id,
                tableXPx: feature.properties.table_x_px,
                tableYPx: feature.properties.table_y_px,
            }

            if (previousPose === undefined) {
                events.push({ type: "appeared", ...eventData })
                this.lastPose.set(objectId, pose)
            } else if (!poseEquals(previousPose, pose)) {
                events.push({ type: "updated", ...eventData })
                this.lastPose.set(objectId, pose)
            }
        }

        // Deliberately broader than "only the ignored calibration marker": ANY non-empty snapshot
        // that resolves zero registered objects is suppressed, including an id this registry
        // simply doesn't (yet) map. The registry is data-driven (OD-4) and this module can't tell
        // "Python is calibrating" apart from "a marker id isn't mapped yet" without redesigning
        // the registry, which A3 explicitly says not to do. Freezing in both cases is the safe
        // default for a PoC that must never mistake a transient state for "the table is empty" —
        // the cost is a rare pathological case (every previously-tracked object genuinely vanishes
        // in the same tick an unrelated unmapped marker appears) freezing instead of disappearing;
        // that trade-off is accepted here rather than guessed away.
        const isSuppressed = featureCollection.features.length > 0 && presentObjectIds.length === 0
        this.availability = isSuppressed ? "suppressed" : "live"
        if (isSuppressed) {
            return events
        }

        if (this.presenceHeld) {
            // Still observe presence (so a held object's clock keeps running and it does not
            // vanish the instant the hold lifts), but synthesize nothing.
            this.presence.observe(presentObjectIds, timestamp)
            return events
        }

        for (const objectId of this.presence.observe(presentObjectIds, timestamp)) {
            const pose = this.lastPose.get(objectId)
            if (pose === undefined) {
                continue
            }
            events.push({ type: "disappeared", objectId, pose, confidence: 0, timestamp })
            this.lastPose.delete(objectId)
        }

        return events
    }

    /**
     * Suspends (or resumes) turning absence into `disappeared`.
     *
     * Held while the admin panel is calibrating a building: the operator stands over the table to
     * seat it, occluding the very marker that keeps its footprint alive, and a footprint that
     * blinks out is a footprint that cannot be aimed. Positions still update normally from every
     * snapshot the marker *is* visible in — this only stops the removal, and only for as long as
     * the panel is open.
     */
    setPresenceHold(held: boolean): void {
        this.presenceHeld = held
    }

    private resolveObjectId(feature: Feature<Point | Polygon | MultiPolygon, TrackingMarkerFeatureProperties>): string | undefined {
        const markerId = feature.properties.marker_id
        if (markerId === IGNORED_MARKER_ID) {
            return undefined
        }
        const buildingId = feature.properties.building_id
        if (typeof buildingId === "string" && buildingId.trim() !== "") {
            return buildingId
        }
        const legacyObjectId = this.registry.get(markerId)
        if (legacyObjectId === undefined) {
            reportDeveloperError(
                "collabTracking.TrackingFeedNormalizer",
                new Error(`unknown marker ${markerId}: Python supplied no building_id`)
            )
        }
        return legacyObjectId
    }
}

function poseFromFeature(feature: Feature<Point | Polygon | MultiPolygon, TrackingMarkerFeatureProperties>): TrackingEvent["pose"] {
    const center = feature.properties.center
    const [lng, lat] = center ?? (feature.geometry.type === "Point" ? feature.geometry.coordinates : [NaN, NaN])
    return { lng, lat, rotation: feature.properties.rotation }
}

function poseEquals(a: TrackingEvent["pose"], b: TrackingEvent["pose"]): boolean {
    return a.lng === b.lng && a.lat === b.lat && a.rotation === b.rotation
}

/** One instant in a {@link MockTrackingSource} timeline: the full marker snapshot at `atMs`. */
export interface MockTrackingSnapshot {
    atMs: number
    features: readonly { markerId: number; lng: number; lat: number; rotation: number; confidence?: number }[]
}

/**
 * Default M1 timeline (plan §14 acceptance: appeared/updated(moved)/rotated/disappeared): one
 * object appears, moves, rotates in place, then goes silent so the presence tracker synthesizes
 * `disappeared` after the timeout — exercising the full `TrackingEvent` lifecycle with no server.
 */
export const DEFAULT_MOCK_TIMELINE: readonly MockTrackingSnapshot[] = [
    { atMs: 0, features: [{ markerId: 182, lng: 10.0, lat: 53.55, rotation: 0 }] },
    { atMs: 1000, features: [{ markerId: 182, lng: 10.0005, lat: 53.5502, rotation: 0 }] },
    { atMs: 2000, features: [{ markerId: 182, lng: 10.0005, lat: 53.5502, rotation: 45 }] },
    { atMs: 3000, features: [] },
]

export interface MockTrackingSourceOptions {
    registry: MarkerObjectRegistry
    timeline?: readonly MockTrackingSnapshot[]
    /** Absence-timeout for synthesized `disappeared` (plan §17.1). Default 1000ms. */
    disappearTimeoutMs?: number
    /** How often the timeline is sampled. Default 200ms (matches Python's `server.py` cadence, §4). */
    tickMs?: number
    now?: () => number
}

/**
 * Milestone-1 `TrackingSource` (plan §14): needs no server, no hardware. Replays a scripted
 * timeline shaped exactly like Python's post-calibration GeoJSON through the same
 * {@link TrackingFeedNormalizer} `RealTrackingSource` (ticket 09) will use, so swapping the
 * transport later touches nothing downstream.
 */
export class MockTrackingSource implements TrackingSource {
    private readonly timeline: readonly MockTrackingSnapshot[]
    private readonly tickMs: number
    private readonly now: () => number
    private readonly normalizer: TrackingFeedNormalizer
    private readonly listeners: Array<(event: TrackingEvent) => void> = []
    private readonly availabilityListeners: Array<(availability: TrackingAvailability) => void> = []
    private intervalId: ReturnType<typeof setInterval> | undefined
    private startedAt = 0

    constructor(options: MockTrackingSourceOptions) {
        this.timeline = options.timeline ?? DEFAULT_MOCK_TIMELINE
        this.tickMs = options.tickMs ?? 200
        this.now = options.now ?? Date.now
        this.normalizer = new TrackingFeedNormalizer(options.registry, options.disappearTimeoutMs)
    }

    start(): void {
        if (this.intervalId !== undefined) {
            return
        }
        this.startedAt = this.now()
        this.intervalId = setInterval(() => this.tick(), this.tickMs)
    }

    stop(): void {
        if (this.intervalId === undefined) {
            return
        }
        clearInterval(this.intervalId)
        this.intervalId = undefined
    }

    onEvent(cb: (event: TrackingEvent) => void): void {
        this.listeners.push(cb)
    }

    onAvailabilityChange(cb: (availability: TrackingAvailability) => void): void {
        this.availabilityListeners.push(cb)
    }

    private tick(): void {
        const timestamp = this.now()
        const elapsedMs = timestamp - this.startedAt
        const snapshot = activeSnapshotAt(this.timeline, elapsedMs)
        if (snapshot === undefined) {
            return
        }

        const featureCollection = toFeatureCollection(snapshot)
        const events = this.normalizer.applySnapshot(featureCollection, timestamp)
        for (const availabilityListener of this.availabilityListeners) {
            availabilityListener(this.normalizer.currentAvailability())
        }
        for (const event of events) {
            for (const listener of this.listeners) {
                listener(event)
            }
        }
    }
}

function activeSnapshotAt(
    timeline: readonly MockTrackingSnapshot[],
    elapsedMs: number
): MockTrackingSnapshot | undefined {
    let active: MockTrackingSnapshot | undefined
    for (const snapshot of timeline) {
        if (snapshot.atMs <= elapsedMs) {
            active = snapshot
        }
    }
    return active
}

function toFeatureCollection(snapshot: MockTrackingSnapshot): TrackingMarkerFeatureCollection {
    return {
        type: "FeatureCollection",
        features: snapshot.features.map((feature) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [feature.lng, feature.lat] },
            properties: {
                marker_id: feature.markerId,
                rotation: feature.rotation,
                confidence: feature.confidence,
            },
        })),
    }
}

/**
 * The subset of the browser `WebSocket` interface {@link RealTrackingSource} needs — injectable
 * so tests can supply a fake instead of a real socket (plan §5b/§14, ticket 09).
 */
export interface TrackingWebSocket {
    onopen: (() => void) | null
    onmessage: ((event: { data: string }) => void) | null
    onclose: (() => void) | null
    onerror: ((event: unknown) => void) | null
    send(data: string): void
    close(): void
}

export interface RealTrackingSourceOptions {
    /** `ws://<table-host>:8053` — `server.py --client web` (plan §5a/§5b, OD-1 resolved). */
    url: string
    registry: MarkerObjectRegistry
    /**
     * Built by `collabCalibration.buildMapCalibration` (ticket 03) from the operator's chosen AOI.
     * Optional (ticket 08, connect-first): the socket connects and stays connected with no AOI
     * selected and no calibration payload available at all. When present, it's only the default
     * {@link RealTrackingSource.sendMapCalibration} sends when called with no argument — it is
     * never sent automatically on open or reconnect.
     */
    calibration?: MapCalibrationMessage
    /** Absence-timeout for synthesized `disappeared` (plan §17.1). Default 1000ms. */
    disappearTimeoutMs?: number
    now?: () => number
    /** Defaults to the global `WebSocket` constructor; overridable for tests. */
    createSocket?: (url: string) => TrackingWebSocket
    /** First reconnect delay after an unexpected drop (marker-health-plan §2). Default 1000ms. */
    reconnectBaseDelayMs?: number
    /** Reconnect backoff ceiling — doubles each attempt up to this cap. Default 10000ms. */
    reconnectMaxDelayMs?: number
    /** Consecutive reconnect attempts allowed after an unexpected drop before giving up and reporting plain `"disconnected"` (ticket 08). Default 5. */
    reconnectMaxAttempts?: number
    /** Defaults to the global `setTimeout`/`clearTimeout`; overridable for tests. */
    setTimeoutFn?: (handler: () => void, delayMs: number) => ReturnType<typeof setTimeout>
    clearTimeoutFn?: (handle: ReturnType<typeof setTimeout>) => void
}

function defaultCreateSocket(url: string): TrackingWebSocket {
    return new WebSocket(url) as unknown as TrackingWebSocket
}

function isTrackingFeatureCollection(data: unknown): data is TrackingMarkerFeatureCollection {
    return typeof data === "object" && data !== null && (data as { type?: unknown }).type === "FeatureCollection"
}

/** One raw entry's shape: `[pixel_x, pixel_y, rotation, camera_or_tag]` (`marker.py::printJSON`). */
type RawMarkerEntry = [number, number, number, string]

function isRawMarkerEntry(value: unknown): value is RawMarkerEntry {
    return (
        Array.isArray(value) &&
        value.length >= 3 &&
        typeof value[0] === "number" &&
        typeof value[1] === "number" &&
        typeof value[2] === "number"
    )
}

/**
 * Python's pre-calibration raw table-pixel marker dictionary (plan §5b/§5d): a plain `{marker_id:
 * [pixel_x, pixel_y, rotation, camera_or_tag]}` object, sent whenever Python has no
 * `basemap_homography` configured yet — i.e. before `map_calibration` has been sent (ticket 08).
 * Deliberately excludes anything shaped like {@link TrackingMarkerFeatureCollection} first, then
 * requires every value to look like a raw marker entry — an empty `{}` (no markers currently
 * detected) still counts.
 */
function isRawMarkerDictionary(data: unknown): data is Record<string, RawMarkerEntry> {
    if (typeof data !== "object" || data === null || Array.isArray(data) || isTrackingFeatureCollection(data)) {
        return false
    }
    return Object.values(data).every(isRawMarkerEntry)
}

/**
 * Recognizes a `{"type": "calibration_ack"}` message (grilling doc item 6, "conditional"). Python's
 * `server.py` sends no such acknowledgement today — this guard exists so `handleMessage` can tell
 * the shape apart from the raw marker dictionary/GeoJSON cases without throwing, once/if Python
 * ever adds one. Deliberately inert: recognized and relayed via {@link RealTrackingSource.onCalibrationAck}
 * but nothing in this codebase currently subscribes to it.
 */
function isCalibrationAck(data: unknown): data is { type: "calibration_ack" } {
    return typeof data === "object" && data !== null && (data as { type?: unknown }).type === "calibration_ack"
}

function parseRawMarkerSnapshot(data: Record<string, RawMarkerEntry>): RawMarkerSnapshot {
    const markers = new Map<number, RawMarkerReading>()
    for (const [key, [pixelX, pixelY, rotation, cameraOrTag]] of Object.entries(data)) {
        const markerId = Number(key)
        if (!Number.isFinite(markerId)) {
            continue
        }
        markers.set(markerId, { pixelX, pixelY, rotation, cameraOrTag })
    }
    return markers
}

/**
 * Milestone-2 `TrackingSource` (plan §5c/§14, ticket 09; connect-first plumbing ticket 08): a pure
 * transport swap for {@link MockTrackingSource}. Connects to `:8053` and reports its own
 * connection/reconnect state independently of tracking availability — the socket opens and stays
 * open with no AOI selected and no calibration payload available at all; `map_calibration` is
 * never sent automatically on open, only via an explicit {@link sendMapCalibration} call (ticket
 * 12). Before that call, Python has no `basemap_homography` and streams the raw pre-calibration
 * marker dictionary (plan §5b/§5d) instead of GeoJSON — parsed and surfaced via
 * {@link onRawMarkerSnapshot} rather than discarded. Once calibrated, GeoJSON `FeatureCollection`
 * messages flow through the same {@link TrackingFeedNormalizer} the mock uses, unchanged.
 */
export class RealTrackingSource implements TrackingSource {
    private readonly url: string
    private readonly calibrationMessage: MapCalibrationMessage | undefined
    private readonly normalizer: TrackingFeedNormalizer
    private readonly now: () => number
    private readonly createSocket: (url: string) => TrackingWebSocket
    private readonly reconnectBaseDelayMs: number
    private readonly reconnectMaxDelayMs: number
    /** Consecutive reconnect attempts allowed after an unexpected drop before giving up (ticket 08). */
    private readonly reconnectMaxAttempts: number
    private readonly setTimeoutFn: (handler: () => void, delayMs: number) => ReturnType<typeof setTimeout>
    private readonly clearTimeoutFn: (handle: ReturnType<typeof setTimeout>) => void
    private readonly listeners: Array<(event: TrackingEvent) => void> = []
    private readonly availabilityListeners: Array<(availability: TrackingAvailability) => void> = []
    private readonly connectionStateListeners: Array<(state: PythonConnectionState) => void> = []
    private readonly markerSnapshotListeners: Array<(markerIds: readonly number[]) => void> = []
    private readonly rawMarkerSnapshotListeners: Array<(markers: RawMarkerSnapshot) => void> = []
    private readonly geojsonSnapshotListeners: Array<() => void> = []
    private readonly calibrationAckListeners: Array<() => void> = []
    private socket: TrackingWebSocket | undefined
    /** True only between `onopen` and the socket closing/erroring — {@link sendMapCalibration} refuses to send onto a socket that isn't actually open yet. */
    private socketOpen = false
    /** Set only while a reconnect attempt is pending (marker-health-plan §2: never more than one in flight). */
    private reconnectTimer: ReturnType<typeof setTimeout> | undefined
    private reconnectAttempt = 0
    /** True only after an explicit {@link stop} — distinguishes "operator stopped" from "connection dropped" so only the latter reconnects. */
    private explicitlyStopped = true

    constructor(options: RealTrackingSourceOptions) {
        this.url = options.url
        this.calibrationMessage = options.calibration
        this.normalizer = new TrackingFeedNormalizer(options.registry, options.disappearTimeoutMs)
        this.now = options.now ?? Date.now
        this.createSocket = options.createSocket ?? defaultCreateSocket
        this.reconnectBaseDelayMs = options.reconnectBaseDelayMs ?? 1000
        this.reconnectMaxDelayMs = options.reconnectMaxDelayMs ?? 10_000
        this.reconnectMaxAttempts = options.reconnectMaxAttempts ?? 5
        this.setTimeoutFn = options.setTimeoutFn ?? ((handler, delayMs) => setTimeout(handler, delayMs))
        this.clearTimeoutFn = options.clearTimeoutFn ?? ((handle) => clearTimeout(handle))
    }

    /**
     * Connects (or reconnects) to `:8053`. A no-op while a socket is already open or a reconnect
     * is already pending, so overlapping `start()` calls — or a reconnect racing an operator's
     * manual "Start Tracking" click — can never create a second socket/timer loop.
     */
    start(): void {
        if (this.socket !== undefined || this.reconnectTimer !== undefined) {
            return
        }
        this.explicitlyStopped = false
        this.reconnectAttempt = 0
        this.connect()
    }

    /** Explicit stop (marker-health-plan §2): cancels any pending reconnect and closes the socket; never reconnects afterward. */
    stop(): void {
        this.explicitlyStopped = true
        this.cancelReconnect()
        if (this.socket !== undefined) {
            this.detachAndClose(this.socket)
            this.socket = undefined
        }
        this.socketOpen = false
        this.reconnectAttempt = 0
        this.emitConnectionState("disconnected")
    }

    onEvent(cb: (event: TrackingEvent) => void): void {
        this.listeners.push(cb)
    }

    onAvailabilityChange(cb: (availability: TrackingAvailability) => void): void {
        this.availabilityListeners.push(cb)
    }

    /** Python transport connection state (marker-health-plan §1) — independent of tracking availability. */
    onConnectionStateChange(cb: (state: PythonConnectionState) => void): void {
        this.connectionStateListeners.push(cb)
    }

    /**
     * Fires with every `marker_id` present in an incoming tracking snapshot — raw pre-calibration
     * dictionary or post-calibration GeoJSON alike (unfiltered: building ids, `IGNORED_MARKER_ID`,
     * and any configured {@link REFERENCE_MARKERS}/{@link MAP_CALIBRATION_MARKERS} id all pass
     * through as-is). Python already includes reference-marker ids in the ordinary tracking feed
     * without being asked (same as Vanilla's `calibration.js` reading its raw marker dict directly,
     * `COUP-table-web-interface/js/calibration.js:48-55`) — this is that same relay, nothing new on
     * the wire.
     */
    onMarkerSnapshot(cb: (markerIds: readonly number[]) => void): void {
        this.markerSnapshotListeners.push(cb)
    }

    /**
     * Fires with every raw pre-calibration marker reading (ticket 08: `[pixel_x, pixel_y,
     * rotation, camera_or_tag]` per id) whenever Python sends its raw table-pixel dictionary
     * instead of GeoJSON — i.e. before {@link sendMapCalibration} has been called. Never fires from
     * a GeoJSON `FeatureCollection` message; those carry no pixel positions to surface.
     */
    onRawMarkerSnapshot(cb: (markers: RawMarkerSnapshot) => void): void {
        this.rawMarkerSnapshotListeners.push(cb)
    }

    /**
     * Fires once for every GeoJSON `FeatureCollection` message, **including an empty one** — the
     * mirror of {@link onRawMarkerSnapshot}, and the only honest answer to "is Python on the
     * calibrated feed right now?".
     *
     * {@link onEvent} cannot answer that: it fires per *tracked object*, so an empty collection —
     * which is exactly what a correctly calibrated Python sends while nothing is on the table —
     * emits nothing at all. Anything that treats "no event arrived" as "Python never switched
     * feeds" is really testing whether a building happens to be sitting on the table.
     */
    onGeojsonSnapshot(cb: () => void): void {
        this.geojsonSnapshotListeners.push(cb)
    }

    /**
     * Fires on a recognized `{"type": "calibration_ack"}` message (grilling doc item 6). Python
     * sends no such message today — this exists as inert, forward-compatible scaffolding, not a
     * behavior change; nothing in this codebase wires a listener onto it yet.
     */
    onCalibrationAck(cb: () => void): void {
        this.calibrationAckListeners.push(cb)
    }

    /**
     * Sends `map_calibration` explicitly (ticket 12) — the only way it is ever sent; `connect()`
     * never sends it automatically on open or reconnect. Sends `calibration` if given, otherwise
     * the one passed to the constructor (if any). No-ops with a developer error if neither is
     * available, or the socket isn't currently open.
     */
    sendMapCalibration(calibration?: MapCalibrationMessage): void {
        const message = calibration ?? this.calibrationMessage
        if (message === undefined) {
            reportDeveloperError(
                "collabTracking.RealTrackingSource.sendMapCalibration",
                new Error("no map_calibration message available to send")
            )
            return
        }
        if (!this.socketOpen || this.socket === undefined) {
            reportDeveloperError(
                "collabTracking.RealTrackingSource.sendMapCalibration",
                new Error("cannot send map_calibration: socket is not open")
            )
            return
        }
        this.socket.send(JSON.stringify(message))
    }

    /**
     * Sends one `building_calibration` (workflow step 3/4) — the operator's saved nudge for a
     * single building. Reports whether the bytes actually went out, so the panel can tell the
     * operator "not saved" instead of silently keeping a draft it believes was persisted.
     *
     * There is no acknowledgement to wait for: Python applies the message, writes the working
     * catalog and the SQLite row, and the *evidence* arrives as the next tracking frame, where
     * the building is drawn at its new pose. That is a far better confirmation than an ack —
     * the operator is looking at the projection, which is the thing they were adjusting.
     */
    /** Suspends/resumes disappearance synthesis for the live feed — see {@link TrackingFeedNormalizer.setPresenceHold}. */
    setPresenceHold(held: boolean): void {
        this.normalizer.setPresenceHold(held)
    }

    sendBuildingCalibration(message: object): boolean {
        if (!this.socketOpen || this.socket === undefined) {
            return false
        }
        this.socket.send(JSON.stringify(message))
        return true
    }

    /**
     * Returns Python to its raw-pixel feed so a fresh four-marker calibration can be measured.
     * Reports whether the message actually went out, so the caller can decide whether to wait for
     * Python to confirm the clear by reverting to raw snapshots (grilling doc 2026-09-01 Q13).
     *
     * A closed socket is an ordinary outcome here, not a developer error (grilling doc Q5): this is
     * called on every AOI (re)confirmation, and the operator is free to choose an AOI while Python
     * is down or still reconnecting. Nothing is queued for later — a Python that was never told to
     * clear has no stale homography to clear either, since it is starting from nothing.
     */
    resetMapCalibration(): boolean {
        if (!this.socketOpen || this.socket === undefined) {
            return false
        }
        this.socket.send(JSON.stringify({ type: "clear_calibration" }))
        return true
    }

    private connect(): void {
        this.emitConnectionState(this.reconnectAttempt === 0 ? "connecting" : "reconnecting")
        const socket = this.createSocket(this.url)
        socket.onopen = () => {
            this.reconnectAttempt = 0
            this.socketOpen = true
            this.emitConnectionState("connected")
        }
        socket.onmessage = (event) => this.handleMessage(event.data)
        socket.onerror = (event) => {
            reportDeveloperError("collabTracking.RealTrackingSource", event instanceof Error ? event : new Error("WebSocket error"))
            this.handleTermination()
        }
        socket.onclose = () => this.handleTermination()
        this.socket = socket
    }

    private detachAndClose(socket: TrackingWebSocket): void {
        socket.onopen = null
        socket.onmessage = null
        socket.onclose = null
        socket.onerror = null
        socket.close()
    }

    private handleMessage(raw: string): void {
        let data: unknown
        try {
            data = JSON.parse(raw)
        } catch {
            return
        }
        if (isTrackingFeatureCollection(data)) {
            // Before normalizing, and unconditionally: an empty collection is still proof that
            // Python is on the calibrated feed, and it is the normal shape while the table is bare.
            this.emitGeojsonSnapshot()
            this.emitMarkerSnapshot(data.features.map((feature) => feature.properties.marker_id))
            const events = this.normalizer.applySnapshot(data, this.now())
            this.emitAvailability(this.normalizer.currentAvailability())
            this.emitAll(events)
            return
        }
        if (isRawMarkerDictionary(data)) {
            const markers = parseRawMarkerSnapshot(data)
            this.emitMarkerSnapshot([...markers.keys()])
            this.emitRawMarkerSnapshot(markers)
            return
        }
        if (isCalibrationAck(data)) {
            this.emitCalibrationAck()
        }
    }

    /**
     * Runs when the connection itself is lost (close or error) rather than intentionally stopped
     * (A3): reports `disconnected` and freezes the last known poses instead of synthesizing
     * `disappeared` for everything tracked. A dropped socket is a transport failure, not an
     * observation that every physical building vanished from the table — erasing them here would
     * make a momentary Wi-Fi/server hiccup look identical to someone clearing the table. Normal
     * processing (including genuine disappearance via presence+timeout) resumes from this same
     * frozen state once snapshots start arriving again.
     *
     * Unless this was reached via an explicit {@link stop} (which already set `explicitlyStopped`
     * before closing), an unexpected drop schedules a reconnect attempt (marker-health-plan §2) —
     * the operator never has to press "Start Tracking" again — up to {@link reconnectMaxAttempts}
     * consecutive failures. Past that, it gives up: reports plain `"disconnected"` instead of
     * `"reconnecting"` and schedules nothing further, so the UI can offer a manual retry (ticket
     * 08) instead of implying automatic recovery is still silently in flight forever. A later
     * `start()` (operator-triggered retry) always resets the attempt count and tries again.
     */
    private handleTermination(): void {
        if (this.socket === undefined) {
            return
        }
        this.detachAndClose(this.socket)
        this.socket = undefined
        this.socketOpen = false
        this.emitAvailability("disconnected")

        if (this.explicitlyStopped) {
            this.emitConnectionState("disconnected")
            return
        }
        if (this.reconnectAttempt >= this.reconnectMaxAttempts) {
            this.emitConnectionState("disconnected")
            return
        }
        this.emitConnectionState("reconnecting")
        this.scheduleReconnect()
    }

    /** Schedules the next reconnect attempt with exponential backoff, capped at `reconnectMaxDelayMs`. Never schedules a second one on top of a pending attempt. */
    private scheduleReconnect(): void {
        if (this.reconnectTimer !== undefined) {
            return
        }
        const delayMs = Math.min(this.reconnectBaseDelayMs * 2 ** this.reconnectAttempt, this.reconnectMaxDelayMs)
        this.reconnectAttempt += 1
        this.reconnectTimer = this.setTimeoutFn(() => {
            this.reconnectTimer = undefined
            if (this.explicitlyStopped) {
                return
            }
            this.connect()
        }, delayMs)
    }

    private cancelReconnect(): void {
        if (this.reconnectTimer === undefined) {
            return
        }
        this.clearTimeoutFn(this.reconnectTimer)
        this.reconnectTimer = undefined
    }

    private emitAll(events: readonly TrackingEvent[]): void {
        for (const event of events) {
            for (const listener of this.listeners) {
                listener(event)
            }
        }
    }

    private emitAvailability(availability: TrackingAvailability): void {
        for (const listener of this.availabilityListeners) {
            listener(availability)
        }
    }

    private emitConnectionState(state: PythonConnectionState): void {
        for (const listener of this.connectionStateListeners) {
            listener(state)
        }
    }

    private emitMarkerSnapshot(markerIds: readonly number[]): void {
        for (const listener of this.markerSnapshotListeners) {
            listener(markerIds)
        }
    }

    private emitRawMarkerSnapshot(markers: RawMarkerSnapshot): void {
        for (const listener of this.rawMarkerSnapshotListeners) {
            listener(markers)
        }
    }

    private emitGeojsonSnapshot(): void {
        for (const listener of this.geojsonSnapshotListeners) {
            listener()
        }
    }

    private emitCalibrationAck(): void {
        for (const listener of this.calibrationAckListeners) {
            listener()
        }
    }
}

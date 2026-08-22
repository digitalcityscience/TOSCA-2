import type { Feature, FeatureCollection, Point } from "geojson"
import { reportDeveloperError } from "@helpers/userFacingError"
import type { MapCalibrationMessage } from "./collabCalibration"

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
}

export type TrackingMarkerFeatureCollection = FeatureCollection<Point, TrackingMarkerFeatureProperties>

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

            if (previousPose === undefined) {
                events.push({ type: "appeared", objectId, pose, confidence, timestamp })
                this.lastPose.set(objectId, pose)
            } else if (!poseEquals(previousPose, pose)) {
                events.push({ type: "updated", objectId, pose, confidence, timestamp })
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

    private resolveObjectId(feature: Feature<Point, TrackingMarkerFeatureProperties>): string | undefined {
        const markerId = feature.properties.marker_id
        if (markerId === IGNORED_MARKER_ID) {
            return undefined
        }
        return this.registry.get(markerId)
    }
}

function poseFromFeature(feature: Feature<Point, TrackingMarkerFeatureProperties>): TrackingEvent["pose"] {
    const [lng, lat] = feature.geometry.coordinates
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
    /** Built by `collabCalibration.buildMapCalibration` (ticket 03) from the operator's chosen AOI. */
    calibration: MapCalibrationMessage
    /** Absence-timeout for synthesized `disappeared` (plan §17.1). Default 1000ms. */
    disappearTimeoutMs?: number
    now?: () => number
    /** Defaults to the global `WebSocket` constructor; overridable for tests. */
    createSocket?: (url: string) => TrackingWebSocket
}

function defaultCreateSocket(url: string): TrackingWebSocket {
    return new WebSocket(url) as unknown as TrackingWebSocket
}

function isTrackingFeatureCollection(data: unknown): data is TrackingMarkerFeatureCollection {
    return typeof data === "object" && data !== null && (data as { type?: unknown }).type === "FeatureCollection"
}

/**
 * Milestone-2 `TrackingSource` (plan §5c/§14, ticket 09): a pure transport swap for
 * {@link MockTrackingSource}. Connects to `:8053`, sends **one** `map_calibration` on open (built
 * by `collabCalibration` from the operator's chosen AOI — this adapter never builds it itself),
 * then feeds every subsequent message through the same {@link TrackingFeedNormalizer} the mock
 * uses. Messages that are not a GeoJSON `FeatureCollection` are Python's pre-calibration raw
 * table-pixel dict (plan §5b/§5d) — never the tracking contract — and are ignored; TOSCA already
 * knows the AOI locally and does not need to read table-pixel corner markers to calibrate.
 */
export class RealTrackingSource implements TrackingSource {
    private readonly url: string
    private readonly calibrationMessage: MapCalibrationMessage
    private readonly normalizer: TrackingFeedNormalizer
    private readonly now: () => number
    private readonly createSocket: (url: string) => TrackingWebSocket
    private readonly listeners: Array<(event: TrackingEvent) => void> = []
    private readonly availabilityListeners: Array<(availability: TrackingAvailability) => void> = []
    private socket: TrackingWebSocket | undefined

    constructor(options: RealTrackingSourceOptions) {
        this.url = options.url
        this.calibrationMessage = options.calibration
        this.normalizer = new TrackingFeedNormalizer(options.registry, options.disappearTimeoutMs)
        this.now = options.now ?? Date.now
        this.createSocket = options.createSocket ?? defaultCreateSocket
    }

    start(): void {
        if (this.socket !== undefined) {
            return
        }
        const socket = this.createSocket(this.url)
        socket.onopen = () => socket.send(JSON.stringify(this.calibrationMessage))
        socket.onmessage = (event) => this.handleMessage(event.data)
        socket.onerror = (event) => {
            reportDeveloperError("collabTracking.RealTrackingSource", event instanceof Error ? event : new Error("WebSocket error"))
            this.handleTermination()
        }
        socket.onclose = () => this.handleTermination()
        this.socket = socket
    }

    stop(): void {
        if (this.socket === undefined) {
            return
        }
        this.detachAndClose(this.socket)
        this.socket = undefined
    }

    onEvent(cb: (event: TrackingEvent) => void): void {
        this.listeners.push(cb)
    }

    onAvailabilityChange(cb: (availability: TrackingAvailability) => void): void {
        this.availabilityListeners.push(cb)
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
        if (!isTrackingFeatureCollection(data)) {
            return
        }
        const events = this.normalizer.applySnapshot(data, this.now())
        this.emitAvailability(this.normalizer.currentAvailability())
        this.emitAll(events)
    }

    /**
     * Runs when the connection itself is lost (close or error) rather than intentionally stopped
     * (A3): reports `disconnected` and freezes the last known poses instead of synthesizing
     * `disappeared` for everything tracked. A dropped socket is a transport failure, not an
     * observation that every physical building vanished from the table — erasing them here would
     * make a momentary Wi-Fi/server hiccup look identical to someone clearing the table. Normal
     * processing (including genuine disappearance via presence+timeout) resumes from this same
     * frozen state once snapshots start arriving again.
     */
    private handleTermination(): void {
        if (this.socket === undefined) {
            return
        }
        this.detachAndClose(this.socket)
        this.socket = undefined
        this.emitAvailability("disconnected")
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
}

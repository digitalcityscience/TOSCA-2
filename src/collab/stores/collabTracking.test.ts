import { describe, expect, test, vi } from "vitest";
import type { AOIExtent, MapCalibrationMessage } from "./collabCalibration";
import type {
    MarkerObjectRegistry,
    PythonConnectionState,
    RawMarkerSnapshot,
    TrackingAvailability,
    TrackingEvent,
    TrackingMarkerFeatureCollection,
    TrackingWebSocket,
} from "./collabTracking";
import {
    DEFAULT_MOCK_TIMELINE,
    IGNORED_MARKER_ID,
    MAP_CALIBRATION_MARKER_IDS,
    MAP_CALIBRATION_MARKERS,
    REQUIRED_MAP_CALIBRATION_MARKERS,
    MockTrackingSource,
    REFERENCE_MARKERS,
    RealTrackingSource,
    RESERVED_BUILDING_MARKER_IDS,
    RESERVED_MARKER_REGISTRY,
    TrackingFeedNormalizer,
    aoiCalibrationMarkerPosition,
    aoiCornerForMapMarker,
    buildMapCalibrationFromMarkerReadings,
    calibrationMarkerImageUrl,
    createMarkerObjectRegistry,
    reservedMarkerRole,
} from "./collabTracking";

const registry: MarkerObjectRegistry = createMarkerObjectRegistry([{ markerId: 182, objectId: "B-28" }]);

test("uses Python building identity and geometry directly without a marker registry", () => {
    const normalizer = new TrackingFeedNormalizer(createMarkerObjectRegistry([]));
    const geometry = {
        type: "Polygon" as const,
        coordinates: [[[10, 53], [10.001, 53], [10.001, 53.001], [10, 53.001], [10, 53]]],
    };
    const events = normalizer.applySnapshot({
        type: "FeatureCollection",
        features: [{
            type: "Feature",
            geometry,
            properties: {
                marker_id: 24,
                building_id: "G17",
                city_scope_id: "B-17",
                center: [10.0005, 53.0005],
                rotation: 32,
                bbox: [10, 53, 10.001, 53.001],
            },
        }],
    }, 1000);

    expect(events).toEqual([expect.objectContaining({
        type: "appeared",
        objectId: "G17",
        geometry,
        bbox: [10, 53, 10.001, 53.001],
        cityScopeId: "B-17",
        pose: { lng: 10.0005, lat: 53.0005, rotation: 32 },
    })]);
});

function featureCollection(
    features: readonly { markerId: number; lng: number; lat: number; rotation: number; confidence?: number }[]
): TrackingMarkerFeatureCollection {
    return {
        type: "FeatureCollection",
        features: features.map((f) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [f.lng, f.lat] },
            properties: { marker_id: f.markerId, rotation: f.rotation, confidence: f.confidence },
        })),
    };
}

describe("createMarkerObjectRegistry", () => {
    test("rejects marker id 500 (Python's ignored calibration marker)", () => {
        expect(() => createMarkerObjectRegistry([{ markerId: IGNORED_MARKER_ID, objectId: "x" }])).toThrow();
    });

    test("accepts reserved building ids without throwing (plan reserves, doesn't forbid, 100-103 for buildings)", () => {
        expect(() =>
            createMarkerObjectRegistry(RESERVED_BUILDING_MARKER_IDS.map((markerId) => ({ markerId, objectId: `B-${markerId}` })))
        ).not.toThrow();
    });

    test("is data-driven: no ids hardcoded, built entirely from the entries passed in", () => {
        const custom = createMarkerObjectRegistry([{ markerId: 7, objectId: "custom" }]);
        expect(custom.get(7)).toBe("custom");
        expect(custom.get(182)).toBeUndefined();
    });
});

describe("reserved marker id registry (ticket 08)", () => {
    test("MAP_CALIBRATION_MARKERS are a 3x3 grid over ids 200-208", () => {
        expect([...MAP_CALIBRATION_MARKER_IDS].sort()).toEqual([200, 201, 202, 203, 204, 205, 206, 207, 208]);
        const bands = MAP_CALIBRATION_MARKERS.map((marker) => `${marker.column}/${marker.row}`);
        expect(new Set(bands).size).toBe(9);
    });

    test("200-203 keep exactly their original corners, because that mapping is a physical contract", () => {
        // Shared verbatim with Python's `calibration_contract.py` and the Vanilla reference app.
        // The five new markers are additive; re-labelling these four would silently invalidate
        // every marker already taped or projected against them.
        const byId = new Map(MAP_CALIBRATION_MARKERS.map((marker) => [marker.id, marker]));
        expect(byId.get(200)?.corner).toBe("top_left");
        expect(byId.get(201)?.corner).toBe("top_right");
        expect(byId.get(202)?.corner).toBe("bottom_left");
        expect(byId.get(203)?.corner).toBe("bottom_right");
    });

    test("only the four corners are required, so an undecodable extra cannot block a session", () => {
        expect(REQUIRED_MAP_CALIBRATION_MARKERS.map((marker) => marker.id)).toEqual([200, 201, 202, 203]);
    });

    test("reservedMarkerRole resolves every role via the one registry, and undefined for a non-reserved id", () => {
        expect(reservedMarkerRole(REFERENCE_MARKERS[0]!.id)).toBe("camera-reference");
        expect(reservedMarkerRole(200)).toBe("map-calibration");
        expect(reservedMarkerRole(IGNORED_MARKER_ID)).toBe("ignored");
        expect(reservedMarkerRole(100)).toBe("building-reserved");
        expect(reservedMarkerRole(9999)).toBeUndefined();
    });

    test("RESERVED_MARKER_REGISTRY contains every id from every role-specific constant, with no duplicates across roles", () => {
        const ids = RESERVED_MARKER_REGISTRY.map((entry) => entry.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const marker of REFERENCE_MARKERS) {
            expect(reservedMarkerRole(marker.id)).toBe("camera-reference");
        }
        for (const marker of MAP_CALIBRATION_MARKERS) {
            expect(reservedMarkerRole(marker.id)).toBe("map-calibration");
        }
        for (const id of RESERVED_BUILDING_MARKER_IDS) {
            expect(reservedMarkerRole(id)).toBe("building-reserved");
        }
    });
});

describe("aoiCornerForMapMarker (ticket 11)", () => {
    const aoi: AOIExtent = {
        corners: [
            [9.98, 53.56], // top-left
            [10.0, 53.56], // top-right
            [10.0, 53.54], // bottom-right
            [9.98, 53.54], // bottom-left
        ],
    };

    test("resolves each MAP_CALIBRATION_MARKERS corner role to the matching AOI corner", () => {
        expect(aoiCornerForMapMarker(aoi, "top_left")).toEqual([9.98, 53.56]);
        expect(aoiCornerForMapMarker(aoi, "top_right")).toEqual([10.0, 53.56]);
        expect(aoiCornerForMapMarker(aoi, "bottom_right")).toEqual([10.0, 53.54]);
        expect(aoiCornerForMapMarker(aoi, "bottom_left")).toEqual([9.98, 53.54]);
    });

    test("agrees with MAP_CALIBRATION_MARKERS' own id-to-corner mapping (200 top-left ... 203 bottom-right)", () => {
        const byId = new Map(REQUIRED_MAP_CALIBRATION_MARKERS.map((marker) => [marker.id, marker.corner!]));
        expect(aoiCornerForMapMarker(aoi, byId.get(200)!)).toEqual(aoi.corners[0]);
        expect(aoiCornerForMapMarker(aoi, byId.get(201)!)).toEqual(aoi.corners[1]);
        expect(aoiCornerForMapMarker(aoi, byId.get(202)!)).toEqual(aoi.corners[3]);
        expect(aoiCornerForMapMarker(aoi, byId.get(203)!)).toEqual(aoi.corners[2]);
    });
});

describe("buildMapCalibrationFromMarkerReadings (ticket 12)", () => {
    const aoi: AOIExtent = {
        corners: [
            [9.98, 53.56], // top-left
            [10.0, 53.56], // top-right
            [10.0, 53.54], // bottom-right
            [9.98, 53.54], // bottom-left
        ],
    };

    function readings(entries: readonly [number, [number, number]][]): RawMarkerSnapshot {
        return new Map(entries.map(([id, [pixelX, pixelY]]) => [id, { pixelX, pixelY, rotation: 0, cameraOrTag: "000" }]));
    }

    test("pairs each of the four detected markers' raw pixel position with the position that marker was actually projected at — the inset one, not the bare AOI corner (they must be the same point, or Python's homography is skewed by the inset itself)", () => {
        const message = buildMapCalibrationFromMarkerReadings(
            aoi,
            readings([
                [200, [10, 20]], // top_left
                [201, [1590, 20]], // top_right
                [202, [10, 780]], // bottom_left
                [203, [1590, 780]], // bottom_right
            ])
        );

        // 5% of the AOI's 0.02° width in from each vertical edge, and the same distance — 10% of
        // its 0.02° height, on a 2:1 table — in from each horizontal one. Only the four corners
        // were read here, so only those four correspondences go out (workflow step 5: the extra
        // grid markers are used when present, never required).
        expect(message).toEqual<MapCalibrationMessage>({
            type: "map_calibration",
            points: [
                { pixel_position: [10, 20], lat_lon_position: [53.558, 9.981] },
                { pixel_position: [1590, 20], lat_lon_position: [53.558, 9.999] },
                { pixel_position: [10, 780], lat_lon_position: [53.542, 9.981] },
                { pixel_position: [1590, 780], lat_lon_position: [53.542, 9.999] },
            ],
            version: 2,
        });
    });

    test("every marker position sits strictly inside the AOI, on both axes, for all nine markers", () => {
        for (const marker of MAP_CALIBRATION_MARKERS) {
            const [lng, lat] = aoiCalibrationMarkerPosition(aoi, marker);
            expect(lng).toBeGreaterThan(9.98);
            expect(lng).toBeLessThan(10.0);
            expect(lat).toBeGreaterThan(53.54);
            expect(lat).toBeLessThan(53.56);
        }
    });

    test("uses every extra grid marker that was decoded, in id order", () => {
        const message = buildMapCalibrationFromMarkerReadings(
            aoi,
            readings([
                [200, [10, 20]],
                [201, [1590, 20]],
                [202, [10, 780]],
                [203, [1590, 780]],
                [208, [800, 400]], // the centre marker — the one place four corners never constrain
            ])
        );

        expect(message?.points).toHaveLength(5);
        expect(message?.points[4]?.pixel_position).toEqual([800, 400]);
    });

    test("a missing extra marker costs a correspondence, never the calibration", () => {
        // Requiring all nine would make calibration more fragile than the four-marker version it
        // replaces: one marker on a stitching seam would block the whole session.
        const message = buildMapCalibrationFromMarkerReadings(
            aoi,
            readings([
                [200, [10, 20]],
                [201, [1590, 20]],
                [202, [10, 780]],
                [203, [1590, 780]],
            ])
        );

        expect(message).toBeDefined();
        expect(message?.points).toHaveLength(4);
    });

    test("the extra markers spread the sampled quad, they do not sit on top of the corners", () => {
        const message = buildMapCalibrationFromMarkerReadings(
            aoi,
            readings(MAP_CALIBRATION_MARKERS.map((marker, index) => [marker.id, [100 + index, 200 + index]]))
        );

        const positions = message!.points.map((point) => point.lat_lon_position.join(","));
        expect(new Set(positions).size).toBe(MAP_CALIBRATION_MARKERS.length);
    });

    test("returns undefined when any of the four required marker ids has no reading yet", () => {
        expect(
            buildMapCalibrationFromMarkerReadings(
                aoi,
                readings([
                    [200, [10, 20]],
                    [201, [1590, 20]],
                    [202, [10, 780]],
                    // 203 missing
                ])
            )
        ).toBeUndefined();
        expect(buildMapCalibrationFromMarkerReadings(aoi, readings([]))).toBeUndefined();
    });

    test("ignores readings for ids outside MAP_CALIBRATION_MARKERS", () => {
        const message = buildMapCalibrationFromMarkerReadings(
            aoi,
            readings([
                [200, [10, 20]],
                [201, [1590, 20]],
                [202, [10, 780]],
                [203, [1590, 780]],
                [999, [0, 0]],
            ])
        );
        expect(message?.points).toHaveLength(4);
    });
});

describe("calibrationMarkerImageUrl (ticket 11)", () => {
    test("returns a distinct public-asset path per marker id", () => {
        expect(calibrationMarkerImageUrl(200)).toBe("/collab/calibration-markers/4x4_1000-200.svg");
        expect(calibrationMarkerImageUrl(203)).toBe("/collab/calibration-markers/4x4_1000-203.svg");
    });
});

describe("TrackingFeedNormalizer", () => {
    test("emits appeared on first sighting, nothing on an unchanged pose, updated on a moved/rotated pose", () => {
        const normalizer = new TrackingFeedNormalizer(registry);

        const first = normalizer.applySnapshot(featureCollection([{ markerId: 182, lng: 10, lat: 53.5, rotation: 0 }]), 0);
        // `objectContaining`, because an event also carries the marker id and the table-pixel
        // position it was read at; this test is about the appeared/unchanged/updated decision.
        expect(first).toEqual([
            expect.objectContaining({
                type: "appeared",
                objectId: "B-28",
                pose: { lng: 10, lat: 53.5, rotation: 0 },
                confidence: 1,
                timestamp: 0,
            }),
        ]);

        const unchanged = normalizer.applySnapshot(
            featureCollection([{ markerId: 182, lng: 10, lat: 53.5, rotation: 0 }]),
            200
        );
        expect(unchanged).toEqual([]);

        const moved = normalizer.applySnapshot(
            featureCollection([{ markerId: 182, lng: 10.001, lat: 53.5, rotation: 90 }]),
            400
        );
        expect(moved).toEqual([
            expect.objectContaining({
                type: "updated",
                objectId: "B-28",
                pose: { lng: 10.001, lat: 53.5, rotation: 90 },
                confidence: 1,
                timestamp: 400,
            }),
        ]);
    });

    test("synthesizes disappeared from absence + timeout, not from an explicit event (plan §17.1)", () => {
        const normalizer = new TrackingFeedNormalizer(registry, 500);

        normalizer.applySnapshot(featureCollection([{ markerId: 182, lng: 10, lat: 53.5, rotation: 0 }]), 0);

        const stillWithinTimeout = normalizer.applySnapshot(featureCollection([]), 300);
        expect(stillWithinTimeout).toEqual([]);

        const timedOut = normalizer.applySnapshot(featureCollection([]), 600);
        expect(timedOut).toEqual<TrackingEvent[]>([
            {
                type: "disappeared",
                objectId: "B-28",
                pose: { lng: 10, lat: 53.5, rotation: 0 },
                confidence: 0,
                timestamp: 600,
            },
        ]);

        // Re-appearing after being forgotten is a fresh "appeared", not "updated".
        const reappeared = normalizer.applySnapshot(
            featureCollection([{ markerId: 182, lng: 11, lat: 54, rotation: 0 }]),
            700
        );
        expect(reappeared[0]?.type).toBe("appeared");
    });

    test("ignores marker id 500 and any marker with no registry entry (OD-4)", () => {
        const normalizer = new TrackingFeedNormalizer(registry);
        const events = normalizer.applySnapshot(
            featureCollection([
                { markerId: IGNORED_MARKER_ID, lng: 0, lat: 0, rotation: 0 },
                { markerId: 999, lng: 1, lat: 1, rotation: 0 },
            ]),
            0
        );
        expect(events).toEqual([]);
    });

    test("never touches pixel/camera/homography fields — the normalized event carries only geographic pose", () => {
        const normalizer = new TrackingFeedNormalizer(registry);
        const [event] = normalizer.applySnapshot(featureCollection([{ markerId: 182, lng: 10, lat: 53.5, rotation: 12 }]), 0);
        expect(Object.keys(event.pose).sort()).toEqual(["lat", "lng", "rotation"]);
    });

    test("A3: starts live, and a genuinely empty snapshot stays live (a real 'no objects' observation)", () => {
        const normalizer = new TrackingFeedNormalizer(registry);
        expect(normalizer.currentAvailability()).toBe("live");
        normalizer.applySnapshot(featureCollection([]), 0);
        expect(normalizer.currentAvailability()).toBe("live");
    });

    test("A3: a non-empty snapshot containing only the ignored calibration marker is suppressed, not disappeared", () => {
        const normalizer = new TrackingFeedNormalizer(registry, 500);
        normalizer.applySnapshot(featureCollection([{ markerId: 182, lng: 10, lat: 53.5, rotation: 0 }]), 0);

        // Suppression lasts well past the disappear timeout — presence must not advance during it.
        const duringSuppression = normalizer.applySnapshot(
            featureCollection([{ markerId: IGNORED_MARKER_ID, lng: 0, lat: 0, rotation: 0 }]),
            1000
        );
        expect(duringSuppression).toEqual([]);
        expect(normalizer.currentAvailability()).toBe("suppressed");

        // Real tracking resumes: the frozen pose is still there (an "updated"/no-op, not "appeared").
        const resumed = normalizer.applySnapshot(featureCollection([{ markerId: 182, lng: 10, lat: 53.5, rotation: 0 }]), 1100);
        expect(resumed).toEqual([]);
        expect(normalizer.currentAvailability()).toBe("live");
    });

    test("A3: an unregistered (non-calibration) marker id alone also suppresses rather than disappearing", () => {
        const normalizer = new TrackingFeedNormalizer(registry);
        normalizer.applySnapshot(featureCollection([{ markerId: 182, lng: 10, lat: 53.5, rotation: 0 }]), 0);
        const events = normalizer.applySnapshot(featureCollection([{ markerId: 999, lng: 1, lat: 1, rotation: 0 }]), 0);
        expect(events).toEqual([]);
        expect(normalizer.currentAvailability()).toBe("suppressed");
    });
});

describe("MockTrackingSource", () => {
    test("replays the default timeline end-to-end: appeared, updated (moved), updated (rotated), disappeared", () => {
        vi.useFakeTimers();
        let now = 0;
        const source = new MockTrackingSource({ registry, now: () => now, tickMs: 100, disappearTimeoutMs: 500 });
        const events: TrackingEvent[] = [];
        source.onEvent((e) => events.push(e));

        source.start();
        const lastSnapshotMs = DEFAULT_MOCK_TIMELINE[DEFAULT_MOCK_TIMELINE.length - 1]!.atMs;
        const runForMs = lastSnapshotMs + 1000;
        for (let elapsed = 100; elapsed <= runForMs; elapsed += 100) {
            now = elapsed;
            vi.advanceTimersByTime(100);
        }
        source.stop();
        vi.useRealTimers();

        expect(events[0]?.type).toBe("appeared");
        expect(events.some((e) => e.type === "updated")).toBe(true);
        expect(events[events.length - 1]?.type).toBe("disappeared");
        expect(events.every((e) => e.objectId === "B-28")).toBe(true);
    });

    test("start() is idempotent and stop() halts further events", () => {
        vi.useFakeTimers();
        let now = 0;
        const source = new MockTrackingSource({ registry, now: () => now, tickMs: 100 });
        const events: TrackingEvent[] = [];
        source.onEvent((e) => events.push(e));

        source.start();
        source.start(); // second call must not create a second interval
        now = 100;
        vi.advanceTimersByTime(100);
        const countAfterFirstTick = events.length;

        source.stop();
        now = 5000;
        vi.advanceTimersByTime(5000);
        expect(events.length).toBe(countAfterFirstTick);

        vi.useRealTimers();
    });
});

/** A minimal fake of the browser `WebSocket` surface `RealTrackingSource` uses. */
class FakeSocket implements TrackingWebSocket {
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    sent: string[] = [];
    closed = false;

    send(data: string): void {
        this.sent.push(data);
    }

    close(): void {
        this.closed = true;
    }

    emitOpen(): void {
        this.onopen?.();
    }

    emitMessage(data: unknown): void {
        this.onmessage?.({ data: JSON.stringify(data) });
    }
}

const calibration: MapCalibrationMessage = {
    type: "map_calibration",
    points: [{ pixel_position: [0, 0], lat_lon_position: [53.5, 10] }],
    version: 2,
};

describe("RealTrackingSource", () => {
    test("connects and stays connected with no calibration payload available at all — never required to reach Connected (ticket 08)", () => {
        const socket = new FakeSocket();
        const states: PythonConnectionState[] = [];
        const source = new RealTrackingSource({ url: "ws://table-host:8053", registry, createSocket: () => socket });
        source.onConnectionStateChange((s) => states.push(s));

        source.start();
        socket.emitOpen();

        expect(states).toEqual<PythonConnectionState[]>(["connecting", "connected"]);
        source.stop();
    });

    test("does not send map_calibration automatically on open, even when a calibration payload was provided (ticket 08)", () => {
        const socket = new FakeSocket();
        const source = new RealTrackingSource({
            url: "ws://table-host:8053",
            registry,
            calibration,
            createSocket: () => socket,
        });

        source.start();
        socket.emitOpen();

        expect(socket.sent).toEqual([]);
        source.stop();
    });

    test("sendMapCalibration() sends the constructor-provided calibration only when explicitly called, and only once the socket is open", () => {
        const socket = new FakeSocket();
        const source = new RealTrackingSource({
            url: "ws://table-host:8053",
            registry,
            calibration,
            createSocket: () => socket,
        });

        source.start();
        // Not open yet — sending now must not throw or queue a message onto a socket that isn't open.
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
        source.sendMapCalibration();
        expect(socket.sent).toEqual([]);
        expect(consoleError).toHaveBeenCalled();
        consoleError.mockRestore();

        socket.emitOpen();
        source.sendMapCalibration();
        expect(socket.sent).toEqual([JSON.stringify(calibration)]);

        source.stop();
    });

    test("sendMapCalibration(message) sends the given message, overriding whatever the constructor provided", () => {
        const socket = new FakeSocket();
        const source = new RealTrackingSource({
            url: "ws://table-host:8053",
            registry,
            calibration,
            createSocket: () => socket,
        });
        const override: MapCalibrationMessage = { type: "map_calibration", points: [], version: 2 };

        source.start();
        socket.emitOpen();
        source.sendMapCalibration(override);

        expect(socket.sent).toEqual([JSON.stringify(override)]);
        source.stop();
    });

    test("normalizes an incoming GeoJSON FeatureCollection into TrackingEvents via the shared normalizer", () => {
        const socket = new FakeSocket();
        let now = 0;
        const source = new RealTrackingSource({
            url: "ws://table-host:8053",
            registry,
            calibration,
            createSocket: () => socket,
            now: () => now,
        });
        const events: TrackingEvent[] = [];
        source.onEvent((e) => events.push(e));

        source.start();
        socket.emitOpen();
        now = 100;
        socket.emitMessage(featureCollection([{ markerId: 182, lng: 10, lat: 53.5, rotation: 0 }]));

        expect(events).toEqual([
            expect.objectContaining({
                type: "appeared",
                objectId: "B-28",
                pose: { lng: 10, lat: 53.5, rotation: 0 },
                confidence: 1,
                timestamp: 100,
            }),
        ]);
    });

    test("parses and surfaces the pre-calibration raw table-pixel dict via onRawMarkerSnapshot — never treats it as the tracking contract (plan §5b/§5d, ticket 08)", () => {
        const socket = new FakeSocket();
        const source = new RealTrackingSource({ url: "ws://table-host:8053", registry, calibration, createSocket: () => socket });
        const events: TrackingEvent[] = [];
        const rawSnapshots: RawMarkerSnapshot[] = [];
        const idSnapshots: Array<readonly number[]> = [];
        source.onEvent((e) => events.push(e));
        source.onRawMarkerSnapshot((markers) => rawSnapshots.push(markers));
        source.onMarkerSnapshot((ids) => idSnapshots.push(ids));

        source.start();
        socket.emitOpen();
        socket.emitMessage({ 182: [120, 80, 45, "000"], 200: [10, 20, 0, "000"] });

        // Never resolves to TrackingEvents — the raw dict is not the GeoJSON tracking contract.
        expect(events).toEqual([]);
        expect(rawSnapshots).toHaveLength(1);
        expect(rawSnapshots[0]!.get(182)).toEqual({ pixelX: 120, pixelY: 80, rotation: 45, cameraOrTag: "000" });
        expect(rawSnapshots[0]!.get(200)).toEqual({ pixelX: 10, pixelY: 20, rotation: 0, cameraOrTag: "000" });
        expect(idSnapshots).toEqual([[182, 200]]);

        source.stop();
    });

    test("treats an empty raw dict ({}) as a valid raw snapshot (no markers currently detected)", () => {
        const socket = new FakeSocket();
        const source = new RealTrackingSource({ url: "ws://table-host:8053", registry, calibration, createSocket: () => socket });
        const rawSnapshots: RawMarkerSnapshot[] = [];
        source.onRawMarkerSnapshot((markers) => rawSnapshots.push(markers));

        source.start();
        socket.emitOpen();
        socket.emitMessage({});

        expect(rawSnapshots).toHaveLength(1);
        expect(rawSnapshots[0]!.size).toBe(0);

        source.stop();
    });

    test("recognizes a {\"type\": \"calibration_ack\"} message via onCalibrationAck without disturbing raw/GeoJSON parsing (grilling doc item 6 — inert scaffolding, Python sends none of these today)", () => {
        const socket = new FakeSocket();
        const source = new RealTrackingSource({ url: "ws://table-host:8053", registry, calibration, createSocket: () => socket });
        const acks: number[] = [];
        const rawSnapshots: RawMarkerSnapshot[] = [];
        source.onCalibrationAck(() => acks.push(1));
        source.onRawMarkerSnapshot((markers) => rawSnapshots.push(markers));

        source.start();
        socket.emitOpen();
        socket.emitMessage({ type: "calibration_ack" });

        expect(acks).toHaveLength(1);
        expect(rawSnapshots).toHaveLength(0);

        // Still parses ordinary raw snapshots normally afterward.
        socket.emitMessage({ 182: [120, 80, 45, "000"] });
        expect(rawSnapshots).toHaveLength(1);

        source.stop();
    });

    test("ignores malformed (non-JSON) messages instead of throwing", () => {
        const socket = new FakeSocket();
        const source = new RealTrackingSource({ url: "ws://table-host:8053", registry, calibration, createSocket: () => socket });
        source.onEvent(() => {
            throw new Error("should not be called");
        });

        source.start();
        socket.emitOpen();
        expect(() => socket.onmessage?.({ data: "not json" })).not.toThrow();
    });

    test("start() is idempotent (does not open a second socket) and stop() closes it and detaches handlers", () => {
        const sockets: FakeSocket[] = [];
        const source = new RealTrackingSource({
            url: "ws://table-host:8053",
            registry,
            calibration,
            createSocket: () => {
                const socket = new FakeSocket();
                sockets.push(socket);
                return socket;
            },
        });

        source.start();
        source.start();
        expect(sockets.length).toBe(1);

        source.stop();
        expect(sockets[0]?.closed).toBe(true);
        expect(sockets[0]?.onmessage).toBeNull();

        // idempotent: calling stop() again with no open socket must not throw
        expect(() => source.stop()).not.toThrow();
    });

    test("onclose reports disconnected and freezes tracked objects instead of disappearing them (A3)", () => {
        const socket = new FakeSocket();
        let now = 0;
        const source = new RealTrackingSource({
            url: "ws://table-host:8053",
            registry,
            calibration,
            createSocket: () => socket,
            now: () => now,
        });
        const events: TrackingEvent[] = [];
        const availabilities: TrackingAvailability[] = [];
        source.onEvent((e) => events.push(e));
        source.onAvailabilityChange((a) => availabilities.push(a));

        source.start();
        socket.emitOpen();
        socket.emitMessage(featureCollection([{ markerId: 182, lng: 10, lat: 53.5, rotation: 0 }]));
        expect(events).toHaveLength(1);

        now = 5000;
        socket.onclose?.();

        // A dropped connection must not synthesize a "disappeared" event — the last known pose
        // is frozen, and the UI is told via availability instead.
        expect(events).toHaveLength(1);
        expect(availabilities).toEqual<TrackingAvailability[]>(["live", "disconnected"]);

        // An unexpected drop schedules a reconnect (marker-health-plan §2); stop() here just
        // cancels it so the test doesn't leave a dangling timer.
        source.stop();
    });

    test("onerror reports a developer error and reports disconnected without disappearing tracked objects", () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const socket = new FakeSocket();
        const source = new RealTrackingSource({ url: "ws://table-host:8053", registry, calibration, createSocket: () => socket });
        const events: TrackingEvent[] = [];
        const availabilities: TrackingAvailability[] = [];
        source.onEvent((e) => events.push(e));
        source.onAvailabilityChange((a) => availabilities.push(a));

        source.start();
        socket.emitOpen();
        socket.emitMessage(featureCollection([{ markerId: 182, lng: 10, lat: 53.5, rotation: 0 }]));
        socket.onerror?.(new Event("error"));

        expect(consoleError).toHaveBeenCalled();
        expect(events.some((e) => e.type === "disappeared")).toBe(false);
        expect(availabilities[availabilities.length - 1]).toBe("disconnected");

        source.stop(); // cancels the reconnect an unexpected drop schedules (marker-health-plan §2)
        consoleError.mockRestore();
    });

    test("a re-start()/stop() cycle after termination does not throw", () => {
        const sockets: FakeSocket[] = [];
        const source = new RealTrackingSource({
            url: "ws://table-host:8053",
            registry,
            calibration,
            createSocket: () => {
                const socket = new FakeSocket();
                sockets.push(socket);
                return socket;
            },
        });

        source.start();
        sockets[0]?.emitOpen();
        sockets[0]?.emitMessage(featureCollection([{ markerId: 182, lng: 10, lat: 53.5, rotation: 0 }]));
        sockets[0]?.onclose?.();

        // stop() after the socket already terminated itself must be a no-op, not a double-close.
        expect(() => source.stop()).not.toThrow();
    });

    test("a calibration-marker-only snapshot (only the ignored id) suppresses without disappearing tracked objects (A3)", () => {
        const socket = new FakeSocket();
        const source = new RealTrackingSource({ url: "ws://table-host:8053", registry, calibration, createSocket: () => socket });
        const events: TrackingEvent[] = [];
        const availabilities: TrackingAvailability[] = [];
        source.onEvent((e) => events.push(e));
        source.onAvailabilityChange((a) => availabilities.push(a));

        source.start();
        socket.emitOpen();
        socket.emitMessage(featureCollection([{ markerId: 182, lng: 10, lat: 53.5, rotation: 0 }]));
        socket.emitMessage(featureCollection([{ markerId: IGNORED_MARKER_ID, lng: 0, lat: 0, rotation: 0 }]));

        expect(events.some((e) => e.type === "disappeared")).toBe(false);
        expect(availabilities).toEqual<TrackingAvailability[]>(["live", "suppressed"]);

        // Real tracking resuming after suppression is "live" again, not a fresh "appeared".
        socket.emitMessage(featureCollection([{ markerId: 182, lng: 10, lat: 53.5, rotation: 0 }]));
        expect(availabilities).toEqual<TrackingAvailability[]>(["live", "suppressed", "live"]);
    });
});

describe("RealTrackingSource — Python connection state & auto-reconnect (marker-health-plan §1/§2)", () => {
    function socketFactory(): { createSocket: () => TrackingWebSocket; sockets: FakeSocket[] } {
        const sockets: FakeSocket[] = [];
        return {
            sockets,
            createSocket: () => {
                const socket = new FakeSocket();
                sockets.push(socket);
                return socket;
            },
        };
    }

    test("successful connection: connecting -> connected", () => {
        const { createSocket, sockets } = socketFactory();
        const source = new RealTrackingSource({ url: "ws://table-host:8053", registry, calibration, createSocket });
        const states: PythonConnectionState[] = [];
        source.onConnectionStateChange((s) => states.push(s));

        source.start();
        expect(states).toEqual<PythonConnectionState[]>(["connecting"]);

        sockets[0]?.emitOpen();
        expect(states).toEqual<PythonConnectionState[]>(["connecting", "connected"]);

        source.stop();
    });

    test("connection failure (onerror before onopen) reports disconnected and schedules exactly one reconnect", () => {
        vi.useFakeTimers();
        const { createSocket, sockets } = socketFactory();
        const source = new RealTrackingSource({ url: "ws://table-host:8053", registry, calibration, createSocket });
        const states: PythonConnectionState[] = [];
        source.onConnectionStateChange((s) => states.push(s));

        source.start();
        sockets[0]?.onerror?.(new Event("error"));

        expect(states).toEqual<PythonConnectionState[]>(["connecting", "reconnecting"]);
        expect(sockets).toHaveLength(1);

        vi.advanceTimersByTime(1000);
        expect(sockets).toHaveLength(2); // exactly one reconnect attempt fired

        source.stop();
        vi.useRealTimers();
    });

    test("unexpected disconnect (onclose after connected) transitions to reconnecting, not disconnected", () => {
        vi.useFakeTimers();
        const { createSocket, sockets } = socketFactory();
        const source = new RealTrackingSource({ url: "ws://table-host:8053", registry, calibration, createSocket });
        const states: PythonConnectionState[] = [];
        source.onConnectionStateChange((s) => states.push(s));

        source.start();
        sockets[0]?.emitOpen();
        sockets[0]?.onclose?.();

        expect(states).toEqual<PythonConnectionState[]>(["connecting", "connected", "reconnecting"]);

        source.stop();
        vi.useRealTimers();
    });

    test("reconnect: automatically opens a new socket without the operator pressing Start Tracking again — but never re-sends map_calibration on its own (ticket 08)", () => {
        vi.useFakeTimers();
        const { createSocket, sockets } = socketFactory();
        const source = new RealTrackingSource({ url: "ws://table-host:8053", registry, calibration, createSocket });

        source.start();
        sockets[0]?.emitOpen();
        sockets[0]?.onclose?.();

        vi.advanceTimersByTime(1000);
        expect(sockets).toHaveLength(2);

        sockets[1]?.emitOpen();
        expect(sockets[1]?.sent).toEqual([]);

        source.stop();
        vi.useRealTimers();
    });

    test("successful recovery: tracking availability and connection state both return to normal after reconnect", () => {
        vi.useFakeTimers();
        const { createSocket, sockets } = socketFactory();
        const source = new RealTrackingSource({ url: "ws://table-host:8053", registry, calibration, createSocket });
        const states: PythonConnectionState[] = [];
        const availabilities: TrackingAvailability[] = [];
        source.onConnectionStateChange((s) => states.push(s));
        source.onAvailabilityChange((a) => availabilities.push(a));

        source.start();
        sockets[0]?.emitOpen();
        sockets[0]?.emitMessage(featureCollection([{ markerId: 182, lng: 10, lat: 53.5, rotation: 0 }]));
        sockets[0]?.onclose?.();
        vi.advanceTimersByTime(1000);
        sockets[1]?.emitOpen();
        sockets[1]?.emitMessage(featureCollection([{ markerId: 182, lng: 10, lat: 53.5, rotation: 0 }]));

        expect(states).toEqual<PythonConnectionState[]>(["connecting", "connected", "reconnecting", "reconnecting", "connected"]);
        expect(availabilities[availabilities.length - 1]).toBe("live");

        source.stop();
        vi.useRealTimers();
    });

    test("repeated disconnects do not create duplicate sockets or overlapping reconnect timers", () => {
        vi.useFakeTimers();
        const { createSocket, sockets } = socketFactory();
        const source = new RealTrackingSource({ url: "ws://table-host:8053", registry, calibration, createSocket });

        source.start();
        sockets[0]?.emitOpen();
        sockets[0]?.onclose?.();
        // A second onclose on the same (already-terminated) socket must not schedule a second timer.
        sockets[0]?.onclose?.();
        // Calling start() again while a reconnect is already pending must not open a second socket either.
        source.start();

        vi.advanceTimersByTime(1000);
        expect(sockets).toHaveLength(2); // exactly one reconnect, not two

        // Backoff grows and stays single-flight across multiple failures.
        sockets[1]?.onerror?.(new Event("error"));
        vi.advanceTimersByTime(2000);
        expect(sockets).toHaveLength(3);

        source.stop();
        vi.useRealTimers();
    });

    test("explicit Stop Tracking cancels any pending reconnect and never reconnects afterward", () => {
        vi.useFakeTimers();
        const { createSocket, sockets } = socketFactory();
        const source = new RealTrackingSource({ url: "ws://table-host:8053", registry, calibration, createSocket });
        const states: PythonConnectionState[] = [];
        source.onConnectionStateChange((s) => states.push(s));

        source.start();
        sockets[0]?.emitOpen();
        sockets[0]?.onclose?.();
        expect(states[states.length - 1]).toBe("reconnecting");

        source.stop();
        expect(states[states.length - 1]).toBe("disconnected");

        vi.advanceTimersByTime(60_000);
        expect(sockets).toHaveLength(1); // no reconnect ever fired

        vi.useRealTimers();
    });

    test("gives up after reconnectMaxAttempts consecutive failures: reports plain disconnected and schedules no further reconnect (ticket 08)", () => {
        vi.useFakeTimers();
        const { createSocket, sockets } = socketFactory();
        const source = new RealTrackingSource({
            url: "ws://table-host:8053",
            registry,
            calibration,
            createSocket,
            reconnectMaxAttempts: 2,
            reconnectBaseDelayMs: 1000,
        });
        const states: PythonConnectionState[] = [];
        source.onConnectionStateChange((s) => states.push(s));

        source.start();
        sockets[0]?.onerror?.(new Event("error")); // failure 1/3 -> schedules reconnect attempt 1
        vi.advanceTimersByTime(1000);
        expect(sockets).toHaveLength(2);

        sockets[1]?.onerror?.(new Event("error")); // failure 2/3 -> schedules reconnect attempt 2
        vi.advanceTimersByTime(2000);
        expect(sockets).toHaveLength(3);

        sockets[2]?.onerror?.(new Event("error")); // failure 3/3 -> gives up, no further reconnect scheduled
        expect(states[states.length - 1]).toBe("disconnected");

        vi.advanceTimersByTime(60_000);
        expect(sockets).toHaveLength(3); // no reconnect attempt 3 ever fired

        vi.useRealTimers();
    });

    test("a manual retry (start()) after give-up resets the attempt count and connects again", () => {
        vi.useFakeTimers();
        const { createSocket, sockets } = socketFactory();
        const source = new RealTrackingSource({
            url: "ws://table-host:8053",
            registry,
            calibration,
            createSocket,
            reconnectMaxAttempts: 1,
            reconnectBaseDelayMs: 1000,
        });
        const states: PythonConnectionState[] = [];
        source.onConnectionStateChange((s) => states.push(s));

        source.start();
        sockets[0]?.onerror?.(new Event("error")); // failure 1/2 -> schedules reconnect attempt 1
        vi.advanceTimersByTime(1000);
        expect(sockets).toHaveLength(2);

        sockets[1]?.onerror?.(new Event("error")); // failure 2/2 -> gives up
        expect(states[states.length - 1]).toBe("disconnected");

        source.start(); // operator-triggered retry
        expect(states[states.length - 1]).toBe("connecting");
        expect(sockets).toHaveLength(3);

        sockets[2]?.emitOpen();
        expect(states[states.length - 1]).toBe("connected");

        source.stop();
        vi.useRealTimers();
    });

    test("preserves last-known building poses across an unexpected disconnect and reconnect", () => {
        vi.useFakeTimers();
        const { createSocket, sockets } = socketFactory();
        const source = new RealTrackingSource({ url: "ws://table-host:8053", registry, calibration, createSocket });
        const events: TrackingEvent[] = [];
        source.onEvent((e) => events.push(e));

        source.start();
        sockets[0]?.emitOpen();
        sockets[0]?.emitMessage(featureCollection([{ markerId: 182, lng: 10, lat: 53.5, rotation: 0 }]));
        sockets[0]?.onclose?.();
        vi.advanceTimersByTime(1000);

        // No "disappeared" was synthesized purely from the transport drop — the pose is still
        // frozen, so the very next snapshot at the same pose is a no-op, not a fresh "appeared".
        sockets[1]?.emitOpen();
        sockets[1]?.emitMessage(featureCollection([{ markerId: 182, lng: 10, lat: 53.5, rotation: 0 }]));
        expect(events).toHaveLength(1); // only the original "appeared" — nothing re-synthesized
        expect(events[0]?.type).toBe("appeared");

        source.stop();
        vi.useRealTimers();
    });
});

describe("RealTrackingSource — onMarkerSnapshot (marker-health-plan §3, no dedicated Python message)", () => {
    // Python never strips reference/corner marker ids out of the ordinary tracking feed
    // (table_to_geojson.py/marker.py pass every detected id through) — these ids simply show up as
    // regular features alongside real building markers, exactly like Vanilla's raw marker dict did.
    test("relays every marker_id present in an ordinary FeatureCollection snapshot, including ones with no registry entry", () => {
        const socket = new FakeSocket();
        const source = new RealTrackingSource({ url: "ws://table-host:8053", registry, calibration, createSocket: () => socket });
        const snapshots: Array<readonly number[]> = [];
        source.onMarkerSnapshot((ids) => snapshots.push(ids));

        source.start();
        socket.emitOpen();
        socket.emitMessage(
            featureCollection([
                { markerId: 182, lng: 10, lat: 53.5, rotation: 0 }, // a real, registered building
                { markerId: 72, lng: 10.001, lat: 53.501, rotation: 0 }, // a reference/corner marker
            ])
        );

        expect(snapshots).toEqual([[182, 72]]);

        source.stop();
    });

    test("onMarkerSnapshot never resolves to TrackingEvents by itself (unregistered ids stay out of the tracking contract)", () => {
        const socket = new FakeSocket();
        const source = new RealTrackingSource({ url: "ws://table-host:8053", registry, calibration, createSocket: () => socket });
        const events: TrackingEvent[] = [];
        const snapshots: Array<readonly number[]> = [];
        source.onEvent((e) => events.push(e));
        source.onMarkerSnapshot((ids) => snapshots.push(ids));

        source.start();
        socket.emitOpen();
        socket.emitMessage(featureCollection([{ markerId: 72, lng: 10, lat: 53.5, rotation: 0 }]));

        expect(snapshots).toEqual([[72]]);
        expect(events).toEqual([]); // marker 72 has no registry entry — normalizer ignores it

        source.stop();
    });
});

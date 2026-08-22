import { describe, expect, test, vi } from "vitest";
import type { MapCalibrationMessage } from "./collabCalibration";
import type { MarkerObjectRegistry, TrackingEvent, TrackingMarkerFeatureCollection, TrackingWebSocket } from "./collabTracking";
import {
    DEFAULT_MOCK_TIMELINE,
    IGNORED_MARKER_ID,
    MockTrackingSource,
    RealTrackingSource,
    RESERVED_BUILDING_MARKER_IDS,
    TrackingFeedNormalizer,
    createMarkerObjectRegistry,
} from "./collabTracking";

const registry: MarkerObjectRegistry = createMarkerObjectRegistry([{ markerId: 182, objectId: "B-28" }]);

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

describe("TrackingFeedNormalizer", () => {
    test("emits appeared on first sighting, nothing on an unchanged pose, updated on a moved/rotated pose", () => {
        const normalizer = new TrackingFeedNormalizer(registry);

        const first = normalizer.applySnapshot(featureCollection([{ markerId: 182, lng: 10, lat: 53.5, rotation: 0 }]), 0);
        expect(first).toEqual<TrackingEvent[]>([
            { type: "appeared", objectId: "B-28", pose: { lng: 10, lat: 53.5, rotation: 0 }, confidence: 1, timestamp: 0 },
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
        expect(moved).toEqual<TrackingEvent[]>([
            {
                type: "updated",
                objectId: "B-28",
                pose: { lng: 10.001, lat: 53.5, rotation: 90 },
                confidence: 1,
                timestamp: 400,
            },
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
};

describe("RealTrackingSource", () => {
    test("sends exactly one map_calibration on connect", () => {
        const socket = new FakeSocket();
        const source = new RealTrackingSource({
            url: "ws://table-host:8053",
            registry,
            calibration,
            createSocket: () => socket,
        });

        source.start();
        socket.emitOpen();

        expect(socket.sent).toEqual([JSON.stringify(calibration)]);
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

        expect(events).toEqual<TrackingEvent[]>([
            { type: "appeared", objectId: "B-28", pose: { lng: 10, lat: 53.5, rotation: 0 }, confidence: 1, timestamp: 100 },
        ]);
    });

    test("ignores the pre-calibration raw table-pixel dict — never treats it as the tracking contract (plan §5b/§5d)", () => {
        const socket = new FakeSocket();
        const source = new RealTrackingSource({ url: "ws://table-host:8053", registry, calibration, createSocket: () => socket });
        const events: TrackingEvent[] = [];
        source.onEvent((e) => events.push(e));

        source.start();
        socket.emitOpen();
        socket.emitMessage({ 182: [120, 80, 45, "000"] });

        expect(events).toEqual([]);
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

    test("onclose synthesizes disappeared for every tracked object instead of leaving markers frozen", () => {
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
        socket.emitMessage(featureCollection([{ markerId: 182, lng: 10, lat: 53.5, rotation: 0 }]));
        expect(events).toHaveLength(1);

        now = 5000;
        socket.onclose?.();

        expect(events).toHaveLength(2);
        expect(events[1]).toEqual<TrackingEvent>({
            type: "disappeared",
            objectId: "B-28",
            pose: { lng: 10, lat: 53.5, rotation: 0 },
            confidence: 0,
            timestamp: 5000,
        });
    });

    test("onerror reports a developer error and also synthesizes disappeared", () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const socket = new FakeSocket();
        const source = new RealTrackingSource({ url: "ws://table-host:8053", registry, calibration, createSocket: () => socket });
        const events: TrackingEvent[] = [];
        source.onEvent((e) => events.push(e));

        source.start();
        socket.emitOpen();
        socket.emitMessage(featureCollection([{ markerId: 182, lng: 10, lat: 53.5, rotation: 0 }]));
        socket.onerror?.(new Event("error"));

        expect(consoleError).toHaveBeenCalled();
        expect(events.some((e) => e.type === "disappeared")).toBe(true);

        consoleError.mockRestore();
    });

    test("a re-start()/stop() cycle after termination does not double-emit disappeared", () => {
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
});

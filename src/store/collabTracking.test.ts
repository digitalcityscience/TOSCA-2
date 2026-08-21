import { describe, expect, test, vi } from "vitest";
import type { MarkerObjectRegistry, TrackingEvent, TrackingMarkerFeatureCollection } from "./collabTracking";
import {
    DEFAULT_MOCK_TIMELINE,
    IGNORED_MARKER_ID,
    MockTrackingSource,
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

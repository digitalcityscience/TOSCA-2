/**
 * Cross-repo contract test: real Python bytes -> real `RealTrackingSource`.
 *
 * `CAPTURED_BACKEND_SNAPSHOT` is not hand-written. It is the payload captured off the wire
 * from `COUP-table-object-tracking`'s actual websocket handler by that repo's
 * `test/test_frontend_contract.py`, which drives `server.handle_web_client` over a real
 * socket and writes what the client received to `test/fixtures/captured_raw_snapshot.json`.
 * The same bytes are replayed here through this app's real message handler.
 *
 * Why it exists: the two sides drifted apart once already. Python's raw snapshot is a plain
 * `{id: [x, y, rotation, camera]}` object with no `type` discriminator, so nothing about it
 * is self-describing — if the shape changes, `isRawMarkerDictionary` silently stops matching
 * and the calibration markers vanish with no error anywhere. These assertions fail instead.
 *
 * The pixel positions are the operator-confirmed 2026-08-31 handshake recorded in
 * `known_good_map_calibration_2026-08-31.json`.
 */
import { describe, expect, test } from "vitest";
import {
    REQUIRED_MAP_CALIBRATION_MARKERS,
    RealTrackingSource,
    buildMapCalibrationFromMarkerReadings,
    createMarkerObjectRegistry,
    isMarkerReadingStable,
    pixelReadingsWithinTolerance,
    type RawMarkerReading,
    type RawMarkerSnapshot,
    type TrackedMarkerReading,
    type TrackingWebSocket,
} from "./collabTracking";
import type { AOIExtent } from "./collabCalibration";

/**
 * Captured verbatim from `server.handle_web_client`; see this file's header.
 *
 * These bytes predate the 3x3 calibration grid (workflow step 5), so they carry only the four
 * corner markers. That is exactly the case the grid is designed to survive: the four required
 * markers alone still calibrate, and the five extra ones are used whenever they are decoded.
 * Assertions below therefore walk `REQUIRED_MAP_CALIBRATION_MARKERS`, not all nine.
 */
const CAPTURED_BACKEND_SNAPSHOT: Record<string, [number, number, number, string]> = {
    "12": [700, 400, 12.5, "000"],
    "200": [288, 658, 0.0, "000"],
    "201": [1347, 663, 0.0, "000"],
    "202": [298, 153, 0.0, "000"],
    "203": [1350, 150, 0.0, "000"],
};

/** The AOI of that same confirmed handshake. */
const AOI: AOIExtent = {
    corners: [
        [10.027891448941773, 53.57073154051318],
        [10.033103979838955, 53.57073154051318],
        [10.033103979838955, 53.569183833647685],
        [10.027891448941773, 53.569183833647685],
    ],
};

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
    /** Deliberately takes a string: the point is to replay the exact bytes Python sent. */
    emitRaw(json: string): void {
        this.onmessage?.({ data: json });
    }
}

function connectedSource(): { socket: FakeSocket; snapshots: RawMarkerSnapshot[]; source: RealTrackingSource } {
    const socket = new FakeSocket();
    const source = new RealTrackingSource({
        url: "ws://table-host:8053",
        registry: createMarkerObjectRegistry([]),
        createSocket: () => socket,
    });
    const snapshots: RawMarkerSnapshot[] = [];
    source.onRawMarkerSnapshot((markers) => snapshots.push(markers));
    source.start();
    socket.emitOpen();
    return { socket, snapshots, source };
}

function readingsFrom(entries: Record<string, [number, number, number, string]>): RawMarkerSnapshot {
    return new Map(
        Object.entries(entries).map(([id, [pixelX, pixelY, rotation, cameraOrTag]]) => [
            Number(id),
            { pixelX, pixelY, rotation, cameraOrTag },
        ])
    );
}

describe("Python's raw marker snapshot -> RealTrackingSource", () => {
    test("is recognised as a raw marker dictionary and yields all four required calibration markers", () => {
        const { socket, snapshots, source } = connectedSource();

        socket.emitRaw(JSON.stringify(CAPTURED_BACKEND_SNAPSHOT));

        expect(snapshots).toHaveLength(1);
        const snapshot = snapshots[0]!;
        for (const marker of REQUIRED_MAP_CALIBRATION_MARKERS) {
            expect(snapshot.get(marker.id), `marker ${marker.id} missing from the snapshot`).toBeDefined();
        }
        expect(snapshot.get(200)).toEqual({ pixelX: 288, pixelY: 658, rotation: 0, cameraOrTag: "000" });
        expect(snapshot.get(203)).toEqual({ pixelX: 1350, pixelY: 150, rotation: 0, cameraOrTag: "000" });

        source.stop();
    });

    test("string ids on the wire become numeric ids in the snapshot", () => {
        // JSON object keys are always strings; `MAP_CALIBRATION_MARKER_IDS` holds numbers.
        // A regression here makes every calibration lookup miss without throwing.
        const { socket, snapshots, source } = connectedSource();
        socket.emitRaw(JSON.stringify(CAPTURED_BACKEND_SNAPSHOT));
        for (const key of [...snapshots[0]!.keys()]) {
            expect(typeof key).toBe("number");
        }
        source.stop();
    });

    test("building markers ride along in the same snapshot as the calibration markers", () => {
        // Python's `Markers.toDict` merges both sets. It used to return only the
        // calibration markers whenever one was visible, silencing the building feed.
        const { socket, snapshots, source } = connectedSource();
        socket.emitRaw(JSON.stringify(CAPTURED_BACKEND_SNAPSHOT));
        expect(snapshots[0]!.get(12)).toBeDefined();
        source.stop();
    });

    test("two consecutive identical snapshots satisfy the stability gate", () => {
        const { socket, snapshots, source } = connectedSource();
        socket.emitRaw(JSON.stringify(CAPTURED_BACKEND_SNAPSHOT));
        socket.emitRaw(JSON.stringify(CAPTURED_BACKEND_SNAPSHOT));

        // Mirrors `collabTrackingRender`'s stability bookkeeping.
        const tracked = new Map<number, TrackedMarkerReading>();
        for (const snapshot of snapshots) {
            for (const marker of REQUIRED_MAP_CALIBRATION_MARKERS) {
                const reading = snapshot.get(marker.id) as RawMarkerReading | undefined;
                if (reading === undefined) continue;
                const previous = tracked.get(marker.id);
                tracked.set(marker.id, {
                    reading,
                    firstSeenAt: previous?.firstSeenAt ?? 0,
                    lastUpdatedAt: 0,
                    consecutiveCount:
                        previous !== undefined && pixelReadingsWithinTolerance(previous.reading, reading)
                            ? previous.consecutiveCount + 1
                            : 1,
                });
            }
        }
        for (const marker of REQUIRED_MAP_CALIBRATION_MARKERS) {
            expect(isMarkerReadingStable(tracked.get(marker.id)!), `marker ${marker.id} never stabilised`).toBe(true);
        }
        source.stop();
    });

    test("the accepted readings build a complete map_calibration for Python", () => {
        const message = buildMapCalibrationFromMarkerReadings(AOI, readingsFrom(CAPTURED_BACKEND_SNAPSHOT));

        expect(message).toBeDefined();
        expect(message!.type).toBe("map_calibration");
        // Ordered by MAP_CALIBRATION_MARKERS: 200, 201, 202, 203.
        expect(message!.points.map((point) => point.pixel_position)).toEqual([
            [288, 658],
            [1347, 663],
            [298, 153],
            [1350, 150],
        ]);
    });

    test("a snapshot missing one calibration marker cannot complete calibration", () => {
        const { "203": _dropped, ...partial } = CAPTURED_BACKEND_SNAPSHOT;
        expect(buildMapCalibrationFromMarkerReadings(AOI, readingsFrom(partial))).toBeUndefined();
    });

    test("Python's post-calibration GeoJSON is not mistaken for a raw snapshot", () => {
        // Once a homography exists Python switches to a FeatureCollection. An empty one is
        // still meaningful ("Python is on the calibrated feed"), and must not be parsed as
        // a marker dictionary.
        const { socket, snapshots, source } = connectedSource();
        socket.emitRaw(JSON.stringify({ type: "FeatureCollection", features: [] }));
        expect(snapshots).toHaveLength(0);
        source.stop();
    });
});

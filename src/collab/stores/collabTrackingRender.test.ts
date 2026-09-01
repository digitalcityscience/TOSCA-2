import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const toastAdd = vi.hoisted(() => vi.fn());

vi.mock("@helpers/toast", () => ({
    useToast: () => ({ add: toastAdd }),
}));

import type { CollabSceneObject, CollabTrackingObjectState } from "./collabSession";
import { useCollabSessionStore } from "./collabSession";
import { useCollabScenarioStore } from "./collabScenario";
import type { AOIExtent } from "./collabCalibration";
import { tableToAoiRotationOffsetDeg } from "./collabCalibration";
import type { TrackingEvent } from "./collabTracking";
import { applyTrackingEvent, buildMarkerRegistryFromBase, useCollabTrackingRenderStore } from "./collabTrackingRender";

describe("buildMarkerRegistryFromBase", () => {
    test("maps marker_id -> object id for scene objects that carry one", () => {
        const objects: CollabSceneObject[] = [
            { id: "G01", properties: { marker_id: 1 } },
            { id: "G02", properties: { marker_id: 2 } },
        ];
        const registry = buildMarkerRegistryFromBase(objects);
        expect(registry.get(1)).toBe("G01");
        expect(registry.get(2)).toBe("G02");
    });

    test("skips objects without a numeric marker_id", () => {
        const objects: CollabSceneObject[] = [{ id: "no-marker" }, { id: "bad-marker", properties: { marker_id: "x" } }];
        const registry = buildMarkerRegistryFromBase(objects);
        expect(registry.size).toBe(0);
    });
});

describe("applyTrackingEvent", () => {
    test("appeared/updated write pose+confidence+lastSeen", () => {
        const tracking: Record<string, CollabTrackingObjectState> = {};
        const event: TrackingEvent = {
            type: "appeared",
            objectId: "G01",
            pose: { lng: 10, lat: 53.5, rotation: 0 },
            confidence: 0.9,
            timestamp: 123,
        };
        applyTrackingEvent(tracking, event);
        expect(tracking.G01).toEqual({ pose: { lng: 10, lat: 53.5, rotation: 0 }, confidence: 0.9, lastSeen: 123 });
    });

    test("disappeared removes the object", () => {
        const tracking: Record<string, CollabTrackingObjectState> = {
            G01: { pose: { lng: 10, lat: 53.5, rotation: 0 }, confidence: 1, lastSeen: 0 },
        };
        applyTrackingEvent(tracking, {
            type: "disappeared",
            objectId: "G01",
            pose: { lng: 10, lat: 53.5, rotation: 0 },
            confidence: 0,
            timestamp: 1,
        });
        expect(tracking.G01).toBeUndefined();
    });
});

describe("collabTrackingRender store", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        toastAdd.mockClear();
    });

    /**
     * A post-calibration GeoJSON snapshot carrying one building.
     *
     * `building_id` is required, not decoration: the production registry is empty
     * (`connectPythonTransport` passes `createMarkerObjectRegistry([])`), so a feature carrying
     * only `marker_id` is rejected by `TrackingFeedNormalizer.resolveObjectId` and no tracking
     * event is ever emitted. Without it this fixture silently proved nothing — which is why
     * "GeoJSON resuming within the window cancels the fallback" was failing before the
     * confirmation work even started.
     */
    let geojsonNudge = 0;
    // Typed structurally rather than against a `FakeSocket`: each describe block below declares its
    // own, and both need this fixture.
    function sendGeojson(socket: { onmessage: ((event: { data: string }) => void) | null }): void {
        // Each call reports the building at a slightly different place. An identical snapshot
        // is not a no-op for the socket but it is one for the normalizer — an unchanged pose
        // emits no tracking event — so a repeated fixture would look like Python having gone
        // quiet. Every caller here uses this fixture as *evidence that a message arrived*, so it
        // has to move.
        geojsonNudge += 1;
        socket.onmessage?.({
            data: JSON.stringify({
                type: "FeatureCollection",
                features: [
                    {
                        type: "Feature",
                        geometry: { type: "Point", coordinates: [10 + geojsonNudge * 0.0001, 53.5] },
                        properties: { marker_id: 1, building_id: "G01", rotation: 0 },
                    },
                ],
            }),
        });
    }

    test("startRendering('control') mirrors the local AOI's rotation offset into collabSession.calibration", () => {
        const session = useCollabSessionStore();
        const scenarioStore = useCollabScenarioStore();
        const trackingRender = useCollabTrackingRenderStore();

        expect(session.calibration.rotationOffsetDeg).toBe(0);

        scenarioStore.aoi = {
            corners: [
                [9.98, 53.56],
                [10.0, 53.55],
                [9.99, 53.53],
                [9.97, 53.54],
            ],
        };
        trackingRender.startRendering("control");

        expect(session.calibration.rotationOffsetDeg).toBe(tableToAoiRotationOffsetDeg(scenarioStore.aoi));
        expect(session.calibration.rotationOffsetDeg).not.toBe(0);
    });

    test("startRendering('table') never touches collabSession.calibration — it only reads it", () => {
        const session = useCollabSessionStore();
        session.calibration.rotationOffsetDeg = 12;

        const trackingRender = useCollabTrackingRenderStore();
        trackingRender.startRendering("table");

        expect(session.calibration.rotationOffsetDeg).toBe(12);
    });

    test("startRendering('control') connects RealTrackingSource when VITE_COLLAB_TRACKING_MODE is \"real\" and a WS URL is configured (ticket 03)", () => {
        vi.stubEnv("VITE_COLLAB_TRACKING_MODE", "real");
        vi.stubEnv("VITE_COLLAB_TRACKING_WS_URL", "ws://table-host:8053");

        class FakeSocket {
            onopen: (() => void) | null = null;
            onmessage: ((event: { data: string }) => void) | null = null;
            onclose: (() => void) | null = null;
            onerror: ((event: unknown) => void) | null = null;
            sent: string[] = [];
            send(data: string): void {
                this.sent.push(data);
            }
            close(): void {}
        }
        vi.stubGlobal("WebSocket", FakeSocket as unknown as typeof WebSocket);

        const trackingRender = useCollabTrackingRenderStore();
        trackingRender.startRendering("control");

        expect(trackingRender.pythonConnectionState).toBe("connecting");

        trackingRender.stop();
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    test("startRendering('control') stays in \"mock\" pythonConnectionState in \"real\" mode when no WS URL is configured (safety net, ticket 03)", () => {
        vi.stubEnv("VITE_COLLAB_TRACKING_MODE", "real");

        const trackingRender = useCollabTrackingRenderStore();
        trackingRender.startRendering("control");

        expect(trackingRender.pythonConnectionState).toBe("mock");

        trackingRender.stop();
        vi.unstubAllEnvs();
    });

    test("real tracking wires RealTrackingSource's connection state and reference-marker detection into the store, sticky (marker-health-plan §1/§3)", () => {
        vi.stubEnv("VITE_COLLAB_TRACKING_WS_URL", "ws://table-host:8053");

        class FakeSocket {
            onopen: (() => void) | null = null;
            onmessage: ((event: { data: string }) => void) | null = null;
            onclose: (() => void) | null = null;
            onerror: ((event: unknown) => void) | null = null;
            sent: string[] = [];
            send(data: string): void {
                this.sent.push(data);
            }
            close(): void {}
        }
        const sockets: FakeSocket[] = [];
        vi.stubGlobal(
            "WebSocket",
            function FakeWebSocket() {
                const created = new FakeSocket();
                sockets.push(created);
                return created;
            } as unknown as typeof WebSocket
        );
        const socket = (): FakeSocket | undefined => sockets[sockets.length - 1];

        const scenarioStore = useCollabScenarioStore();
        scenarioStore.mapCalibration = {
            type: "map_calibration",
            points: [{ pixel_position: [0, 0], lat_lon_position: [53.5, 10] }],
            version: 2,
        };

        const trackingRender = useCollabTrackingRenderStore();
        trackingRender.startRendering("control");

        expect(trackingRender.pythonConnectionState).toBe("connecting");

        socket()?.onopen?.();
        expect(trackingRender.pythonConnectionState).toBe("connected");

        // Reference marker 72 arrives as an ordinary feature in the regular tracking feed — no
        // dedicated Python message, same feed real buildings ride on.
        socket()?.onmessage?.({
            data: JSON.stringify({
                type: "FeatureCollection",
                features: [{ type: "Feature", geometry: { type: "Point", coordinates: [10, 53.5] }, properties: { marker_id: 72, rotation: 0 } }],
            }),
        });

        expect(trackingRender.detectedReferenceMarkerIds.has(72)).toBe(true);
        expect(trackingRender.detectedReferenceMarkerIds.has(63)).toBe(false);

        // Sticky: 72 dropping out of a later snapshot must not un-detect it.
        socket()?.onmessage?.({
            data: JSON.stringify({ type: "FeatureCollection", features: [] }),
        });
        expect(trackingRender.detectedReferenceMarkerIds.has(72)).toBe(true);

        socket()?.onclose?.();
        expect(trackingRender.pythonConnectionState).toBe("reconnecting");

        // Only full store teardown (mount/unmount) actually disconnects the transport — this also
        // cancels the reconnect the onclose above scheduled.
        trackingRender.stop();
        expect(trackingRender.pythonConnectionState).toBe("mock");
        expect(trackingRender.detectedReferenceMarkerIds.size).toBe(0);

        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    test("startRendering('control') alone connects the Python transport automatically — no Start Tracking click needed (ticket 08)", () => {
        vi.stubEnv("VITE_COLLAB_TRACKING_WS_URL", "ws://table-host:8053");

        class FakeSocket {
            onopen: (() => void) | null = null;
            onmessage: ((event: { data: string }) => void) | null = null;
            onclose: (() => void) | null = null;
            onerror: ((event: unknown) => void) | null = null;
            send(): void {}
            close(): void {}
        }
        const sockets: FakeSocket[] = [];
        vi.stubGlobal(
            "WebSocket",
            function FakeWebSocket() {
                const created = new FakeSocket();
                sockets.push(created);
                return created;
            } as unknown as typeof WebSocket
        );

        const trackingRender = useCollabTrackingRenderStore();
        // No footprints, no AOI, no "Start Tracking" click — mounting Control alone must reach Connected.
        trackingRender.startRendering("control");

        expect(trackingRender.pythonConnectionState).toBe("connecting");
        expect(sockets).toHaveLength(1);
        sockets[0]?.onopen?.();
        expect(trackingRender.pythonConnectionState).toBe("connected");

        trackingRender.stop();
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    test("mapCalibrationMarkerHealth only tracks ids 200-203 from raw pre-calibration snapshots, sticky, holding the measured pixel position (ticket 08)", () => {
        vi.stubEnv("VITE_COLLAB_TRACKING_WS_URL", "ws://table-host:8053");

        class FakeSocket {
            onopen: (() => void) | null = null;
            onmessage: ((event: { data: string }) => void) | null = null;
            onclose: (() => void) | null = null;
            onerror: ((event: unknown) => void) | null = null;
            send(): void {}
            close(): void {}
        }
        const sockets: FakeSocket[] = [];
        vi.stubGlobal(
            "WebSocket",
            function FakeWebSocket() {
                const created = new FakeSocket();
                sockets.push(created);
                return created;
            } as unknown as typeof WebSocket
        );

        const trackingRender = useCollabTrackingRenderStore();
        trackingRender.startRendering("control");
        // Raw marker readings are only accepted while presenting (fix, 2026-09-01).
        useCollabSessionStore().calibration.phase = "presenting";
        sockets[0]?.onopen?.();

        // Two consistent snapshots (grilling doc Q4 stability gate) are required before a reading
        // is promoted — a lone sighting is deliberately not enough (see the dedicated stability
        // tests below).
        sockets[0]?.onmessage?.({
            data: JSON.stringify({ 200: [10, 20, 0, "000"], 999: [1, 2, 0, "000"] }),
        });
        sockets[0]?.onmessage?.({
            data: JSON.stringify({ 200: [10, 20, 0, "000"], 999: [1, 2, 0, "000"] }),
        });

        expect(trackingRender.mapCalibrationMarkerHealth.get(200)).toEqual({ pixelX: 10, pixelY: 20, rotation: 0, cameraOrTag: "000" });
        expect(trackingRender.mapCalibrationMarkerHealth.has(999)).toBe(false); // outside 200-203, never enters
        expect(trackingRender.mapCalibrationMarkerHealth.size).toBe(1);

        // Sticky: 200 dropping out of a later snapshot must not clear its held reading.
        sockets[0]?.onmessage?.({ data: JSON.stringify({}) });
        expect(trackingRender.mapCalibrationMarkerHealth.get(200)).toEqual({ pixelX: 10, pixelY: 20, rotation: 0, cameraOrTag: "000" });

        trackingRender.stop();
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    test("a single map-calibration marker reading is never enough to promote it — two consecutive, consistent snapshots are required within the TTL window (grilling doc Q4)", () => {
        vi.useFakeTimers();
        vi.stubEnv("VITE_COLLAB_TRACKING_WS_URL", "ws://table-host:8053");

        class FakeSocket {
            onopen: (() => void) | null = null;
            onmessage: ((event: { data: string }) => void) | null = null;
            onclose: (() => void) | null = null;
            onerror: ((event: unknown) => void) | null = null;
            send(): void {}
            close(): void {}
        }
        const sockets: FakeSocket[] = [];
        vi.stubGlobal(
            "WebSocket",
            function FakeWebSocket() {
                const created = new FakeSocket();
                sockets.push(created);
                return created;
            } as unknown as typeof WebSocket
        );

        const trackingRender = useCollabTrackingRenderStore();
        trackingRender.startRendering("control");
        // Raw marker readings are only accepted while presenting (fix, 2026-09-01).
        useCollabSessionStore().calibration.phase = "presenting";
        sockets[0]?.onopen?.();

        sockets[0]?.onmessage?.({ data: JSON.stringify({ 200: [10, 20, 0, "000"] }) });
        expect(trackingRender.mapCalibrationMarkerHealth.has(200)).toBe(false);

        // Arrives after the TTL — treated as a fresh first sighting, not a confirming second one.
        vi.advanceTimersByTime(800);
        sockets[0]?.onmessage?.({ data: JSON.stringify({ 200: [10, 20, 0, "000"] }) });
        expect(trackingRender.mapCalibrationMarkerHealth.has(200)).toBe(false);

        // Arrives promptly and consistently — this is the confirming second reading.
        sockets[0]?.onmessage?.({ data: JSON.stringify({ 200: [10, 20, 0, "000"] }) });
        expect(trackingRender.mapCalibrationMarkerHealth.has(200)).toBe(true);

        trackingRender.stop();
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    test("a stray/out-of-tolerance reading does not count toward promoting a later, consistent one (grilling doc Q4 — the 'wrong camera reading while the rig settles' failure mode)", () => {
        vi.stubEnv("VITE_COLLAB_TRACKING_WS_URL", "ws://table-host:8053");

        class FakeSocket {
            onopen: (() => void) | null = null;
            onmessage: ((event: { data: string }) => void) | null = null;
            onclose: (() => void) | null = null;
            onerror: ((event: unknown) => void) | null = null;
            send(): void {}
            close(): void {}
        }
        const sockets: FakeSocket[] = [];
        vi.stubGlobal(
            "WebSocket",
            function FakeWebSocket() {
                const created = new FakeSocket();
                sockets.push(created);
                return created;
            } as unknown as typeof WebSocket
        );

        const trackingRender = useCollabTrackingRenderStore();
        trackingRender.startRendering("control");
        // Raw marker readings are only accepted while presenting (fix, 2026-09-01).
        useCollabSessionStore().calibration.phase = "presenting";
        sockets[0]?.onopen?.();

        // One stray sighting far from the real position, then the real, consistent one.
        sockets[0]?.onmessage?.({ data: JSON.stringify({ 200: [500, 500, 0, "000"] }) });
        sockets[0]?.onmessage?.({ data: JSON.stringify({ 200: [10, 20, 0, "000"] }) });
        expect(trackingRender.mapCalibrationMarkerHealth.has(200)).toBe(false);

        sockets[0]?.onmessage?.({ data: JSON.stringify({ 200: [10, 20, 0, "000"] }) });
        expect(trackingRender.mapCalibrationMarkerHealth.has(200)).toBe(true);

        trackingRender.stop();
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    test("resetMarkerPositions() bumps session.calibration.resetPositionsToken (grilling doc Q2) so Table can react without touching Python or the sticky marker-health state", () => {
        const session = useCollabSessionStore();
        const trackingRender = useCollabTrackingRenderStore();
        expect(session.calibration.resetPositionsToken).toBe(0);

        trackingRender.resetMarkerPositions();
        expect(session.calibration.resetPositionsToken).toBe(1);

        trackingRender.resetMarkerPositions();
        expect(session.calibration.resetPositionsToken).toBe(2);
    });

    describe("calibrateFromDetectedMarkers / canCalibrateFromMarkers (ticket 12)", () => {
        const aoi: AOIExtent = {
            corners: [
                [9.98, 53.56], // top-left
                [10.0, 53.56], // top-right
                [10.0, 53.54], // bottom-right
                [9.98, 53.54], // bottom-left
            ],
        };

        class FakeSocket {
            onopen: (() => void) | null = null;
            onmessage: ((event: { data: string }) => void) | null = null;
            onclose: (() => void) | null = null;
            onerror: ((event: unknown) => void) | null = null;
            sent: string[] = [];
            send(data: string): void {
                this.sent.push(data);
            }
            close(): void {}
        }

        function stubRealSocket(): FakeSocket[] {
            const sockets: FakeSocket[] = [];
            vi.stubGlobal(
                "WebSocket",
                function FakeWebSocket() {
                    const created = new FakeSocket();
                    sockets.push(created);
                    return created;
                } as unknown as typeof WebSocket
            );
            return sockets;
        }

        /** Sends the same reading twice — the grilling doc Q4 stability gate requires two consecutive, consistent snapshots before a reading is promoted/confirmed. */
        function sendRawMarkerReading(socket: FakeSocket, markerId: number, pixelX: number, pixelY: number): void {
            const message = { data: JSON.stringify({ [markerId]: [pixelX, pixelY, 0, "000"] }) };
            socket.onmessage?.(message);
            socket.onmessage?.(message);
        }

        test("canCalibrateFromMarkers is false until all four ids (200-203) have a reading, true once they all do", () => {
            vi.stubEnv("VITE_COLLAB_TRACKING_WS_URL", "ws://table-host:8053");
            const sockets = stubRealSocket();

            // Raw marker readings are only accepted while presenting (fix, 2026-09-01) — see
            // `wireRealSource`'s onRawMarkerSnapshot gate.
            useCollabSessionStore().calibration.phase = "presenting";

            const trackingRender = useCollabTrackingRenderStore();
            trackingRender.startRendering("control");
            sockets[0]?.onopen?.();

            expect(trackingRender.canCalibrateFromMarkers()).toBe(false);
            sendRawMarkerReading(sockets[0]!, 200, 10, 20);
            sendRawMarkerReading(sockets[0]!, 201, 1590, 20);
            sendRawMarkerReading(sockets[0]!, 202, 10, 780);
            expect(trackingRender.canCalibrateFromMarkers()).toBe(false);
            sendRawMarkerReading(sockets[0]!, 203, 1590, 780);
            expect(trackingRender.canCalibrateFromMarkers()).toBe(true);

            trackingRender.stop();
            vi.unstubAllEnvs();
            vi.unstubAllGlobals();
        });

        test("sends map_calibration built from the real marker readings, then waits for Python's feed to switch before calling itself calibrated", () => {
            vi.stubEnv("VITE_COLLAB_TRACKING_WS_URL", "ws://table-host:8053");
            const sockets = stubRealSocket();

            const session = useCollabSessionStore();
            const scenarioStore = useCollabScenarioStore();
            scenarioStore.aoi = aoi;
            scenarioStore.calibrated = false;

            const trackingRender = useCollabTrackingRenderStore();
            trackingRender.startRendering("control");
            // Presentation is only ever entered explicitly now (fix, 2026-09-01) — the AOI watcher
            // above already ran (immediate: true) and reset `phase` back to "idle".
            trackingRender.startCalibration();
            sockets[0]?.onopen?.();

            sendRawMarkerReading(sockets[0]!, 200, 10, 20);
            sendRawMarkerReading(sockets[0]!, 201, 1590, 20);
            sendRawMarkerReading(sockets[0]!, 202, 10, 780);
            sendRawMarkerReading(sockets[0]!, 203, 1590, 780);

            trackingRender.calibrateFromDetectedMarkers();

            expect(sockets[0]?.sent).toHaveLength(1);
            expect(JSON.parse(sockets[0]!.sent[0]!)).toEqual({
                type: "map_calibration",
                points: [
                    // The inset positions the markers were actually projected at, not the AOI's
                    // raw corners (Vanilla's `MARKER_INSET_RATIO`).
                    { pixel_position: [10, 20], lat_lon_position: [53.558, 9.981] },
                    { pixel_position: [1590, 20], lat_lon_position: [53.558, 9.999] },
                    { pixel_position: [10, 780], lat_lon_position: [53.542, 9.981] },
                    { pixel_position: [1590, 780], lat_lon_position: [53.542, 9.999] },
                ],
                version: 2,
            });
            // Sending is not succeeding (grilling doc 2026-09-01 Q11): Python may still reject this
            // payload, and it would say so only on its own console. Still presenting, still
            // uncalibrated, nothing cached for a future reconnect resend.
            expect(scenarioStore.calibrated).toBe(false);
            expect(scenarioStore.lastMeasuredCalibration).toBeNull();
            expect(session.calibration.phase).toBe("presenting");

            // Python switching to the GeoJSON feed is the proof, since it only ever emits GeoJSON
            // while holding a homography.
            sendGeojson(sockets[0]!);

            expect(scenarioStore.calibrated).toBe(true);
            expect(scenarioStore.lastMeasuredCalibration).not.toBeNull();
            expect(session.calibration.phase).toBe("idle");

            trackingRender.stop();
            vi.unstubAllEnvs();
            vi.unstubAllGlobals();
        });

        test("goes unreachable, not calibrated, when Python never switches to the GeoJSON feed", () => {
            vi.useFakeTimers();
            vi.stubEnv("VITE_COLLAB_TRACKING_WS_URL", "ws://table-host:8053");
            const sockets = stubRealSocket();

            const session = useCollabSessionStore();
            const scenarioStore = useCollabScenarioStore();
            scenarioStore.aoi = aoi;

            const trackingRender = useCollabTrackingRenderStore();
            trackingRender.startRendering("control");
            trackingRender.startCalibration();
            sockets[0]?.onopen?.();

            sendRawMarkerReading(sockets[0]!, 200, 10, 20);
            sendRawMarkerReading(sockets[0]!, 201, 1590, 20);
            sendRawMarkerReading(sockets[0]!, 202, 10, 780);
            sendRawMarkerReading(sockets[0]!, 203, 1590, 780);
            trackingRender.calibrateFromDetectedMarkers();

            // Python rejected the payload (or died): no GeoJSON ever arrives.
            vi.advanceTimersByTime(3000);

            expect(scenarioStore.calibrated).toBe(false);
            // "unreachable", not "needs-calibration": pressing "Start calibration" again cannot fix
            // a Python that isn't answering, so the Table must not imply that it can.
            expect(session.calibration.phase).toBe("unreachable");
            // The rejected payload must never become the one a later reconnect resends.
            expect(scenarioStore.lastMeasuredCalibration).toBeNull();
            expect(toastAdd).toHaveBeenCalledWith({
                severity: "error",
                summary: "Python didn't confirm the calibration — check that the tracking server is running, then try again",
            });

            trackingRender.stop();
            vi.useRealTimers();
            vi.unstubAllEnvs();
            vi.unstubAllGlobals();
        });

        test("does nothing (besides reporting a developer error) when called with no AOI confirmed, an incomplete marker set, or no real transport connected", () => {
            const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

            // No real transport at all (mock mode) — canCalibrateFromMarkers is false and calling
            // the action anyway must not throw or silently claim success.
            const session = useCollabSessionStore();
            session.calibration.phase = "presenting";
            const scenarioStore = useCollabScenarioStore();
            scenarioStore.aoi = null;
            const trackingRender = useCollabTrackingRenderStore();

            trackingRender.calibrateFromDetectedMarkers();
            expect(scenarioStore.calibrated).toBe(false);
            expect(session.calibration.phase).toBe("presenting");
            expect(consoleError).toHaveBeenCalled();

            consoleError.mockRestore();
        });
    });

    describe("reconnect and recalibration policy (ticket 14)", () => {
        const aoi: AOIExtent = {
            corners: [
                [9.98, 53.56], // top-left
                [10.0, 53.56], // top-right
                [10.0, 53.54], // bottom-right
                [9.98, 53.54], // bottom-left
            ],
        };

        class FakeSocket {
            onopen: (() => void) | null = null;
            onmessage: ((event: { data: string }) => void) | null = null;
            onclose: (() => void) | null = null;
            onerror: ((event: unknown) => void) | null = null;
            sent: string[] = [];
            send(data: string): void {
                this.sent.push(data);
            }
            close(): void {}
        }

        function stubRealSocket(): FakeSocket[] {
            const sockets: FakeSocket[] = [];
            vi.stubGlobal(
                "WebSocket",
                function FakeWebSocket() {
                    const created = new FakeSocket();
                    sockets.push(created);
                    return created;
                } as unknown as typeof WebSocket
            );
            return sockets;
        }

        /** Sends the same reading twice — the grilling doc Q4 stability gate requires two consecutive, consistent snapshots before a reading is promoted/confirmed. */
        function sendRawMarkerReading(socket: FakeSocket, markerId: number, pixelX: number, pixelY: number): void {
            const message = { data: JSON.stringify({ [markerId]: [pixelX, pixelY, 0, "000"] }) };
            socket.onmessage?.(message);
            socket.onmessage?.(message);
        }

        /**
         * Drives a real four-marker calibration to completion so `lastMeasuredCalibration` gets
         * cached, exactly as it happens for real (ticket 12).
         *
         * The trailing `sendGeojson` is the confirmation step, not scaffolding (grilling doc
         * 2026-09-01 Q11): `calibrateFromDetectedMarkers` only sends the payload, and the
         * calibration completes when Python proves it took by switching to the GeoJSON feed.
         */
        function calibrateOnce(socket: FakeSocket): void {
            sendRawMarkerReading(socket, 200, 10, 20);
            sendRawMarkerReading(socket, 201, 1590, 20);
            sendRawMarkerReading(socket, 202, 10, 780);
            sendRawMarkerReading(socket, 203, 1590, 780);
            useCollabTrackingRenderStore().calibrateFromDetectedMarkers();
            sendGeojson(socket);
        }

        /** Connects, calibrates, then drops the connection so a reconnect can be exercised — returns the sockets array (index 0 = pre-drop, 1+ = reconnect attempts). */
        function connectAndCalibrate(): FakeSocket[] {
            vi.stubEnv("VITE_COLLAB_TRACKING_WS_URL", "ws://table-host:8053");
            const sockets = stubRealSocket();

            const session = useCollabSessionStore();
            session.base.objects = [{ id: "G01", properties: { marker_id: 1 } }];
            const scenarioStore = useCollabScenarioStore();
            scenarioStore.aoi = aoi;

            const trackingRender = useCollabTrackingRenderStore();
            trackingRender.startRendering("control");
            // Presentation is only ever entered explicitly now (fix, 2026-09-01) — the AOI watcher
            // above already ran (immediate: true) and reset `phase` back to "idle".
            trackingRender.startCalibration();
            sockets[0]?.onopen?.();
            calibrateOnce(sockets[0]!);
            expect(scenarioStore.calibrated).toBe(true);
            expect(scenarioStore.lastMeasuredCalibration).not.toBeNull();

            sockets[0]?.onclose?.();
            expect(trackingRender.pythonConnectionState).toBe("reconnecting");
            return sockets;
        }

        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            useCollabTrackingRenderStore().stop();
            vi.useRealTimers();
            vi.unstubAllEnvs();
            vi.unstubAllGlobals();
        });

        test("resends the last valid measured calibration automatically once the transport reconnects", () => {
            const sockets = connectAndCalibrate();
            const cached = useCollabScenarioStore().lastMeasuredCalibration;

            vi.advanceTimersByTime(1000); // default reconnect backoff
            expect(sockets).toHaveLength(2);
            sockets[1]?.onopen?.();

            expect(sockets[1]?.sent).toHaveLength(1);
            expect(JSON.parse(sockets[1]!.sent[0]!)).toEqual(cached);
        });

        test("blacks the Table out, rather than auto-presenting markers, when GeoJSON does not resume within the window", () => {
            const session = useCollabSessionStore();
            const scenarioStore = useCollabScenarioStore();
            const sockets = connectAndCalibrate();

            vi.advanceTimersByTime(1000);
            sockets[1]?.onopen?.();
            expect(sockets[1]?.sent).toHaveLength(1); // resend went out

            // No GeoJSON ever arrives on the new connection — the resume window elapses.
            vi.advanceTimersByTime(8000);

            // Blacked out and waiting for the operator, not presenting markers (grilling doc
            // 2026-09-01 Q16). A reconnect lands whenever it lands; auto-presenting here would start
            // projecting markers and accepting readings against them at a moment nobody chose —
            // the same mistake `941ff5e` removed from the AOI watcher.
            expect(session.calibration.phase).toBe("needs-calibration");
            expect(scenarioStore.calibrated).toBe(false);
            expect(toastAdd).toHaveBeenCalledWith({
                severity: "warning",
                summary: "Calibration didn't resume after reconnecting — recalibrate using the four markers",
            });
        });

        test("GeoJSON resuming within the window cancels the fallback and keeps calibrated_tracking", () => {
            const session = useCollabSessionStore();
            const scenarioStore = useCollabScenarioStore();
            const sockets = connectAndCalibrate();

            vi.advanceTimersByTime(1000);
            sockets[1]?.onopen?.();
            toastAdd.mockClear();

            sendGeojson(sockets[1]!);
            // Would have triggered the fallback had the resend not been confirmed.
            vi.advanceTimersByTime(8000);

            expect(session.calibration.phase).toBe("idle");
            expect(scenarioStore.calibrated).toBe(true);
            expect(toastAdd).not.toHaveBeenCalled();
        });

        test("does not auto-resend while the operator is already mid-way through a fresh calibration", () => {
            const session = useCollabSessionStore();
            const sockets = connectAndCalibrate();
            // Operator re-entered detection mode themselves before the reconnect completed.
            session.calibration.phase = "presenting";

            vi.advanceTimersByTime(1000);
            sockets[1]?.onopen?.();

            expect(sockets[1]?.sent).toHaveLength(0);
        });

        test("recalibrate() clears the cached payload and calibrated status and returns to detection mode", () => {
            const session = useCollabSessionStore();
            const scenarioStore = useCollabScenarioStore();
            scenarioStore.aoi = aoi;
            scenarioStore.calibrated = true;
            scenarioStore.lastMeasuredCalibration = { type: "map_calibration", points: [], version: 2 };
            session.calibration.phase = "idle";

            useCollabTrackingRenderStore().recalibrate();

            expect(scenarioStore.calibrated).toBe(false);
            expect(scenarioStore.lastMeasuredCalibration).toBeNull();
            expect(session.calibration.phase).toBe("presenting");
        });

        test("confirming a new AOI clears Python's homography and blacks the Table out until Python drops off the GeoJSON feed", async () => {
            vi.stubEnv("VITE_COLLAB_TRACKING_WS_URL", "ws://table-host:8053");
            const sockets = stubRealSocket();

            const session = useCollabSessionStore();
            const scenarioStore = useCollabScenarioStore();
            session.base.objects = [{ id: "G01", properties: { marker_id: 1 } }];
            scenarioStore.aoi = aoi;

            const trackingRender = useCollabTrackingRenderStore();
            trackingRender.startRendering("control");
            trackingRender.startCalibration();
            sockets[0]?.onopen?.();
            calibrateOnce(sockets[0]!);
            expect(scenarioStore.calibrated).toBe(true);
            const sentBeforeAoiChange = sockets[0]!.sent.length;

            // The operator picks a different area. Python is still holding the *previous* AOI's
            // homography at this instant and would keep emitting buildings positioned against an
            // extent that no longer exists, so it has to be told (grilling doc Q5).
            scenarioStore.aoi = {
                corners: [
                    [9.9, 53.5],
                    [9.92, 53.5],
                    [9.92, 53.48],
                    [9.9, 53.48],
                ],
            };
            await nextTick();

            expect(JSON.parse(sockets[0]!.sent[sentBeforeAoiChange]!)).toEqual({ type: "clear_calibration" });
            expect(scenarioStore.calibrated).toBe(false);
            expect(session.calibration.phase).toBe("needs-calibration");

            // Python proves the clear took by reverting to raw marker dictionaries — it only emits
            // those while it holds no homography (grilling doc Q13). Empty is proof too: it
            // publishes every 200 ms regardless of what it saw.
            sockets[0]?.onmessage?.({ data: JSON.stringify({}) });
            vi.advanceTimersByTime(3000);

            // Still the blackout, never "unreachable": Python answered.
            expect(session.calibration.phase).toBe("needs-calibration");

            trackingRender.stop();
            vi.unstubAllEnvs();
            vi.unstubAllGlobals();
        });

        test("goes unreachable when Python never confirms that the previous calibration was cleared", async () => {
            vi.stubEnv("VITE_COLLAB_TRACKING_WS_URL", "ws://table-host:8053");
            const sockets = stubRealSocket();

            const session = useCollabSessionStore();
            const scenarioStore = useCollabScenarioStore();
            session.base.objects = [{ id: "G01", properties: { marker_id: 1 } }];
            scenarioStore.aoi = aoi;

            const trackingRender = useCollabTrackingRenderStore();
            trackingRender.startRendering("control");
            trackingRender.startCalibration();
            sockets[0]?.onopen?.();
            calibrateOnce(sockets[0]!);

            scenarioStore.aoi = {
                corners: [
                    [9.9, 53.5],
                    [9.92, 53.5],
                    [9.92, 53.48],
                    [9.9, 53.48],
                ],
            };
            await nextTick();

            // Nothing comes back at all — Python took the message and went silent, which means it
            // may still be holding the old homography.
            vi.advanceTimersByTime(3000);

            expect(session.calibration.phase).toBe("unreachable");
            expect(toastAdd).toHaveBeenCalledWith({
                severity: "error",
                summary: "Python didn't confirm that the previous calibration was cleared — check that the tracking server is running",
            });

            trackingRender.stop();
            vi.unstubAllEnvs();
            vi.unstubAllGlobals();
        });
    });

    test("surfaces a visible toast when auto-reconnect gives up (ticket 08) — not console-only", () => {
        vi.stubEnv("VITE_COLLAB_TRACKING_WS_URL", "ws://table-host:8053");
        vi.useFakeTimers();

        class FakeSocket {
            onopen: (() => void) | null = null;
            onmessage: ((event: { data: string }) => void) | null = null;
            onclose: (() => void) | null = null;
            onerror: ((event: unknown) => void) | null = null;
            send(): void {}
            close(): void {}
        }
        const sockets: FakeSocket[] = [];
        vi.stubGlobal(
            "WebSocket",
            function FakeWebSocket() {
                const created = new FakeSocket();
                sockets.push(created);
                return created;
            } as unknown as typeof WebSocket
        );

        const trackingRender = useCollabTrackingRenderStore();
        trackingRender.startRendering("control");

        // Exhaust every reconnect attempt (default reconnectMaxAttempts) so RealTrackingSource gives up.
        for (let i = 0; i < 6; i++) {
            sockets[sockets.length - 1]?.onerror?.(new Event("error"));
            vi.advanceTimersByTime(60_000);
        }

        expect(trackingRender.pythonConnectionState).toBe("disconnected");
        expect(toastAdd).toHaveBeenCalledWith({
            severity: "error",
            summary: "Lost connection to the Python tracking server — click Retry to try again",
        });

        trackingRender.stop();
        vi.useRealTimers();
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    test("retryPythonConnection() manually reconnects after give-up", () => {
        vi.stubEnv("VITE_COLLAB_TRACKING_WS_URL", "ws://table-host:8053");
        vi.useFakeTimers();

        class FakeSocket {
            onopen: (() => void) | null = null;
            onmessage: ((event: { data: string }) => void) | null = null;
            onclose: (() => void) | null = null;
            onerror: ((event: unknown) => void) | null = null;
            send(): void {}
            close(): void {}
        }
        const sockets: FakeSocket[] = [];
        vi.stubGlobal(
            "WebSocket",
            function FakeWebSocket() {
                const created = new FakeSocket();
                sockets.push(created);
                return created;
            } as unknown as typeof WebSocket
        );

        const trackingRender = useCollabTrackingRenderStore();
        trackingRender.startRendering("control");
        for (let i = 0; i < 6; i++) {
            sockets[sockets.length - 1]?.onerror?.(new Event("error"));
            vi.advanceTimersByTime(60_000);
        }
        expect(trackingRender.pythonConnectionState).toBe("disconnected");

        trackingRender.retryPythonConnection();
        expect(trackingRender.pythonConnectionState).toBe("connecting");
        sockets[sockets.length - 1]?.onopen?.();
        expect(trackingRender.pythonConnectionState).toBe("connected");

        trackingRender.stop();
        vi.useRealTimers();
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });
});

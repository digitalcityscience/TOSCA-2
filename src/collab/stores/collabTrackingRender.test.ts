import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test, vi } from "vitest";

const toastAdd = vi.hoisted(() => vi.fn());

vi.mock("@helpers/toast", () => ({
    useToast: () => ({ add: toastAdd }),
}));

import type { CollabSceneObject, CollabTrackingObjectState } from "./collabSession";
import { DEFAULT_COLLAB_LAYER_POLICY, useCollabSessionStore } from "./collabSession";
import { useCollabScenarioStore } from "./collabScenario";
import type { AOIExtent } from "./collabCalibration";
import { tableToAoiRotationOffsetDeg } from "./collabCalibration";
import type { TrackingEvent } from "./collabTracking";
import {
    applyTrackingEvent,
    buildDemoMockTimeline,
    buildMarkerRegistryFromBase,
    useCollabTrackingRenderStore,
} from "./collabTrackingRender";

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

describe("buildDemoMockTimeline", () => {
    test("appears at the anchor, moves, rotates 45°, then disappears", () => {
        const timeline = buildDemoMockTimeline(7, [10, 53.5]);

        expect(timeline).toHaveLength(4);
        expect(timeline[0].features).toEqual([{ markerId: 7, lng: 10, lat: 53.5, rotation: 0 }]);
        expect(timeline[3].features).toEqual([]);

        const moved = timeline[1].features[0];
        expect(moved.lng).not.toBe(10);
        expect(moved.rotation).toBe(0);

        const rotated = timeline[2].features[0];
        expect(rotated.rotation).toBe(45);
        expect(rotated.lng).toBe(moved.lng);
        expect(rotated.lat).toBe(moved.lat);
    });
});

describe("collabSession layer policy", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    test("defaults match the plan §13 M1 matrix: Control sees everything, Table sees footprints + trackedId", () => {
        const session = useCollabSessionStore();
        expect(session.layerPolicy).toEqual(DEFAULT_COLLAB_LAYER_POLICY);
    });

    test("isLayerVisible reads control/table independently", () => {
        const session = useCollabSessionStore();
        expect(session.isLayerVisible("trackedBbox", "control")).toBe(true);
        expect(session.isLayerVisible("trackedBbox", "table")).toBe(false);
        expect(session.isLayerVisible("trackedFootprint", "table")).toBe(true);
    });
});

describe("collabTrackingRender store", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        toastAdd.mockClear();
    });

    test("startMockTracking replays a timeline into session.tracking; stopMockTracking halts it", () => {
        vi.useFakeTimers();
        vi.setSystemTime(0);

        const session = useCollabSessionStore();
        session.base.objects = [
            {
                id: "G01",
                geometry: {
                    type: "Polygon",
                    coordinates: [
                        [
                            [9.999, 53.549],
                            [10.001, 53.549],
                            [10.001, 53.551],
                            [9.999, 53.551],
                            [9.999, 53.549],
                        ],
                    ],
                },
                properties: { marker_id: 1 },
            },
        ];

        const trackingRender = useCollabTrackingRenderStore();
        trackingRender.startMockTracking([{ atMs: 0, features: [{ markerId: 1, lng: 10, lat: 53.55, rotation: 0 }] }]);

        expect(trackingRender.active).toBe(true);

        vi.advanceTimersByTime(200);

        expect(session.tracking.G01).toEqual({ pose: { lng: 10, lat: 53.55, rotation: 0 }, confidence: 1, lastSeen: 200 });

        trackingRender.stopMockTracking();
        expect(trackingRender.active).toBe(false);

        delete session.tracking.G01;
        vi.advanceTimersByTime(400);
        expect(session.tracking.G01).toBeUndefined();

        vi.useRealTimers();
    });

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

    test("startMockTracking() forces MockTrackingSource when VITE_COLLAB_TRACKING_MODE is \"mock\", even with a WS URL and AOI calibration configured (ticket 03)", () => {
        vi.stubEnv("VITE_COLLAB_TRACKING_MODE", "mock");
        vi.stubEnv("VITE_COLLAB_TRACKING_WS_URL", "ws://table-host:8053");
        vi.useFakeTimers();
        vi.setSystemTime(0);

        const scenarioStore = useCollabScenarioStore();
        scenarioStore.mapCalibration = {
            type: "map_calibration",
            points: [{ pixel_position: [0, 0], lat_lon_position: [53.5, 10] }],
        };

        const trackingRender = useCollabTrackingRenderStore();
        trackingRender.startMockTracking();

        expect(trackingRender.active).toBe(true);
        expect(trackingRender.pythonConnectionState).toBe("mock");

        trackingRender.stopMockTracking();
        vi.useRealTimers();
        vi.unstubAllEnvs();
    });

    test("startMockTracking() uses RealTrackingSource when VITE_COLLAB_TRACKING_MODE is \"real\" and a WS URL + AOI calibration are configured (ticket 03)", () => {
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

        const scenarioStore = useCollabScenarioStore();
        scenarioStore.mapCalibration = {
            type: "map_calibration",
            points: [{ pixel_position: [0, 0], lat_lon_position: [53.5, 10] }],
        };

        const trackingRender = useCollabTrackingRenderStore();
        trackingRender.startMockTracking();

        expect(trackingRender.active).toBe(true);
        expect(trackingRender.pythonConnectionState).toBe("connecting");

        trackingRender.stopMockTracking();
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    test("startMockTracking() falls back to MockTrackingSource in \"real\" mode when no WS URL is configured (safety net, ticket 03)", () => {
        vi.stubEnv("VITE_COLLAB_TRACKING_MODE", "real");
        vi.useFakeTimers();
        vi.setSystemTime(0);

        const trackingRender = useCollabTrackingRenderStore();
        trackingRender.startMockTracking();

        expect(trackingRender.active).toBe(true);
        expect(trackingRender.pythonConnectionState).toBe("mock");

        trackingRender.stopMockTracking();
        vi.useRealTimers();
        vi.unstubAllEnvs();
    });

    test("startMockTracking(timeline) always uses the mock, even with a table host configured — an explicit timeline is a dev/demo override", () => {
        vi.stubEnv("VITE_COLLAB_TRACKING_WS_URL", "ws://table-host:8053");
        vi.useFakeTimers();
        vi.setSystemTime(0);

        const trackingRender = useCollabTrackingRenderStore();
        trackingRender.startMockTracking([{ atMs: 0, features: [{ markerId: 1, lng: 10, lat: 53.55, rotation: 0 }] }]);

        expect(trackingRender.active).toBe(true);
        trackingRender.stopMockTracking();

        vi.useRealTimers();
        vi.unstubAllEnvs();
    });

    test("startMockTracking() connects and becomes active in real mode even with no AOI calibration selected at all — the old early-return-with-no-visible-effect path is gone (ticket 08)", () => {
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

        const scenarioStore = useCollabScenarioStore();
        expect(scenarioStore.mapCalibration).toBeNull(); // deliberately no AOI selected

        const trackingRender = useCollabTrackingRenderStore();
        trackingRender.startMockTracking();

        expect(trackingRender.active).toBe(true);
        expect(trackingRender.pythonConnectionState).toBe("connecting");

        trackingRender.stop();
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    test("startMockTracking() swaps to RealTrackingSource (ticket 09) when a table host + AOI calibration are configured — the operator/UI call unchanged", () => {
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

        const scenarioStore = useCollabScenarioStore();
        scenarioStore.mapCalibration = {
            type: "map_calibration",
            points: [{ pixel_position: [0, 0], lat_lon_position: [53.5, 10] }],
        };

        const trackingRender = useCollabTrackingRenderStore();
        trackingRender.startMockTracking();

        expect(trackingRender.active).toBe(true);
        trackingRender.stopMockTracking();
        expect(trackingRender.active).toBe(false);

        trackingRender.stop();
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    test("mock tracking reports pythonConnectionState 'mock' and no detected reference markers (marker-health-plan §1)", () => {
        vi.useFakeTimers();
        vi.setSystemTime(0);

        const trackingRender = useCollabTrackingRenderStore();
        trackingRender.startMockTracking([{ atMs: 0, features: [] }]);

        expect(trackingRender.pythonConnectionState).toBe("mock");
        expect(trackingRender.detectedReferenceMarkerIds.size).toBe(0);

        trackingRender.stopMockTracking();
        vi.useRealTimers();
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
        };

        const trackingRender = useCollabTrackingRenderStore();
        trackingRender.startMockTracking();

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

        // Stopping the tracking-display toggle (ticket 08) must not disconnect an otherwise-live
        // transport — connection state and sticky detection both persist across it.
        trackingRender.stopMockTracking();
        expect(trackingRender.active).toBe(false);
        expect(trackingRender.pythonConnectionState).toBe("reconnecting");
        expect(trackingRender.detectedReferenceMarkerIds.has(72)).toBe(true);

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
        // Connected never implies calibrated/active — the operator never clicked Start Tracking.
        expect(trackingRender.active).toBe(false);

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
        sockets[0]?.onopen?.();

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

        function sendRawMarkerReading(socket: FakeSocket, markerId: number, pixelX: number, pixelY: number): void {
            socket.onmessage?.({ data: JSON.stringify({ [markerId]: [pixelX, pixelY, 0, "000"] }) });
        }

        test("canCalibrateFromMarkers is false until all four ids (200-203) have a reading, true once they all do", () => {
            vi.stubEnv("VITE_COLLAB_TRACKING_WS_URL", "ws://table-host:8053");
            const sockets = stubRealSocket();

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

        test("sends map_calibration built from the real marker readings, marks the AOI calibrated, and exits presentation", () => {
            vi.stubEnv("VITE_COLLAB_TRACKING_WS_URL", "ws://table-host:8053");
            const sockets = stubRealSocket();

            const session = useCollabSessionStore();
            session.calibration.phase = "presenting";
            const scenarioStore = useCollabScenarioStore();
            scenarioStore.aoi = aoi;
            scenarioStore.calibrated = false;

            const trackingRender = useCollabTrackingRenderStore();
            trackingRender.startRendering("control");
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
                    { pixel_position: [10, 20], lat_lon_position: [53.56, 9.98] },
                    { pixel_position: [1590, 20], lat_lon_position: [53.56, 10.0] },
                    { pixel_position: [10, 780], lat_lon_position: [53.54, 9.98] },
                    { pixel_position: [1590, 780], lat_lon_position: [53.54, 10.0] },
                ],
            });
            expect(scenarioStore.calibrated).toBe(true);
            expect(session.calibration.phase).toBe("idle");

            trackingRender.stop();
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

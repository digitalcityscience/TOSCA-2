import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@helpers/toast", () => ({
    useToast: () => ({ add: vi.fn() }),
}));

/**
 * Fake `maplibregl.Marker`: records every instance created (keyed by its element's `alt`, which
 * `buildCalibrationMarkerElement` sets to the marker id) so tests can assert on position/removal
 * without depending on the real MapLibre Marker's DOM/map-projection internals, which a plain fake
 * map object cannot support.
 */
const { createdMarkers } = vi.hoisted(() => ({
    createdMarkers: new Map<string, { element: HTMLElement; lngLat?: [number, number]; removed: boolean }>(),
}));

vi.mock("maplibre-gl", () => {
    class FakeMarker {
        private readonly record: { element: HTMLElement; lngLat?: [number, number]; removed: boolean };

        constructor(options: { element: HTMLElement }) {
            this.record = { element: options.element, removed: false };
            createdMarkers.set(options.element.getAttribute("alt") ?? "", this.record);
        }

        setLngLat(lngLat: [number, number]): this {
            this.record.lngLat = lngLat;
            return this;
        }

        addTo(): this {
            return this;
        }

        remove(): this {
            this.record.removed = true;
            return this;
        }
    }
    return { default: { Marker: FakeMarker } };
});

const { addMapDataSource, addMapLayer, addCompanionLayer, fakeSources, fakeLayerVisibility, styleLayers } = vi.hoisted(() => {
    const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
    const visibility = new Map<string, string>();
    return {
        fakeSources: sources,
        fakeLayerVisibility: visibility,
        styleLayers: [{ id: "osm-basemap", type: "raster" }],
        addMapDataSource: vi.fn(async ({ identifier }: { identifier: string }) => {
            await Promise.resolve();
            sources.set(identifier, { setData: vi.fn() });
        }),
        addMapLayer: vi.fn(async ({ identifier }: { identifier: string }) => {
            await Promise.resolve();
            visibility.set(identifier, "visible");
        }),
        addCompanionLayer: vi.fn(),
    };
});

vi.mock("@store/map", () => ({
    useMapStore: () => ({
        map: {
            getSource: (id: string) => fakeSources.get(id),
            getLayer: (id: string) => (fakeLayerVisibility.has(id) || styleLayers.some((layer) => layer.id === id) ? {} : undefined),
            getLayoutProperty: (id: string) => fakeLayerVisibility.get(id),
            setLayoutProperty: (id: string, _property: string, value: string) => {
                fakeLayerVisibility.set(id, value);
            },
            getStyle: () => ({ layers: styleLayers }),
            isStyleLoaded: () => true,
            on: () => {},
            off: () => {},
        },
        addMapDataSource,
        addMapLayer,
        addCompanionLayer,
    }),
}));

import { useCollabSessionStore } from "./collabSession";
import { useCollabTrackingRenderStore } from "./collabTrackingRender";

const hamburgAoi = {
    corners: [
        [9.98, 53.56],
        [10.0, 53.56],
        [10.0, 53.54],
        [9.98, 53.54],
    ] as [[number, number], [number, number], [number, number], [number, number]],
};

async function flush(): Promise<void> {
    for (let i = 0; i < 20; i++) {
        await Promise.resolve();
    }
}

describe("calibration presentation mode on Table (ticket 11)", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        fakeSources.clear();
        fakeLayerVisibility.clear();
        createdMarkers.clear();
        addMapDataSource.mockClear();
        addMapLayer.mockClear();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    test("entering presentation mode renders exactly the 4 calibration markers at the AOI corners, using the Vanilla 200/201/202/203 corner mapping", async () => {
        vi.stubEnv("VITE_COLLAB_CALIBRATION_MARKER_SIZE_PX", "100");

        const session = useCollabSessionStore();
        session.calibration.aoi = hamburgAoi;
        const trackingRender = useCollabTrackingRenderStore();
        trackingRender.startRendering("table");
        await flush();

        trackingRender.enterCalibrationPresentation();
        await flush();

        expect(session.calibration.phase).toBe("presenting");
        expect([...createdMarkers.keys()].sort()).toEqual(["200", "201", "202", "203"]);
        expect(createdMarkers.get("200")?.lngLat).toEqual([9.98, 53.56]); // top-left
        expect(createdMarkers.get("201")?.lngLat).toEqual([10.0, 53.56]); // top-right
        expect(createdMarkers.get("202")?.lngLat).toEqual([9.98, 53.54]); // bottom-left
        expect(createdMarkers.get("203")?.lngLat).toEqual([10.0, 53.54]); // bottom-right
        expect(createdMarkers.get("200")?.element.style.width).toBe("100px");

        trackingRender.stop();
    });

    test("entering presentation mode hides the basemap and every Collab overlay layer already on Table", async () => {
        const session = useCollabSessionStore();
        session.base.objects = [
            { id: "B-1", geometry: { type: "Polygon", coordinates: [[[9.99, 53.55], [9.991, 53.55], [9.991, 53.551], [9.99, 53.551], [9.99, 53.55]]] }, properties: {} },
        ];
        session.calibration.aoi = hamburgAoi;
        const trackingRender = useCollabTrackingRenderStore();
        trackingRender.startRendering("table");
        await flush();

        // Sanity: the tracked-footprint layer and basemap are visible before presentation mode.
        expect(fakeLayerVisibility.get("collabTrackedFootprints-fill")).toBe("visible");
        expect(fakeLayerVisibility.get("osm-basemap")).toBeUndefined(); // unset == visible

        trackingRender.enterCalibrationPresentation();
        await flush();

        expect(fakeLayerVisibility.get("collabTrackedFootprints-fill")).toBe("none");
        expect(fakeLayerVisibility.get("osm-basemap")).toBe("none");

        trackingRender.stop();
    });

    test("exiting presentation mode removes the markers and restores exactly the layers it hid", async () => {
        const session = useCollabSessionStore();
        session.base.objects = [
            { id: "B-1", geometry: { type: "Polygon", coordinates: [[[9.99, 53.55], [9.991, 53.55], [9.991, 53.551], [9.99, 53.551], [9.99, 53.55]]] }, properties: {} },
        ];
        session.calibration.aoi = hamburgAoi;
        const trackingRender = useCollabTrackingRenderStore();
        trackingRender.startRendering("table");
        await flush();

        trackingRender.enterCalibrationPresentation();
        await flush();
        expect(fakeLayerVisibility.get("collabTrackedFootprints-fill")).toBe("none");

        trackingRender.exitCalibrationPresentation();
        await flush();

        expect(session.calibration.phase).toBe("idle");
        expect(fakeLayerVisibility.get("collabTrackedFootprints-fill")).toBe("visible");
        expect(fakeLayerVisibility.get("osm-basemap")).toBe("visible");
        expect(createdMarkers.get("200")?.removed).toBe(true);
        expect(createdMarkers.get("203")?.removed).toBe(true);

        trackingRender.stop();
    });

    test("presentation mode bumps session.calibration.revision on entry and exit", () => {
        const session = useCollabSessionStore();
        const trackingRender = useCollabTrackingRenderStore();
        const before = session.calibration.revision;

        trackingRender.enterCalibrationPresentation();
        expect(session.calibration.revision).toBe(before + 1);

        trackingRender.exitCalibrationPresentation();
        expect(session.calibration.revision).toBe(before + 2);
    });

    test("Control's own rendering never enters presentation mode — Control keeps its basemap for operator context", async () => {
        const session = useCollabSessionStore();
        session.calibration.aoi = hamburgAoi;
        session.calibration.phase = "presenting";
        const trackingRender = useCollabTrackingRenderStore();

        trackingRender.startRendering("control");
        await flush();

        expect(createdMarkers.size).toBe(0);
        expect(fakeLayerVisibility.get("osm-basemap")).toBeUndefined();

        trackingRender.stop();
    });

    test("Table opens no WebSocket to Python — only Control's transport does (ticket 11)", async () => {
        const OriginalWebSocket = globalThis.WebSocket;
        const socketConstructions = vi.fn();
        class SpyWebSocket {
            constructor(url: string) {
                socketConstructions(url);
            }
            onopen: (() => void) | null = null;
            onmessage: ((event: { data: string }) => void) | null = null;
            onclose: (() => void) | null = null;
            onerror: ((event: unknown) => void) | null = null;
            send(): void {}
            close(): void {}
        }
        vi.stubGlobal("WebSocket", SpyWebSocket as unknown as typeof WebSocket);
        vi.stubEnv("VITE_COLLAB_TRACKING_WS_URL", "ws://table-host:8053");

        const session = useCollabSessionStore();
        session.calibration.aoi = hamburgAoi;
        const trackingRender = useCollabTrackingRenderStore();
        trackingRender.startRendering("table");
        trackingRender.enterCalibrationPresentation();
        await flush();

        expect(socketConstructions).not.toHaveBeenCalled();

        trackingRender.stop();
        vi.stubGlobal("WebSocket", OriginalWebSocket);
    });
});

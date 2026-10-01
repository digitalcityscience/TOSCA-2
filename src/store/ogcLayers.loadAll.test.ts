import { createPinia, setActivePinia } from "pinia";
import { reactive } from "vue";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { LayerObjectWithAttributes } from "./map";

const loaderMock = vi.hoisted(() => ({ loadAllOgcFeatures: vi.fn() }));
vi.mock("@helpers/ogcFeatureLoader", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@helpers/ogcFeatureLoader")>()),
    loadAllOgcFeatures: loaderMock.loadAllOgcFeatures,
}));

const fakeMap = vi.hoisted(() => ({ store: undefined as unknown }));
vi.mock("./map", () => ({ useMapStore: () => fakeMap.store }));

const { useOgcLayersStore } = await import("./ogcLayers");

function createFakeMapStore() {
    const layersOnMap = reactive<LayerObjectWithAttributes[]>([
        { id: "other", source: "other", sourceType: "geojson", type: "fill" },
        {
            id: "parcels",
            source: "parcels",
            sourceType: "geojson",
            type: "fill",
            displayName: "Flurstück",
            externalSource: { type: "ogc-api", sourceTitle: "OGC", bbox: [9, 53, 10, 54] },
        },
    ]);
    const store = {
        layersOnMap,
        map: { getSource: vi.fn(() => ({})), off: vi.fn(), on: vi.fn() },
        deleteMapLayer: vi.fn(async (id: string) => {
            layersOnMap.splice(layersOnMap.findIndex((layer) => layer.id === id), 1);
        }),
        deleteMapDataSource: vi.fn(),
        addDeckGeoJsonLayer: vi.fn((params: { identifier: string, index?: number, displayName?: string }) => {
            const record: LayerObjectWithAttributes = {
                id: params.identifier,
                source: params.identifier,
                sourceType: "deckgl",
                type: "deckgl-geojson",
                renderer: "deckgl",
                displayName: params.displayName,
            };
            layersOnMap.splice(params.index ?? layersOnMap.length, 0, record);
            return record;
        }),
        appendDeckGeoJsonChunk: vi.fn(),
        requestLayerPanelExpansion: vi.fn(),
        clearDeckGeoJsonChunks: vi.fn(),
    };
    return store;
}

describe("OGC load all (deck.gl)", () => {
    let map: ReturnType<typeof createFakeMapStore>;

    beforeEach(() => {
        setActivePinia(createPinia());
        map = createFakeMapStore();
        fakeMap.store = map;
        loaderMock.loadAllOgcFeatures.mockReset();
    });

    function seedState(store: ReturnType<typeof useOgcLayersStore>): void {
        store.layers.parcels = {
            layerId: "parcels",
            collection: { id: "Flurstueck", title: "Flurstück", description: "", itemsUrl: "https://x.test/c/Flurstueck/items?f=json" },
            queryables: [
                { name: "flstkennz", title: "Kennzeichen", type: "string", isGeometry: false },
                { name: "geometrie", title: "geometrie", type: "other", isGeometry: true },
            ],
            properties: ["flstkennz"],
            conditions: [{ property: "flstkennz", operator: "contains", value: "0102" }],
            mode: "viewport",
            totalMatched: 261663,
            loadedCount: 10000,
            loading: false,
        };
    }

    test("replaces the MapLibre layer in place and streams chunks into deck.gl", async () => {
        loaderMock.loadAllOgcFeatures.mockImplementation(async (options) => {
            options.onTotal?.(261663);
            options.onChunk({ featureCount: 10000 }, 10000);
            options.onChunk({ featureCount: 10000 }, 20000);
        });
        const store = useOgcLayersStore();
        seedState(store);

        await store.loadAll("parcels");

        expect(map.deleteMapLayer).toHaveBeenCalledWith("parcels", false);
        expect(map.deleteMapDataSource).toHaveBeenCalledWith("parcels");
        expect(map.addDeckGeoJsonLayer).toHaveBeenCalledWith(expect.objectContaining({ identifier: "parcels", index: 1 }));
        expect(map.layersOnMap.map((layer) => layer.id)).toEqual(["other", "parcels"]);
        expect(map.appendDeckGeoJsonChunk).toHaveBeenCalledTimes(2);
        expect(map.requestLayerPanelExpansion).toHaveBeenCalledWith("parcels");

        const firstPage = new URL(loaderMock.loadAllOgcFeatures.mock.calls[0][0].firstPageUrl);
        expect(firstPage.searchParams.get("limit")).toBe("10000");
        expect(firstPage.searchParams.get("properties")).toBe("flstkennz,geometrie");
        expect(firstPage.searchParams.get("filter")).toBe("CASEI(flstkennz) LIKE CASEI('%0102%')");

        // The state survived the MapLibre -> deck.gl swap.
        expect(store.layers.parcels).toMatchObject({ mode: "full", loadedCount: 20000, loading: false });
    });

    test("cancelling keeps the features that already arrived", async () => {
        let release: () => void = () => undefined;
        loaderMock.loadAllOgcFeatures.mockImplementation(async (options) => {
            options.onChunk({ featureCount: 10000 }, 10000);
            await new Promise<void>((resolve, reject) => {
                release = resolve;
                options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
            });
        });
        const store = useOgcLayersStore();
        seedState(store);

        const loading = store.loadAll("parcels");
        await vi.waitFor(() => expect(store.layers.parcels.loadedCount).toBe(10000));
        store.cancelFullLoad("parcels");
        await loading;
        release();

        expect(store.layers.parcels).toMatchObject({ loading: false, stopped: true, loadedCount: 10000 });
        expect(map.clearDeckGeoJsonChunks).toHaveBeenCalledTimes(1);
    });

    test("reports rejected filters", async () => {
        const { OgcLoadError } = await import("@helpers/ogcFeatureLoader");
        loaderMock.loadAllOgcFeatures.mockRejectedValue(new OgcLoadError("bad filter", 400));
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        const store = useOgcLayersStore();
        seedState(store);

        await store.loadAll("parcels");

        expect(store.layers.parcels).toMatchObject({ mode: "full", errorKind: "filter", loading: false });
    });
});

import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useMapStore } from "./map";

vi.mock("@helpers/toast", () => ({ useToast: () => ({ add: vi.fn() }) }));
vi.mock("@deck.gl/mapbox", () => ({
    MapboxOverlay: class {
        props: Record<string, unknown>;
        constructor(props: Record<string, unknown>) {
            this.props = { ...props };
        }

        setProps(props: Record<string, unknown>): void {
            Object.assign(this.props, props);
        }
    },
}));

const emptyCollection = { type: "FeatureCollection" as const, features: [] };

function createFakeMap() {
    const styleLayers = new Set<string>();
    const sources = new Set<string>();
    return {
        styleLayers,
        addControl: vi.fn(),
        addSource: vi.fn((id: string) => sources.add(id)),
        getSource: vi.fn((id: string) => (sources.has(id) ? {} : undefined)),
        addLayer: vi.fn((layer: { id: string }) => styleLayers.add(layer.id)),
        getLayer: vi.fn((id: string) => (styleLayers.has(id) ? { id } : undefined)),
        removeLayer: vi.fn((id: string) => styleLayers.delete(id)),
        moveLayer: vi.fn(),
        getPitch: () => 60,
        easeTo: vi.fn(),
    };
}

/** Deck layers as handed to the overlay, bottom to top, with their anchors. */
function deckLayers(mapStore: ReturnType<typeof useMapStore>): Array<[string, unknown]> {
    const layers = (mapStore.deckOverlay as unknown as { props: { layers: Array<{ id: string, props: { beforeId?: string } }> } })
        .props.layers;
    return layers.map((layer) => [layer.id, layer.props.beforeId]);
}

async function addMapLibreLayer(mapStore: ReturnType<typeof useMapStore>, identifier: string): Promise<void> {
    await mapStore.addMapDataSource({ sourceType: "geojson", identifier, isFilterLayer: false, geoJSONSrc: emptyCollection });
    await mapStore.addMapLayer({
        sourceType: "geojson",
        identifier,
        layerType: "fill",
        geoJSONSrc: emptyCollection,
        isFilterLayer: false,
    });
}

describe("deck.gl layer ordering", () => {
    let map: ReturnType<typeof createFakeMap>;

    beforeEach(() => {
        setActivePinia(createPinia());
        map = createFakeMap();
    });

    test("anchors a 2D deck layer below MapLibre layers added after it, and re-anchors on removal", async () => {
        const mapStore = useMapStore();
        mapStore.map = map;
        mapStore.addDeckGeoJsonLayer({ identifier: "parcels" });
        expect(deckLayers(mapStore)).toEqual([["parcels", undefined]]);

        await addMapLibreLayer(mapStore, "buildings");
        expect(mapStore.layersOnMap.map((layer) => layer.id)).toEqual(["parcels", "buildings"]);
        expect(deckLayers(mapStore)).toEqual([["parcels", "buildings"]]);

        await mapStore.deleteMapLayer("buildings");
        expect(deckLayers(mapStore)).toEqual([["parcels", undefined]]);
    });

    test("keeps 3D tilesets above all 2D layers", async () => {
        const mapStore = useMapStore();
        mapStore.map = map;
        mapStore.addDeckTilesetLayer({ identifier: "lod3", tilesetUrl: "https://x.test/tileset.json" });
        mapStore.addDeckGeoJsonLayer({ identifier: "parcels" });
        await addMapLibreLayer(mapStore, "roads");

        expect(mapStore.layersOnMap.map((layer) => layer.id)).toEqual(["parcels", "roads", "lod3"]);
        expect(deckLayers(mapStore)).toEqual([["parcels", "roads"], ["lod3", undefined]]);

        // Dragging a 2D layer to the very top stops just below the 3D layer...
        mapStore.reorderVisibleMapLayer("parcels", 0);
        expect(mapStore.layersOnMap.map((layer) => layer.id)).toEqual(["roads", "parcels", "lod3"]);
        expect(deckLayers(mapStore)).toEqual([["parcels", undefined], ["lod3", undefined]]);

        // ...and a 3D layer cannot be dragged below 2D layers.
        mapStore.reorderVisibleMapLayer("lod3", 2);
        expect(mapStore.layersOnMap.map((layer) => layer.id)).toEqual(["roads", "parcels", "lod3"]);
    });

    test("orders deck layers exactly as dropped, even next to other deck layers", async () => {
        const mapStore = useMapStore();
        mapStore.map = map;
        mapStore.addDeckGeoJsonLayer({ identifier: "a" });
        mapStore.addDeckGeoJsonLayer({ identifier: "b" });
        await addMapLibreLayer(mapStore, "m");
        // Visible top to bottom: m, b, a. Drop "a" between m and b.
        mapStore.reorderVisibleMapLayer("a", 1);

        expect(mapStore.layersOnMap.map((layer) => layer.id)).toEqual(["b", "a", "m"]);
        expect(deckLayers(mapStore)).toEqual([["b", "m"], ["a", "m"]]);
    });

    test("moving a MapLibre layer re-anchors the deck layers around it", async () => {
        const mapStore = useMapStore();
        mapStore.map = map;
        await addMapLibreLayer(mapStore, "low");
        mapStore.addDeckGeoJsonLayer({ identifier: "parcels" });
        await addMapLibreLayer(mapStore, "high");
        expect(deckLayers(mapStore)).toEqual([["parcels", "high"]]);

        // Visible top to bottom: high, parcels, low. Move "high" to the bottom.
        mapStore.reorderVisibleMapLayer("high", 2);

        expect(map.moveLayer).toHaveBeenCalledWith("high", "low");
        expect(mapStore.layersOnMap.map((layer) => layer.id)).toEqual(["high", "low", "parcels"]);
        expect(deckLayers(mapStore)).toEqual([["parcels", undefined]]);
    });

    test("updates deck.gl GeoJSON styles", () => {
        const mapStore = useMapStore();
        mapStore.map = map;
        mapStore.addDeckGeoJsonLayer({ identifier: "parcels" });

        mapStore.setDeckGeoJsonStyle("parcels", { fillColor: "#ff0000", fillOpacity: 0.5, lineColor: "#0000ff", lineWidth: 2 });

        expect(mapStore.deckGeoJsonStyles.parcels).toEqual({ fillColor: "#ff0000", fillOpacity: 0.5, lineColor: "#0000ff", lineWidth: 2 });
        const layer = (mapStore.deckOverlay as unknown as { props: { layers: Array<{ props: Record<string, unknown> }> } }).props.layers[0];
        expect(layer.props.fillColor).toEqual([255, 0, 0, 128]);
        expect(layer.props.lineColor).toEqual([0, 0, 255, 255]);
        expect(layer.props.lineWidth).toBe(2);

        mapStore.removeDeckLayer("parcels");
        expect(mapStore.deckGeoJsonStyles.parcels).toBeUndefined();
    });
});

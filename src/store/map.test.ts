import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { type LayerObjectWithAttributes, useMapStore } from "./map";

vi.mock("primevue/usetoast", () => ({
    useToast: () => ({
        add: vi.fn(),
    }),
}));

function createLayer(
    id: string,
    options: Partial<LayerObjectWithAttributes> = {}
): LayerObjectWithAttributes {
    return {
        id,
        source: id,
        sourceType: "geojson",
        type: "fill",
        showOnLayerList: true,
        ...options,
    };
}

describe("map store layer reordering", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    test("returns visible reorderable layers from top to bottom", () => {
        const mapStore = useMapStore();
        mapStore.layersOnMap = [
            createLayer("hidden-helper", { showOnLayerList: false }),
            createLayer("raster", { type: "raster" }),
            createLayer("roads"),
            createLayer("live-drawing", {
                showOnLayerList: false,
                keepOnTop: true,
            }),
        ];

        expect(
            mapStore.getReorderableVisibleLayersTopToBottom().map((layer) => layer.id)
        ).toEqual(["roads", "raster"]);
    });

    test("moves only the dragged layer below keep-on-top layers", () => {
        const moveLayer = vi.fn();
        const mapStore = useMapStore();
        mapStore.map = {
            getLayer: () => ({}),
            moveLayer,
        };
        mapStore.layersOnMap = [
            createLayer("hidden-helper", { showOnLayerList: false }),
            createLayer("raster", { type: "raster" }),
            createLayer("roads"),
            createLayer("buildings"),
            createLayer("live-drawing", {
                showOnLayerList: false,
                keepOnTop: true,
            }),
        ];

        mapStore.reorderVisibleMapLayer("raster", 0);

        expect(moveLayer).toHaveBeenCalledTimes(1);
        expect(moveLayer).toHaveBeenCalledWith("raster", "live-drawing");
        expect(mapStore.layersOnMap.map((layer) => layer.id)).toEqual([
            "hidden-helper",
            "roads",
            "buildings",
            "raster",
            "live-drawing",
        ]);
    });

    test("moves a top layer to the bottom of the visible stack with one MapLibre move", () => {
        const moveLayer = vi.fn();
        const mapStore = useMapStore();
        mapStore.map = {
            getLayer: () => ({}),
            moveLayer,
        };
        mapStore.layersOnMap = [
            createLayer("raster", { type: "raster" }),
            createLayer("roads"),
            createLayer("buildings"),
        ];

        mapStore.reorderVisibleMapLayer("buildings", 2);

        expect(moveLayer).toHaveBeenCalledTimes(1);
        expect(moveLayer).toHaveBeenCalledWith("buildings", "raster");
        expect(mapStore.layersOnMap.map((layer) => layer.id)).toEqual([
            "buildings",
            "raster",
            "roads",
        ]);
    });
});

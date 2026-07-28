import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { type GeoserverRasterTypeLayerDetail } from "./geoserver";
import { type LayerObjectWithAttributes, useMapStore } from "./map";

vi.mock("@helpers/toast", () => ({
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

    test("uses the catalog provider URL for raster WMS tiles", async () => {
        const addSource = vi.fn();
        const source = { type: "raster" };
        const mapStore = useMapStore();
        mapStore.map = {
            addSource,
            getSource: () => source,
        };
        const detail = {
            catalog: {
                provider: {
                    id: "provider-1",
                    name: "Primary GeoServer",
                    base_url: "https://maps.example.test/geoserver",
                },
                workspace_name: "Hamburg",
            },
            coverage: {
                name: "rainfall",
            },
        } as GeoserverRasterTypeLayerDetail;

        await mapStore.addMapDataSource({
            sourceType: "geoserver",
            sourceDataType: "raster",
            sourceProtocol: "wms",
            identifier: "rainfall",
            isFilterLayer: false,
            workspaceName: "Hamburg",
            layer: detail,
        });

        const sourceSpecification = addSource.mock.calls[0][1] as {
            tiles: string[]
        };
        expect(sourceSpecification.tiles[0]).toMatch(
            /^https:\/\/maps\.example\.test\/geoserver\/wms\?/
        );
        expect(sourceSpecification.tiles[0]).toContain("LAYERS=Hamburg%3Arainfall");
    });

    test("adds raster WMTS as 256px PNG tiles", async () => {
        const addSource = vi.fn();
        const source = { type: "raster" };
        const mapStore = useMapStore();
        mapStore.map = {
            addSource,
            getSource: () => source,
        };
        const detail = {
            catalog: {
                provider: {
                    id: "provider-1",
                    name: "Primary GeoServer",
                    base_url: "https://maps.example.test/geoserver",
                },
                workspace_name: "Hamburg",
            },
            coverage: {
                name: "rainfall",
            },
        } as GeoserverRasterTypeLayerDetail;

        await mapStore.addMapDataSource({
            sourceType: "geoserver",
            sourceDataType: "raster",
            sourceProtocol: "wmts",
            identifier: "rainfall",
            isFilterLayer: false,
            workspaceName: "Hamburg",
            layer: detail,
        });

        const sourceSpecification = addSource.mock.calls[0][1] as {
            type: string
            tileSize: number
            tiles: string[]
        };
        expect(sourceSpecification.type).toBe("raster");
        expect(sourceSpecification.tileSize).toBe(256);
        expect(sourceSpecification.tiles[0]).toMatch(
            /^https:\/\/maps\.example\.test\/geoserver\/gwc\/service\/wmts\?/
        );
        expect(sourceSpecification.tiles[0]).toContain("FORMAT=image%2Fpng");
        expect(sourceSpecification.tiles[0]).toContain("TILEMATRIX=EPSG%3A900913%3A{z}");
        expect(sourceSpecification.tiles[0]).toContain("TILECOL={x}");
        expect(sourceSpecification.tiles[0]).toContain("TILEROW={y}");
    });

    test("rejects WMS when a MapLibre vector source is requested", async () => {
        const mapStore = useMapStore();
        mapStore.map = {
            addSource: vi.fn(),
            getSource: vi.fn(),
        };

        await expect(mapStore.addMapDataSource({
            sourceType: "geoserver",
            sourceDataType: "vector",
            sourceProtocol: "wms",
            identifier: "districts",
            isFilterLayer: false,
            workspaceName: "Hamburg",
            layer: {
                featureType: {
                    name: "districts",
                },
            } as never,
        })).rejects.toThrow(
            "WMS cannot provide a MapLibre vector tile source."
        );
    });
});

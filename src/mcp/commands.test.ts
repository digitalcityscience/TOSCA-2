import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFilterStore } from "@store/filter";
import { type GeoServerVectorTypeLayerDetail } from "@store/geoserver";
import { type LayerObjectWithAttributes, useMapStore } from "@store/map";
import { CommandError, dispatch, mapCommands } from "./commands";

const loader = vi.hoisted(() => ({
    resolveCatalogLayer: vi.fn(),
    loadCatalogLayerStyling: vi.fn(),
    addCatalogVectorLayer: vi.fn(),
    addCatalogRasterLayer: vi.fn(),
}));
vi.mock("@helpers/catalogLayerLoader", () => loader);
vi.mock("@helpers/toast", () => ({ useToast: () => ({ add: vi.fn() }) }));

/** The commands the MCP server may send (backend `tools/map.py` MAP_COMMANDS). */
const SERVER_COMMANDS = [
    "getMapState", "setView", "fitBounds", "zoomToLayer", "addCatalogLayer", "addGeoJsonLayer", "removeLayer",
    "setLayerVisibility", "setLayerOpacity", "getLayerAttributes", "addAttributeFilter", "removeAttributeFilter",
];

function vectorDetail(): GeoServerVectorTypeLayerDetail {
    return {
        featureType: {
            name: "bicycle_counts",
            title: "Bicycle counts",
            latLonBoundingBox: { minx: 9.7, miny: 53.4, maxx: 10.3, maxy: 53.7 },
            attributes: {
                attribute: [
                    { name: "count", binding: "java.lang.Integer" },
                    { name: "street", binding: "java.lang.String" },
                    { name: "geom", binding: "org.locationtech.jts.geom.Point" },
                ],
            },
        },
    } as unknown as GeoServerVectorTypeLayerDetail;
}

function layer(id: string, options: Partial<LayerObjectWithAttributes> = {}): LayerObjectWithAttributes {
    return { id, source: id, sourceType: "geoserver", type: "circle", showOnLayerList: true, displayName: id, ...options };
}

function fakeMap() {
    const layout: Record<string, string> = {};
    const paint: Record<string, number> = {};
    const sources = new Set<string>();
    const map = {
        getCenter: () => ({ lng: 9.99, lat: 53.55 }),
        getZoom: () => 11.234,
        getBearing: () => 0,
        getPitch: () => 0,
        getBounds: () => ({ getWest: () => 9.7, getSouth: () => 53.4, getEast: () => 10.3, getNorth: () => 53.7 }),
        once: vi.fn((_event: string, callback: () => void) => { callback(); }),
        flyTo: vi.fn(),
        fitBounds: vi.fn(),
        getLayer: vi.fn((id: string) => ({ id, type: "circle" })),
        getSource: vi.fn((id: string) => sources.has(id) ? {} : undefined),
        removeLayer: vi.fn(),
        removeSource: vi.fn((id: string) => { sources.delete(id); }),
        setFilter: vi.fn(),
        setLayoutProperty: vi.fn((id: string, _name: string, value: string) => { layout[id] = value; }),
        getLayoutProperty: vi.fn((id: string) => layout[id] ?? "visible"),
        setPaintProperty: vi.fn((id: string, _name: string, value: number) => { paint[id] = value; }),
        getPaintProperty: vi.fn((id: string) => paint[id]),
    };
    return { map, sources };
}

describe("map commands", () => {
    let map: ReturnType<typeof fakeMap>["map"];
    let sources: Set<string>;

    beforeEach(() => {
        setActivePinia(createPinia());
        ({ map, sources } = fakeMap());
        const mapStore = useMapStore();
        mapStore.map = map;
        mapStore.layersOnMap = [
            layer("bicycle", { details: vectorDetail(), workspaceName: "mobility", displayName: "Bicycle counts" }),
            layer("helper", { showOnLayerList: false }),
        ];
        Object.values(loader).forEach((mock) => mock.mockReset());
    });

    it("has exactly the commands the server may send", () => {
        expect(Object.keys(mapCommands).sort()).toEqual([...SERVER_COMMANDS].sort());
    });

    it("refuses unknown commands, including inherited property names", async () => {
        await expect(dispatch("resetMapData", {})).rejects.toThrow(CommandError);
        await expect(dispatch("constructor", {})).rejects.toThrow("Unknown map command");
        await expect(dispatch("__proto__", {})).rejects.toThrow("Unknown map command");
    });

    it("reads the view and the listed layers", async () => {
        const state = await dispatch("getMapState") as { view: Record<string, unknown>, layers: Array<Record<string, unknown>> };

        expect(state.view).toMatchObject({ center: [9.99, 53.55], zoom: 11.23, bounds: [9.7, 53.4, 10.3, 53.7] });
        expect(state.layers).toHaveLength(1);
        expect(state.layers[0]).toMatchObject({
            id: "bicycle", title: "Bicycle counts", visible: true, opacity: 1, filters: [],
            catalog: { workspace: "mobility", name: "bicycle_counts" },
        });
    });

    it("moves the map and reports the view", async () => {
        await dispatch("setView", { center: [9.93, 53.55], zoom: 13 });
        expect(map.flyTo).toHaveBeenCalledWith({ center: [9.93, 53.55], zoom: 13 });

        await dispatch("setView", { center: [9.93, 53.55], zoom: null });
        expect(map.flyTo).toHaveBeenLastCalledWith({ center: [9.93, 53.55] });

        await dispatch("fitBounds", { bounds: [9.8, 53.5, 10, 53.6] });
        expect(map.fitBounds).toHaveBeenCalledWith([[9.8, 53.5], [10, 53.6]], { padding: 20 });

        await dispatch("zoomToLayer", { layerId: "bicycle" });
        expect(map.fitBounds).toHaveBeenLastCalledWith([[9.7, 53.4], [10.3, 53.7]], { padding: 20 });
    });

    it("validates parameters before touching the map", async () => {
        await expect(dispatch("setView", { center: ["a", 1] })).rejects.toThrow(CommandError);
        await expect(dispatch("fitBounds", { bounds: [1, 2, 3] })).rejects.toThrow(CommandError);
        await expect(dispatch("setLayerOpacity", { layerId: "bicycle", opacity: 3 })).rejects.toThrow(CommandError);
        await expect(dispatch("setLayerVisibility", { layerId: "bicycle", visible: "yes" })).rejects.toThrow(CommandError);
        await expect(dispatch("setLayerVisibility", { layerId: "missing", visible: true })).rejects.toThrow(/no layer "missing"/);
        expect(map.flyTo).not.toHaveBeenCalled();
        expect(map.setLayoutProperty).not.toHaveBeenCalled();
    });

    it("changes visibility and opacity through the map store, so the layer list follows", async () => {
        const mapStore = useMapStore();

        await dispatch("setLayerVisibility", { layerId: "bicycle", visible: false });
        expect(map.setLayoutProperty).toHaveBeenCalledWith("bicycle", "visibility", "none");
        expect(mapStore.getLayerUiState("bicycle")?.visible).toBe(false);

        const result = await dispatch("setLayerOpacity", { layerId: "bicycle", opacity: 0.4 }) as { layer: { opacity: number } };
        expect(mapStore.getLayerUiState("bicycle")?.opacity).toBe(0.4);
        expect(result.layer.opacity).toBe(0.4);
    });

    it("lists filterable attributes with a simple type", async () => {
        expect(await dispatch("getLayerAttributes", { layerId: "bicycle" })).toEqual({
            layerId: "bicycle",
            attributes: [{ name: "count", type: "number" }, { name: "street", type: "text" }],
        });
    });

    it("adds an attribute filter to the filter store and the map", async () => {
        const filterStore = useFilterStore();

        const result = await dispatch("addAttributeFilter", {
            layerId: "bicycle", attribute: "count", operator: ">", value: "5", relation: "AND",
        }) as { layer: { filters: unknown[] } };

        expect(filterStore.appliedFiltersList).toHaveLength(1);
        expect(filterStore.appliedFiltersList[0].attributeFilters?.[0]).toMatchObject({ operand: ">", value: "5" });
        expect(map.setFilter).toHaveBeenCalledWith("bicycle", ["all", ["all", [">", ["get", "count"], 5]]]);
        expect(result.layer.filters).toEqual([{ attribute: "count", operator: ">", value: "5" }]);
    });

    it("refuses filters that do not fit the attribute", async () => {
        const base = { layerId: "bicycle", relation: "AND" };
        await expect(dispatch("addAttributeFilter", { ...base, attribute: "nope", operator: "==", value: "1" }))
            .rejects.toThrow(/no filterable attribute/);
        await expect(dispatch("addAttributeFilter", { ...base, attribute: "street", operator: ">", value: "a" }))
            .rejects.toThrow(/allowed operators/);
        await expect(dispatch("addAttributeFilter", { ...base, attribute: "count", operator: ">", value: "many" }))
            .rejects.toThrow(/not a number/);
        // The geometry column is not filterable and cannot be reached by name.
        await expect(dispatch("addAttributeFilter", { ...base, attribute: "geom", operator: "==", value: "x" }))
            .rejects.toThrow(/no filterable attribute/);
        expect(map.setFilter).not.toHaveBeenCalled();
    });

    it("removes an attribute filter and clears the map filter", async () => {
        await dispatch("addAttributeFilter", { layerId: "bicycle", attribute: "count", operator: ">", value: "5" });
        const result = await dispatch("removeAttributeFilter", { layerId: "bicycle", attribute: "count", operator: ">" }) as { layer: { filters: unknown[] } };

        expect(map.setFilter).toHaveBeenLastCalledWith("bicycle", null);
        expect(result.layer.filters).toEqual([]);
        await expect(dispatch("removeAttributeFilter", { layerId: "bicycle", attribute: "count", operator: ">" }))
            .rejects.toThrow(/no filter/);
    });

    it("adds a vector catalog layer through the catalog loader", async () => {
        const detail = vectorDetail();
        loader.resolveCatalogLayer.mockResolvedValue({ ok: true, info: { name: "bicycle_counts" }, detail });
        loader.loadCatalogLayerStyling.mockResolvedValue({ styles: [], defaultStyleId: "" });
        loader.addCatalogVectorLayer.mockImplementation(async () => {
            useMapStore().layersOnMap.push(layer("layer:new", { details: detail, workspaceName: "mobility" }));
            return { runtimeId: "layer:new", minZoomWarning: false };
        });

        const result = await dispatch("addCatalogLayer", { providerId: "p1", workspace: "mobility", layerName: "bicycle_counts" });

        expect(loader.resolveCatalogLayer).toHaveBeenCalledWith({ providerId: "p1", workspace: "mobility", layerName: "bicycle_counts" });
        expect(loader.addCatalogVectorLayer).toHaveBeenCalledWith({
            detail, workspace: "mobility", styling: { styles: [], defaultStyleId: "" },
        });
        expect(result).toMatchObject({ layer: { id: "layer:new" } });
    });

    it("adds a raster catalog layer through the raster loader", async () => {
        const detail = { coverage: { name: "heat", latLonBoundingBox: { minx: 9, miny: 53, maxx: 10, maxy: 54 } } };
        loader.resolveCatalogLayer.mockResolvedValue({ ok: true, info: { defaultStyle: { attributes: [] } }, detail });
        loader.addCatalogRasterLayer.mockImplementation(async () => {
            useMapStore().layersOnMap.push(layer("layer:heat", { type: "raster" }));
            return "layer:heat";
        });

        await dispatch("addCatalogLayer", { providerId: "p1", workspace: "climate", layerName: "heat" });

        expect(loader.addCatalogRasterLayer).toHaveBeenCalledWith({ detail, workspace: "climate", attributes: [] });
        expect(loader.addCatalogVectorLayer).not.toHaveBeenCalled();
    });

    it("reports a catalog layer the user may not see as not found", async () => {
        loader.resolveCatalogLayer.mockResolvedValue({ ok: false, reason: "not-found" });

        await expect(dispatch("addCatalogLayer", { providerId: "p1", workspace: "secret", layerName: "x" }))
            .rejects.toThrow(/was not found/);
        expect(loader.addCatalogVectorLayer).not.toHaveBeenCalled();
    });

    it("refuses GeoJSON that is not one kind of geometry, and duplicate titles", async () => {
        const point = { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [9.9, 53.5] } };
        const line = { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[9.9, 53.5], [10, 53.6]] } };

        await expect(dispatch("addGeoJsonLayer", { title: "Mixed", geojson: { type: "FeatureCollection", features: [point, line] } }))
            .rejects.toThrow(/one kind/);
        await expect(dispatch("addGeoJsonLayer", { title: "Empty", geojson: { type: "FeatureCollection", features: [] } }))
            .rejects.toThrow(CommandError);
        await expect(dispatch("addGeoJsonLayer", { title: "Bicycle", geojson: { type: "FeatureCollection", features: [point] } }))
            .rejects.toThrow(/already on the map/);
        expect(sources.size).toBe(0);
    });

    it("removes a layer and its source, as the layer list does", async () => {
        const mapStore = useMapStore();
        const deleteLayer = vi.spyOn(mapStore, "deleteMapLayer").mockResolvedValue();
        const deleteSource = vi.spyOn(mapStore, "deleteMapDataSource").mockImplementation(() => undefined);

        expect(await dispatch("removeLayer", { layerId: "bicycle" })).toEqual({ removed: "bicycle" });

        expect(deleteLayer).toHaveBeenCalledWith("bicycle", true);
        expect(deleteSource).toHaveBeenCalledWith("bicycle");
    });
});

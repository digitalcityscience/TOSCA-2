/**
 * The commands of groups 3 to 5: external data, time, style and colour, order, legend, what is
 * at a point, basemap, terrain, drawings, buffers and geostories. Stores other than the map
 * store are replaced by fakes; each test checks the command calls them as the UI does.
 */
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type LayerObjectWithAttributes, useMapStore } from "@store/map";
import { CommandError, dispatch } from "./commands";

const fakes = vi.hoisted(() => ({
    loader: {
        resolveCatalogLayer: vi.fn(),
        loadCatalogLayerStyling: vi.fn(),
        addCatalogVectorLayer: vi.fn(),
        addCatalogRasterLayer: vi.fn(),
    },
    geoserver: { getLayerList: vi.fn(), getLayerGroup: vi.fn(), fetchWmsCapabilities: vi.fn() },
    resolveTimeDomain: vi.fn(),
    resolveLegendUrl: vi.fn(),
    external: {
        loadExternalServices: vi.fn(),
        getOgcApiDatasets: vi.fn(),
        getOgcApiCollections: vi.fn(),
        getSensorThingsLayerCatalog: vi.fn(),
    },
    ogc: { layers: {} as Record<string, any>, addCollectionLayer: vi.fn(), updateLayerQuery: vi.fn() },
    sensorThings: { addServiceLayer: vi.fn() },
    draw: { externalAppOnProgress: false, drawOnProgress: false, editOnProgress: false, getSnapshot: vi.fn(() => [] as unknown[]) },
    geostory: { getStoryDetail: vi.fn() },
    router: { push: vi.fn() },
}));

vi.mock("@helpers/catalogLayerLoader", () => fakes.loader);
vi.mock("@helpers/toast", () => ({ useToast: () => ({ add: vi.fn() }) }));
vi.mock("@store/geoserver", async (original) => ({
    ...await original<typeof import("@store/geoserver")>(),
    useGeoserverStore: () => fakes.geoserver,
    resolveTimeDomain: fakes.resolveTimeDomain,
    resolveLegendUrl: fakes.resolveLegendUrl,
}));
vi.mock("@store/externalDataSources", async (original) => ({
    ...await original<typeof import("@store/externalDataSources")>(),
    useExternalDataSourcesStore: () => fakes.external,
}));
vi.mock("@store/ogcLayers", () => ({ useOgcLayersStore: () => fakes.ogc }));
vi.mock("@store/sensorThingsLayers", () => ({ useSensorThingsLayersStore: () => fakes.sensorThings }));
vi.mock("@store/draw", () => ({ useDrawStore: () => fakes.draw }));
vi.mock("@store/geostory", () => ({ useGeostoryStore: () => fakes.geostory }));
vi.mock("../router", () => ({ default: fakes.router }));

function layer(id: string, options: Partial<LayerObjectWithAttributes> = {}): LayerObjectWithAttributes {
    return { id, source: id, sourceType: "geoserver", type: "fill", showOnLayerList: true, displayName: id, ...options };
}

const TIMED_COVERAGE = {
    coverage: {
        name: "heat_2024",
        latLonBoundingBox: { minx: 9.7, miny: 53.4, maxx: 10.3, maxy: 53.7 },
        metadata: { entry: [{ "@key": "time", dimensionInfo: { enabled: true } }] },
    },
};

function fakeMap() {
    const container = document.createElement("div");
    const sources = new Set<string>(["terrain-dem"]);
    let terrain: unknown = null;
    return {
        container,
        sources,
        getCenter: () => ({ lng: 9.99, lat: 53.55 }),
        getZoom: () => 12,
        getBearing: () => 0,
        getPitch: () => 0,
        getBounds: () => ({ getWest: () => 9.7, getSouth: () => 53.4, getEast: () => 10.3, getNorth: () => 53.7 }),
        getContainer: () => container,
        getCanvas: () => ({ clientWidth: 800, clientHeight: 600 }),
        project: vi.fn(([lng]: [number, number]) => (lng > 11 ? { x: 900, y: 10 } : { x: 400, y: 300 })),
        getStyle: () => ({ layers: [{ id: "basemap:bg", type: "background" }, { id: "schools", type: "circle" }] }),
        queryRenderedFeatures: vi.fn((): unknown[] => []),
        once: vi.fn((_event: string, callback: () => void) => { callback(); }),
        flyTo: vi.fn(),
        fitBounds: vi.fn(),
        getLayer: vi.fn((id: string) => ({ id })),
        getSource: vi.fn((id: string) => (sources.has(id) ? { type: "geojson" } : undefined)),
        addSource: vi.fn((id: string) => { sources.add(id); }),
        removeSource: vi.fn((id: string) => { sources.delete(id); }),
        addLayer: vi.fn(),
        setTerrain: vi.fn((value: unknown) => { terrain = value; }),
        getTerrain: () => terrain,
    };
}

describe("commands of groups 3 to 5", () => {
    let map: ReturnType<typeof fakeMap>;

    beforeEach(() => {
        setActivePinia(createPinia());
        vi.clearAllMocks();
        map = fakeMap();
        fakes.ogc.layers = {};
        fakes.draw.drawOnProgress = false;
        fakes.draw.externalAppOnProgress = false;
        const mapStore = useMapStore();
        mapStore.map = map;
        mapStore.layersOnMap = [];
    });

    describe("view", () => {
        it("turns and tilts the map, within the map's pitch limit", async () => {
            await dispatch("setView", { center: [10, 53.5], zoom: 14, bearing: 30, pitch: 60 });
            expect(map.flyTo).toHaveBeenCalledWith({ center: [10, 53.5], zoom: 14, bearing: 30, pitch: 60 });
            await expect(dispatch("setView", { center: [10, 53.5], pitch: 90 })).rejects.toThrow(/0 to 85/);
        });

        it("switches the basemap through the basemap control's tile", async () => {
            map.container.innerHTML = `<div class="maplibregl-ctrl-basemaps">
                <div class="basemap active" data-id="inHouseBright"><span>Bright</span></div>
                <div class="basemap" data-id="satellite"><span>Satellite</span></div></div>`;
            const satellite = map.container.querySelector<HTMLElement>("[data-id=satellite]")!;
            satellite.addEventListener("click", () => satellite.classList.add("active"));

            const result = await dispatch("setBasemap", { basemapId: "satellite" }) as { basemaps: Array<{ id: string, active: boolean }> };

            expect(result.basemaps.find((item) => item.id === "satellite")?.active).toBe(true);
            await expect(dispatch("setBasemap", { basemapId: "moon" })).rejects.toThrow(/Known: inHouseBright, satellite/);
            const state = await dispatch("getMapState") as { basemaps: unknown[], terrain: boolean };
            expect(state.basemaps).toHaveLength(2);
        });

        it("turns terrain on with the map's terrain source, and off", async () => {
            expect(await dispatch("setTerrain", { enabled: true })).toEqual({ terrain: true });
            expect(map.setTerrain).toHaveBeenCalledWith({ source: "terrain-dem", exaggeration: 1 });
            expect(await dispatch("setTerrain", { enabled: false })).toEqual({ terrain: false });
            map.sources.delete("terrain-dem");
            await expect(dispatch("setTerrain", { enabled: true })).rejects.toThrow(/no terrain/);
        });
    });

    describe("catalog layers", () => {
        it("adds a raster layer at a time it offers, and refuses others", async () => {
            fakes.loader.resolveCatalogLayer.mockResolvedValue({ ok: true, detail: TIMED_COVERAGE, info: {} });
            fakes.loader.addCatalogRasterLayer.mockResolvedValue("layer:heat:1");
            fakes.resolveTimeDomain.mockResolvedValue({ values: ["2024-07-01", "2024-08-01"], default: "2024-08-01", source: "capabilities" });
            useMapStore().layersOnMap = [layer("layer:heat:1", { type: "raster" })];
            const params = { providerId: "p", workspace: "climate", layerName: "heat_2024" };

            await dispatch("addCatalogLayer", { ...params, time: "default" });
            expect(fakes.loader.addCatalogRasterLayer).toHaveBeenCalledWith(expect.objectContaining({ time: "2024-08-01" }));
            await expect(dispatch("addCatalogLayer", { ...params, time: "1999-01-01" })).rejects.toThrow(/2024-07-01, 2024-08-01/);
        });

        it("changes the time of a raster layer on the map", async () => {
            const mapStore = useMapStore();
            mapStore.layersOnMap = [layer("heat", { type: "raster", workspaceName: "climate", details: TIMED_COVERAGE as never }), layer("roads")];
            const setTime = vi.spyOn(mapStore, "setRasterLayerTime").mockImplementation(() => undefined);
            fakes.resolveTimeDomain.mockResolvedValue({ values: ["2024-07-01"], default: "2024-07-01", source: "capabilities" });

            await dispatch("setLayerTime", { layerId: "heat", time: "2024-07-01" });

            expect(setTime).toHaveBeenCalledWith("heat", "2024-07-01");
            await expect(dispatch("setLayerTime", { layerId: "roads", time: "2024" })).rejects.toThrow(/not a catalog raster/);
        });

        it("adds a layer group from the workspace's group list", async () => {
            const mapStore = useMapStore();
            const item = { name: "districts", href: "/groups/districts" };
            fakes.geoserver.getLayerList.mockResolvedValue({ groups: { group: [item] } });
            fakes.geoserver.getLayerGroup.mockResolvedValue({ id: "g1" });
            const group = layer("group:g1:1:render:0", { logicalKind: "group" });
            const addGroup = vi.spyOn(mapStore, "addMapGroup").mockResolvedValue(group);

            const result = await dispatch("addCatalogLayerGroup", { providerId: "p", workspace: "admin", groupName: "districts" }) as { layer: { kind: string } };

            expect(fakes.geoserver.getLayerList).toHaveBeenCalledWith("admin", "p");
            expect(fakes.geoserver.getLayerGroup).toHaveBeenCalledWith(item);
            expect(addGroup).toHaveBeenCalledWith({ id: "g1" });
            expect(result.layer.kind).toBe("group");
            await expect(dispatch("addCatalogLayerGroup", { providerId: "p", workspace: "admin", groupName: "x" })).rejects.toThrow(/no layer group/);
        });
    });

    describe("external data", () => {
        const hamburg = { id: "hamburg-ogc", type: "ogc-api", capabilities: { server_filters: true } };
        const sensors = { id: "hamburg-sta", type: "sensorthings", mqttUrl: "wss://x", capabilities: { live_updates: true } };

        beforeEach(() => {
            fakes.external.loadExternalServices.mockResolvedValue([hamburg, sensors]);
        });

        it("adds an OGC API collection; an empty dataset id means the service's only dataset", async () => {
            const dataset = { id: "hamburg-ogc", landingPageUrl: "https://x" };
            const collection = { id: "schools", itemsUrl: "https://x/items" };
            fakes.external.getOgcApiDatasets.mockResolvedValue([dataset]);
            fakes.external.getOgcApiCollections.mockResolvedValue([collection]);
            fakes.ogc.addCollectionLayer.mockImplementation(async () => {
                useMapStore().layersOnMap = [layer("external-ogc--hamburg-ogc--hamburg-ogc--schools", { sourceType: "geojson" })];
                return { layerId: "external-ogc--hamburg-ogc--hamburg-ogc--schools", loadedCount: 3, totalMatched: 3, mode: "all" };
            });

            const result = await dispatch("addOgcCollection", { serviceId: "hamburg-ogc", datasetId: "", collectionId: "schools" }) as Record<string, unknown>;

            expect(fakes.ogc.addCollectionLayer).toHaveBeenCalledWith({ source: hamburg, dataset, collection });
            expect(result).toMatchObject({ loaded: 3, mode: "all" });
            await expect(dispatch("addOgcCollection", { serviceId: "hamburg-ogc", collectionId: "schools" })).rejects.toThrow(/already on the map/);
            await expect(dispatch("addOgcCollection", { serviceId: "nope", collectionId: "schools" })).rejects.toThrow(/Known: hamburg-ogc/);
        });

        it("lists and adds SensorThings layers", async () => {
            fakes.external.getSensorThingsLayerCatalog.mockResolvedValue([{ serviceName: "Air", layerName: "PM10", datastreamCount: 12 }]);
            fakes.sensorThings.addServiceLayer.mockResolvedValue(layer("external-sta--hamburg-sta--Air--PM10", { sourceType: "geojson" }));

            const listed = await dispatch("listSensorThingsLayers", { serviceId: "hamburg-sta" }) as { layers: unknown[] };
            expect(listed.layers).toEqual([{ serviceName: "Air", layerName: "PM10", sensors: 12 }]);
            const added = await dispatch("addSensorThingsLayer", { serviceId: "hamburg-sta", serviceName: "Air", layerName: "PM10" }) as { live: boolean };

            expect(fakes.sensorThings.addServiceLayer).toHaveBeenCalledWith({
                source: sensors, serviceName: "Air", layerName: "PM10", displayName: "PM10", totalCount: 12,
            });
            expect(added.live).toBe(true);
            await expect(dispatch("addSensorThingsLayer", { serviceId: "hamburg-sta", serviceName: "Air", layerName: "NO2" }))
                .rejects.toThrow(/list_sensor_things_layers/);
        });

        it("queries an OGC API layer as its query panel does, and resets it", async () => {
            useMapStore().layersOnMap = [layer("ogc", { sourceType: "geojson" })];
            fakes.ogc.layers.ogc = {
                loading: false,
                capabilities: { server_filters: true },
                queryables: [
                    { name: "name", type: "string", isGeometry: false },
                    { name: "pupils", type: "integer", isGeometry: false },
                    { name: "geom", type: "geometry", isGeometry: true },
                ],
                totalMatched: 4,
                loadedCount: 4,
                mode: "all",
            };

            const result = await dispatch("setOgcLayerQuery", {
                layerId: "ogc",
                properties: ["name", "pupils"],
                conditions: [{ attribute: "pupils", operator: "gte", value: "300" }],
            }) as Record<string, unknown>;

            expect(fakes.ogc.updateLayerQuery).toHaveBeenCalledWith("ogc", {
                properties: undefined,
                conditions: [{ property: "pupils", operator: "gte", value: "300" }],
            });
            expect(result).toMatchObject({ matched: 4, loaded: 4 });
            await expect(dispatch("setOgcLayerQuery", { layerId: "ogc", conditions: [{ attribute: "name", operator: "gt", value: "a" }] }))
                .rejects.toThrow(/eq, neq, contains/);
            await dispatch("resetOgcLayerQuery", { layerId: "ogc" });
            expect(fakes.ogc.updateLayerQuery).toHaveBeenLastCalledWith("ogc", { properties: undefined, conditions: [] });

            fakes.ogc.layers.ogc.errorKind = "filter";
            await expect(dispatch("resetOgcLayerQuery", { layerId: "ogc" })).rejects.toThrow(/refused/);
        });
    });

    describe("layer look", () => {
        it("switches to another published style", async () => {
            const mapStore = useMapStore();
            mapStore.layersOnMap = [layer("schools", {
                activeStyleId: "a",
                availableStyles: [{ id: "a", name: "Default", layers: [] }, { id: "b", name: "By size", layers: [] }],
            })];
            const setStyle = vi.spyOn(mapStore, "setStandaloneLayerStyle").mockResolvedValue();

            await dispatch("setLayerStyle", { layerId: "schools", styleId: "b" });

            expect(setStyle).toHaveBeenCalledWith("schools", "b");
            await expect(dispatch("setLayerStyle", { layerId: "schools", styleId: "z" })).rejects.toThrow(/no style "z"/);
            const state = await dispatch("getMapState") as { layers: Array<{ styles: unknown[] }> };
            expect(state.layers[0].styles).toEqual([{ id: "a", title: "Default", active: true }, { id: "b", title: "By size", active: false }]);
        });

        it("sets a plain colour, and refuses one that depends on the data", async () => {
            const mapStore = useMapStore();
            mapStore.layersOnMap = [
                layer("parks", { paint: { "fill-color": "#00ff00", "fill-outline-color": ["match", ["get", "kind"], "a", "#000", "#fff"] } }),
                layer("deck", { renderer: "deckgl", type: "deckgl-geojson" }),
            ];
            const setColor = vi.spyOn(mapStore, "setStandaloneLayerPaintColor").mockImplementation(() => undefined);
            const setDeck = vi.spyOn(mapStore, "setDeckGeoJsonStyle").mockImplementation(() => undefined);

            await dispatch("setLayerColor", { layerId: "parks", part: "fill", color: "#2A9" });

            expect(setColor).toHaveBeenCalledWith("parks", "fill-color", "#22aa99");
            await expect(dispatch("setLayerColor", { layerId: "parks", part: "outline", color: "#000000" })).rejects.toThrow(/depends on its data/);
            await expect(dispatch("setLayerColor", { layerId: "parks", part: "fill", color: "green" })).rejects.toThrow(CommandError);
            await dispatch("setLayerColor", { layerId: "deck", part: "outline", color: "#123456" });
            expect(setDeck).toHaveBeenCalledWith("deck", { lineColor: "#123456" });
        });

        it("moves a layer in the layer list, at most to the bottom", async () => {
            const mapStore = useMapStore();
            mapStore.layersOnMap = [layer("a"), layer("b"), layer("c")];
            const reorder = vi.spyOn(mapStore, "reorderVisibleMapLayer").mockImplementation(() => undefined);

            await dispatch("moveLayer", { layerId: "c", position: 7 });

            expect(reorder).toHaveBeenCalledWith("c", 2);
        });

        it("reads the legend from the style, or the server's legend image for a raster", async () => {
            const mapStore = useMapStore();
            mapStore.layersOnMap = [
                layer("parks", { mbStyleLayers: [{ id: "parks", type: "fill", paint: { "fill-color": "#00ff00" }, metadata: { "tosca:legend-label": "Parks" } }] as never }),
                layer("heat", { type: "raster", workspaceName: "climate", details: TIMED_COVERAGE as never }),
            ];
            fakes.resolveLegendUrl.mockResolvedValue("https://geo/legend.png");

            const parks = await dispatch("getLayerLegend", { layerId: "parks" }) as { entries: Array<{ label: string, colors: string[] }> };
            const heat = await dispatch("getLayerLegend", { layerId: "heat" });

            expect(parks.entries[0]).toMatchObject({ label: "Parks", colors: ["#00ff00"] });
            expect(heat).toEqual({ layerId: "heat", image: "https://geo/legend.png" });
        });

        it("reads what is drawn at a point in view, as the click popup does", async () => {
            const mapStore = useMapStore();
            mapStore.layersOnMap = [layer("schools", { type: "circle" })];
            map.queryRenderedFeatures.mockReturnValue([{ id: 1, source: "schools", properties: { name: "Max Brauer" }, layer: { id: "schools" } }]);

            const result = await dispatch("identifyAt", { longitude: 9.95, latitude: 53.55 }) as { total: number, features: Array<Record<string, unknown>> };

            expect(map.queryRenderedFeatures).toHaveBeenCalledWith({ x: 400, y: 300 }, { layers: ["schools"] });
            expect(result.total).toBe(1);
            expect(result.features[0].attributes).toMatchObject({ name: "Max Brauer" });
            await expect(dispatch("identifyAt", { longitude: 12, latitude: 53.55 })).rejects.toThrow(/outside the current map view/);
        });
    });

    describe("drawings, buffers and geostories", () => {
        it("reads the drawing in progress without editing helpers, and the saved drawings", async () => {
            fakes.draw.drawOnProgress = true;
            fakes.draw.getSnapshot.mockReturnValue([
                { type: "Feature", properties: { mode: "polygon" }, geometry: { type: "Polygon", coordinates: [] } },
                { type: "Feature", properties: { mode: "point", selectionPoint: true }, geometry: { type: "Point", coordinates: [0, 0] } },
            ]);
            const area = { type: "FeatureCollection", features: [] };
            useMapStore().layersOnMap = [layer("my_area", { sourceType: "geojson", layerData: area as never }), layer("roads")];

            const result = await dispatch("getDrawnFeatures", {}) as { inProgress: { features: unknown[] }, savedLayers: Array<{ layerId: string }> };

            expect(result.inProgress.features).toHaveLength(1);
            expect(result.savedLayers.map((item) => item.layerId)).toEqual(["my_area"]);
            fakes.draw.externalAppOnProgress = true;
            await expect(dispatch("getDrawnFeatures", {})).rejects.toThrow(/Another tool/);
        });

        it("adds a buffer as a polygon layer that can be an area, as the buffer panel does", async () => {
            const mapStore = useMapStore();
            const rathaus = { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [9.992, 53.550] } }] };
            mapStore.layersOnMap = [layer("rathaus", { sourceType: "geojson", layerData: rathaus as never }), layer("buildings")];
            const addSource = vi.spyOn(mapStore, "addMapDataSource").mockResolvedValue(undefined as never);
            const addLayer = vi.spyOn(mapStore, "addMapLayer").mockImplementation(async (params: any) => {
                mapStore.layersOnMap.push(layer(params.identifier, { sourceType: "geojson", filterLayer: true, layerData: params.geoJSONSrc }));
                return undefined;
            });

            await dispatch("createBuffer", { layerId: "rathaus", meters: 100, title: "Rathaus 100 m" });

            expect(addSource).toHaveBeenCalledWith(expect.objectContaining({ identifier: "rathaus_buffer_100_rathaus_100_m", isFilterLayer: true }));
            expect(addLayer).toHaveBeenCalledWith(expect.objectContaining({ layerType: "fill", isFilterLayer: true, isDrawnLayer: true }));
            const polygon = (addLayer.mock.calls[0][0] as any).geoJSONSrc.features[0].geometry;
            expect(polygon.type).toBe("Polygon");
            await expect(dispatch("createBuffer", { layerId: "buildings", meters: 50, title: "x" })).rejects.toThrow(/no features in the browser/);
        });

        it("opens a geostory the user may see", async () => {
            fakes.geostory.getStoryDetail.mockImplementation(async (id: string) => {
                if (id !== "s1") throw new Error("404");
                return { title: "Green Altona" };
            });

            expect(await dispatch("openGeostory", { storyId: "s1" })).toMatchObject({ opened: "s1", title: "Green Altona" });
            expect(fakes.router.push).toHaveBeenCalledWith({ name: "geostory-detail", params: { storyId: "s1" } });
            await expect(dispatch("openGeostory", { storyId: "s2" })).rejects.toThrow(/list_geostories/);
        });
    });
});

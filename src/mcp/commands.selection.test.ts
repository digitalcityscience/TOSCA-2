/**
 * Commands added with the geostory / write-tool work: what the user clicked, one member of a layer
 * group, loading all features of an OGC API layer, multipolygon areas, and the catalog source of
 * a layer in the map state (a geostory scene is saved from it).
 */
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type LayerObjectWithAttributes, useMapStore } from "@store/map";
import { dispatch } from "./commands";
import { KEPT_SELECTIONS, startSelectionTracking, stopSelectionTracking } from "./selection";

const fakes = vi.hoisted(() => ({
    ogc: {
        layers: {} as Record<string, any>,
        loadAll: vi.fn(),
        cancelFullLoad: vi.fn(),
        refreshLayer: vi.fn(),
        capabilitiesForLayer: vi.fn(() => ({ full_load: true })),
    },
}));

vi.mock("@helpers/catalogLayerLoader", () => ({}));
vi.mock("@helpers/toast", () => ({ useToast: () => ({ add: vi.fn() }) }));
vi.mock("@store/ogcLayers", () => ({ useOgcLayersStore: () => fakes.ogc }));

function layer(id: string, options: Partial<LayerObjectWithAttributes> = {}): LayerObjectWithAttributes {
    return { id, source: id, sourceType: "geoserver", type: "fill", showOnLayerList: true, displayName: id, ...options };
}

function fakeMap() {
    const handlers = new Map<string, (event: unknown) => void>();
    const visibility: Record<string, string> = {};
    return {
        handlers,
        visibility,
        on: vi.fn((event: string, handler: (event: unknown) => void) => { handlers.set(event, handler); }),
        off: vi.fn((event: string) => { handlers.delete(event); }),
        click(x: number, lng: number) { handlers.get("click")?.({ point: { x, y: 10 }, lngLat: { lng, lat: 53.55 } }); },
        getCenter: () => ({ lng: 9.99, lat: 53.55 }),
        getZoom: () => 12,
        getBearing: () => 0,
        getPitch: () => 0,
        getBounds: () => ({ getWest: () => 9.7, getSouth: () => 53.4, getEast: () => 10.3, getNorth: () => 53.7 }),
        getStyle: () => ({ layers: [{ id: "buildings", type: "fill" }] }),
        getContainer: () => document.createElement("div"),
        queryRenderedFeatures: vi.fn((point: { x: number }) => [
            { id: point.x, source: "buildings", properties: { name: `Building ${point.x}`, year: 1900 + point.x }, layer: { id: "buildings" } },
        ]),
        getLayer: vi.fn((id: string) => ({ id })),
        getSource: vi.fn(() => undefined),
        getLayoutProperty: vi.fn((id: string) => visibility[id] ?? "visible"),
        setLayoutProperty: vi.fn((id: string, _name: string, value: string) => { visibility[id] = value; }),
    };
}

describe("selection, group members, OGC loading", () => {
    let map: ReturnType<typeof fakeMap>;

    beforeEach(() => {
        setActivePinia(createPinia());
        vi.clearAllMocks();
        stopSelectionTracking();
        map = fakeMap();
        fakes.ogc.layers = {};
        const mapStore = useMapStore();
        mapStore.map = map as never;
        mapStore.layersOnMap = [layer("buildings")];
    });

    describe("what the user clicked", () => {
        it("answers with the last click first, and only clicks made while connected", async () => {
            map.click(1, 9.9);
            startSelectionTracking();
            await nextTick();
            map.click(2, 9.95);
            map.click(3, 9.96);

            const result = await dispatch("getSelectedFeatures") as any;

            expect(result.latest.point).toEqual([9.96, 53.55]);
            expect(result.latest.features[0].attributes).toMatchObject({ name: "Building 3", year: "1903" });
            expect(result.earlier.map((item: any) => item.features[0].attributes.name)).toEqual(["Building 2"]);
        });

        it("keeps a few clicks and forgets them when the connection ends", async () => {
            startSelectionTracking();
            await nextTick();
            for (let x = 1; x <= KEPT_SELECTIONS + 2; x += 1) map.click(x, 9.9);
            expect((await dispatch("getSelectedFeatures") as any).earlier).toHaveLength(KEPT_SELECTIONS - 1);

            stopSelectionTracking();
            expect(map.off).toHaveBeenCalledWith("click", expect.any(Function));
            const empty = await dispatch("getSelectedFeatures") as any;
            expect(empty.latest).toBeNull();
            expect(empty.note).toMatch(/not clicked/);
        });
    });

    describe("layer groups", () => {
        const group = () => layer("green_city", {
            logicalKind: "group",
            groupManifest: { members: [
                { id: "m-parks", title: "Parks", name: "parks" },
                { id: "m-trees", title: "Trees", name: "trees" },
            ] } as never,
            groupMemberLayerIds: { "m-parks": ["green_city:parks"], "m-trees": ["green_city:trees", "green_city:trees-outline"] },
        });

        it("lists members with their visibility and hides one member", async () => {
            const mapStore = useMapStore();
            mapStore.layersOnMap = [group(), layer("buildings")];

            const result = await dispatch("setLayerVisibility", { layerId: "green_city", visible: false, memberId: "m-trees" }) as any;

            expect(map.setLayoutProperty).toHaveBeenCalledWith("green_city:trees", "visibility", "none");
            expect(map.setLayoutProperty).toHaveBeenCalledWith("green_city:trees-outline", "visibility", "none");
            expect(result.layer.members).toEqual([
                { id: "m-parks", title: "Parks", visible: true },
                { id: "m-trees", title: "Trees", visible: false },
            ]);
            await expect(dispatch("setLayerVisibility", { layerId: "green_city", visible: true, memberId: "nope" }))
                .rejects.toThrow(/no group member "nope"/);
            await expect(dispatch("setLayerVisibility", { layerId: "buildings", visible: true, memberId: "m-parks" }))
                .rejects.toThrow(/no group member/);
        });
    });

    describe("OGC API layers", () => {
        beforeEach(() => {
            useMapStore().layersOnMap = [layer("ogc:schools", { sourceType: "geojson" }), layer("buildings")];
            fakes.ogc.layers["ogc:schools"] = { mode: "viewport", loading: false, loadedCount: 40, totalMatched: 900 };
        });

        it("loads all features as the panel's Load all button does", async () => {
            fakes.ogc.loadAll.mockImplementation(async () => {
                Object.assign(fakes.ogc.layers["ogc:schools"], { mode: "full", loadedCount: 900 });
            });

            const result = await dispatch("loadOgcLayer", { layerId: "ogc:schools", action: "all" }) as any;

            expect(fakes.ogc.loadAll).toHaveBeenCalledWith("ogc:schools");
            expect(result).toMatchObject({ mode: "full", loaded: 900, matched: 900, stillLoading: false });
        });

        it("refuses Load all when the service does not allow it, and stops or reloads", async () => {
            fakes.ogc.capabilitiesForLayer.mockReturnValueOnce({ full_load: false });
            await expect(dispatch("loadOgcLayer", { layerId: "ogc:schools", action: "all" })).rejects.toThrow(/does not allow/);
            await expect(dispatch("loadOgcLayer", { layerId: "ogc:schools", action: "stop" })).rejects.toThrow(/not loading all/);

            fakes.ogc.layers["ogc:schools"] = { mode: "full", loading: true, loadedCount: 10 };
            await dispatch("loadOgcLayer", { layerId: "ogc:schools", action: "stop" });
            expect(fakes.ogc.cancelFullLoad).toHaveBeenCalledWith("ogc:schools");

            await dispatch("loadOgcLayer", { layerId: "ogc:schools", action: "reload" });
            expect(fakes.ogc.refreshLayer).toHaveBeenCalledWith("ogc:schools");
            await expect(dispatch("loadOgcLayer", { layerId: "buildings", action: "reload" })).rejects.toThrow(/not an OGC API layer/);
        });
    });

    describe("GeoJSON and map state", () => {
        it("adds multipolygons as a layer that can be a filter area", async () => {
            const mapStore = useMapStore();
            const addSource = vi.spyOn(mapStore, "addMapDataSource").mockResolvedValue(undefined as never);
            const addLayer = vi.spyOn(mapStore, "addMapLayer").mockImplementation(async (params: any) => {
                mapStore.layersOnMap.push(layer(params.identifier, { sourceType: "geojson", filterLayer: true, layerData: params.geoJSONSrc }));
                return undefined;
            });
            const square = [[[9.9, 53.5], [10, 53.5], [10, 53.6], [9.9, 53.5]]];
            const geojson = { type: "FeatureCollection", features: [
                { type: "Feature", properties: {}, geometry: { type: "MultiPolygon", coordinates: [square] } },
                { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: square } },
            ] };

            await dispatch("addGeoJsonLayer", { title: "Altona", geojson });

            expect(addSource).toHaveBeenCalledWith(expect.objectContaining({ identifier: "altona", isFilterLayer: true }));
            expect(addLayer).toHaveBeenCalledWith(expect.objectContaining({ isFilterLayer: true }));
        });

        it("names the catalog source and active style of catalog layers", async () => {
            useMapStore().layersOnMap = [layer("layer:parks", {
                workspaceName: "green",
                details: { catalog: { provider: { id: "prov-1" } }, featureType: { name: "parks", attributes: { attribute: [] } } } as never,
                availableStyles: [{ id: "s1", name: "parks-default", layers: [] }, { id: "s2", name: "parks-age", layers: [] }],
                activeStyleId: "s2",
            })];

            const state = await dispatch("getMapState") as any;

            expect(state.layers[0].catalog).toEqual({ providerId: "prov-1", workspace: "green", name: "parks", style: "parks-age" });
        });
    });
});

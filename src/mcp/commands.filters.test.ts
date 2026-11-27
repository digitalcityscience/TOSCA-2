/**
 * The "Altona flow" commands: read features, zoom to matching features, area filters,
 * AND / OR and clearing filters. They share the filter store's code with the filter panels.
 *
 * Features come only from the browser (GeoJSON layer data, loaded vector tiles); a test
 * fails if anything asks GeoServer for features.
 */
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type FeatureCollection } from "@helpers/geojson";
import { useFilterStore } from "@store/filter";
import { type GeoServerVectorTypeLayerDetail, useGeoserverStore } from "@store/geoserver";
import { type LayerObjectWithAttributes, useMapStore } from "@store/map";
import { CommandError, dispatch } from "./commands";

vi.mock("@helpers/catalogLayerLoader", () => ({}));
vi.mock("@helpers/toast", () => ({ useToast: () => ({ add: vi.fn() }) }));

function detail(name: string, attributes: Array<[string, string]>): GeoServerVectorTypeLayerDetail {
    return {
        featureType: {
            name,
            title: name,
            latLonBoundingBox: { minx: 9.7, miny: 53.4, maxx: 10.3, maxy: 53.7 },
            attributes: { attribute: attributes.map(([attrName, binding]) => ({ name: attrName, binding })) },
        },
    } as unknown as GeoServerVectorTypeLayerDetail;
}

function square(west: number, south: number, size: number): number[][][] {
    return [[[west, south], [west + size, south], [west + size, south + size], [west, south + size], [west, south]]];
}

const DISTRICTS: FeatureCollection = {
    type: "FeatureCollection",
    features: [
        { type: "Feature", properties: { bezirk_name: "Altona" }, geometry: { type: "Polygon", coordinates: square(9.8, 53.5, 0.1) } },
        { type: "Feature", properties: { bezirk_name: "Mitte" }, geometry: { type: "Polygon", coordinates: square(10.0, 53.5, 0.1) } },
    ],
} as FeatureCollection;

function point(gid: number, lng: number, lat: number, properties: Record<string, unknown> = {}) {
    return { type: "Feature", properties: { gid, ...properties }, geometry: { type: "Point", coordinates: [lng, lat] } };
}

/** A feature as MapLibre hands it out of a vector tile. */
function tilePiece(properties: Record<string, unknown>, coordinates: number[][][]) {
    return { properties, geometry: { type: "Polygon", coordinates } };
}

function layer(id: string, options: Partial<LayerObjectWithAttributes>): LayerObjectWithAttributes {
    return { id, source: id, sourceType: "geoserver", type: "circle", showOnLayerList: true, displayName: id, ...options };
}

const TILE_SOURCES = ["buildings", "district_tiles"];

function fakeMap() {
    let rendered: unknown[] = [];
    return {
        getCenter: () => ({ lng: 9.99, lat: 53.55 }),
        getZoom: () => 12,
        getBearing: () => 0,
        getPitch: () => 0,
        getContainer: () => document.createElement("div"),
        getBounds: () => ({ getWest: () => 9.7, getSouth: () => 53.4, getEast: () => 10.3, getNorth: () => 53.7 }),
        once: vi.fn((_event: string, callback: () => void) => { callback(); }),
        fitBounds: vi.fn(),
        getLayer: vi.fn((id: string) => ({ id })),
        getSource: vi.fn((id: string) => (TILE_SOURCES.includes(id) ? { type: "vector" } : { type: "geojson" })),
        queryRenderedFeatures: vi.fn(() => rendered),
        querySourceFeatures: vi.fn((): unknown[] => []),
        areTilesLoaded: vi.fn(() => true),
        triggerRepaint: vi.fn(),
        setFilter: vi.fn(),
        setRendered(features: unknown[]) { rendered = features; },
    };
}

describe("Altona flow commands", () => {
    let map: ReturnType<typeof fakeMap>;
    let geoserverFeatures: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        setActivePinia(createPinia());
        geoserverFeatures = vi.spyOn(useGeoserverStore(), "getGeoJSONLayerSource");
        map = fakeMap();
        const mapStore = useMapStore();
        mapStore.map = map;
        mapStore.layersOnMap = [
            layer("buildings", {
                type: "fill",
                workspaceName: "city",
                details: detail("buildings_2025", [
                    ["gid", "java.lang.Integer"], ["year", "java.lang.Integer"], ["use", "java.lang.String"],
                ]),
            }),
            layer("districts", { sourceType: "geojson", type: "fill", layerData: DISTRICTS }),
            layer("district_tiles", {
                type: "fill",
                workspaceName: "city",
                "source-layer": "bezirke",
                details: detail("bezirke", [["gid", "java.lang.Integer"], ["bezirk_name", "java.lang.String"]]),
            }),
            layer("drawn", {
                sourceType: "geojson",
                type: "fill",
                filterLayer: true,
                layerData: { type: "FeatureCollection", features: [DISTRICTS.features[0]] } as FeatureCollection,
            }),
        ];
    });

    afterEach(() => {
        expect(geoserverFeatures).not.toHaveBeenCalled();
    });

    async function addFilters(): Promise<void> {
        await dispatch("addAttributeFilter", { layerId: "buildings", attribute: "year", operator: ">=", value: 2000 });
        await dispatch("addAttributeFilter", { layerId: "buildings", attribute: "use", operator: "==", value: "school" });
    }

    describe("AND / OR", () => {
        it("stores the relation, shows it on the map and in the map state", async () => {
            await addFilters();
            await dispatch("setFilterRelation", { layerId: "buildings", relation: "OR" });

            expect(useFilterStore().appliedFiltersList[0].attributeRelation).toBe("OR");
            expect(map.setFilter).toHaveBeenLastCalledWith("buildings", ["all", ["any",
                [">=", ["get", "year"], 2000], ["==", ["downcase", ["get", "use"]], "school"]]]);
            const state = await dispatch("getMapState") as { layers: Array<{ id: string, filterRelation?: string }> };
            expect(state.layers.find((item) => item.id === "buildings")?.filterRelation).toBe("OR");
        });

        it("keeps the stored relation when a filter is added without one, and stores a given one", async () => {
            await addFilters();
            await dispatch("setFilterRelation", { layerId: "buildings", relation: "OR" });
            await dispatch("addAttributeFilter", { layerId: "buildings", attribute: "year", operator: "<", value: 2020 });
            expect(useFilterStore().appliedFiltersList[0].attributeRelation).toBe("OR");

            await dispatch("addAttributeFilter", {
                layerId: "buildings", attribute: "use", operator: "!=", value: "garage", relation: "AND",
            });
            expect(useFilterStore().appliedFiltersList[0].attributeRelation).toBe("AND");
        });

        it("refuses a relation for a layer without attribute filters", async () => {
            await expect(dispatch("setFilterRelation", { layerId: "buildings", relation: "OR" })).rejects.toThrow(/no attribute filters/);
            await expect(dispatch("setFilterRelation", { layerId: "buildings", relation: "XOR" })).rejects.toThrow(CommandError);
        });
    });

    describe("area filter", () => {
        it("filters to the features inside a matching feature of another layer, after moving there", async () => {
            map.setRendered([point(1, 9.85, 53.55), point(2, 10.05, 53.55), point(3, 9.82, 53.52)]);

            const result = await dispatch("applyGeometryFilter", {
                layerId: "buildings", areaMatch: { layerId: "districts", attribute: "bezirk_name", value: "altona" },
            }) as { featuresInArea: number };

            expect(map.fitBounds).toHaveBeenCalledWith([9.8, 53.5, 9.9, 53.6], expect.anything());
            expect(map.fitBounds.mock.invocationCallOrder[0]).toBeLessThan(map.queryRenderedFeatures.mock.invocationCallOrder[0]);
            expect(result.featuresInArea).toBe(2);
            expect(useFilterStore().appliedFiltersList[0].geometryFilters).toMatchObject({ identifier: "gid", filterArray: [1, 3] });
            expect(map.setFilter).toHaveBeenLastCalledWith("buildings", ["all", ["in", ["get", "gid"], ["literal", [1, 3]]]]);
        });

        it("refuses a catalog (vector tile) layer as the area: tiles hold no whole geometries", async () => {
            const match = { layerId: "district_tiles", attribute: "bezirk_name", value: "Altona" };
            await expect(dispatch("applyGeometryFilter", { layerId: "buildings", areaMatch: match })).rejects.toThrow(/GeoJSON polygon layer/);
            await expect(dispatch("applyGeometryFilter", { layerId: "buildings", areaLayerId: "district_tiles" })).rejects.toThrow(/GeoJSON polygon layer/);
            expect(map.querySourceFeatures).not.toHaveBeenCalled();
            expect(map.fitBounds).not.toHaveBeenCalled();
        });

        it("takes off the old area filter before finding the features of a new area", async () => {
            map.setRendered([point(1, 9.85, 53.55), point(2, 10.05, 53.55)]);
            await dispatch("applyGeometryFilter", { layerId: "buildings", areaLayerId: "drawn" });

            await dispatch("applyGeometryFilter", {
                layerId: "buildings", areaMatch: { layerId: "districts", attribute: "bezirk_name", value: "Mitte" },
            });

            const cleared = map.setFilter.mock.calls.findIndex(([id, filter]) => id === "buildings" && filter === null);
            expect(cleared).toBeGreaterThan(-1);
            expect(map.setFilter.mock.invocationCallOrder[cleared]).toBeLessThan(map.queryRenderedFeatures.mock.invocationCallOrder.at(-1)!);
            expect(useFilterStore().appliedFiltersList[0].geometryFilters?.filterArray).toEqual([2]);
        });

        it("keeps the old area filter when the new area holds no drawn feature", async () => {
            map.setRendered([point(1, 9.85, 53.55)]);
            await dispatch("applyGeometryFilter", { layerId: "buildings", areaLayerId: "drawn" });
            await expect(dispatch("applyGeometryFilter", {
                layerId: "buildings", areaMatch: { layerId: "districts", attribute: "bezirk_name", value: "Mitte" },
            })).rejects.toThrow(/No feature of the layer drawn/);
            expect(useFilterStore().appliedFiltersList[0].geometryFilters?.filterArray).toEqual([1]);
            expect(map.setFilter).toHaveBeenLastCalledWith("buildings", ["all", ["in", ["get", "gid"], ["literal", [1]]]]);
        });

        it("takes a polygon layer on the map as the area", async () => {
            map.setRendered([point(7, 9.85, 53.55)]);
            await dispatch("applyGeometryFilter", { layerId: "buildings", areaLayerId: "drawn" });
            expect(useFilterStore().appliedFiltersList[0].geometryFilters?.filterArray).toEqual([7]);
        });

        it("keeps OR between the attribute filters when the area filter is added (the old AND bug)", async () => {
            await addFilters();
            await dispatch("setFilterRelation", { layerId: "buildings", relation: "OR" });
            map.setRendered([point(1, 9.85, 53.55)]);

            await dispatch("applyGeometryFilter", { layerId: "buildings", areaLayerId: "drawn" });

            const expression = map.setFilter.mock.lastCall?.[1] as unknown[];
            expect(expression[1]).toEqual(["any", [">=", ["get", "year"], 2000], ["==", ["downcase", ["get", "use"]], "school"]]);
            expect(expression[2]).toEqual(["in", ["get", "gid"], ["literal", [1]]]);
        });

        it("refuses unclear or impossible requests before touching the map", async () => {
            const match = { layerId: "districts", attribute: "bezirk_name", value: "Altona" };
            await expect(dispatch("applyGeometryFilter", { layerId: "buildings" })).rejects.toThrow(/exactly one/);
            await expect(dispatch("applyGeometryFilter", { layerId: "buildings", areaLayerId: "drawn", areaMatch: match }))
                .rejects.toThrow(/exactly one/);
            await expect(dispatch("applyGeometryFilter", { layerId: "districts", areaLayerId: "drawn" }))
                .rejects.toThrow(/cannot be filtered by an area/);
            await expect(dispatch("applyGeometryFilter", { layerId: "buildings", areaLayerId: "buildings" }))
                .rejects.toThrow(/cannot be the area/);
            await expect(dispatch("applyGeometryFilter", {
                layerId: "buildings", areaMatch: { ...match, value: "Atlantis" },
            })).rejects.toThrow(/No feature of "districts"/);
            expect(map.fitBounds).not.toHaveBeenCalled();
        });

        it("says so when no drawn feature is inside the area", async () => {
            map.setRendered([point(2, 10.05, 53.55)]);
            await expect(dispatch("applyGeometryFilter", { layerId: "buildings", areaLayerId: "drawn" }))
                .rejects.toThrow(/No feature of the layer drawn on the map/);
            expect(useFilterStore().appliedFiltersList).toHaveLength(0);
        });

        it("needs a gid or id attribute on the target layer", async () => {
            useMapStore().layersOnMap[0].details = detail("buildings_2025", [["name", "java.lang.String"]]);
            await expect(dispatch("applyGeometryFilter", { layerId: "buildings", areaLayerId: "drawn" }))
                .rejects.toThrow(/"gid" or "id"/);
        });

        it("removes the area filter and keeps attribute filters", async () => {
            await dispatch("addAttributeFilter", { layerId: "buildings", attribute: "year", operator: ">=", value: 2000 });
            map.setRendered([point(1, 9.85, 53.55)]);
            await dispatch("applyGeometryFilter", { layerId: "buildings", areaLayerId: "drawn" });

            await dispatch("removeGeometryFilter", { layerId: "buildings" });

            expect(map.setFilter).toHaveBeenLastCalledWith("buildings", ["all", [">=", ["get", "year"], 2000]]);
            await expect(dispatch("removeGeometryFilter", { layerId: "buildings" })).rejects.toThrow(/no area filter/);
        });
    });

    it("clears every filter of a layer and gives back its style filter", async () => {
        useMapStore().layersOnMap[0].filter = ["==", ["get", "kind"], "house"];
        await addFilters();
        const result = await dispatch("clearLayerFilters", { layerId: "buildings" }) as { layer: { filters: unknown[] } };
        // The store's remove functions leave the layer's entry, empty, as after the panels' delete buttons.
        expect(useFilterStore().appliedFiltersList).toEqual([{ layerName: "buildings" }]);
        expect(result.layer.filters).toEqual([]);
        expect(map.setFilter).toHaveBeenLastCalledWith("buildings", ["==", ["get", "kind"], "house"]);
    });

    it("puts the filter on every render pass, each with its own style filter", async () => {
        Object.assign(useMapStore().layersOnMap[0], {
            companionLayerIds: ["buildings:style:1"],
            mbStyleLayers: [{ id: "a", type: "fill", filter: ["==", ["get", "kind"], "house"] }, { id: "b", type: "line" }],
        });
        await dispatch("addAttributeFilter", { layerId: "buildings", attribute: "year", operator: ">=", value: 2000 });
        expect(map.setFilter).toHaveBeenCalledWith("buildings", ["all", ["==", ["get", "kind"], "house"], [">=", ["get", "year"], 2000]]);
        expect(map.setFilter).toHaveBeenCalledWith("buildings:style:1", ["all", [">=", ["get", "year"], 2000]]);
    });

    describe("reading features", () => {
        it("reads a tile layer as drawn in the view, with the map's filters, one row per feature", async () => {
            await dispatch("addAttributeFilter", { layerId: "buildings", attribute: "use", operator: "in", value: "SCHOOL" });
            // What MapLibre draws after the filter; building 2 comes in two tile pieces.
            map.setRendered([
                point(1, 9.8, 53.5, { use: "School" }),
                point(2, 9.81, 53.5, { use: "Primary school" }),
                point(2, 9.81, 53.5, { use: "Primary school" }),
            ]);

            const page = await dispatch("getLayerFeatures", { layerId: "buildings", limit: 1, offset: 1 }) as Record<string, any>;

            expect(map.queryRenderedFeatures).toHaveBeenCalledWith({ layers: ["buildings"] });
            expect(page).toMatchObject({ scope: "view", total: 2, offset: 1, returned: 1, filtersApplied: true });
            expect(page.features).toEqual([{ properties: { gid: 2, use: "Primary school" } }]);
            expect(page.note).toMatch(/current map view/);
        });

        it("refuses a hidden tile layer, whose tiles the map does not load", async () => {
            useMapStore().layerUiState.buildings = { visible: false, opacity: 1 };
            await expect(dispatch("getLayerFeatures", { layerId: "buildings" })).rejects.toThrow(/hidden/);
        });

        it("reads all features of a GeoJSON layer, with geometries only when asked, and refuses bad paging", async () => {
            const page = await dispatch("getLayerFeatures", { layerId: "districts", withGeometry: true }) as Record<string, any>;
            expect(page).toMatchObject({ scope: "all", total: 2, filtersApplied: false });
            expect(page.features[0].geometry.type).toBe("Polygon");
            await expect(dispatch("getLayerFeatures", { layerId: "districts", limit: 0 })).rejects.toThrow(CommandError);
        });
    });

    describe("zoom to features", () => {
        it("fits the map to the matching features, ignoring case", async () => {
            const result = await dispatch("zoomToFeatures", { layerId: "districts", attribute: "bezirk_name", value: "MITTE" }) as { matched: number };
            expect(result.matched).toBe(1);
            expect(map.fitBounds).toHaveBeenCalledWith([[10.0, 53.5], [10.1, 53.6]], { padding: 40, maxZoom: 16 });
        });

        it("searches a tile layer in the loaded tiles, and once more after showing its whole extent", async () => {
            map.getBounds = () => ({ getWest: () => 9.9, getSouth: () => 53.5, getEast: () => 10.0, getNorth: () => 53.6 });
            map.querySourceFeatures
                .mockReturnValueOnce([tilePiece({ gid: 2, bezirk_name: "Mitte" }, square(10.0, 53.5, 0.1))])
                .mockReturnValue([tilePiece({ gid: 1, bezirk_name: "Altona" }, square(9.8, 53.5, 0.1))]);

            const result = await dispatch("zoomToFeatures", { layerId: "district_tiles", attribute: "bezirk_name", value: "altona" }) as { matched: number };

            expect(map.fitBounds).toHaveBeenNthCalledWith(1, [9.7, 53.4, 10.3, 53.7], expect.anything());
            expect(map.fitBounds).toHaveBeenLastCalledWith([[9.8, 53.5], [9.9, 53.6]], { padding: 40, maxZoom: 16 });
            expect(result.matched).toBe(1);
        });

        it("matches number attributes of tile layers as numbers", async () => {
            map.querySourceFeatures.mockReturnValue([tilePiece({ gid: 7, bezirk_name: "Nord" }, square(10.0, 53.6, 0.05))]);
            const result = await dispatch("zoomToFeatures", { layerId: "district_tiles", attribute: "gid", value: "7.0" }) as { matched: number };
            expect(result.matched).toBe(1);
            await expect(dispatch("zoomToFeatures", { layerId: "district_tiles", attribute: "gid", value: "seven" }))
                .rejects.toThrow(/not a number/);
        });

        it("refuses unknown attributes and reports no match", async () => {
            await expect(dispatch("zoomToFeatures", { layerId: "districts", attribute: "name", value: "x" })).rejects.toThrow(/no attribute/);
            await expect(dispatch("zoomToFeatures", { layerId: "districts", attribute: "bezirk_name", value: "Atlantis" }))
                .rejects.toThrow(/No feature/);
        });
    });
});

import { describe, expect, test, vi } from "vitest";
import type { Feature, FeatureCollection } from "./geojson";
import type { LayerObjectWithAttributes, MapLibreLayerTypes } from "@store/map";
import {
    addExternalGeoJSONLayer,
    dominantLayerType,
    mergeFeatures,
    ogcCollectionLayerId,
    sensorThingsLayerId,
    setExternalLayerFeatures,
    type ExternalLayerMapStore,
} from "./externalLayers";

function point(id: number): Feature {
    return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [10 + id, 53] },
        properties: { datastream_id: id },
    };
}

function collection(features: Feature[]): FeatureCollection {
    return { type: "FeatureCollection", features };
}

const geometryConversion = (geometry: string): MapLibreLayerTypes =>
    geometry.includes("Point") ? "circle" : geometry.includes("Line") ? "line" : "fill";

function createFakeMapStore(): ExternalLayerMapStore & { sources: Map<string, { setData: ReturnType<typeof vi.fn> }> } {
    const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
    const layers = new Set<string>();
    const store = {
        sources,
        layersOnMap: [] as LayerObjectWithAttributes[],
        map: {
            getSource: (id: string) => sources.get(id),
            getLayer: (id: string) => layers.has(id) ? { id } : undefined,
            fitBounds: vi.fn(),
        },
        geometryConversion,
        addMapDataSource: vi.fn(async (params: { identifier: string }) => {
            sources.set(params.identifier, { setData: vi.fn() });
        }),
        addMapLayer: vi.fn(async (params: { identifier: string, layerType: MapLibreLayerTypes, displayName?: string }) => {
            layers.add(params.identifier);
            store.layersOnMap.push({
                id: params.identifier,
                source: params.identifier,
                sourceType: "geojson",
                type: params.layerType,
                displayName: params.displayName,
            });
        }),
        deleteMapDataSource: vi.fn((id: string) => {
            sources.delete(id);
        }),
    };
    return store;
}

describe("external layer helpers", () => {
    test("builds stable, MapLibre-safe layer ids", () => {
        expect(ogcCollectionLayerId("hh ogc", "trees", "street/trees")).toBe("external-ogc--hh_ogc--trees--street_trees");
        expect(sensorThingsLayerId("hh-sta", 5652)).toBe("external-sta--hh-sta--5652");
    });

    test("picks the most common geometry family", () => {
        const line: Feature = { type: "Feature", geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] }, properties: {} };
        expect(dominantLayerType(collection([line, point(1), point(2)]), geometryConversion)).toBe("circle");
        expect(dominantLayerType(collection([]), geometryConversion)).toBe("circle");
    });

    test("merges features by key and counts new ones", () => {
        const key = (feature: Feature): string => String(feature.properties?.datastream_id);
        const merged = mergeFeatures(collection([point(1), point(2)]), [point(2), point(3)], key);
        expect(merged.addedCount).toBe(1);
        expect(merged.features.features.map(key)).toEqual(["1", "2", "3"]);
    });

    test("adds a GeoJSON layer with its features and source info", async () => {
        const store = createFakeMapStore();
        const record = await addExternalGeoJSONLayer(store, {
            identifier: "external-sta--s--1",
            displayName: "Bikes",
            features: collection([point(1)]),
            externalSource: { type: "sensorthings", sourceTitle: "STA", totalCount: 5 },
        });

        expect(store.addMapLayer).toHaveBeenCalledWith(expect.objectContaining({
            sourceType: "geojson",
            layerType: "circle",
            isFilterLayer: false,
        }));
        expect(record.layerData?.features).toHaveLength(1);
        expect(record.externalSource?.totalCount).toBe(5);
        expect(store.map.fitBounds).toHaveBeenCalled();
    });

    test("removes the source again when the layer cannot be added", async () => {
        const store = createFakeMapStore();
        store.addMapLayer = vi.fn(async () => {
            throw new Error("boom");
        });

        await expect(addExternalGeoJSONLayer(store, {
            identifier: "broken",
            displayName: "Broken",
            features: collection([point(1)]),
            externalSource: { type: "ogc-api", sourceTitle: "OGC" },
        })).rejects.toThrow("boom");
        expect(store.sources.has("broken")).toBe(false);
    });

    test("updates the map source and record when features change", async () => {
        const store = createFakeMapStore();
        await addExternalGeoJSONLayer(store, {
            identifier: "layer",
            displayName: "Layer",
            features: collection([point(1)]),
            externalSource: { type: "sensorthings", sourceTitle: "STA" },
        });
        const updated = collection([point(1), point(2)]);

        setExternalLayerFeatures(store, "layer", updated);

        expect(store.sources.get("layer")?.setData).toHaveBeenCalledWith(updated);
        expect(store.layersOnMap[0].layerData).toBe(updated);
        expect(() => setExternalLayerFeatures(store, "missing", updated)).toThrow("not on the map");
    });
});

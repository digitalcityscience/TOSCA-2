import bbox from "@turf/bbox";
import type { Feature, FeatureCollection } from "./geojson";
import type {
    ExternalLayerSourceInfo,
    GeoJSONSourceParams,
    LayerObjectWithAttributes,
    LayerParams,
    MapLibreLayerTypes,
} from "@store/map";

/** The slice of the map store used to manage external GeoJSON layers. */
export interface ExternalLayerMapStore {
    map: any;
    layersOnMap: LayerObjectWithAttributes[];
    addMapDataSource: (params: GeoJSONSourceParams) => Promise<unknown>;
    addMapLayer: (params: LayerParams) => Promise<unknown>;
    deleteMapDataSource: (identifier: string) => void;
    geometryConversion: (geometry: string) => MapLibreLayerTypes;
}

function sanitizeIdPart(value: string | number): string {
    return String(value).replace(/[^A-Za-z0-9_-]/g, "_");
}

/** One map layer per OGC API collection. */
export function ogcCollectionLayerId(sourceId: string, datasetId: string, collectionId: string): string {
    return ["external-ogc", sourceId, datasetId, collectionId].map(sanitizeIdPart).join("--");
}

/** One map layer per observed property of a SensorThings service. */
export function sensorThingsLayerId(sourceId: string, observedPropertyId: string | number): string {
    return ["external-sta", sourceId, observedPropertyId].map(sanitizeIdPart).join("--");
}

export function findExternalLayer(
    mapStore: Pick<ExternalLayerMapStore, "map" | "layersOnMap">,
    identifier: string
): LayerObjectWithAttributes | undefined {
    const record = mapStore.layersOnMap.find((layer) => layer.id === identifier);
    if (record === undefined || mapStore.map?.getLayer(identifier) === undefined) return undefined;
    return record;
}

/**
 * MapLibre renders one geometry family per layer, so pick the most common one.
 * Features of other families stay in the table/data but are not drawn.
 */
export function dominantLayerType(
    features: FeatureCollection,
    geometryConversion: (geometry: string) => MapLibreLayerTypes
): MapLibreLayerTypes {
    const counts = new Map<MapLibreLayerTypes, number>();
    for (const feature of features.features) {
        if (feature.geometry === null || feature.geometry === undefined) continue;
        const layerType = geometryConversion(feature.geometry.type);
        counts.set(layerType, (counts.get(layerType) ?? 0) + 1);
    }
    let dominant: MapLibreLayerTypes = "circle";
    let highest = 0;
    counts.forEach((count, layerType) => {
        if (count > highest) {
            dominant = layerType;
            highest = count;
        }
    });
    return dominant;
}

/**
 * Adds features to a collection, replacing features with the same key.
 * Returns the merged collection and how many keys were new.
 */
export function mergeFeatures(
    existing: FeatureCollection | undefined,
    added: Feature[],
    key: (feature: Feature) => string
): { features: FeatureCollection, addedCount: number } {
    const byKey = new Map<string, Feature>();
    for (const feature of existing?.features ?? []) byKey.set(key(feature), feature);
    let addedCount = 0;
    for (const feature of added) {
        const featureKey = key(feature);
        if (!byKey.has(featureKey)) addedCount += 1;
        byKey.set(featureKey, feature);
    }
    return {
        features: { type: "FeatureCollection", features: [...byKey.values()] },
        addedCount,
    };
}

export function fitMapToFeatures(map: any, features: FeatureCollection): void {
    if (features.features.length === 0) return;
    const [minX, minY, maxX, maxY] = bbox(features);
    if (![minX, minY, maxX, maxY].every(Number.isFinite)) return;
    map?.fitBounds([[minX, minY], [maxX, maxY]], { padding: 40, maxZoom: 16 });
}

export async function addExternalGeoJSONLayer(
    mapStore: ExternalLayerMapStore,
    params: {
        identifier: string
        displayName: string
        features: FeatureCollection
        externalSource: ExternalLayerSourceInfo
        /** Zoom the map to the loaded features (default true). */
        fitToFeatures?: boolean
    }
): Promise<LayerObjectWithAttributes> {
    const { identifier, displayName, features, externalSource, fitToFeatures = true } = params;
    // A source can outlive its layer if a previous removal failed half-way.
    if (mapStore.map?.getSource(identifier) !== undefined) {
        mapStore.deleteMapDataSource(identifier);
    }
    await mapStore.addMapDataSource({
        sourceType: "geojson",
        identifier,
        isFilterLayer: false,
        geoJSONSrc: features,
    });
    try {
        await mapStore.addMapLayer({
            sourceType: "geojson",
            identifier,
            layerType: dominantLayerType(features, mapStore.geometryConversion),
            geoJSONSrc: features,
            isFilterLayer: false,
            displayName,
        });
    } catch (error) {
        mapStore.deleteMapDataSource(identifier);
        throw error;
    }
    const record = mapStore.layersOnMap.find((layer) => layer.id === identifier);
    if (record === undefined) {
        throw new Error(`Layer ${identifier} was not registered on the map`);
    }
    record.layerData = features;
    record.externalSource = externalSource;
    if (fitToFeatures) fitMapToFeatures(mapStore.map, features);
    return record;
}

/** Replaces the data of an existing external layer (e.g. after adding streams). */
export function setExternalLayerFeatures(
    mapStore: Pick<ExternalLayerMapStore, "map" | "layersOnMap">,
    identifier: string,
    features: FeatureCollection,
    totalCount?: number
): void {
    const record = findExternalLayer(mapStore, identifier);
    if (record === undefined) {
        throw new Error(`Layer ${identifier} is not on the map`);
    }
    mapStore.map.getSource(identifier)?.setData(features);
    record.layerData = features;
    if (record.externalSource !== undefined && totalCount !== undefined) {
        record.externalSource = { ...record.externalSource, totalCount };
    }
}

import { acceptHMRUpdate, defineStore } from "pinia";
import type { ExternalDataSourceConfig } from "../config/externalDataSources";
import {
    sensorThingsDatastreamFeature,
    useExternalDataSourcesStore,
    type ExternalCategoryItem,
} from "./externalDataSources";
import { useMapStore, type LayerObjectWithAttributes } from "./map";
import { useSensorThingsLiveStore } from "./sensorThingsLive";
import { addExternalGeoJSONLayer, sensorThingsLayerId } from "@helpers/externalLayers";
import { mapStyleColorProperties } from "@helpers/mapStyleEditing";

export const useSensorThingsLayersStore = defineStore("sensorThingsLayers", () => {
    const externalSources = useExternalDataSourcesStore();
    const mapStore = useMapStore();
    // Mount the subscription watcher before the new layer enters the map store.
    useSensorThingsLiveStore();

    async function addServiceLayer(params: {
        source: ExternalDataSourceConfig
        serviceName: string
        layerName: string
        displayName: string
        totalCount?: number
        color?: string
    }): Promise<LayerObjectWithAttributes> {
        const { source, serviceName, layerName, displayName, totalCount, color } = params;
        const layerId = sensorThingsLayerId(source.id, serviceName, layerName);
        const existing = mapStore.layersOnMap.find((layer) => layer.id === layerId);
        if (existing !== undefined) return existing;

        const datastreams = await externalSources.getAllSensorThingsLayerDatastreams(
            source,
            serviceName,
            layerName
        );
        const features = datastreams.flatMap((datastream) => {
            const feature = sensorThingsDatastreamFeature(datastream);
            return feature === undefined ? [] : [feature];
        });
        const record = await addExternalGeoJSONLayer(mapStore, {
            identifier: layerId,
            displayName,
            features: { type: "FeatureCollection", features },
            externalSource: {
                type: "sensorthings",
                sourceId: source.id,
                sourceTitle: source.title,
                totalCount,
            },
        });
        const colorProperty = color === undefined ? undefined : mapStyleColorProperties(record.type)[0];
        if (colorProperty !== undefined && color !== undefined) {
            mapStore.setStandaloneLayerPaintColor(layerId, colorProperty, color);
        }
        return record;
    }

    async function addCategoryItemLayer(
        item: ExternalCategoryItem,
        source: ExternalDataSourceConfig
    ): Promise<LayerObjectWithAttributes> {
        const selection = item.sensorthings;
        if (item.service_type !== "sensorthings" || selection === undefined) {
            throw new Error(`Category item ${item.id} is not a SensorThings layer`);
        }
        return await addServiceLayer({
            source,
            serviceName: selection.service_name,
            layerName: selection.layer_name,
            displayName: item.title,
            totalCount: item.availability.feature_count ?? undefined,
            color: item.style.color,
        });
    }

    return { addServiceLayer, addCategoryItemLayer };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useSensorThingsLayersStore, import.meta.hot));
}

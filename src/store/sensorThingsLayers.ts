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

    async function addCategoryItemLayer(
        item: ExternalCategoryItem,
        source: ExternalDataSourceConfig
    ): Promise<LayerObjectWithAttributes> {
        const selection = item.sensorthings;
        if (item.service_type !== "sensorthings" || selection === undefined) {
            throw new Error(`Category item ${item.id} is not a SensorThings layer`);
        }
        const layerId = sensorThingsLayerId(source.id, selection.service_name, selection.layer_name);
        const existing = mapStore.layersOnMap.find((layer) => layer.id === layerId);
        if (existing !== undefined) return existing;

        const datastreams = await externalSources.getAllSensorThingsLayerDatastreams(
            source,
            selection.service_name,
            selection.layer_name
        );
        const features = datastreams.flatMap((datastream) => {
            const feature = sensorThingsDatastreamFeature(datastream);
            return feature === undefined ? [] : [feature];
        });
        const record = await addExternalGeoJSONLayer(mapStore, {
            identifier: layerId,
            displayName: item.title,
            features: { type: "FeatureCollection", features },
            externalSource: {
                type: "sensorthings",
                sourceId: source.id,
                sourceTitle: source.title,
                totalCount: item.availability.feature_count ?? undefined,
            },
        });
        const colorProperty = mapStyleColorProperties(record.type)[0];
        if (colorProperty !== undefined) {
            mapStore.setStandaloneLayerPaintColor(layerId, colorProperty, item.style.color);
        }
        return record;
    }

    return { addCategoryItemLayer };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useSensorThingsLayersStore, import.meta.hot));
}

import { acceptHMRUpdate, defineStore } from "pinia";
import { type GeoJSONSourceParams, type LayerObjectWithAttributes, type GeoJSONLayerParams, useMapStore } from "./map";
import buffer from "@turf/buffer";
import { type FeatureCollection } from "geojson";
import flatten from "@turf/flatten";
import { ref } from "vue";

export const useBufferStore = defineStore("buffer", () => {
    const mapStore = useMapStore();
    const isTmpDataCreated =ref<boolean>(false);
    const selectedLayer = ref<LayerObjectWithAttributes|null>(null)
    const bufferLayerName = ref<string>("")
    const bufferRadius = ref<number>(0)
    const tmpBufferLayerSource: GeoJSONSourceParams = {
        identifier:"tmpBufferSource",
        sourceType: "geojson",
        isFilterLayer: false,
        geoJSONSrc: {
            type: "FeatureCollection",
            features: []
        }

    }
    const tmpBufferLayer: GeoJSONLayerParams = {
        sourceType: "geojson",
        identifier: "tmpBufferLayer",
        layerType: "fill",
        sourceIdentifier: "tmpBufferSource",
        showOnLayerList: false,
        geoJSONSrc: {
            type: "FeatureCollection",
            features: []
        },
        isFilterLayer: false,
        isDrawnLayer: true,
    }
    function temporaryBufferHandler(selectedLayer: LayerObjectWithAttributes, radius: number): void {
        if (selectedLayer === null || (selectedLayer.sourceType !== "geojson" && (selectedLayer.layerData === undefined))) return;
        const data = flatten(selectedLayer.layerData!);
        const bufferData: FeatureCollection|undefined = buffer(data, radius, { units: "meters" });
        if (bufferData === undefined) return;
        const bufferSource = tmpBufferLayerSource
        bufferSource.geoJSONSrc = bufferData;
        mapStore.addMapDataSource(bufferSource).then(() => {
            const bufferLayer = tmpBufferLayer;
            bufferLayer.geoJSONSrc = bufferData;
            bufferLayer.layerType = "fill";
            mapStore.addMapLayer(bufferLayer).then(() => {
                isTmpDataCreated.value = true;
            }).catch((error) => {
                console.error(error);
            })
        }).catch((error) => {
            console.error(error);
        })
    }
    function clearTmpBufferLayer(): void {
        mapStore.deleteMapLayer("tmpBufferLayer").then(() => {
            mapStore.deleteMapDataSource("tmpBufferSource").then(() => {
                isTmpDataCreated.value = false;
                selectedLayer.value = null;
                bufferLayerName.value = "";
                bufferRadius.value = 0;
            }).catch((error) => {
                console.error(error);
            })
        }).catch((error) => {
            console.error(error);
        })
    }
    function addToMapLayer(selectedLayer: LayerObjectWithAttributes, radius: number, name: string): void {
        if (isTmpDataCreated.value) {
            const bufferLayer = mapStore.layersOnMap.filter((layer) => layer.id === "tmpBufferLayer")[0];
            const bufferData = bufferLayer.layerData;
            if (bufferData === undefined) return;
            const bufferSource: GeoJSONSourceParams = {
                identifier:`${selectedLayer.id}_buffer_${radius}_${name.trim().toLowerCase().replaceAll(" ", "_")}`,
                sourceType: "geojson",
                isFilterLayer: true,
                geoJSONSrc: bufferData
            }
            bufferSource.geoJSONSrc = bufferData;
            mapStore.addMapDataSource(bufferSource).then(() => {
                const bufferLayer: GeoJSONLayerParams = {
                    sourceType: "geojson",
                    identifier: bufferSource.identifier,
                    layerType: "fill",
                    sourceIdentifier: bufferSource.identifier,
                    displayName: name,
                    showOnLayerList: true,
                    geoJSONSrc: bufferData,
                    isFilterLayer: true,
                    isDrawnLayer: true,
                };
                console.log(mapStore.map.getSource(bufferSource.identifier))
                mapStore.addMapLayer(bufferLayer).then(() => {
                    clearTmpBufferLayer();
                }).catch((error) => {
                    console.error(error);
                })
            }).catch((error) => {
                console.error(error);
            })
        }
    }
    return {
        selectedLayer,
        bufferLayerName,
        bufferRadius,
        isTmpDataCreated,
        temporaryBufferHandler,
        clearTmpBufferLayer,
        addToMapLayer
    }
});
/* eslint-disable */
if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useBufferStore, import.meta.hot))
}
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
    /**
     * Creates a temporary buffer layer around the selected layer's geometries.
     *
     * This function flattens the geometries of the selected layer, computes a buffer using
     * the specified radius, and then adds the resulting buffer as a temporary GeoJSON layer
     * on the map. If the buffer calculation fails or if the selected layer is not valid, the
     * operation is aborted.
     *
     * @param {LayerObjectWithAttributes} selectedLayer - The layer object selected for buffering. Must contain valid GeoJSON data or layerData.
     * @param {number} radius - The radius (in meters) to buffer around the geometries in the selected layer.
     *
     * @returns {void} This function does not return anything, but updates the map state with the new temporary buffer layer.
     *
     * @throws Will log an error to the console if adding the buffer source or layer fails.
     */
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
    /**
     * Clears the temporary buffer layer and its associated data source from the map.
     *
     * This function removes both the temporary buffer layer and the GeoJSON data source
     * from the map, and resets the relevant state variables, including the selected layer,
     * buffer layer name, and buffer radius. If the removal of the source or layer fails,
     * an error is logged to the console.
     *
     * @returns {void} This function does not return anything, but updates the map state by clearing the temporary buffer layer.
     *
     * @throws Will log an error to the console if the deletion of the temporary layer or data source fails.
     */
    function clearTmpBufferLayer(): void {
        mapStore.deleteMapLayer("tmpBufferLayer").then(() => {
            try {
                mapStore.deleteMapDataSource("tmpBufferSource");
                isTmpDataCreated.value = false;
                selectedLayer.value = null;
                bufferLayerName.value = "";
                bufferRadius.value = 0;
            } catch (error){
                console.error(error);
            }
        }).catch((error) => {
            console.error(error);
        })
    }
    /**
     * Adds the temporary buffer layer as a permanent map layer with a specified name and buffer radius.
     *
     * This function checks if a temporary buffer layer exists, retrieves the associated buffer data,
     * and creates a new GeoJSON data source and layer using the provided layer name and radius.
     * The new layer is added to the map and is displayed in the layer list. After adding the new layer,
     * the temporary buffer layer is cleared from the map.
     *
     * @param {LayerObjectWithAttributes} selectedLayer - The selected layer used for generating the buffer.
     * @param {number} radius - The radius (in meters) used to create the buffer.
     * @param {string} name - The name of the new buffer layer to be added to the map.
     *
     * @returns {void} This function does not return anything, but updates the map state by adding a new buffer layer.
     *
     * @throws Will log an error to the console if the addition of the new layer or data source fails.
     */
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
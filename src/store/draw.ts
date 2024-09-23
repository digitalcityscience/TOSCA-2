import { defineStore, acceptHMRUpdate } from "pinia"
import { TerraDraw, TerraDrawLineStringMode, TerraDrawMapLibreGLAdapter, TerraDrawPointMode, TerraDrawPolygonMode, TerraDrawSelectMode } from "terra-draw"
import { ref } from "vue";
import { type GeoJSONSourceParams, type LayerParams, useMapStore } from "./map";
import { type Map } from "maplibre-gl"
import { type Feature, type FeatureCollection } from "geojson";
import { useToast } from "primevue/usetoast";

export type DrawMode = "point" | "linestring" | "polygon" | "select" | "static";
type DrawTypes = Array<{ mode: string, name: DrawMode }>
export const useDrawStore = defineStore("draw", () => {
    const mapStore = useMapStore()
    const toast = useToast()
    const drawTypes = ref<DrawTypes>([{ name: "point", mode: "Point" }, { name: "linestring", mode: "Line" }, { name: "polygon", mode: "Polygon" }])
    const drawMode = ref<DrawMode>("polygon")
    const drawOnProgress = ref(false)
    const editOnProgress = ref(false)
    /**
     * Use this flag to indicate that an external application is currently using terra draw instance. This is use to prevent default drawing tool from being used.
     *
     */
    const externalAppOnProgress = ref(false)
    const terraDraw = ref<TerraDraw>()
    /**
     * Initializes the TerraDraw object with the given map and draw modes.
     *
     * @param map - The map object to be used by TerraDraw.
     * @param modes - An array of draw modes to be selected.
     * @returns A new instance of TerraDraw with the specified map and selected draw modes.
     */
    function initializeTerraDraw(map: Map, modes: DrawMode[]): TerraDraw {
        console.log("Initializing TerraDraw")
        try {
            const selectedModes: Array<TerraDrawPointMode | TerraDrawLineStringMode | TerraDrawPolygonMode | TerraDrawSelectMode> = [];
            const draggableFeatureConfig = {
                feature: {
                    draggable: true,
                    coordinates: {
                        midpoints: true,
                        draggable: true,
                        deletable: true,
                    },
                },
            };
            for (const mode of modes) {
                switch (mode) {
                    case "point":
                        selectedModes.push(new TerraDrawPointMode({
                            styles: {
                                pointColor: "#AA4545",
                                pointWidth: 6
                            }
                        }));
                        break;
                    case "linestring":
                        selectedModes.push(new TerraDrawLineStringMode());
                        break;
                    case "polygon":
                        selectedModes.push(new TerraDrawPolygonMode());
                        break;
                    case "select":
                        selectedModes.push(new TerraDrawSelectMode({
                            flags: {
                                point: {
                                    feature: {
                                        draggable: true,
                                        coordinates: {
                                            deletable: true
                                        }
                                    },
                                },
                                polygon: draggableFeatureConfig,
                                linestring: draggableFeatureConfig
                            }
                        }));
                        break;
                    default:
                        console.warn(`Unsupported mode: ${mode as string}`);
                        break;
                }
            }
            console.log("TerraDraw initialized")
            return new TerraDraw({
                adapter: new TerraDrawMapLibreGLAdapter({ map }),
                modes: selectedModes
            });
        } catch (error) {
            console.error("Failed to initialize TerraDraw:", error);
            throw new Error("TerraDraw initialization failed");
        }
    }
    /**
     * Destroys the TerraDraw instance.
     */
    function destroyTerraDraw(): void {
        if (terraDraw.value !== undefined) {
            terraDraw.value.stop()
            terraDraw.value = undefined
        }
    }
    /**
     * Changes the draw mode of the TerraDraw instance.
     *
     * @param mode - The new draw mode to be set.
     */
    function changeMode(mode: DrawMode): void {
        try {
            if (terraDraw.value !== undefined) {
                if (!terraDraw.value.enabled) {
                    terraDraw.value.start()
                }
                if (mode === "select") {
                    drawOnProgress.value = false;
                    editOnProgress.value = true;
                } else if (mode === "static") {
                    drawOnProgress.value = false;
                    editOnProgress.value = false;
                } else if (mode === "point" || mode === "linestring" || mode === "polygon") {
                    drawOnProgress.value = true;
                    editOnProgress.value = false;
                }
                terraDraw.value.setMode(mode)
            } else {
                console.error("TerraDraw instance is not initialized")
            }
        } catch (error) {
            console.error("An error occurred while changing draw mode:", error);
        }
    }
    /**
     * Stops the TerraDraw instance if it is enabled and sets the mode to "static".
     * Resets the drawing and editing progress flags and clears the layer name.
     *
     * @remarks
     * This function requires the `terraDraw` instance to be defined and enabled.
     * If the instance is undefined, an error is logged.
     *
     * @returns {void}
     */
    function stopTerradraw(): void {
        if (terraDraw.value !== undefined && terraDraw.value.enabled) {
            terraDraw.value.setMode("static")
            terraDraw.value.stop()
            drawOnProgress.value = false
            editOnProgress.value = false
            layerName.value = ""
        }
    }
    /**
     * Initializes the drawing mode for the TerraDraw instance.
     *
     * @remarks
     * This function starts the drawing mode if it's not already in progress. If the drawing is
     * already in progress, it does nothing. If editing is in progress, it switches to drawing.
     * If no drawing or editing is in progress, it starts the drawing process with the selected mode.
     * Logs an error if the `terraDraw` instance is not found.
     *
     * @returns {void}
     */
    function initDrawMode(): void {
        if (terraDraw.value !== undefined) {
            if (!drawOnProgress.value){
                if (editOnProgress.value) {
                    terraDraw.value.setMode(drawMode.value)
                    editOnProgress.value = false
                    drawOnProgress.value = true
                } else {
                    terraDraw.value.start();
                    terraDraw.value.setMode(drawMode.value);
                    drawOnProgress.value = true
                    editOnProgress.value = false
                }
            }
        } else {
            console.error("Could not find drawing instance")
        }
    }
    /**
     * Sets the edit mode for the drawing.
     * If a drawing instance is available, it sets the mode to "select".
     * It also updates the state variables `drawOnProgress` and `editOnProgress`.
     * If no drawing instance is found, it logs an error message.
     */
    function editMode(): void {
        if (terraDraw.value !== undefined) {
            terraDraw.value.setMode("select");
            drawOnProgress.value = false
            editOnProgress.value = true
        } else {
            console.error("Could not find drawing instance")
        }
    }
    /**
     * Stops the draw mode.
     *
     * This function checks if the draw mode is enabled and stops it if it is. It also resets the draw and edit progress flags, as well as the layer name.
     *
     * @remarks
     * This function requires the `terraDraw` object to be defined. If the `terraDraw` object is not found, an error message will be logged to the console.
     *
     * @returns void
     */
    function stopDrawMode(): void {
        if (terraDraw.value !== undefined) {
            if (terraDraw.value.enabled) {
                terraDraw.value.setMode("static")
                terraDraw.value.stop()
            }
            drawOnProgress.value = false
            editOnProgress.value = false
            layerName.value = ""
        } else {
            console.error("Could not find drawing instance")
        }
    }
    /**
     * Gets a snapshot of the current drawn features from the TerraDraw instance.
     *
     * @remarks
     * This function retrieves the current features being drawn on the map.
     * If the `terraDraw` instance is not initialized, it returns an empty array
     * and logs an error to the console.
     *
     * @returns {Feature[]} An array of GeoJSON features drawn on the map.
     */
    function getSnapshot(): Feature[]{
        if (terraDraw.value !== undefined) {
            return terraDraw.value.getSnapshot()
        } else {
            console.error("Could not find drawing instance")
            return [];
        }
    }
    /**
     * Clears all drawn features from the TerraDraw instance.
     *
     * @remarks
     * This function requires the `terraDraw` instance to be defined.
     * It removes all currently drawn features from the map.
     * Logs an error if `terraDraw` is not initialized.
     *
     * @returns {void}
     */
    function clearSnapshot(): void {
        if (terraDraw.value !== undefined) {
            terraDraw.value.clear()
        } else {
            console.error("Could not find drawing instance")
        }
    }
    /**
     * Saves the current drawing as a layer.
     *
     * This function saves the current drawing as a layer on the map. It checks if there is a drawing available,
     * and if so, converts it to a GeoJSON snapshot. It then adds the GeoJSON data as a map data source and
     * creates a map layer using the provided layer parameters. If successful, it stops the draw mode.
     *
     * @remarks
     * This function requires the `terraDraw` and `mapStore` variables to be defined.
     *
     * @throws {Error} If there is an error adding the map data source or map layer.
     *
     * @returns {void}
     */
    function saveAsLayer(): void {
        if (terraDraw.value !== undefined) {
            const featureList = terraDraw.value.getSnapshot()
            const processedLayerName = layerName.value.trim().toLowerCase().replaceAll(" ", "_")
            const isOnMap = mapStore.layersOnMap.filter((layer) => layer.id === processedLayerName).length > 0
            if (!isOnMap) {
                if ((featureList.length > 0)) {
                    const geoJsonSnapshot: FeatureCollection = {
                        type: "FeatureCollection",
                        features: featureList
                    }
                    const geomType = mapStore.geometryConversion(featureList[0].geometry.type)
                    const isFilterLayer = featureList[0].geometry.type === "Polygon"
                    const sourceParams: GeoJSONSourceParams={
                        sourceType:"geojson",
                        identifier:processedLayerName,
                        isFilterLayer,
                        geoJSONSrc:geoJsonSnapshot
                    }
                    mapStore.addMapDataSource(sourceParams).then(() => {
                        const layerParams: LayerParams = {
                            sourceType:"geojson",
                            identifier:processedLayerName,
                            layerType:geomType,
                            geoJSONSrc:geoJsonSnapshot,
                            isFilterLayer,
                            isDrawnLayer:true,
                            displayName:layerName.value,
                        }
                        mapStore.addMapLayer(layerParams)
                            .then(() => {
                                stopDrawMode()
                            }).catch(error => {
                                mapStore.map.value.removeSource(processedLayerName)
                                toast.add({ severity: "error", summary: "Error", detail: error, life: 3000 });
                            })
                    }).catch((error) => {
                        toast.add({ severity: "error", summary: "Error", detail: error, life: 3000 });
                    })
                } else {
                    toast.add({ severity: "error", summary: "Error", detail: "There is no feature drawn on map!", life: 3000 });
                }
            } else {
                toast.add({ severity: "error", summary: "Error", detail: "Layer name already in use!", life: 3000 });
            }
        }
    }
    const layerName = ref("")

    return {
        // refactored
        externalAppOnProgress,
        terraDraw,
        initializeTerraDraw,
        destroyTerraDraw,
        changeMode,
        stopTerradraw,
        // old fn
        initDrawMode,
        editMode,
        stopDrawMode,
        saveAsLayer,
        getSnapshot,
        clearSnapshot,
        drawMode,
        drawTypes,
        drawOnProgress,
        editOnProgress,
        layerName
    }
})

/* eslint-disable */
if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useDrawStore, import.meta.hot))
}

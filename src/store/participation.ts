import { defineStore, acceptHMRUpdate } from "pinia";
import { ref } from "vue";
import { type FeatureCollection, type Feature } from "geojson";
import { type LayerParams, useMapStore } from "./map";
import { type Map } from "maplibre-gl";
import {
    TerraDraw,
    TerraDrawMapLibreGLAdapter,
    TerraDrawPointMode,
} from "terra-draw";
import { useDrawStore } from "./draw";
export interface CenterLocation {
    lng: number;
    lat: number;
}
export const useParticipationStore = defineStore("participation", () => {
    // Feedback Progression
    const feedbackOnProgress = ref<boolean>(false)
    const isLocationSelected = ref<boolean>(false)

    const mapStore = useMapStore();
    const drawTool = useDrawStore();
    const drawMode = ref("polygon");
    // DRAWN GEOMETRY
    const selectedDrawnGeometry = ref<Feature[]>([]);
    /**
	 * Adds an administrative feature to the selected administrative features list.
	 * @param item - The feature to add to the list.
	 * @returns A boolean indicating whether the feature was successfully added (`true`) or not (`false`).
	 */
    function addToSelectedDrawnGeometry(item: Feature): boolean {
        if (selectedDrawnGeometry.value.length > 0) {
            let alreadySelected = false;
            selectedDrawnGeometry.value.forEach((feature) => {
                if (feature.id === item.id) {
                    alreadySelected = true;
                }
            });
            if (alreadySelected) {
                throw new Error("Feature already selected");
            } else {
                selectedDrawnGeometry.value.push(item);
                updateSelectedAreasTempLayer();
                console.log(selectedDrawnGeometry.value);
                return true;
            }
        } else {
            selectedDrawnGeometry.value.push(item);
            updateSelectedAreasTempLayer();
            console.log(selectedDrawnGeometry.value);
        }
        return true;
    }
    /**
	 * Removes an administrative feature from the selected administrative features list.
	 * @param item - The feature to remove from the list.
	 * @returns A boolean indicating whether the feature was successfully removed (`true`) or not (`false`).
	 */
    function removeFromSelectedDrawnGeometry(item: Feature): boolean {
        const index = selectedDrawnGeometry.value.findIndex(
            (feature) => feature.id === item.id
        );
        if (index !== -1) {
            selectedDrawnGeometry.value.splice(index, 1);
            return true;
        } else {
            return false;
        }
    }
    function createSelectedGeometryGeoJSON(): FeatureCollection {
        const allSelectedFeatures: Feature[] = [];
        selectedDrawnGeometry.value.forEach((feature) => {
            allSelectedFeatures.push(feature);
        });
        const featureCollection: FeatureCollection = {
            type: "FeatureCollection",
            features: allSelectedFeatures,
        };
        return featureCollection;
    }
    function createSelectedAreasTempLayer(): void {
        const features: FeatureCollection = createSelectedGeometryGeoJSON();
        const layerStylePolygon: Record<string, any> = {
            paint: {
                "fill-color": "#FF0000",
                "fill-opacity": 0.2,
                "fill-outline-color": "#000000",
            },
        };
        const layerStyleLine: Record<string, any> = {
            paint: {
                "line-color": "#FF0000",
                "line-width": 2,
            },
        };
        const layerStylePoint: Record<string, any> = {
            paint: {
                "circle-color": "#FF0000",
                "circle-radius": 8,
            },
        };
        mapStore
            .addMapDataSource(
                "geojson",
                "selectedAreasTempLayer",
                false,
                undefined,
                undefined,
                features
            )
            .then(() => {
                const layerParamsPolygon: LayerParams = {
                    sourceType:"geojson",
                    identifier:"selectedAreasTempLayer-polygon",
                    layerType:"fill",
                    layerStyle:layerStylePolygon,
                    geoJSONSrc:features,
                    isFilterLayer:false,
                    sourceIdentifier:"selectedAreasTempLayer",
                    showOnLayerList:false
                }
                mapStore
                    .addMapLayer(layerParamsPolygon)
                    .then(() => {
                        mapStore.map.setFilter(
                            "selectedAreasTempLayer-polygon",
                            ["==", "$type", "Polygon"]
                        );
                    })
                    .catch((error) => {
                        console.error(error);
                    });
                const layerParamsLine: LayerParams = {
                    sourceType:"geojson",
                    identifier:"selectedAreasTempLayer-line",
                    layerType:"line",
                    layerStyle:layerStyleLine,
                    geoJSONSrc:features,
                    isFilterLayer:false,
                    sourceIdentifier:"selectedAreasTempLayer",
                    showOnLayerList:false
                }
                mapStore
                    .addMapLayer(layerParamsLine)
                    .then(() => {
                        mapStore.map.setFilter("selectedAreasTempLayer-line", [
                            "==",
                            "$type",
                            "LineString",
                        ]);
                    })
                    .catch((error) => {
                        console.error(error);
                    });
                const layerParamsPoint: LayerParams = {
                    sourceType:"geojson",
                    identifier:"selectedAreasTempLayer-point",
                    layerType:"circle",
                    layerStyle:layerStylePoint,
                    geoJSONSrc:features,
                    isFilterLayer:false,
                    sourceIdentifier:"selectedAreasTempLayer",
                    showOnLayerList:false
                }
                mapStore
                    .addMapLayer(layerParamsPoint)
                    .then(() => {
                        mapStore.map.setFilter("selectedAreasTempLayer-point", [
                            "==",
                            "$type",
                            "Point",
                        ]);
                    })
                    .catch((error) => {
                        console.error(error);
                    });
            })
            .catch((error) => {
                console.error(error);
            });
    }
    function updateSelectedAreasTempLayer(): void {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (!mapStore.map.getSource("selectedAreasTempLayer-polygon")) {
            createSelectedAreasTempLayer();
        }
        mapStore.map
            .getSource("selectedAreasTempLayer")
            .setData(createSelectedGeometryGeoJSON());
    }
    function deleteSelectedAreasTempLayer(): void {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (mapStore.map.getLayer("selectedAreasTempLayer-polygon")) {
            mapStore.map.removeLayer("selectedAreasTempLayer-polygon");
            mapStore.removeFromMapLayerList("selectedAreasTempLayer-polygon");
        }
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (mapStore.map.getLayer("selectedAreasTempLayer-line")) {
            mapStore.map.removeLayer("selectedAreasTempLayer-line");
            mapStore.removeFromMapLayerList("selectedAreasTempLayer-line");
        }
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (mapStore.map.getLayer("selectedAreasTempLayer-point")) {
            mapStore.map.removeLayer("selectedAreasTempLayer-point");
            mapStore.removeFromMapLayerList("selectedAreasTempLayer-point");
        }
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (mapStore.map.getSource("selectedAreasTempLayer")){
            mapStore.map.removeSource("selectedAreasTempLayer");
        }
        selectedDrawnGeometry.value = [];
    }
    // Feedback Location Selector
    const selectionOnProgress = ref<boolean>(false);
    const pointOfInterest = ref<CenterLocation>();
    const centerSelectDrawer = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({
            map: mapStore.map as unknown as Map,
        }),
        modes: [
            new TerraDrawPointMode({
                styles: {
                    pointColor: "#f20acf",
                    pointWidth: 12,
                },
            }),
        ],
    });
    function startCenterSelection(): void {
        selectionOnProgress.value = true;
        drawTool.stopDrawMode();
        centerSelectDrawer.start();
        centerSelectDrawer.setMode("point");
        centerSelectDrawer.on("change", centerSelector);
        const src: FeatureCollection = {
            type: "FeatureCollection",
            features: [],
        }
        const layerStylePoint: Record<string, any> = {
            paint: {
                "circle-color": "#f20acf",
                "circle-radius": 12,
            },
        };
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (!mapStore.map.getSource("centerSelectionLayer")) {
            mapStore.addMapDataSource("geojson", "centerSelectionLayer", false, undefined, undefined, src).then(()=>{
                const layerParams: LayerParams = {
                    sourceType:"geojson",
                    identifier:"centerSelectionLayer",
                    layerType:"circle",
                    layerStyle:layerStylePoint,
                    geoJSONSrc:src,
                    isFilterLayer:false,
                    showOnLayerList:false
                }
                mapStore.addMapLayer(layerParams).then(()=>{}).catch((error)=>{
                    console.error(error)
                })
            }).catch((error)=>{
                console.error(error)
            })
        }
    }
    function cancelCenterSelection(): void {
        console.log("canceling center selection");
        selectionOnProgress.value = false;
        if (centerSelectDrawer.enabled) {
            centerSelectDrawer.setMode("static");
            centerSelectDrawer.off("change", centerSelector);
            centerSelectDrawer.stop();
        }
        mapStore.map.getSource("centerSelectionLayer").setData({
            type: "FeatureCollection",
            features: [],
        });
        pointOfInterest.value = undefined;
    }
    function finishCenterSelection(): void {
        selectionOnProgress.value = false;
        centerSelectDrawer.setMode("static");
        centerSelectDrawer.off("change", centerSelector);
        const features = centerSelectDrawer.getSnapshot()[0]
        const src: FeatureCollection = {
            type: "FeatureCollection",
            features: [features],
        }
        mapStore.map.getSource("centerSelectionLayer").setData(src)
        centerSelectDrawer.stop();
    }
    function centerSelector(): void {
        const snap = centerSelectDrawer.getSnapshot();
        if (snap.length > 1) {
            centerSelectDrawer.removeFeatures([
                snap[0].id !== undefined ? String(snap[0].id) : "",
            ]);
        }
        pointOfInterest.value = {
            ...{
                lng: snap[0].geometry.coordinates[0] as number,
                lat: snap[0].geometry.coordinates[1] as number,
            },
        };
        isLocationSelected.value = true
    }

    // reset selected areas
    function resetSelectedAreas(): void {
        selectedDrawnGeometry.value = [];
        updateSelectedAreasTempLayer();
    }
    return {
        feedbackOnProgress,
        isLocationSelected,
        selectionOnProgress,
        centerSelectDrawer,
        pointOfInterest,
        startCenterSelection,
        cancelCenterSelection,
        finishCenterSelection,
        selectedDrawnGeometry,
        addToSelectedDrawnGeometry,
        removeFromSelectedDrawnGeometry,
        createSelectedGeometryGeoJSON,
        createSelectedAreasTempLayer,
        updateSelectedAreasTempLayer,
        deleteSelectedAreasTempLayer,
        resetSelectedAreas,
        drawMode,
    };
});

/* eslint-disable */
if (import.meta.hot) {
	import.meta.hot.accept(
		acceptHMRUpdate(useParticipationStore, import.meta.hot)
	);
}

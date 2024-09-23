import { defineStore, acceptHMRUpdate } from "pinia";
import { ref } from "vue";
import { type FeatureCollection, type Feature, type Point } from "geojson";
import { type GeoJSONSourceParams, type LayerParams, useMapStore } from "./map";
import { type Map } from "maplibre-gl";
import { type DrawMode, useDrawStore } from "./draw";
export interface CenterLocation {
    lng: number;
    lat: number;
}
export type FeedbackStep = "idle" | "location" | "feedback" | "rating";
export interface CampaignListItem {
    "campaing_title": string,
    "campaign_url_name": string,
    "campaing_short_description": string,
    "geoserver_layers": string[],
    "geoserver_workspace": string,
    "start_date": string,
    "end_date": string,
    "total_comment_count": number,
}
export interface CampaignDetail {
    campaign_id: number;
    campaign_name: string;
    campaign_url_name: string;
    allow_drawings: boolean;
    rate_enabled: boolean;
    form_enabled: boolean;
    campaing_title: string;
    campaing_detailed_description: string;
    start_date: string; // ISO 8601 date string
    geoserver_workspace: string;
    geoserver_layers: string[];
    end_date: string; // ISO 8601 date string
    category_type: number;
    categories: string[];
}
/**
 * @todo Find better naming for post interfaces
 */
// Interface for POST1: Only Rating
export interface PostRating {
    type: "POST1";
    rating: {
        campaign_id: number;
        rating: number;
    };
}
// Interface for POST2: Only Feedback
export interface PostFeedback {
    type: "POST2";
    feedback: {
        campaign_id: number;
        feedback_location: Feature; // Assuming Feature is defined elsewhere
        feedback_text: string;
        feedback_category: string;
        feedback_geometry?: FeatureCollection; // Optional, assuming FeatureCollection is defined elsewhere
    };
}
// Interface for POST3: Feedback + Rating
export interface PostFeedbackRating {
    type: "POST3";
    rating: {
        campaign_id: number;
        rating: number;
    };
    feedback: {
        campaign_id: number;
        feedback_location: Feature; // Assuming Feature is defined elsewhere
        feedback_text: string;
        feedback_category: string;
        feedback_geometry?: FeatureCollection; // Optional, assuming FeatureCollection is defined elsewhere
    };
}
export const useParticipationStore = defineStore("participation", () => {
    // Feedback Progression
    /**
     * Flag to indicate whether the feedback process is currently in progress.
     */
    const feedbackOnProgress = ref<boolean>(false)
    /**
     * The current step of the feedback process, can be "idle", "location", "feedback", or "rating".
     */
    const feedbackStep = ref<FeedbackStep>("location")
    /**
     * Flag indicating whether a location has been selected during the feedback process.
     */
    const isLocationSelected = ref<boolean>(false)
    /**
     * Flag indicating whether the campaign has been rated.
     */
    const isCampaignRated = ref<boolean>(false)

    const mapStore = useMapStore();
    const drawTool = useDrawStore();
    /**
     * Current drawing mode, such as "polygon", which determines how the drawing tool behaves.
     */
    const drawMode = ref<DrawMode>("polygon");
    // DRAWN GEOMETRY
    const selectedDrawnGeometry = ref<Feature[]>([]);
    /**
     * Adds a drawn feature to the selected drawn geometry list.
     * If the feature is already selected, it throws an error.
     * @param {Feature} item - The feature to add.
     * @returns {boolean} - `true` if the feature is successfully added.
     * @throws {Error} - Throws if the feature is already selected.
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
     * Removes a drawn feature from the selected drawn geometry list.
     * @param {Feature} item - The feature to remove.
     * @returns {boolean} - `true` if the feature is successfully removed.
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
    /**
     * Creates a GeoJSON FeatureCollection from the selected drawn geometry.
     * @returns {FeatureCollection} - The generated GeoJSON feature collection.
     */
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
    /**
     * Creates a temporary layer on the map to visualize the selected areas.
     * This function adds polygon, line, and point layers based on the selected geometry.
     */
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
        const tempAreaSourceParams: GeoJSONSourceParams={
            sourceType:"geojson",
            identifier:"selectedAreasTempLayer",
            isFilterLayer:false,
            geoJSONSrc:features
        }
        mapStore
            .addMapDataSource(tempAreaSourceParams)
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
    /**
     * Updates the temporary layer on the map with the newly selected areas.
     */
    function updateSelectedAreasTempLayer(): void {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (!mapStore.map.getSource("selectedAreasTempLayer-polygon")) {
            createSelectedAreasTempLayer();
        }
        mapStore.map
            .getSource("selectedAreasTempLayer")
            .setData(createSelectedGeometryGeoJSON());
    }
    /**
     * Deletes the temporary layer that displays the selected areas from the map.
     * It removes all layers associated with the selected geometry and clears the selected features.
     */
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
    const locationSelectionOnProgress = ref<boolean>(false);
    const pointOfInterest = ref<CenterLocation>();
    /**
     * Starts the center selection process on the map.
     * Initializes TerraDraw for point selection and creates a temporary layer for visualizing the selection.
     */
    function startCenterSelection(): void {
        try {
            if (drawTool.terraDraw === undefined) {
                const terra = drawTool.initializeTerraDraw(mapStore.map as Map, ["point", "linestring", "polygon", "select"])
                drawTool.terraDraw = terra
            }
            feedbackStep.value = "location";
            locationSelectionOnProgress.value = true;
            drawTool.externalAppOnProgress = true;
            drawTool.stopDrawMode();
            drawTool.initDrawMode();
            drawTool.changeMode("point");
            drawTool.terraDraw.on("change", centerSelector);
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
                const centerSelectionSourceParams: GeoJSONSourceParams = {
                    sourceType:"geojson",
                    identifier:"centerSelectionLayer",
                    isFilterLayer:false,
                    geoJSONSrc:src
                }
                mapStore.addMapDataSource(centerSelectionSourceParams).then(()=>{
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
        } catch (error) {
            console.error(error);
        }
    }
    /**
     * Cancels the center selection process.
     * This function stops the drawing mode, clears the selected center point, and resets the selection process.
     */
    function cancelCenterSelection(): void {
        console.log("canceling center selection");
        locationSelectionOnProgress.value = false;
        drawTool.externalAppOnProgress = false;
        if (drawTool.terraDraw!.enabled) {
            drawTool.changeMode("static");
            drawTool.terraDraw!.off("change", centerSelector);
            drawTool.stopTerradraw();
        }
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (mapStore.map.getSource("centerSelectionLayer")){
            mapStore.map.getSource("centerSelectionLayer").setData({
                type: "FeatureCollection",
                features: [],
            });
        }
        pointOfInterest.value = undefined;
    }
    /**
     * Finishes the center selection process and proceeds to the next step based on the campaign settings.
     * If rating is enabled in the campaign, the feedback step moves to "rating"; otherwise, it moves to "feedback".
     * The selected center point is finalized and saved in the temporary layer.
     *
     * @param {CampaignDetail} campaign - The campaign details, including settings for rating and feedback.
     */
    function finishCenterSelection(campaign: CampaignDetail): void {
        if (campaign.rate_enabled) {
            feedbackStep.value = "rating";
        } else {
            feedbackStep.value = "feedback";
        }
        locationSelectionOnProgress.value = false;
        drawTool.externalAppOnProgress = false;
        drawTool.changeMode("static");
        drawTool.terraDraw!.off("change", centerSelector);
        const features = drawTool.getSnapshot()[0]
        const src: FeatureCollection = {
            type: "FeatureCollection",
            features: [features],
        }
        mapStore.map.getSource("centerSelectionLayer").setData(src)
        drawTool.stopTerradraw();
    }
    /**
     * Handles the center point selection process by monitoring changes in TerraDraw.
     * Ensures that only one center point is selected at a time by removing any extra points from the map.
     * Updates the `pointOfInterest` value with the selected location's coordinates.
     */
    function centerSelector(): void {
        const snap = drawTool.getSnapshot();
        if (snap.length > 1) {
            drawTool.terraDraw!.removeFeatures([
                snap[0].id !== undefined ? String(snap[0].id) : "",
            ]);
        }
        pointOfInterest.value = {
            ...{
                lng: (snap[0].geometry as Point).coordinates[0],
                lat: (snap[0].geometry as Point).coordinates[1],
            },
        };
        isLocationSelected.value = true
    }

    /**
     * Resets the selected areas by clearing the `selectedDrawnGeometry` array and updating the temporary layer on the map.
     * This effectively clears any previously selected drawn features from the map.
     */
    function resetSelectedAreas(): void {
        selectedDrawnGeometry.value = [];
        updateSelectedAreasTempLayer();
    }
    /**
     * CAMPAIGN OPERATIONS
     *  This part contains operations related to campaigns. Such as fetching active campaigns and campaign details.
     */
    const activeCampaigns = ref<CampaignListItem[]>([]);
    /**
     * Retrieves the list of active campaigns.
     * @returns A promise that resolves to an array of CampaignListItem objects.
     * @throws An error if there is an issue fetching the campaigns.
     */
    async function getActiveCampaigns(): Promise<CampaignListItem[]> {
        const url = `${import.meta.env.VITE_GEONODE_REST_URL}/v2/cpt/campaigns`;
        try {
            const response = await fetch(url, {
                method: "GET"
            });
            return await response.json();
        } catch (error) {
            throw new Error(`Error fetching campaigns: ${String(error)}`);
        }
    }
    /**
     * Populate campaign list
     */
    function populateCampaignList(): void {
        getActiveCampaigns().then((campaigns) => {
            activeCampaigns.value = campaigns;
        }).catch((error) => {
            console.error(error);
        });
    }
    /**
     * Retrieves the campaign detail from the specified URL.
     *
     * @param campaignURL - The URL of the campaign (campaign_url_name from campaign list item).
     * @returns A promise that resolves to the campaign detail.
     * @throws An error if there is an issue fetching the campaign detail.
     */
    async function getCampaignDetail(campaignURL: string): Promise<CampaignDetail> {
        const url = `${import.meta.env.VITE_GEONODE_REST_URL}/v2/cpt/campaigns/${campaignURL}`;
        try {
            const response = await fetch(url, {
                method: "GET"
            });
            return await response.json();
        } catch (error) {
            throw new Error(`Error fetching campaign detail: ${String(error)}`);
        }
    }
    async function sendFeedback(feed: PostRating|PostFeedback|PostFeedbackRating): Promise<void> {
        feedbackOnProgress.value = false;
        locationSelectionOnProgress.value = false;
        drawTool.externalAppOnProgress = false;
        const url = `${import.meta.env.VITE_GEONODE_REST_URL}/v2/cpt/feedback/`;
        const feedback = await fetch(url, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify(feed)
        });
        if (!feedback.ok) {
            throw new Error("Error sending feedback");
        }
    }
    return {
        feedbackOnProgress,
        feedbackStep,
        sendFeedback,
        isLocationSelected,
        isCampaignRated,
        locationSelectionOnProgress,
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
        getCampaignDetail,
        getActiveCampaigns,
        activeCampaigns,
        populateCampaignList
    };
});

/* eslint-disable */
if (import.meta.hot) {
	import.meta.hot.accept(
		acceptHMRUpdate(useParticipationStore, import.meta.hot)
	);
}

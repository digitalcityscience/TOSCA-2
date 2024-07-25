<template>
	<Card>
		<template #title>
			<h4 class="font-bold flex items-center">Give Feedback <Button severity="danger" text @click="resetFeedbackCycle">Reset</Button></h4>
		</template>
		<template #content>
			<div v-if="participation.feedbackOnProgress" class="w-full relative">
                <div class="pt-2 w-full">
                    <p class="text-sm font-light mb-1">Choose the location where you want to give your feedback.</p>
                    <Button v-if="!participation.selectionOnProgress" size="small"
                        @click="participation.startCenterSelection">
                        Start selection
                    </Button>
                    <Button v-else :disabled="!participation.isLocationSelected" size="small" @click="selectCenter">
                        Finish selection
                    </Button>
                </div>
                <div class="w-full relative" v-if="participation.isLocationSelected && !participation.selectionOnProgress">
                    <div class="pt-3 w-full flex flex-col">
                        <p class="text-sm font-light mb-1">Do you have a suggestion? Describe your comment.</p>
                        <Textarea class="w-full" v-model="text" rows="5"></Textarea>
                    </div>
                    <p class="text-sm font-light mb-1">Choose the category of your suggestion if applicable.</p>
                    <div class="pt-3 w-full flex flex-col relative">
                        <Dropdown v-model="category" :options="categories" class="max-w-full relative" :virtual-scroller-options="{ itemSize: 35 }"></Dropdown>
                    </div>
                    <div class="pt-3 w-full">
                        <ParticipationDraw></ParticipationDraw>
                    </div>
                    <div class="w-full px-1 pt-3 flex">
                        <Button class="grow" size="small" @click="sendFeedback">Send Feedback</Button>
                    </div>
                </div>
            </div>
            <div v-else>
                <p class="pb-2">You can view all the active proposals in the map, please click on each project to view information about it. Click on 'Start Submission' to give your feedback.                </p>
                <Button size="small" @click="participation.feedbackOnProgress = true">Start Submission</Button>
            </div>
		</template>
	</Card>
</template>

<script setup lang="ts">
import Button from "primevue/button"
import Textarea from "primevue/textarea"
import Dropdown from "primevue/dropdown"
import Card from "primevue/card"
import ParticipationDraw from "./ParticipationDraw.vue"
import { ref } from "vue";
import { useParticipationStore, type CenterLocation } from "@store/participation";
import { type Feature, type FeatureCollection } from "geojson";
import { type GeoJSONSourceParams, type LayerParams, useMapStore } from "@store/map";

const mapStore = useMapStore()
const participation = useParticipationStore()

const text = ref<string>("");
const category = ref<string>("General");
const location = ref<CenterLocation | undefined>();
const categories = [
    "General",
    "Suggest new land use category",
    "Suggest new route",
    "Reduce width of street",
    "Increase width of street",
    "Request to construct a new street",
    "Suggest new infrastructure",
    "I feel safe here",
    "I feel unsafe here"
]

function resetFeedbackCycle(): void {
    participation.feedbackOnProgress = false
    participation.isLocationSelected = false
    location.value = undefined
    category.value = "General"
    text.value = ""
    console.log("text:", text.value)
    console.log("cat:", category.value)
    console.log("loc:", location.value)
    participation.deleteSelectedAreasTempLayer()
    participation.cancelCenterSelection()
}
function selectCenter(): void {
    participation.finishCenterSelection()
    participation.isLocationSelected = true
    location.value = participation.pointOfInterest
}

function createFeedbackLayer(): void{
    const layerStylePoint: Record<string, any> = {
        paint: {
            "circle-color": "#5603fc",
            "circle-radius": 8,
        },
    };
    const src: FeatureCollection = {
        type:"FeatureCollection",
        features:[]
    }
    const sourceParams: GeoJSONSourceParams={
        sourceType:"geojson",
        identifier:"feedbackLayer",
        isFilterLayer:false,
        geoJSONSrc:src
    }
    mapStore.addMapDataSource(sourceParams).then(()=>{
        const layerParams: LayerParams = {
            sourceType:"geojson",
            identifier:"feedbackLayer",
            layerType:"circle",
            layerStyle:layerStylePoint,
            geoJSONSrc:src,
            isFilterLayer:false,
            displayName:"Feedbacks",
        }
        mapStore.addMapLayer(layerParams).then(()=>{}).catch((error)=>{
            console.error(error)
        })
    }).catch((error)=>{
        console.error(error)
    })
}
function sendFeedback(): void{
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!mapStore.map.getSource("feedbackLayer")) {
        createFeedbackLayer()
    }
    const geometry: FeatureCollection = {
        type:"FeatureCollection",
        features:[]
    }
    if (participation.selectedDrawnGeometry.length>0){
        geometry.features=participation.selectedDrawnGeometry
    }
    if (text.value.length>1 && location.value !== undefined) {
        const pointFeedback: Feature = {
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates: [location.value.lng, location.value.lat]
            },
            properties: {
                text: text.value,
                category: category.value
            }
        };
        const feedbackSource: FeatureCollection = mapStore.map.getSource("feedbackLayer")._data
        console.log(feedbackSource)
        feedbackSource.features.push(pointFeedback)
        mapStore.map.getSource("feedbackLayer").setData(feedbackSource)
        resetFeedbackCycle()
        console.log("feedback", pointFeedback)
    }
}
</script>

<style scoped></style>

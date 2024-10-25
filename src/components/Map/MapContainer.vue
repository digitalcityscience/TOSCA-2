<template>
  <div id="map">
  </div>
</template>

<script setup lang="ts">
import maplibre, { type MapMouseEvent, type Map } from "maplibre-gl"
import { h, nextTick, onMounted, ref, render } from "vue";
import { useMapStore } from "@store/map";
import MapAttributeDialog from "./MapAttributeDialog.vue"
import { useDrawStore } from "@store/draw";
import { useParticipationStore } from "@store/participation";
import { BaseMapControl, type BaseMapControlOptions } from "@helpers/baseMapControl";

const mapStore = useMapStore()
const clickedLayers = ref()
onMounted(() => {
    const lng = Number(import.meta.env.VITE_MAP_START_LNG) ?? 9.993163
    const lat = Number(import.meta.env.VITE_MAP_START_LAT) ?? 53.552123
    const zoom = Number.isNaN(Number(import.meta.env.VITE_MAP_START_ZOOM)) ? 15 : Number(import.meta.env.VITE_MAP_START_ZOOM);
    mapStore.map = new maplibre.Map({
        container: "map",
        style: {
            version: 8,
            sources: {},
            layers: []
        },
        center: [lng, lat], // starting position [lng, lat]
        zoom // starting zoom
    })
    if (mapStore.map !== undefined) {
        /**
         * Initialize TerraDraw after the map is loaded. This is necessary to ensure that the map object is available.
         */
        try {
            const terraDraw = useDrawStore().initializeTerraDraw(mapStore.map as Map, ["point", "linestring", "polygon", "select"]);
            console.log(terraDraw);
            useDrawStore().terraDraw = terraDraw;
        } catch (error) {
            console.error("Failed to initialize TerraDraw:", error);
        }
        /**
         * Add a click event listener to the map to show the attribute dialog for the clicked feature.
         * Ignore the click event if the draw or edit mode is active. This is necessary to avoid conflicts with the draw and edit tools.
         * The attribute dialog is only shown if the clicked feature is part of a layer that is currently displayed on the map.
         * The attribute dialog is populated with the attributes of the clicked feature. Features are grouped by layer.
         */
        mapStore.map.on("click", (e: MapMouseEvent)=>{
            if (!(useDrawStore().drawOnProgress || useDrawStore().editOnProgress || useParticipationStore().locationSelectionOnProgress)) {
                const clickedFeatures: any[] = mapStore.map.queryRenderedFeatures(e.point)
                if (clickedFeatures.length > 0) {
                    const matchedFeatures = clickedFeatures.filter((clickedLayer)=>{ return mapStore.layersOnMap.some((l)=>{ return l.source === clickedLayer.source }) })
                    if (matchedFeatures.length > 0){
                        const uniqueLayers = new Set();
                        const reducedFeatures: any[] = [];
                        for (const feature of matchedFeatures) {
                            if (!uniqueLayers.has(feature.sourceLayer)) {
                                uniqueLayers.add(feature.sourceLayer);
                                reducedFeatures.push(feature);
                            }
                        }
                        console.log("matched features", matchedFeatures)
                        console.log(e)
                        clickedLayers.value = reducedFeatures
                        console.log("clicked layers", clickedLayers.value)
                        new maplibre.Popup({ maxWidth:"none" })
                            .setLngLat(e.lngLat)
                            .setHTML("<div id='map-popup-content'></div>")
                            .addTo(mapStore.map as Map)
                        nextTick(() => {
                            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                            const popupComp = h(MapAttributeDialog, {
                                features: [...reducedFeatures],
                            });
                            render(popupComp, document.getElementById("map-popup-content")!);
                        }).then(()=>{}, ()=>{})
                    }
                }
            }
        })
    }
    // Add zoom controls to the map.
    const zoomControl = new maplibre.NavigationControl()
    mapStore.map.addControl(zoomControl, "bottom-right");

    const options: BaseMapControlOptions = {
        maps:[
            {
                id:"streets-v2",
                title:"Streets",
                tiles: [
                    `https://api.maptiler.com/maps/${import.meta.env.VITE_MAPTILER_API_MAP_ID}/{z}/{x}/{y}.png?key=${import.meta.env.VITE_MAPTILER_API_KEY}`
                ]
            },
            {
                id:"satellite",
                title:"Satellite",
                tiles: [
                    `https://api.maptiler.com/maps/satellite/{z}/{x}/{y}.jpg?key=${import.meta.env.VITE_MAPTILER_API_KEY}`
                ]
            }
        ],
        initialBasemap: "satellite"
    }
    mapStore.map.addControl(new BaseMapControl(options), "bottom-left");
})
</script>

<style scoped>
#map {
  width: 100%;
  height: 100%;
}
</style>

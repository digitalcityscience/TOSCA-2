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

const mapStore = useMapStore()
const clickedLayers = ref()
onMounted(() => {
    const lng = Number(import.meta.env.VITE_MAP_START_LNG) ?? 9.993163
    const lat = Number(import.meta.env.VITE_MAP_START_LAT) ?? 53.552123
    mapStore.map = new maplibre.Map({
        container: "map",
        style: `https://api.maptiler.com/maps/${import.meta.env.VITE_MAPTILER_API_MAP_ID}/style.json?key=${import.meta.env.VITE_MAPTILER_API_KEY}`, // stylesheet location
        center: [lng, lat], // starting position [lng, lat]
        zoom: 15 // starting zoom
    })
    if (mapStore.map !== undefined) {
        mapStore.map.on("click", (e: MapMouseEvent)=>{
            if (!(useDrawStore().drawOnProgress || useDrawStore().editOnProgress || useParticipationStore().selectionOnProgress)) {
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
    // Add zoom and rotation controls to the map.
    const zoomControl = new maplibre.NavigationControl()
    mapStore.map.addControl(zoomControl, "top-right");
})
</script>

<style scoped>
#map {
  width: 100%;
  height: 100%;
}
</style>

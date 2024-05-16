<template>
  <div id="map">
  </div>
</template>

<script setup lang="ts">
import maplibre from "maplibre-gl"
import { onMounted } from "vue";
import { useMapStore } from "../store/map";

const mapStore = useMapStore()
onMounted(() => {
    const lng = Number(import.meta.env.VITE_MAP_START_LNG) ?? 9.993163
    const lat = Number(import.meta.env.VITE_MAP_START_LAT) ?? 53.552123
    mapStore.map = new maplibre.Map({
        container: "map",
        style: `https://api.maptiler.com/maps/${import.meta.env.VITE_MAPTILER_API_MAP_ID}/style.json?key=${import.meta.env.VITE_MAPTILER_API_KEY}`, // stylesheet location
        center: [lng, lat], // starting position [lng, lat]
        zoom: 15 // starting zoom
    })
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

<template>
  <div id="map">
  </div>
</template>

<script setup lang="ts">
import maplibre from 'maplibre-gl'
import { onMounted } from 'vue';
onMounted(()=>{
  new maplibre.Map({
    container: 'map',
    style: `https://api.maptiler.com/maps/a2eb63ba-7d0e-4b25-9cfc-9ef74d786ec4/style.json?key=${import.meta.env.VITE_MAPTILER_API_KEY}`, // stylesheet location
    center: [9.993163, 53.552123], // starting position [lng, lat]
    zoom: 15 // starting zoom
  })
})
</script>

<style scoped>
#map{
  width: 100%;
  height: 100%;
}
</style>
<template>
    <BaseSidebarComponent id="maplayerListing" position="right">
        <div class="maplayers maplayers-list" v-if="map.layersOnMap.length > 0">
            <MapLayerListingItem v-for="(layer, index) in map.layersOnMap" :key="index" :layer="layer">
            </MapLayerListingItem>
        </div>
        <div class="maplayers maplayers-empty" v-else>
            <p>There is no layer on map</p>
        </div>
    </BaseSidebarComponent>
</template>

<script setup lang="ts">
//components
import BaseSidebarComponent from './BaseSidebarComponent.vue';
import MapLayerListingItem from './MapLayerListingItem.vue';
//JS imports
import { useMapStore } from '../store/map';

const map = useMapStore()

</script>

<style scoped></style>
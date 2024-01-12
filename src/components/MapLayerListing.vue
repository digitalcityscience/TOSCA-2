<template>
    <BaseSidebarComponent :id="sidebarID" position="right">
        <div class="maplayers maplayers-list" v-if="mapStore.layersOnMap.length > 0">
            <MapLayerListingItem v-for="(layer, index) in mapStore.layersOnMap" :key="index" :layer="layer">
            </MapLayerListingItem>
        </div>
        <div class="maplayers maplayers-empty" v-else>
            <p>There is no layer on map</p>
        </div>
    </BaseSidebarComponent>
</template>

<script setup lang="ts">
// components
import BaseSidebarComponent from "./BaseSidebarComponent.vue";
import MapLayerListingItem from "./MapLayerListingItem.vue";
// JS imports
import { useMapStore } from "../store/map";
import { SidebarControl } from "../core/helpers/sidebarControl"

const mapStore = useMapStore()

const sidebarID = "maplayerListing"

const sidebarControl = new SidebarControl("", sidebarID, document.createElement("div"), "mdi mdi-layers-outline")
mapStore.map.addControl(sidebarControl, "top-right")
</script>

<style scoped></style>

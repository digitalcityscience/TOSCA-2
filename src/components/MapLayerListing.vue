<template>
    <BaseSidebarComponent :id="sidebarID" position="right">
        <div class="w-full" v-if="mapStore.layersOnMap.length > 0">
            <MapLayerListingItem v-for="(layer, index) in mapStore.layersOnMap" :key="index" :layer="layer">
            </MapLayerListingItem>
        </div>
        <div class="w-full" v-else>
            <InlineMessage class="w-full" severity="info">There is no layer on map</InlineMessage>
        </div>
    </BaseSidebarComponent>
</template>

<script setup lang="ts">
import InlineMessage from "primevue/inlinemessage";
// components
import BaseSidebarComponent from "./BaseSidebarComponent.vue";
import MapLayerListingItem from "./MapLayerListingItem.vue";
// JS imports
import { useMapStore } from "../store/map";
import { SidebarControl } from "../core/helpers/sidebarControl"

const mapStore = useMapStore()

const sidebarID = "maplayerListing"

const sidebarControl = new SidebarControl("", sidebarID, document.createElement("div"), "pi pi-tags")
mapStore.map.addControl(sidebarControl, "top-right")
</script>

<style scoped></style>

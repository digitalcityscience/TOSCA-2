<template>
    <BaseSidebarComponent :id="sidebarID" position="right" :collapsed="true">
        <template #header>
            <p>Layers</p>
        </template>
        <div class="w-full" v-if="mapStore.layersOnMap.length > 0">
            <div v-for="(layer, index) in mapStore.layersOnMap" :key="index">
                <MapLayerListingItem v-if="layer.showOnLayerList !== false" :layer="layer">
                </MapLayerListingItem>
            </div>
        </div>
        <div class="w-full" v-else>
            <InlineMessage class="w-full" severity="info">There is no layer on map</InlineMessage>
        </div>
    </BaseSidebarComponent>
</template>

<script setup lang="ts">
import InlineMessage from "primevue/inlinemessage";
// components
import BaseSidebarComponent from "../../Base/BaseSidebarComponent.vue";
import MapLayerListingItem from "./MapLayerListingItem.vue";
// JS imports
import { useMapStore } from "@store/map";
import { SidebarControl } from "@helpers/sidebarControl"

const mapStore = useMapStore()

const sidebarID = "maplayerListing"
const iconElement = document.createElement("span")
iconElement.classList.add("material-icons-outlined")
iconElement.textContent = "layers"
const sidebarControl = new SidebarControl("", sidebarID, document.createElement("div"), iconElement)
mapStore.map.addControl(sidebarControl, "top-right")
</script>

<style scoped></style>

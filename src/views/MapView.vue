<template>
    <div class="mapview">
        <MapSideFrame side="left"></MapSideFrame>
        <div class="mapview-map">
            <MapContainer></MapContainer>
        </div>
        <MapSideFrame side="right"></MapSideFrame>
        <WorkspaceListing :workspaces="geoserverStore.workspaceList"></WorkspaceListing>
        <FloodSidebar></FloodSidebar>
        <GQGeostory></GQGeostory>
        <MapLayerListing></MapLayerListing>
        <ToolboxSidebar></ToolboxSidebar>
    </div>
</template>

<script setup lang="ts">

import { defineAsyncComponent, onMounted } from "vue";
import { useGeoserverStore } from "../store/geoserver";
import MapContainer from "@components/Map/MapContainer.vue";
import MapSideFrame from "@components/Map/MapSideFrame.vue";
import { reportDeveloperError } from "@helpers/userFacingError";
const WorkspaceListing = defineAsyncComponent(async () => await import("@components/Data/Workspace/WorkspaceListing.vue"));
const MapLayerListing = defineAsyncComponent(async () => await import("@components/Map/Layer/MapLayerListing.vue"));
const ToolboxSidebar = defineAsyncComponent(async () => await import("@components/Map/ToolboxSidebar.vue"))
const FloodSidebar = defineAsyncComponent(async () => await import("@components/Geostories/FloodSidebar.vue"))
const GQGeostory = defineAsyncComponent(async () => await import("@components/Geostories/GQGeostory.vue"))
const geoserverStore = useGeoserverStore()
onMounted(()=>{
    geoserverStore.getWorkspaceList().catch((error) => {
        reportDeveloperError("Loading catalog providers and workspaces", error)
    })
})
</script>

<style scoped>
.mapview{
    width:100%;
    height:100%;
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-columns: var(--tosca-map-frame-width) minmax(0, 1fr) var(--tosca-map-frame-width);
    grid-template-rows: minmax(0, 1fr);
}
.mapview-map {
    min-width: 0;
    min-height: 0;
    width: 100%;
    height: 100%;
}
</style>

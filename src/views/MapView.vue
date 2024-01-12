<template>
    <div class="mapview">
        <WorkspaceListing :workspaces="geoserverStore.workspaceList"></WorkspaceListing>
        <MapLayerListing></MapLayerListing>
        <MapContainer></MapContainer>
    </div>
</template>

<script setup lang="ts">

import { defineAsyncComponent, onMounted } from "vue";
import { useGeoserverStore } from "../store/geoserver";

const MapContainer = defineAsyncComponent(async () => await import("../components/MapContainer.vue"));
const WorkspaceListing = defineAsyncComponent(async () => await import("../components/WorkspaceListing.vue"));
const MapLayerListing = defineAsyncComponent(async () => await import("../components/MapLayerListing.vue"));

const geoserverStore = useGeoserverStore()
onMounted(()=>{
    geoserverStore.getWorkspaceList().then((data)=>{
        geoserverStore.workspaceList = data.workspaces.workspace
        console.log(data)
    }).catch((error)=>{ console.error(error) })
})
</script>

<style scoped>
.mapview{
    width:100%;
    height:100%;
}
</style>

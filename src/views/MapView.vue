<template>
    <div class="mapview">
        <MapContainer></MapContainer>
        <WorkspaceListing :workspaces="geoserverStore.workspaceList"></WorkspaceListing>
        <MapLayerListing></MapLayerListing>
        <DrawContainer></DrawContainer>
        <Toast/>
    </div>
</template>

<script setup lang="ts">

import { defineAsyncComponent, onMounted } from "vue";
import { useGeoserverStore } from "../store/geoserver";
import MapContainer from "../components/MapContainer.vue";
const WorkspaceListing = defineAsyncComponent(async () => await import("../components/WorkspaceListing.vue"));
const MapLayerListing = defineAsyncComponent(async () => await import("../components/MapLayerListing.vue"));
const DrawContainer = defineAsyncComponent(async () => await import("../components/DrawContainer.vue"))
const Toast = defineAsyncComponent(async () => await import("primevue/toast"))
const geoserverStore = useGeoserverStore()
onMounted(()=>{
    geoserverStore.getWorkspaceList().then((data)=>{
        geoserverStore.workspaceList = data.workspaces.workspace
    }).catch((error)=>{ console.error(error) })
})
</script>

<style scoped>
.mapview{
    width:100%;
    height:100%;
}
</style>

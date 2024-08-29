<template>
    <div class="mapview">
        <MapContainer></MapContainer>
        <WorkspaceListing :workspaces="geoserverStore.workspaceList"></WorkspaceListing>
        <MapLayerListing></MapLayerListing>
        <DrawContainer></DrawContainer>
        <BufferContainer></BufferContainer>
        <Toast/>
    </div>
</template>

<script setup lang="ts">

import { defineAsyncComponent, onMounted } from "vue";
import { useGeoserverStore } from "../store/geoserver";
import MapContainer from "@components/Map/MapContainer.vue";
const WorkspaceListing = defineAsyncComponent(async () => await import("@components/Data/Workspace/WorkspaceListing.vue"));
const MapLayerListing = defineAsyncComponent(async () => await import("@components/Map/Layer/MapLayerListing.vue"));
const DrawContainer = defineAsyncComponent(async () => await import("@components/Map/Layer/Draw/DrawContainer.vue"))
const BufferContainer = defineAsyncComponent(async () => await import("@components/Map/Buffer/BufferContainer.vue"))
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

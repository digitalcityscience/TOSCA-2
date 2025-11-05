<template>
    <div class="mapview">
        <MapContainer></MapContainer>
        <WorkspaceListing :workspaces="geoserverStore.workspaceList"></WorkspaceListing>
        <FloodSidebar></FloodSidebar>
        <GQGeostory></GQGeostory>
        <MapLayerListing></MapLayerListing>
        <DrawContainer></DrawContainer>
        <BufferContainer></BufferContainer>
        <Toast position="bottom-right"></Toast>
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
const FloodSidebar = defineAsyncComponent(async () => await import("@components/Geostories/FloodSidebar.vue"))
const GQGeostory = defineAsyncComponent(async () => await import("@components/Geostories/GQGeostory.vue"))
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
    position: relative;
    width:100%;
    height:100%;
}
.mapview.has-comparison{
    pointer-events:auto;
}
.mapview .comparison-map{
    position:absolute;
    inset:0;
    pointer-events:auto;
    z-index:2;
}
.comparison-slider{
    position:absolute;
    top:0;
    bottom:0;
    width:3px;
    background:rgba(255, 255, 255, 0.85);
    border-left:1px solid rgba(0, 0, 0, 0.35);
    border-right:1px solid rgba(0, 0, 0, 0.35);
    z-index:10;
    cursor:ew-resize;
    pointer-events:auto;
    transform:translateX(-50%);
}
.comparison-slider::before{
    content:"";
    position:absolute;
    top:50%;
    left:50%;
    transform:translate(-50%, -50%);
    width:18px;
    height:18px;
    border-radius:50%;
    background:#ffffff;
    border:1px solid rgba(0,0,0,0.35);
    box-shadow:0 1px 4px rgba(0,0,0,0.3);
}
</style>

<template>
    <div class="mapview">
        <MapContainer @ready="handleMapReady"></MapContainer>
        <WorkspaceListing
            v-if="mapReady"
            :workspaces="geoserverStore.workspaceList"
        ></WorkspaceListing>
        <FloodSidebar v-if="loadFloodSidebar"></FloodSidebar>
        <GQGeostory v-if="loadGqGeostory"></GQGeostory>
        <MapLayerListing></MapLayerListing>
        <DrawContainer></DrawContainer>
        <BufferContainer></BufferContainer>
        <Toast position="bottom-right"></Toast>
    </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent, ref } from "vue";
import MapContainer from "@components/Map/MapContainer.vue";
import WorkspaceListing from "@components/Data/Workspace/WorkspaceListing.vue";
import { useGeoserverStore } from "@store/geoserver";
import { useMapStore } from "@store/map";

const MapLayerListing = defineAsyncComponent(async () => await import("@components/Map/Layer/MapLayerListing.vue"));
const DrawContainer = defineAsyncComponent(async () => await import("@components/Map/Layer/Draw/DrawContainer.vue"))
const BufferContainer = defineAsyncComponent(async () => await import("@components/Map/Buffer/BufferContainer.vue"))
const FloodSidebar = defineAsyncComponent(async () => await import("@components/Geostories/FloodSidebar.vue"))
const GQGeostory = defineAsyncComponent(async () => await import("@components/Geostories/GQGeostory.vue"))
const Toast = defineAsyncComponent(async () => await import("primevue/toast"))

const geoserverStore = useGeoserverStore()
const mapStore = useMapStore()
const mapReady = ref(false)
const loadFloodSidebar = ref(false)
const loadGqGeostory = ref(false)

function handleMapReady(): void {
    logHomeTiming("map:ready")
    mapReady.value = true
    installDeferredScenarioControls()
    loadWorkspaceList()
}

function loadWorkspaceList(): void {
    if (geoserverStore.workspaceList !== undefined) {
        logHomeTiming("workspace-list:skip-existing", {
            workspaceCount: geoserverStore.workspaceList.length,
        })
        return
    }

    logHomeTiming("workspace-list:request")
    geoserverStore.getWorkspaceList().then((data)=>{
        geoserverStore.workspaceList = data.workspaces.workspace
        logHomeTiming("workspace-list:loaded", {
            workspaceCount: geoserverStore.workspaceList.length,
        })
    }).catch((error)=>{ console.error(error) })
}

let scenarioControlsInstalled = false
function installDeferredScenarioControls(): void {
    if (scenarioControlsInstalled || mapStore.map === undefined) {
        return
    }
    scenarioControlsInstalled = true
}

function logHomeTiming(message: string, details?: Record<string, unknown>): void {
    console.log(
        `[tosca-perf ${new Date().toISOString()} +${performance.now().toFixed(1)}ms] home:${message}`,
        details ?? ""
    )
}

</script>

<style scoped>
.mapview{
    width:100%;
    height:100%;
}
</style>

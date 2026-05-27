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
import { defineAsyncComponent, nextTick, ref } from "vue";
import MapContainer from "@components/Map/MapContainer.vue";
import WorkspaceListing from "@components/Data/Workspace/WorkspaceListing.vue";
import { SidebarControl } from "@helpers/sidebarControl";
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

    // mapStore.map.addControl(
    //     new SidebarControl("", "floodScenarios", document.createElement("div"), createMaterialIcon("water"), 3, async () => {
    //         loadFloodSidebar.value = true
    //         await waitForElement("floodScenarios")
    //     }),
    //     "top-left"
    // )
    // mapStore.map.addControl(
    //     new SidebarControl("", "gq-geostory-sidebar", document.createElement("div"), createMaterialIcon("health_and_safety"), 3, async () => {
    //         loadGqGeostory.value = true
    //         await waitForElement("gq-geostory-sidebar")
    //     }),
    //     "top-left"
    // )
}

function createMaterialIcon(icon: string): HTMLSpanElement {
    const iconElement = document.createElement("span")
    iconElement.classList.add("material-icons-outlined")
    iconElement.textContent = icon
    return iconElement
}

function logHomeTiming(message: string, details?: Record<string, unknown>): void {
    console.log(
        `[tosca-perf ${new Date().toISOString()} +${performance.now().toFixed(1)}ms] home:${message}`,
        details ?? ""
    )
}

async function waitForElement(id: string): Promise<void> {
    const startedAt = performance.now()
    while (document.getElementById(id) === null && performance.now() - startedAt < 3000) {
        await nextTick()
        await new Promise((resolve) => window.setTimeout(resolve, 16))
    }
    logHomeTiming("deferred-sidebar:element-ready", {
        id,
        found: document.getElementById(id) !== null,
        durationMs: Math.round(performance.now() - startedAt),
    })
}
</script>

<style scoped>
.mapview{
    width:100%;
    height:100%;
}
</style>

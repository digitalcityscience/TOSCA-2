<template>
    <div class="mapview">
        <MapContainer @ready="installDeferredScenarioControls"></MapContainer>
        <WorkspaceListing
            v-if="loadWorkspaceListing"
            :workspaces="geoserverStore.workspaceList"
            :collapsed="true"
            :register-control="false"
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
import { useGeoserverStore } from "../store/geoserver";
import { useMapStore } from "../store/map";
import MapContainer from "@components/Map/MapContainer.vue";
import { SidebarControl } from "@helpers/sidebarControl";
const WorkspaceListing = defineAsyncComponent(async () => await import("@components/Data/Workspace/WorkspaceListing.vue"));
const MapLayerListing = defineAsyncComponent(async () => await import("@components/Map/Layer/MapLayerListing.vue"));
const DrawContainer = defineAsyncComponent(async () => await import("@components/Map/Layer/Draw/DrawContainer.vue"))
const BufferContainer = defineAsyncComponent(async () => await import("@components/Map/Buffer/BufferContainer.vue"))
const FloodSidebar = defineAsyncComponent(async () => await import("@components/Geostories/FloodSidebar.vue"))
const GQGeostory = defineAsyncComponent(async () => await import("@components/Geostories/GQGeostory.vue"))
const Toast = defineAsyncComponent(async () => await import("primevue/toast"))
const geoserverStore = useGeoserverStore()
const mapStore = useMapStore()
const loadWorkspaceListing = ref(false)
const loadFloodSidebar = ref(false)
const loadGqGeostory = ref(false)

let scenarioControlsInstalled = false
function installDeferredScenarioControls(): void {
    if (scenarioControlsInstalled) {
        return
    }
    if (mapStore.map === undefined) {
        return
    }
    scenarioControlsInstalled = true

    mapStore.map.addControl(
        new SidebarControl("", "workspaceListing", document.createElement("div"), createMaterialIcon("sd_storage"), 1, async () => {
            logMapTiming("workspace-control:open:start")
            loadWorkspaceListing.value = true
            loadWorkspaceList()
            await waitForElement("workspaceListing")
            logMapTiming("workspace-control:open:rendered")
        }),
        "top-left"
    )
}

function createMaterialIcon(icon: string): HTMLSpanElement {
    const iconElement = document.createElement("span")
    iconElement.classList.add("material-icons-outlined")
    iconElement.textContent = icon
    return iconElement
}

function loadWorkspaceList(): void {
    if (geoserverStore.workspaceList !== undefined) {
        logMapTiming("workspace-list:skip-existing", {
            workspaceCount: geoserverStore.workspaceList.length,
        })
        return
    }

    logMapTiming("workspace-list:request")
    geoserverStore.getWorkspaceList().then((data)=>{
        geoserverStore.workspaceList = data.workspaces.workspace
        logMapTiming("workspace-list:loaded", {
            workspaceCount: geoserverStore.workspaceList.length,
        })
    }).catch((error)=>{ console.error(error) })
}

function logMapTiming(message: string, details?: Record<string, unknown>): void {
    console.log(
        `[tosca-perf ${new Date().toISOString()} +${performance.now().toFixed(1)}ms] mapview:${message}`,
        details ?? ""
    )
}

async function waitForElement(id: string): Promise<void> {
    const startedAt = performance.now()
    while (document.getElementById(id) === null && performance.now() - startedAt < 3000) {
        await nextTick()
        await new Promise((resolve) => window.setTimeout(resolve, 16))
    }
    logMapTiming("deferred-sidebar:element-ready", {
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

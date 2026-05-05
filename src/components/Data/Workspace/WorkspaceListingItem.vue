<template>
    <div class="workspace-detail">
        <WorkspaceLayerListing :list="layerList" :workspaceName="props.workspace.name"></WorkspaceLayerListing>
    </div>
</template>

<script setup lang="ts">
// Components
// JS imports
import { useGeoserverStore, type WorkspaceListItem, type GeoserverLayerListItem } from "@store/geoserver";
import { defineAsyncComponent, ref, onMounted } from "vue";
import { useToast } from "primevue/usetoast";
const WorkspaceLayerListing = defineAsyncComponent(async () => await import("@components/Data/Layer/WorkspaceLayerListing.vue"));
const geoserver = useGeoserverStore()
const toast = useToast()
export interface Props {
    workspace: WorkspaceListItem
}
const props = defineProps<Props>()
const layerList = ref<GeoserverLayerListItem[]>()
logWorkspaceTiming("listing-item:setup", {
    workspace: props.workspace.name,
})
onMounted(() => {
    logWorkspaceTiming("listing-item:mounted", {
        workspace: props.workspace.name,
    })
    const startedAt = performance.now()
    logWorkspaceTiming("layers:list-request", {
        workspace: props.workspace.name,
    })
    geoserver.getLayerList(props.workspace.name).then((response) => {
        layerList.value = response.layers.layer
        logWorkspaceTiming("layers:list-loaded", {
            workspace: props.workspace.name,
            layerCount: layerList.value.length,
            durationMs: Math.round(performance.now() - startedAt),
        })
    }).catch(err => {
        toast.add({ severity: "error", summary: "Error", detail: err, life: 3000 });
    })
})
function logWorkspaceTiming(message: string, details?: Record<string, unknown>): void {
    console.log(
        `[tosca-perf ${new Date().toISOString()} +${performance.now().toFixed(1)}ms] workspace:${message}`,
        details ?? ""
    )
}
</script>

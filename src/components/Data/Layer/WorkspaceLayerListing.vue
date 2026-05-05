<template>
    <div v-if="props.list">
        <WorkspaceLayerListingItem v-for="(layer,index) in props.list" :key="index" :item="layer" :workspace="workspaceName"></WorkspaceLayerListingItem>
    </div>
    <div v-else>
        <Message class="w-full" severity="info">There is no layer in this workspace</Message>
    </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent, onMounted } from "vue";
import Message from "primevue/message";
// Components
import { type GeoserverLayerListItem } from "@store/geoserver";
const WorkspaceLayerListingItem = defineAsyncComponent(async () => await import("./WorkspaceLayerListingItem.vue"));
export interface Props {
    list: GeoserverLayerListItem[] | undefined
    workspaceName: string
}
const props = defineProps<Props>()
logWorkspaceTiming("layer-listing:setup", {
    workspace: props.workspaceName,
    layerCount: props.list?.length ?? 0,
})
onMounted(() => {
    logWorkspaceTiming("layer-listing:mounted", {
        workspace: props.workspaceName,
        layerCount: props.list?.length ?? 0,
    })
})
function logWorkspaceTiming(message: string, details?: Record<string, unknown>): void {
    console.log(
        `[tosca-perf ${new Date().toISOString()} +${performance.now().toFixed(1)}ms] workspace:${message}`,
        details ?? ""
    )
}
</script>
<style scoped></style>

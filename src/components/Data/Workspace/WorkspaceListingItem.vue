<template>
    <div class="workspace-detail">
        <WorkspaceLayerListing :list="layerList" :workspaceName="props.workspace.name"></WorkspaceLayerListing>
    </div>
</template>

<script setup lang="ts">
// Components
import WorkspaceLayerListing from "@components/Data/Layer/WorkspaceLayerListing.vue";
// JS imports
import { useGeoserverStore, type WorkspaceListItem, type GeoserverLayerListItem } from "@store/geoserver";
import { ref, onMounted } from "vue";
import { useToast } from "primevue/usetoast";
const geoserver = useGeoserverStore()
const toast = useToast()
export interface Props {
    workspace: WorkspaceListItem
}
const props = defineProps<Props>()
const layerList = ref<GeoserverLayerListItem[]>()
onMounted(() => {
    geoserver.getLayerList(props.workspace.name).then((response) => {
        layerList.value = response.layers.layer
    }).catch(err => {
        toast.add({ severity: "error", summary: "Error", detail: err, life: 3000 });
    })
})
</script>

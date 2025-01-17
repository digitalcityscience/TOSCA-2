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
import { useAuthStore } from "@store/auth";
const geoserver = useGeoserverStore()
const toast = useToast()
export interface Props {
    workspace: WorkspaceListItem
}
const props = defineProps<Props>()
const layerList = ref<GeoserverLayerListItem[]>()
const authStore = useAuthStore();
onMounted(() => {
    if (authStore.getAccessToken === null) {
        // TODO Koese please implement a call here to a new endpoint which is not going to require an access token
        console.warn("No access token found, cannot fetch layer list")
        return
    }
    geoserver.getLayerList(authStore.getAccessToken, props.workspace.name).then((response) => {
        layerList.value = response.layers.layer
    }).catch(err => {
        toast.add({ severity: "error", summary: "Error", detail: err, life: 3000 });
    })
})
</script>

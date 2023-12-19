<template>
    <div class="workspace-detail">
        <WorkspaceLayerListing :list="layerList" :workspaceName="props.workspace.name"></WorkspaceLayerListing>
    </div>
</template>

<script setup lang="ts">
//Components
import WorkspaceLayerListing from './WorkspaceLayerListing.vue';
//JS imports
import { useGeoserverStore, type WorkspaceListItem, type GeoserverLayerListItem } from '../store/geoserver';
import { ref } from 'vue';
import { onMounted } from 'vue';
const geoserver = useGeoserverStore()
export interface Props {
    workspace: WorkspaceListItem
}
const props = defineProps<Props>()
let layerList = ref<Array<GeoserverLayerListItem>>()
onMounted(() => {
    geoserver.getLayerList(props.workspace.name).then((response) => {
        layerList.value = response.layers.layer
    }).catch(err => console.log(err))
})
</script>

<style scoped></style>
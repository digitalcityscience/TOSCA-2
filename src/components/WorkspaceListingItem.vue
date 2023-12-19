<template>
    <div class="workspace-detail">
        <div v-for="(item, index) in layerList" :key="index">
            {{ item.name }}
        </div>
    </div>
</template>

<script setup lang="ts">
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
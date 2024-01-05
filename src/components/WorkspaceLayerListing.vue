<template>
    <div v-if="props.list">
        <WorkspaceLayetListingItem v-for="(layer,index) in props.list" :key="index" :item="layer" :workspace="workspaceName"></WorkspaceLayetListingItem>
    </div>
    <div v-else>
        There is no layer in this workspace
    </div>
</template>

<script setup lang="ts">
// Components
import WorkspaceLayetListingItem from "./WorkspaceLayetListingItem.vue";
import { type GeoserverLayerListItem } from "../store/geoserver";
export interface Props {
    list: GeoserverLayerListItem[] | undefined
    workspaceName: string
}
const props = defineProps<Props>()
</script>
<style scoped></style>

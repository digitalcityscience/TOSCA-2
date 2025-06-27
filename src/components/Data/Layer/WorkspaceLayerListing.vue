<template>
    <div v-if="props.list">
        <WorkspaceLayerListingItem v-for="(layer,index) in props.list" :key="index" :item="layer" :workspace="workspaceName"></WorkspaceLayerListingItem>
    </div>
    <div v-else>
        <Message class="w-full" severity="info">There is no layer in this workspace</Message>
    </div>
</template>

<script setup lang="ts">
import Message from "primevue/message";
// Components
import WorkspaceLayerListingItem from "./WorkspaceLayerListingItem.vue";
import { type GeoserverLayerListItem } from "@store/geoserver";
export interface Props {
    list: GeoserverLayerListItem[] | undefined
    workspaceName: string
}
const props = defineProps<Props>()
</script>
<style scoped></style>

<template>
    <div v-if="props.list && props.list.length > 0" class="space-y-3">
        <WorkspaceLayerListingItem v-for="layer in props.list" :key="layer.href" :item="layer" :workspace="workspaceName"></WorkspaceLayerListingItem>
    </div>
    <div v-else>
        <UAlert class="w-full" color="info" variant="soft" description="There is no layer in this workspace" />
    </div>
</template>

<script setup lang="ts">
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

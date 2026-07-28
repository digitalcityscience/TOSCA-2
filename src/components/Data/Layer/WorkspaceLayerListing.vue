<template>
    <div v-if="props.list && props.list.length > 0" class="space-y-3">
        <WorkspaceLayerListingItem
            v-for="layer in props.list"
            :key="layer.href"
            :item="layer"
            :workspace="workspace"
        />
    </div>
    <div v-else>
        <UAlert class="w-full" color="info" variant="soft" :description="t('workspace.layerListing.noLayers')" />
    </div>
</template>

<script setup lang="ts">
// Components
import { useI18n } from "vue-i18n";
import WorkspaceLayerListingItem from "./WorkspaceLayerListingItem.vue";
import {
    type GeoserverLayerListItem,
    type WorkspaceListItem,
} from "@store/geoserver";
export interface Props {
    list: GeoserverLayerListItem[] | undefined
    workspace: WorkspaceListItem
}
const { t } = useI18n();
const props = defineProps<Props>()
</script>
<style scoped></style>

<template>
    <div v-if="hasCatalogItems" class="space-y-3">
        <WorkspaceLayerGroupListingItem
            v-for="group in props.groups"
            :key="group.id"
            :item="group"
        />
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
import { computed } from "vue";
import WorkspaceLayerListingItem from "./WorkspaceLayerListingItem.vue";
import WorkspaceLayerGroupListingItem from "./WorkspaceLayerGroupListingItem.vue";
import {
    type CatalogLayerGroupListItem,
    type GeoserverLayerListItem,
    type WorkspaceListItem,
} from "@store/geoserver";
export interface Props {
    list: GeoserverLayerListItem[] | undefined
    workspace: WorkspaceListItem
    groups?: CatalogLayerGroupListItem[]
}
const { t } = useI18n();
const props = defineProps<Props>()
const hasCatalogItems = computed(() =>
    (props.list?.length ?? 0) > 0 || (props.groups?.length ?? 0) > 0
)
</script>
<style scoped></style>

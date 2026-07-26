<template>
    <div class="workspace-detail space-y-3 pt-1">
        <div v-if="isLoading" class="space-y-2">
            <USkeleton class="h-24 w-full rounded-md" />
            <USkeleton class="h-24 w-full rounded-md" />
        </div>
        <UAlert v-else-if="loadError" class="w-full" color="error" variant="soft" :description="loadError" />
        <WorkspaceLayerListing v-else :list="layerList" :workspaceName="props.workspace.name"></WorkspaceLayerListing>
    </div>
</template>

<script setup lang="ts">
// Components
import WorkspaceLayerListing from "@components/Data/Layer/WorkspaceLayerListing.vue";
// JS imports
import { useGeoserverStore, type WorkspaceListItem, type GeoserverLayerListItem } from "@store/geoserver";
import { ref, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useToast } from "@helpers/toast";
const { t } = useI18n();
const geoserver = useGeoserverStore()
const toast = useToast()
export interface Props {
    workspace: WorkspaceListItem
}
const props = defineProps<Props>()
const layerList = ref<GeoserverLayerListItem[]>()
const isLoading = ref(true)
const loadError = ref<string>()
onMounted(() => {
    geoserver.getLayerList(props.workspace.name).then((response) => {
        layerList.value = response.layers.layer ?? []
    }).catch(err => {
        loadError.value = t("workspace.listingItem.loadError")
        toast.add({ severity: "error", summary: t("toast.error"), detail: err, life: 3000 });
    }).finally(() => {
        isLoading.value = false
    })
})
</script>

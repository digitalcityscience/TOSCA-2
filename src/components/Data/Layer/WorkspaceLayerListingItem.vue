<template>
    <div class="w-full">
        <UCard v-if="isLoading" class="bg-default/95 dark:bg-elevated/80" :ui="{ body: 'p-3' }">
            <div class="space-y-3">
                <USkeleton class="h-5 w-2/3" />
                <USkeleton class="h-4 w-full" />
                <USkeleton class="h-8 w-28" />
            </div>
        </UCard>
        <UAlert v-else-if="loadError" class="w-full" color="error" variant="soft" :description="loadError" />
        <div v-else-if="props.item && layerInformation?.type ==='RASTER'">
            <WorkspaceRasterLayerListingItem :item="props.item" :workspace="props.workspace.name" :layerInformation="layerInformation"></WorkspaceRasterLayerListingItem>
        </div>
        <div v-else-if="props.item && layerInformation?.type ==='VECTOR'">
            <WorkspaceVectorLayerListingItem :item="props.item" :workspace="props.workspace.name" :layerInformation="layerInformation" :layerStyling="layerStyling"></WorkspaceVectorLayerListingItem>
        </div>
        <UAlert v-else class="w-full" color="info" variant="soft" :description="t('workspace.layerItem.noInformation')" />
    </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import {
    type CatalogGroupStyleLayer,
    type GeoserverLayerInfo,
    type GeoserverLayerListItem,
    type WorkspaceListItem,
    useGeoserverStore,
} from "@store/geoserver";
import { useToast } from "@helpers/toast";
import { reportDeveloperError } from "@helpers/userFacingError";
import WorkspaceRasterLayerListingItem from "./WorkspaceRasterLayerListingItem.vue";
import WorkspaceVectorLayerListingItem from "./WorkspaceVectorLayerListingItem.vue";

export interface Props {
    item: GeoserverLayerListItem
    workspace: WorkspaceListItem
}
export interface LayerStylingPaint {
    paint: object
}
export interface LayerStylingBundle {
    layers: CatalogGroupStyleLayer[];
    spriteUrl?: string;
}
const props = defineProps<Props>()
const { t } = useI18n();
const toast = useToast()
const geoserver = useGeoserverStore()
const layerInformation = ref<GeoserverLayerInfo>()
const layerStyling = ref<LayerStylingBundle>()
const isLoading = ref(true)
const loadError = ref<string>()

async function loadLayerInformation(): Promise<void> {
    try {
        const response = await geoserver.getLayerInformation(props.item, props.workspace)
        layerInformation.value = response.layer
        try {
            const style = await geoserver.getLayerStyling(response.layer.defaultStyle.href)
            if (Array.isArray(style?.layers) && style.layers.length > 0){
                const selectedIds = response.layer.defaultStyle.styleLayerIds ?? []
                const selectedLayers = selectedIds.length > 0
                    ? style.layers.filter((layer: CatalogGroupStyleLayer) => selectedIds.includes(layer.id))
                    : style.layers.filter((layer: CatalogGroupStyleLayer) =>
                        layer.source === props.item.name || layer["source-layer"] === props.item.name
                    )
                layerStyling.value = {
                    layers: (selectedLayers.length > 0 ? selectedLayers : [style.layers[0]])
                        .map((layer: CatalogGroupStyleLayer) => ({ ...layer })),
                    ...(typeof style.sprite === "string" ? { spriteUrl: style.sprite } : {}),
                }
            }
        } catch (styleError) {
            reportDeveloperError(
                `Loading optional style for ${props.workspace.name}:${props.item.name}`,
                styleError
            )
        }
    } catch (err) {
        loadError.value = t("workspace.layerItem.loadError")
        toast.add({ severity: "error", summary: t("toast.error"), detail: err, life: 3000 });
    } finally {
        isLoading.value = false
    }
}

void loadLayerInformation()
</script>

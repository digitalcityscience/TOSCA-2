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
    catalogLayerStyleReferences,
    selectCatalogStyleLayers,
    type CatalogGroupStyleLayer,
    type CatalogStyleListItem,
    type GeoserverLayerInfo,
    type GeoserverLayerListItem,
    type WorkspaceListItem,
    useGeoserverStore,
} from "@store/geoserver";
import type { MapLayerStyleOption } from "@store/map";
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
    styles: MapLayerStyleOption[];
    defaultStyleId: string;
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
            let catalogStyles: CatalogStyleListItem[] = []
            try {
                catalogStyles = await geoserver.getStyleList(props.workspace.provider.id)
            } catch (styleListError) {
                reportDeveloperError(
                    `Loading style catalog for provider ${props.workspace.provider.id}`,
                    styleListError
                )
            }
            const references = catalogLayerStyleReferences(
                response.layer,
                catalogStyles,
                props.workspace.provider.id,
                props.workspace.name
            )
            const loadedStyles = await Promise.all(references.map(async (reference, index) => {
                try {
                    const style = await geoserver.getLayerStyling(reference.href)
                    if (!Array.isArray(style?.layers) || style.layers.length === 0) return undefined
                    const selectedLayers = selectCatalogStyleLayers(
                        style.layers as CatalogGroupStyleLayer[],
                        reference,
                        props.item.name
                    )
                    const optionId = reference.id ?? reference.assignmentId ?? reference.href
                    return {
                        id: optionId,
                        name: reference.name,
                        title: reference.title ?? reference.name,
                        isDefault: index === 0,
                        layers: selectedLayers.map((layer: CatalogGroupStyleLayer) => ({ ...layer })),
                        ...(typeof style.sprite === "string" ? { spriteUrl: style.sprite } : {}),
                    } satisfies MapLayerStyleOption
                } catch (styleError) {
                    reportDeveloperError(
                        `Loading optional style ${reference.name} for ${props.workspace.name}:${props.item.name}`,
                        styleError
                    )
                    return undefined
                }
            }))
            const availableStyles: MapLayerStyleOption[] = loadedStyles.flatMap(
                (style) => style === undefined ? [] : [style]
            )
            if (availableStyles.length > 0) {
                // The reference flagged isDefault may have failed to load and
                // been dropped above; fall back to the first survivor so one
                // option is always marked default.
                if (!availableStyles.some((style) => style.isDefault)) {
                    availableStyles[0].isDefault = true
                }
                const defaultStyle = availableStyles.find((style) => style.isDefault) ?? availableStyles[0]
                layerStyling.value = {
                    styles: availableStyles,
                    defaultStyleId: defaultStyle.id,
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

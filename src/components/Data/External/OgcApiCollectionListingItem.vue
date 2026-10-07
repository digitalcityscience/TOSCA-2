<template>
    <UCard
        class="workspace-layer-card bg-default/95 dark:bg-elevated/80"
        :ui="{ header: 'p-3 pb-2', body: 'p-3 pt-1', footer: 'p-3 pt-2' }"
    >
        <template #header>
            <div class="min-w-0 space-y-1">
                <p class="external-card-title font-semibold text-highlighted">
                    {{ props.collection.title }}
                </p>
                <div class="flex flex-wrap items-center gap-2">
                    <UBadge
                        color="neutral"
                        variant="soft"
                        size="sm"
                        :label="t('workspace.external.ogc.badge')"
                    />
                    <UBadge
                        v-if="props.collection.itemType"
                        color="info"
                        variant="soft"
                        size="sm"
                        :label="props.collection.itemType"
                    />
                </div>
            </div>
        </template>
        <div class="space-y-2">
            <p v-if="props.collection.description !== ''" class="line-clamp-2 text-sm text-muted">
                {{ props.collection.description }}
            </p>
            <span v-if="props.collection.itemCount !== undefined" class="text-xs text-muted">
                {{ t('workspace.external.ogc.itemCount', {
                    count: props.collection.itemCount.toLocaleString(locale)
                }) }}
            </span>
        </div>
        <template #footer>
            <div class="flex flex-wrap justify-end gap-2">
                <UButton
                    v-if="props.collection.htmlUrl"
                    :href="props.collection.htmlUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    size="sm"
                    variant="ghost"
                    color="neutral"
                    trailing-icon="i-lucide-external-link"
                    :label="t('workspace.external.ogc.openCollection')"
                />
                <UButton
                    v-if="isOgcApiFeatureCollection(props.collection)"
                    size="sm"
                    :loading="isAdding"
                    :disabled="isOnMap"
                    :label="isOnMap ? t('workspace.external.onMap') : t('workspace.layerItem.addToMap')"
                    @click="addToMap"
                />
            </div>
        </template>
    </UCard>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import type { ExternalDataSourceConfig } from "../../../config/externalDataSources";
import {
    isOgcApiFeatureCollection,
    type OgcApiCollection,
    type OgcApiDataset,
} from "@store/externalDataSources";
import { useMapStore } from "@store/map";
import { useOgcLayersStore } from "@store/ogcLayers";
import { ogcCollectionLayerId } from "@helpers/externalLayers";
import { openSlideoverSidebar } from "@helpers/slideoverSidebarRegistry";
import { reportDeveloperError } from "@helpers/userFacingError";
import { useToast } from "@helpers/toast";

export interface Props {
    source: ExternalDataSourceConfig
    dataset: OgcApiDataset
    collection: OgcApiCollection
}

const props = defineProps<Props>()
const { t, locale } = useI18n()
const mapStore = useMapStore()
const ogcLayers = useOgcLayersStore()
const toast = useToast()
const isAdding = ref(false)

const layerId = computed(() => ogcCollectionLayerId(
    props.source.id,
    props.dataset.id,
    props.collection.id
))
const isOnMap = computed(() => mapStore.layersOnMap.some((layer) => layer.id === layerId.value))

async function addToMap(): Promise<void> {
    if (isAdding.value || isOnMap.value) return
    isAdding.value = true
    try {
        const state = await ogcLayers.addCollectionLayer({
            source: props.source,
            dataset: props.dataset,
            collection: props.collection,
        })
        if (state.mode === "all" && state.loadedCount === 0) {
            toast.add({
                severity: "warn",
                summary: t("toast.warning"),
                detail: t("workspace.external.ogc.noFeatures"),
                life: 3000,
            })
        }
        mapStore.requestLayerPanelExpansion(layerId.value)
        openSlideoverSidebar("maplayerListing")
    } catch (error) {
        toast.add({ severity: "error", summary: t("toast.error"), detail: error, life: 3000 })
        reportDeveloperError(`Adding OGC API collection ${props.collection.id} to the map`, error)
    } finally {
        isAdding.value = false
    }
}
</script>

<style scoped>
.external-card-title {
    min-width: 0;
    overflow-wrap: anywhere;
    line-height: 1.35;
}
</style>

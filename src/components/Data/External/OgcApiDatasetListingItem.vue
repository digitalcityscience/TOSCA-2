<template>
    <UCard class="workspace-layer-card bg-default/95 dark:bg-elevated/80" :ui="{ header: 'p-3 pb-2', body: 'p-3 pt-1', footer: 'p-3 pt-2' }">
        <template #header>
            <div class="min-w-0 space-y-1">
                <p class="external-card-title font-semibold text-highlighted">{{ props.dataset.title }}</p>
                <UBadge color="neutral" variant="soft" size="sm" :label="t('workspace.external.ogc.badge')" />
            </div>
        </template>
        <div class="space-y-2">
            <p v-if="props.dataset.description !== ''" class="text-sm text-muted line-clamp-3">{{ props.dataset.description }}</p>
            <div v-if="isExpanded" class="external-scroll-list space-y-2 pt-1">
                <div v-if="isLoading" class="space-y-2">
                    <USkeleton class="h-12 w-full rounded-md" />
                    <USkeleton class="h-12 w-full rounded-md" />
                </div>
                <UAlert v-else-if="loadError" color="error" variant="soft" :description="loadError" />
                <UAlert
                    v-else-if="collections.length === 0"
                    color="info"
                    variant="soft"
                    :description="t('workspace.external.ogc.noCollections')"
                />
                <ul v-else class="space-y-2">
                    <li
                        v-for="collection in collections"
                        :key="collection.id"
                        class="rounded-md border border-muted bg-elevated/40 p-2"
                    >
                        <p class="external-card-title text-sm font-medium text-highlighted">{{ collection.title }}</p>
                        <div class="mt-1 flex flex-wrap items-center gap-2">
                            <UBadge
                                v-if="collection.itemType"
                                color="neutral"
                                variant="outline"
                                size="sm"
                                :label="collection.itemType"
                            />
                            <span v-if="collection.itemCount !== undefined" class="text-xs text-muted">
                                {{ t('workspace.external.ogc.itemCount', { count: collection.itemCount.toLocaleString(locale) }) }}
                            </span>
                        </div>
                        <div class="mt-1 flex flex-wrap items-center justify-between gap-2">
                            <UButton
                                v-if="collection.htmlUrl"
                                :href="collection.htmlUrl"
                                target="_blank"
                                rel="noopener noreferrer"
                                size="xs"
                                variant="link"
                                class="px-0"
                                trailing-icon="i-lucide-external-link"
                                :label="t('workspace.external.ogc.openCollection')"
                            />
                            <UButton
                                v-if="isOgcApiFeatureCollection(collection)"
                                size="xs"
                                class="ml-auto"
                                :color="isCollectionOnMap(collection) ? 'primary' : 'neutral'"
                                :variant="isCollectionOnMap(collection) ? 'soft' : 'outline'"
                                :icon="isCollectionOnMap(collection) ? 'i-lucide-check' : 'i-lucide-map-plus'"
                                :loading="addingIds.has(collection.id)"
                                :disabled="isCollectionOnMap(collection)"
                                :label="isCollectionOnMap(collection) ? t('workspace.external.onMap') : t('workspace.layerItem.addToMap')"
                                @click="addCollectionToMap(collection)"
                            />
                        </div>
                    </li>
                </ul>
            </div>
        </div>
        <template #footer>
            <div class="flex flex-wrap justify-end gap-2">
                <UButton
                    :href="props.dataset.landingPageUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    size="sm"
                    variant="ghost"
                    color="neutral"
                    trailing-icon="i-lucide-external-link"
                    :label="t('workspace.external.ogc.openDataset')"
                />
                <UButton
                    size="sm"
                    variant="soft"
                    :trailing-icon="isExpanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                    :label="isExpanded ? t('workspace.external.ogc.hideCollections') : t('workspace.external.ogc.showCollections')"
                    @click="toggleCollections"
                />
            </div>
        </template>
    </UCard>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import type { ExternalDataSourceConfig } from "../../../config/externalDataSources";
import {
    isOgcApiFeatureCollection,
    useExternalDataSourcesStore,
    type OgcApiCollection,
    type OgcApiDataset,
} from "@store/externalDataSources";
import { useMapStore } from "@store/map";
import { useOgcLayersStore } from "@store/ogcLayers";
import { ogcCollectionLayerId } from "@helpers/externalLayers";
import { openSlideoverSidebar } from "@helpers/slideoverSidebarRegistry";
import { useToast } from "@helpers/toast";
import { reportDeveloperError } from "@helpers/userFacingError";

export interface Props {
    source: ExternalDataSourceConfig
    dataset: OgcApiDataset
}
const props = defineProps<Props>()
const { t, locale } = useI18n();
const externalSources = useExternalDataSourcesStore()
const mapStore = useMapStore()
const ogcLayers = useOgcLayersStore()
const toast = useToast()

const isExpanded = ref(false)
const isLoading = ref(false)
const loadError = ref<string>()
const collections = ref<OgcApiCollection[]>([])
const addingIds = ref(new Set<string>())
let requested = false

function collectionLayerId(collection: OgcApiCollection): string {
    return ogcCollectionLayerId(props.source.id, props.dataset.id, collection.id)
}

function isCollectionOnMap(collection: OgcApiCollection): boolean {
    const identifier = collectionLayerId(collection)
    return mapStore.layersOnMap.some((layer) => layer.id === identifier)
}

/**
 * Each collection becomes its own GeoJSON layer. The OGC layer store decides
 * between one full load and loading by map view for large collections.
 */
async function addCollectionToMap(collection: OgcApiCollection): Promise<void> {
    const identifier = collectionLayerId(collection)
    addingIds.value = new Set(addingIds.value).add(collection.id)
    try {
        const state = await ogcLayers.addCollectionLayer({ source: props.source, dataset: props.dataset, collection })
        if (state.mode === "all" && state.loadedCount === 0) {
            toast.add({ severity: "warn", summary: t("toast.warning"), detail: t("workspace.external.ogc.noFeatures"), life: 3000 })
        }
        mapStore.requestLayerPanelExpansion(identifier)
        openSlideoverSidebar("maplayerListing")
    } catch (error) {
        toast.add({ severity: "error", summary: t("toast.error"), detail: error, life: 3000 })
        reportDeveloperError(`Adding OGC API collection ${collection.id} to the map`, error)
    } finally {
        const next = new Set(addingIds.value)
        next.delete(collection.id)
        addingIds.value = next
    }
}

async function toggleCollections(): Promise<void> {
    isExpanded.value = !isExpanded.value
    if (!isExpanded.value || (requested && loadError.value === undefined)) return
    requested = true
    isLoading.value = true
    loadError.value = undefined
    try {
        collections.value = await externalSources.getOgcApiCollections(props.dataset)
    } catch (error) {
        loadError.value = t("workspace.external.loadError")
        reportDeveloperError(`Loading OGC API collections for ${props.dataset.landingPageUrl}`, error)
    } finally {
        isLoading.value = false
    }
}
</script>

<style scoped>
.external-card-title {
    min-width: 0;
    overflow-wrap: anywhere;
    line-height: 1.35;
}
.external-scroll-list {
    max-height: 22rem;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-right: 0.25rem;
}
</style>

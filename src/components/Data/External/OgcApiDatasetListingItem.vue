<template>
    <div class="dataset-group border border-muted">
        <button
            type="button"
            class="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-elevated/70"
            :aria-expanded="isExpanded"
            @click="toggleCollections"
        >
            <UIcon
                :name="isExpanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                class="mt-0.5 size-4 shrink-0 text-muted"
            />
            <span class="min-w-0 flex-1 space-y-1">
                <span class="external-card-title block text-sm font-semibold text-highlighted">
                    {{ props.dataset.title }}
                </span>
                <span
                    v-if="props.dataset.description !== ''"
                    class="external-card-title line-clamp-2 block text-xs font-normal text-muted"
                >{{ props.dataset.description }}</span>
            </span>
        </button>
        <div v-if="isExpanded" class="space-y-2 border-t border-muted p-2">
            <div class="flex justify-end">
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
            </div>
            <div v-if="isLoading" class="space-y-2">
                <USkeleton class="h-24 w-full rounded-md" />
                <USkeleton class="h-24 w-full rounded-md" />
            </div>
            <UAlert v-else-if="loadError" color="error" variant="soft" :description="loadError" />
            <UAlert
                v-else-if="collections.length === 0"
                color="info"
                variant="soft"
                :description="t('workspace.external.ogc.noCollections')"
            />
            <template v-else>
                <OgcApiCollectionListingItem
                    v-for="collection in collections"
                    :key="collection.id"
                    :source="props.source"
                    :dataset="props.dataset"
                    :collection="collection"
                />
            </template>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import type { ExternalDataSourceConfig } from "../../../config/externalDataSources";
import {
    useExternalDataSourcesStore,
    type OgcApiCollection,
    type OgcApiDataset,
} from "@store/externalDataSources";
import { reportDeveloperError } from "@helpers/userFacingError";
import OgcApiCollectionListingItem from "./OgcApiCollectionListingItem.vue";

export interface Props {
    source: ExternalDataSourceConfig
    dataset: OgcApiDataset
}

const props = defineProps<Props>()
const { t } = useI18n()
const externalSources = useExternalDataSourcesStore()
const isExpanded = ref(false)
const isLoading = ref(false)
const loadError = ref<string>()
const collections = ref<OgcApiCollection[]>([])
let requested = false

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
.dataset-group {
    border-radius: 6px;
    overflow: hidden;
}
.external-card-title {
    min-width: 0;
    overflow-wrap: anywhere;
    line-height: 1.35;
}
</style>

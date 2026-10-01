<template>
    <div class="workspace-detail space-y-3 pt-1">
        <div v-if="isLoading" class="space-y-2">
            <USkeleton class="h-8 w-full rounded-md" />
            <USkeleton class="h-24 w-full rounded-md" />
            <USkeleton class="h-24 w-full rounded-md" />
        </div>
        <UAlert v-else-if="loadError" class="w-full" color="error" variant="soft" :description="loadError" />
        <template v-else>
            <div class="flex items-center gap-2">
                <UInput
                    v-model="query"
                    class="flex-1"
                    size="sm"
                    icon="i-lucide-search"
                    :placeholder="t('workspace.external.searchPlaceholder')"
                />
                <UBadge
                    color="neutral"
                    variant="soft"
                    size="sm"
                    :label="t('workspace.external.ogc.datasetCount', { count: filteredDatasets.length })"
                />
            </div>
            <OgcApiDatasetListingItem
                v-for="dataset in visibleDatasets"
                :key="dataset.id"
                :source="props.source"
                :dataset="dataset"
            />
            <UAlert
                v-if="filteredDatasets.length === 0"
                class="w-full"
                color="info"
                variant="soft"
                :description="t('workspace.external.noResults')"
            />
            <UButton
                v-if="filteredDatasets.length > visibleDatasets.length"
                block
                size="sm"
                variant="soft"
                color="neutral"
                :label="t('workspace.external.showMore', { count: filteredDatasets.length - visibleDatasets.length })"
                @click="limit += PAGE_SIZE"
            />
        </template>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { ExternalDataSourceConfig } from "../../../config/externalDataSources";
import { useExternalDataSourcesStore, type OgcApiDataset } from "@store/externalDataSources";
import { reportDeveloperError } from "@helpers/userFacingError";
import OgcApiDatasetListingItem from "./OgcApiDatasetListingItem.vue";

export interface Props {
    source: ExternalDataSourceConfig
}
const props = defineProps<Props>()
const { t } = useI18n();
const externalSources = useExternalDataSourcesStore()

const PAGE_SIZE = 20
const datasets = ref<OgcApiDataset[]>([])
const isLoading = ref(true)
const loadError = ref<string>()
const query = ref("")
const limit = ref(PAGE_SIZE)

const filteredDatasets = computed(() => {
    const needle = query.value.trim().toLocaleLowerCase()
    if (needle === "") return datasets.value
    return datasets.value.filter((dataset) =>
        dataset.title.toLocaleLowerCase().includes(needle) ||
        dataset.id.toLocaleLowerCase().includes(needle) ||
        dataset.description.toLocaleLowerCase().includes(needle)
    )
})
const visibleDatasets = computed(() => filteredDatasets.value.slice(0, limit.value))

watch(query, () => {
    limit.value = PAGE_SIZE
})

onMounted(() => {
    externalSources.getOgcApiDatasets(props.source).then((response) => {
        datasets.value = response
    }).catch((error) => {
        loadError.value = t("workspace.external.loadError")
        reportDeveloperError(`Loading OGC API datasets from ${props.source.url}`, error)
    }).finally(() => {
        isLoading.value = false
    })
})
</script>

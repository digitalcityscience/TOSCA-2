<template>
    <div class="workspace-detail space-y-3 pt-1">
        <div v-if="isLoading" class="space-y-2">
            <USkeleton class="h-8 w-full rounded-md" />
            <USkeleton class="h-16 w-full rounded-md" />
            <USkeleton class="h-16 w-full rounded-md" />
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
                    :label="t('workspace.external.sensorthings.layerCount', { count: filteredLayerCount })"
                />
            </div>
            <div v-for="group in filteredGroups" :key="group.serviceName" class="service-group border border-muted">
                <button
                    type="button"
                    class="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-elevated/70"
                    :aria-expanded="openGroups.has(group.serviceName)"
                    @click="toggleGroup(group.serviceName)"
                >
                    <UIcon
                        :name="openGroups.has(group.serviceName) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                        class="size-4 shrink-0 text-muted"
                    />
                    <span class="min-w-0 flex-1 truncate text-sm font-semibold text-highlighted">
                        {{ group.serviceName }}
                    </span>
                    <UBadge
                        color="neutral"
                        variant="soft"
                        size="sm"
                        :label="t('workspace.external.sensorthings.layerCount', { count: group.layers.length })"
                    />
                </button>
                <div v-if="openGroups.has(group.serviceName)" class="space-y-2 border-t border-muted p-2">
                    <SensorThingsLayerListingItem
                        v-for="layer in group.layers"
                        :key="layer.layerName"
                        :source="props.source"
                        :layer="layer"
                    />
                </div>
            </div>
            <UAlert
                v-if="filteredGroups.length === 0"
                class="w-full"
                color="info"
                variant="soft"
                :description="t('workspace.external.noResults')"
            />
        </template>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { ExternalDataSourceConfig } from "../../../config/externalDataSources";
import {
    useExternalDataSourcesStore,
    type SensorThingsLayerSummary,
} from "@store/externalDataSources";
import { reportDeveloperError } from "@helpers/userFacingError";
import SensorThingsLayerListingItem from "./SensorThingsLayerListingItem.vue";

export interface Props {
    source: ExternalDataSourceConfig
}

interface LayerGroup {
    serviceName: string
    layers: SensorThingsLayerSummary[]
}

const props = defineProps<Props>()
const { t } = useI18n()
const externalSources = useExternalDataSourcesStore()
const layers = ref<SensorThingsLayerSummary[]>([])
const isLoading = ref(true)
const loadError = ref<string>()
const query = ref("")
const openGroups = ref(new Set<string>())

const groupedLayers = computed<LayerGroup[]>(() => {
    const groups = new Map<string, SensorThingsLayerSummary[]>()
    for (const layer of layers.value) {
        groups.set(layer.serviceName, [...(groups.get(layer.serviceName) ?? []), layer])
    }
    return [...groups.entries()].map(([serviceName, serviceLayers]) => ({
        serviceName,
        layers: serviceLayers,
    }))
})
const filteredGroups = computed<LayerGroup[]>(() => {
    const needle = query.value.trim().toLocaleLowerCase()
    if (needle === "") return groupedLayers.value
    return groupedLayers.value.flatMap((group) => {
        if (group.serviceName.toLocaleLowerCase().includes(needle)) return [group]
        const matchingLayers = group.layers.filter((layer) =>
            layer.layerName.toLocaleLowerCase().includes(needle)
        )
        return matchingLayers.length === 0 ? [] : [{ ...group, layers: matchingLayers }]
    })
})
const filteredLayerCount = computed(() =>
    filteredGroups.value.reduce((count, group) => count + group.layers.length, 0)
)

watch(filteredGroups, (groups) => {
    const visibleNames = new Set(groups.map((group) => group.serviceName))
    const next = new Set([...openGroups.value].filter((name) => visibleNames.has(name)))
    if (next.size === 0 && groups[0] !== undefined) next.add(groups[0].serviceName)
    openGroups.value = next
})

function toggleGroup(serviceName: string): void {
    const next = new Set(openGroups.value)
    if (next.has(serviceName)) next.delete(serviceName)
    else next.add(serviceName)
    openGroups.value = next
}

onMounted(() => {
    externalSources.getSensorThingsLayerCatalog(props.source).then((response) => {
        layers.value = response
    }).catch((error) => {
        loadError.value = t("workspace.external.loadError")
        reportDeveloperError(`Loading SensorThings layer catalog from ${props.source.url}`, error)
    }).finally(() => {
        isLoading.value = false
    })
})
</script>

<style scoped>
.service-group {
    border-radius: 6px;
    overflow: hidden;
}
</style>

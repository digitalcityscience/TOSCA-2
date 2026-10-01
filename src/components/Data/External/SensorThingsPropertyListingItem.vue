<template>
    <UCard class="workspace-layer-card bg-default/95 dark:bg-elevated/80" :ui="{ header: 'p-3 pb-2', body: 'p-3 pt-1', footer: 'p-3 pt-2' }">
        <template #header>
            <div class="min-w-0 space-y-1">
                <p class="external-card-title font-semibold text-highlighted">{{ props.property.name }}</p>
                <div class="flex flex-wrap items-center gap-2">
                    <UBadge color="neutral" variant="soft" size="sm" :label="t('workspace.external.sensorthings.badge')" />
                    <span class="text-xs text-muted">
                        {{ t('workspace.external.sensorthings.datastreamCount', { count: props.property.datastreamCount.toLocaleString(locale) }) }}
                    </span>
                    <UBadge
                        v-if="streamIdsOnMap.size > 0"
                        color="primary"
                        variant="soft"
                        size="sm"
                        icon="i-lucide-map"
                        :label="t('workspace.external.sensorthings.onMapCount', { count: streamIdsOnMap.size.toLocaleString(locale) })"
                    />
                </div>
            </div>
        </template>
        <div class="space-y-2">
            <p v-if="props.property.description !== ''" class="text-sm text-muted line-clamp-3">{{ props.property.description }}</p>
            <div v-if="isExpanded" class="external-scroll-list space-y-2 pt-1">
                <ul v-if="datastreams.length > 0" class="space-y-2">
                    <li
                        v-for="datastream in datastreams"
                        :key="String(datastream.id)"
                        class="flex items-start gap-2 rounded-md border border-muted bg-elevated/40 p-2"
                    >
                        <div class="min-w-0 flex-1">
                            <p class="external-card-title text-sm font-medium text-highlighted">{{ datastream.name }}</p>
                            <p v-if="datastream.thingName" class="external-card-title text-xs text-muted">
                                {{ t('workspace.external.sensorthings.thing') }}: {{ datastream.thingName }}
                            </p>
                            <p class="mt-1 text-xs text-toned">
                                <template v-if="datastream.latestObservation">
                                    {{ t('workspace.external.sensorthings.latest') }}:
                                    <span class="font-semibold text-highlighted">{{ formatObservation(datastream) }}</span>
                                    <span class="text-muted"> · {{ formatTime(datastream.latestObservation.phenomenonTime) }}</span>
                                </template>
                                <span v-else class="text-muted">{{ t('workspace.external.sensorthings.noObservation') }}</span>
                            </p>
                        </div>
                        <UButton
                            size="xs"
                            :color="streamIdsOnMap.has(String(datastream.id)) ? 'primary' : 'neutral'"
                            :variant="streamIdsOnMap.has(String(datastream.id)) ? 'soft' : 'outline'"
                            :icon="streamIdsOnMap.has(String(datastream.id)) ? 'i-lucide-check' : 'i-lucide-map-pin-plus'"
                            :disabled="datastream.geometry === undefined || streamIdsOnMap.has(String(datastream.id)) || isAddingAll"
                            :loading="addingIds.has(String(datastream.id))"
                            :title="datastreamButtonTitle(datastream)"
                            :aria-label="datastreamButtonTitle(datastream)"
                            @click="addSingleDatastream(datastream)"
                        />
                    </li>
                </ul>
                <div v-if="isLoading" class="space-y-2">
                    <USkeleton class="h-12 w-full rounded-md" />
                    <USkeleton class="h-12 w-full rounded-md" />
                </div>
                <UAlert v-else-if="loadError" color="error" variant="soft" :description="loadError" />
                <div v-if="!isLoading && (nextLink !== undefined || loadError)" class="flex items-center justify-between gap-2">
                    <span v-if="total !== undefined" class="text-xs text-muted">
                        {{ t('workspace.external.sensorthings.shownOf', { shown: datastreams.length, total: total.toLocaleString(locale) }) }}
                    </span>
                    <UButton
                        size="xs"
                        variant="soft"
                        color="neutral"
                        :label="loadError ? t('workspace.external.retry') : t('workspace.external.sensorthings.loadMore')"
                        @click="loadPage"
                    />
                </div>
            </div>
        </div>
        <template #footer>
            <div class="flex flex-wrap justify-end gap-2">
                <UButton
                    size="sm"
                    variant="ghost"
                    color="neutral"
                    :trailing-icon="isExpanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                    :label="isExpanded ? t('workspace.external.sensorthings.hideDatastreams') : t('workspace.external.sensorthings.showDatastreams')"
                    @click="toggleDatastreams"
                />
                <UButton
                    size="sm"
                    icon="i-lucide-map-plus"
                    :loading="isAddingAll"
                    :disabled="allOnMap"
                    :label="t('workspace.external.sensorthings.addAll', { count: props.property.datastreamCount.toLocaleString(locale) })"
                    @click="addAllDatastreams"
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
    sensorThingsDatastreamFeature,
    useExternalDataSourcesStore,
    type SensorThingsDatastream,
    type SensorThingsObservedProperty,
} from "@store/externalDataSources";
import { useMapStore } from "@store/map";
import type { Feature } from "@helpers/geojson";
import {
    addExternalGeoJSONLayer,
    findExternalLayer,
    mergeFeatures,
    sensorThingsLayerId,
    setExternalLayerFeatures,
} from "@helpers/externalLayers";
import { openSlideoverSidebar } from "@helpers/slideoverSidebarRegistry";
import { useToast } from "@helpers/toast";
import { reportDeveloperError } from "@helpers/userFacingError";

export interface Props {
    source: ExternalDataSourceConfig
    property: SensorThingsObservedProperty
}
const props = defineProps<Props>()
const { t, locale } = useI18n();
const externalSources = useExternalDataSourcesStore()
const mapStore = useMapStore()
const toast = useToast()

const isExpanded = ref(false)
const isLoading = ref(false)
const loadError = ref<string>()
const datastreams = ref<SensorThingsDatastream[]>([])
const nextLink = ref<string>()
const total = ref<number>()
const isAddingAll = ref(false)
const addingIds = ref(new Set<string>())
let firstPageLoaded = false

const layerId = computed(() => sensorThingsLayerId(props.source.id, props.property.id))
const streamIdsOnMap = computed(() => {
    const record = mapStore.layersOnMap.find((layer) => layer.id === layerId.value)
    return new Set((record?.layerData?.features ?? []).map(datastreamKey))
})
const allOnMap = computed(() => streamIdsOnMap.value.size >= props.property.datastreamCount)

function datastreamKey(feature: Feature): string {
    return String(feature.properties?.datastream_id ?? feature.id)
}

async function loadPage(): Promise<void> {
    isLoading.value = true
    loadError.value = undefined
    try {
        const page = await externalSources.getSensorThingsDatastreams(
            props.source,
            props.property.id,
            firstPageLoaded ? nextLink.value : undefined
        )
        datastreams.value = [...datastreams.value, ...page.items]
        nextLink.value = page.nextLink
        total.value = page.total ?? total.value
        firstPageLoaded = true
    } catch (error) {
        loadError.value = t("workspace.external.loadError")
        reportDeveloperError(`Loading SensorThings datastreams for ${props.property.name}`, error)
    } finally {
        isLoading.value = false
    }
}

function toggleDatastreams(): void {
    isExpanded.value = !isExpanded.value
    if (isExpanded.value && !firstPageLoaded && !isLoading.value) {
        void loadPage()
    }
}

/**
 * All streams of one observed property share a single map layer: the first
 * add creates it, later adds merge into it by datastream id.
 */
async function addDatastreamsToMap(streams: SensorThingsDatastream[]): Promise<void> {
    const features = streams.flatMap((stream) => {
        const feature = sensorThingsDatastreamFeature(stream)
        return feature === undefined ? [] : [feature]
    })
    if (features.length === 0) {
        toast.add({ severity: "warn", summary: t("toast.warning"), detail: t("workspace.external.sensorthings.noLocation"), life: 3000 })
        return
    }
    const existing = findExternalLayer(mapStore, layerId.value)
    if (existing !== undefined) {
        const merged = mergeFeatures(existing.layerData, features, datastreamKey)
        setExternalLayerFeatures(mapStore, layerId.value, merged.features)
        toast.add({
            severity: "success",
            summary: t("toast.success"),
            detail: t("workspace.external.sensorthings.addedToLayer", { count: merged.addedCount, layer: props.property.name }),
            life: 3000,
        })
        return
    }
    await addExternalGeoJSONLayer(mapStore, {
        identifier: layerId.value,
        displayName: props.property.name,
        features: { type: "FeatureCollection", features },
        externalSource: {
            type: "sensorthings",
            sourceTitle: props.source.title,
            totalCount: props.property.datastreamCount,
        },
    })
    mapStore.requestLayerPanelExpansion(layerId.value)
    openSlideoverSidebar("maplayerListing")
}

async function addSingleDatastream(datastream: SensorThingsDatastream): Promise<void> {
    const key = String(datastream.id)
    addingIds.value = new Set(addingIds.value).add(key)
    try {
        await addDatastreamsToMap([datastream])
    } catch (error) {
        toast.add({ severity: "error", summary: t("toast.error"), detail: error, life: 3000 })
    } finally {
        const next = new Set(addingIds.value)
        next.delete(key)
        addingIds.value = next
    }
}

async function addAllDatastreams(): Promise<void> {
    isAddingAll.value = true
    try {
        const streams = await externalSources.getAllSensorThingsDatastreams(props.source, props.property.id)
        await addDatastreamsToMap(streams)
    } catch (error) {
        toast.add({ severity: "error", summary: t("toast.error"), detail: error, life: 3000 })
        reportDeveloperError(`Adding SensorThings datastreams for ${props.property.name}`, error)
    } finally {
        isAddingAll.value = false
    }
}

function datastreamButtonTitle(datastream: SensorThingsDatastream): string {
    if (datastream.geometry === undefined) return t("workspace.external.sensorthings.noLocation")
    if (streamIdsOnMap.value.has(String(datastream.id))) return t("workspace.external.onMap")
    return t("workspace.external.sensorthings.addStream")
}

function formatObservation(datastream: SensorThingsDatastream): string {
    const result = datastream.latestObservation?.result
    const value = typeof result === "object" && result !== null
        ? JSON.stringify(result)
        : typeof result === "number"
            ? result.toLocaleString(locale.value)
            : String(result)
    return datastream.unitSymbol ? `${value} ${datastream.unitSymbol}` : value
}

function formatTime(value: string): string {
    // phenomenonTime may be an interval ("start/end"); show its end.
    const instant = value.includes("/") ? value.split("/")[1] : value
    const date = new Date(instant)
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale.value)
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

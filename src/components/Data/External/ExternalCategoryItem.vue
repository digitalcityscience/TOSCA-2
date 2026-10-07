<template>
    <UCard
        class="workspace-layer-card bg-default/95 dark:bg-elevated/80"
        :class="{ 'opacity-60': unavailable }"
        :ui="{ header: 'p-3 pb-2', body: 'p-3 pt-1', footer: 'p-3 pt-2' }"
    >
        <template #header>
            <div class="min-w-0 space-y-1">
                <p class="external-card-title font-semibold text-highlighted">{{ props.item.title }}</p>
                <p v-if="subtitle !== ''" class="external-card-title text-xs text-toned">{{ subtitle }}</p>
                <div class="flex flex-wrap items-center gap-2">
                    <UBadge color="neutral" variant="soft" size="sm" :label="sourceTypeLabel" />
                    <span v-if="featureCount !== undefined" class="text-xs text-muted">{{ featureCount }}</span>
                </div>
            </div>
        </template>
        <div class="space-y-2">
            <div v-if="props.item.description !== ''" class="space-y-1">
                <p
                    class="external-card-description whitespace-pre-line text-sm text-muted"
                    :class="{ 'line-clamp-3': !descriptionExpanded }"
                >{{ props.item.description }}</p>
                <UButton
                    v-if="descriptionNeedsToggle"
                    size="xs"
                    color="neutral"
                    variant="link"
                    class="h-auto p-0"
                    :label="t(descriptionExpanded
                        ? 'workspace.external.category.descriptionLess'
                        : 'workspace.external.category.descriptionMore')"
                    @click="descriptionExpanded = !descriptionExpanded"
                />
            </div>
            <p v-if="props.source?.attribution" class="text-xs text-dimmed">{{ props.source.attribution }}</p>
            <p v-if="availabilityMessage !== ''" class="text-xs font-medium text-warning">{{ availabilityMessage }}</p>
        </div>
        <template #footer>
            <div class="flex justify-end">
                <UButton
                    size="sm"
                    :label="isOnMap ? t('workspace.external.onMap') : t('workspace.layerItem.addToMap')"
                    :loading="adding"
                    :disabled="!canAdd || unavailable || isOnMap"
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
import type { ExternalCategoryItem } from "@store/externalDataSources";
import { useMapStore } from "@store/map";
import { useOgcLayersStore } from "@store/ogcLayers";
import { useSensorThingsLayersStore } from "@store/sensorThingsLayers";
import { externalCategoryLayerId, sensorThingsLayerId } from "@helpers/externalLayers";
import { openSlideoverSidebar } from "@helpers/slideoverSidebarRegistry";
import { useToast } from "@helpers/toast";
import { reportDeveloperError } from "@helpers/userFacingError";

export interface Props {
    item: ExternalCategoryItem
    source?: ExternalDataSourceConfig
}
const props = defineProps<Props>()
const { t, locale } = useI18n()
const mapStore = useMapStore()
const ogcLayers = useOgcLayersStore()
const sensorThingsLayers = useSensorThingsLayersStore()
const toast = useToast()
const adding = ref(false)
const descriptionExpanded = ref(false)

const unavailable = computed(() =>
    props.item.availability.state === "MISSING" || props.item.availability.state === "ERROR"
)
const sourceTypeLabel = computed(() => props.item.service_type === "ogc_api_features"
    ? t("workspace.external.ogc.badge")
    : t("workspace.external.sensorthings.badge")
)
const subtitle = computed(() => props.item.service_type === "ogc_api_features"
    ? props.item.ogc?.dataset_title ?? ""
    : props.item.sensorthings?.service_name ?? ""
)
const descriptionNeedsToggle = computed(() =>
    props.item.description.length > 180 || props.item.description.split("\n").length > 3
)
const layerId = computed(() => props.item.service_type === "sensorthings" && props.item.sensorthings !== undefined
    ? sensorThingsLayerId(
        props.item.service,
        props.item.sensorthings.service_name,
        props.item.sensorthings.layer_name
    )
    : externalCategoryLayerId(props.item.service, props.item.id)
)
const isOnMap = computed(() => mapStore.layersOnMap.some((layer) => layer.id === layerId.value))
const canAdd = computed(() =>
    props.source !== undefined &&
    ((props.item.service_type === "ogc_api_features" && props.item.ogc !== undefined) ||
        (props.item.service_type === "sensorthings" && props.item.sensorthings !== undefined))
)
const featureCount = computed(() => props.item.availability.feature_count === null
    ? undefined
    : t("workspace.external.category.featureCount", {
        count: props.item.availability.feature_count.toLocaleString(locale.value),
    })
)
const availabilityMessage = computed(() => {
    if (props.item.availability.state === "MISSING") {
        return t("workspace.external.category.missing")
    }
    if (props.item.availability.state === "ERROR") {
        return t("workspace.external.category.error")
    }
    return ""
})

async function addToMap(): Promise<void> {
    if (!canAdd.value || unavailable.value || isOnMap.value || props.source === undefined) return
    adding.value = true
    try {
        if (props.item.service_type === "sensorthings") {
            await sensorThingsLayers.addCategoryItemLayer(props.item, props.source)
        } else {
            await ogcLayers.addCategoryItemLayer(props.item, props.source)
        }
        mapStore.requestLayerPanelExpansion(layerId.value)
        openSlideoverSidebar("maplayerListing")
    } catch (error) {
        toast.add({ severity: "error", summary: t("toast.error"), detail: error, life: 3000 })
        reportDeveloperError(`Adding external category item ${props.item.id}`, error)
    } finally {
        adding.value = false
    }
}
</script>

<style scoped>
.external-card-title {
    overflow-wrap: anywhere;
    line-height: 1.35;
}
.external-card-description {
    overflow-wrap: anywhere;
}
</style>

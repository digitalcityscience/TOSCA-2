<template>
    <UCard
        class="workspace-layer-card bg-default/95 dark:bg-elevated/80"
        :ui="{ body: 'p-3' }"
    >
        <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 space-y-1">
                <p class="external-card-title text-sm font-semibold text-highlighted">
                    {{ props.layer.layerName }}
                </p>
                <div class="flex flex-wrap items-center gap-2">
                    <UBadge
                        color="neutral"
                        variant="soft"
                        size="sm"
                        :label="t('workspace.external.sensorthings.badge')"
                    />
                    <span class="text-xs text-muted">
                        {{ t('workspace.external.sensorthings.datastreamCount', {
                            count: props.layer.datastreamCount.toLocaleString(locale)
                        }) }}
                    </span>
                </div>
            </div>
            <UButton
                class="shrink-0"
                size="sm"
                :color="isOnMap ? 'primary' : 'neutral'"
                :variant="isOnMap ? 'soft' : 'outline'"
                :icon="isOnMap ? 'i-lucide-check' : 'i-lucide-map-plus'"
                :label="isOnMap ? t('workspace.external.onMap') : t('workspace.layerItem.addToMap')"
                :disabled="isOnMap"
                :loading="isAdding"
                @click="addToMap"
            />
        </div>
    </UCard>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import type { ExternalDataSourceConfig } from "../../../config/externalDataSources";
import type { SensorThingsLayerSummary } from "@store/externalDataSources";
import { useMapStore } from "@store/map";
import { useSensorThingsLayersStore } from "@store/sensorThingsLayers";
import { sensorThingsLayerId } from "@helpers/externalLayers";
import { openSlideoverSidebar } from "@helpers/slideoverSidebarRegistry";
import { reportDeveloperError } from "@helpers/userFacingError";
import { useToast } from "@helpers/toast";

export interface Props {
    source: ExternalDataSourceConfig
    layer: SensorThingsLayerSummary
}

const props = defineProps<Props>()
const { t, locale } = useI18n()
const mapStore = useMapStore()
const sensorThingsLayers = useSensorThingsLayersStore()
const toast = useToast()
const isAdding = ref(false)

const layerId = computed(() => sensorThingsLayerId(
    props.source.id,
    props.layer.serviceName,
    props.layer.layerName
))
const isOnMap = computed(() => mapStore.layersOnMap.some((layer) => layer.id === layerId.value))

async function addToMap(): Promise<void> {
    if (isAdding.value || isOnMap.value) return
    isAdding.value = true
    try {
        await sensorThingsLayers.addServiceLayer({
            source: props.source,
            serviceName: props.layer.serviceName,
            layerName: props.layer.layerName,
            displayName: props.layer.layerName,
            totalCount: props.layer.datastreamCount,
        })
        mapStore.requestLayerPanelExpansion(layerId.value)
        openSlideoverSidebar("maplayerListing")
    } catch (error) {
        toast.add({ severity: "error", summary: t("toast.error"), detail: error, life: 3000 })
        reportDeveloperError(
            `Adding SensorThings layer ${props.layer.serviceName}/${props.layer.layerName}`,
            error
        )
    } finally {
        isAdding.value = false
    }
}
</script>

<style scoped>
.external-card-title {
    overflow-wrap: anywhere;
    line-height: 1.35;
}
</style>

<template>
    <div v-if="props.item" class="layer-detail">
        <UCard class="workspace-layer-card bg-default/95 dark:bg-elevated/80" :ui="{ header: 'p-3 pb-2', body: 'p-3 pt-1', footer: 'p-3 pt-2' }">
            <template #header>
                <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0 space-y-1">
                        <div class="flex min-w-0 flex-wrap items-center gap-2">
                            <span class="truncate font-semibold text-highlighted capitalize">{{ cleanLayerName }}</span>
                            <UBadge color="neutral" variant="soft" size="sm" :label="t('workspace.layerItem.raster')" />
                            <UBadge v-if="hasTimeDimension" color="info" variant="soft" size="sm" icon="i-lucide-clock" :label="t('workspace.layerItem.time')" :title="t('workspace.layerItem.timeSupport')" />
                        </div>
                        <div v-if="hasKeywords" class="flex min-w-0 flex-wrap gap-x-2 gap-y-0.5">
                            <span v-for="(keyword,index) in layerDetail?.coverage.keywords.string" :key="index" class="text-[0.6875rem] italic leading-tight text-muted">
                                #{{ keyword }}
                            </span>
                        </div>
                    </div>
                </div>
            </template>
            <div v-if="layerDetail" class="space-y-2">
                <div v-if="hasDescription" class="space-y-1">
                    <p ref="summaryElement" :class="['text-muted text-sm', isSummaryExpanded ? '' : 'line-clamp-2']">
                        {{ descriptionText }}
                    </p>
                    <UButton v-if="isSummaryTruncated || isSummaryExpanded" size="xs" color="neutral" variant="link" class="h-auto justify-start p-0" @click="isSummaryExpanded = !isSummaryExpanded">
                        {{ isSummaryExpanded ? t('workspace.layerItem.showLess') : t('workspace.layerItem.readMore') }}
                    </UButton>
                </div>
            </div>
            <div v-else class="space-y-2">
                <USkeleton class="h-4 w-full" />
                <USkeleton class="h-4 w-3/4" />
            </div>
            <template #footer>
                <div class="flex justify-end gap-2 flex-wrap">
                    <UButton size="sm" @click="add2Map(false)">{{ t('workspace.layerItem.addToMap') }}</UButton>
                    <UButton v-if="hasTimeDimension" size="sm" color="secondary" @click="add2Map(true)">{{ t('workspace.layerItem.addWithTime') }}</UButton>
                </div>
            </template>
        </UCard>
    </div>
    <div v-else class="w-full">
        <UAlert class="w-full" color="info" variant="soft" :description="t('workspace.layerItem.noInformation')" />
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { type GeoserverRasterTypeLayerDetail, type GeoserverLayerInfo, type GeoserverLayerListItem, getTimeDimension, resolveTimeDomain, useGeoserverStore } from "@store/geoserver";
import { type GeoServerSourceParams, type LayerParams, useMapStore } from "@store/map";
import { isNullOrEmpty } from "../../../core/helpers/functions";
import { useToast } from "@helpers/toast";

export interface Props {
    item: GeoserverLayerListItem
    workspace: string
    layerInformation: GeoserverLayerInfo
}
export interface LayerStylingPaint {
    paint: object
}
const props = defineProps<Props>()
const { t } = useI18n();
const toast = useToast()
const cleanLayerName = computed(() => {
    return ((layerDetail.value?.coverage.title) != null) ? String(layerDetail.value?.coverage.title).replaceAll("_", " ") : String(props.item.name).replaceAll("_", " ")
})
const hasTimeDimension = computed(() => {
    if (layerDetail.value === undefined) return false
    return getTimeDimension(layerDetail.value.coverage) !== null
})
const geoserver = useGeoserverStore()
const layerDetail = ref<GeoserverRasterTypeLayerDetail>()
const isSummaryExpanded = ref(false)
const isSummaryTruncated = ref(false)
const summaryElement = ref<HTMLElement>()
const descriptionText = computed(() => layerDetail.value?.coverage.description ?? "")
const hasDescription = computed(() => descriptionText.value.length > 0)
const hasKeywords = computed(() => (layerDetail.value?.coverage.keywords.string.length ?? 0) > 0)
geoserver.getLayerDetail(props.layerInformation.resource.href).then((detail) => {
    layerDetail.value = detail as GeoserverRasterTypeLayerDetail
}).catch(err => {
    toast.add({ severity: "error", summary: t("toast.error"), detail: err, life: 3000 });
})

const handleResize = (): void => {
    void updateSummaryTruncation()
}

onMounted(() => {
    window.addEventListener("resize", handleResize)
})

onBeforeUnmount(() => {
    window.removeEventListener("resize", handleResize)
})

watch(descriptionText, () => {
    isSummaryExpanded.value = false
    void nextTick(updateSummaryTruncation)
})

async function updateSummaryTruncation(): Promise<void> {
    await nextTick()
    const element = summaryElement.value
    if (element === undefined) {
        isSummaryTruncated.value = false
        return
    }

    isSummaryTruncated.value = element.scrollHeight > element.clientHeight + 1
}

const mapStore = useMapStore()
async function add2Map(withTime: boolean): Promise<void> {
    if (isNullOrEmpty(layerDetail.value)) return
    let initialTime: string | undefined
    if (withTime && hasTimeDimension.value) {
        try {
            const domain = await resolveTimeDomain(
                async (ws) => await geoserver.fetchWmsCapabilities(
                    ws,
                    false,
                    layerDetail.value?.catalog?.provider.id
                ),
                props.workspace,
                layerDetail.value!.coverage.name,
                layerDetail.value!.coverage
            )
            initialTime = domain.default
        } catch (err) {
            toast.add({ severity: "warn", summary: t("workspace.layerItem.timeDomainTitle"), detail: t("workspace.layerItem.timeDomainError"), life: 3000 })
        }
    }
    const sourceParams: GeoServerSourceParams = {
        sourceType: "geoserver",
        identifier: layerDetail.value!.coverage.name,
        isFilterLayer: false,
        workspaceName: props.workspace,
        layer: layerDetail.value!,
        sourceDataType: "raster",
        sourceProtocol: "wms",
        time: initialTime,
    }
    try {
        await mapStore.addMapDataSource(sourceParams)
        const layerParams: LayerParams = {
            sourceType: "geoserver",
            identifier: layerDetail.value!.coverage.name,
            layerType: "raster",
            geoserverLayerDetails: layerDetail.value!,
            sourceLayer: `${layerDetail.value!.coverage.name}`,
            displayName: layerDetail.value?.coverage.title ?? undefined,
            sourceDataType: "raster",
            sourceProtocol: "wms",
            workspaceName: props.workspace,
            time: initialTime,
        }
        await mapStore.addMapLayer(layerParams)
    } catch (error) {
        toast.add({ severity: "error", summary: t("toast.error"), detail: error, life: 3000 })
    }
}

</script>
<style scoped>
</style>

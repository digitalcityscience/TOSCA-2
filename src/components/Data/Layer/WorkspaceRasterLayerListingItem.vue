<template>
    <div v-if="props.item" class="layer-detail">
        <UCard class="workspace-layer-card bg-default/95 dark:bg-elevated/80" :ui="{ header: 'p-3 pb-2', body: 'p-3 pt-0', footer: 'p-3 pt-0' }">
            <template #header>
                <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0 space-y-1">
                        <div class="flex min-w-0 flex-wrap items-center gap-2">
                            <span class="truncate font-semibold text-highlighted capitalize">{{ cleanLayerName }}</span>
                            <UBadge color="neutral" variant="soft" size="sm" label="Raster" />
                            <UBadge v-if="hasTimeDimension" color="info" variant="soft" size="sm" icon="i-lucide-clock" label="Time" title="This layer supports time-based queries" />
                        </div>
                        <p v-if="layerDetail && layerDetail.coverage.description !== undefined && layerDetail.coverage.description.length > 0" class="line-clamp-2 hover:line-clamp-none xl:line-clamp-3 text-muted text-sm">
                            {{ layerDetail.coverage.description }}
                        </p>
                    </div>
                </div>
            </template>
            <div v-if="layerDetail" class="space-y-3 text-sm">
                <div class="grid grid-cols-[5.5rem_1fr] gap-3">
                    <span class="font-semibold uppercase tracking-wide text-muted text-xs self-start pt-1">Keywords</span>
                    <div class="flex min-w-0 flex-wrap gap-x-2 gap-y-1">
                        <span v-for="(keyword,index) in layerDetail.coverage.keywords.string" :key="index" class="italic text-muted">
                            #{{ keyword }}
                        </span>
                    </div>
                </div>
            </div>
            <div v-else class="space-y-2">
                <USkeleton class="h-4 w-full" />
                <USkeleton class="h-4 w-3/4" />
            </div>
            <template #footer>
                <div class="flex justify-end gap-2 flex-wrap">
                    <UButton size="sm" @click="add2Map(false)">Add to map</UButton>
                    <UButton v-if="hasTimeDimension" size="sm" color="secondary" @click="add2Map(true)">Add with time</UButton>
                </div>
            </template>
        </UCard>
    </div>
    <div v-else class="w-full">
        <UAlert class="w-full" color="info" variant="soft" description="No information about layer." />
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
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
geoserver.getLayerDetail(props.layerInformation.resource.href).then((detail) => {
    layerDetail.value = detail as GeoserverRasterTypeLayerDetail
}).catch(err => {
    toast.add({ severity: "error", summary: "Error", detail: err, life: 3000 });
})

const mapStore = useMapStore()
async function add2Map(withTime: boolean): Promise<void> {
    if (isNullOrEmpty(layerDetail.value)) return
    let initialTime: string | undefined
    if (withTime && hasTimeDimension.value) {
        try {
            const domain = await resolveTimeDomain(
                async (ws) => await geoserver.fetchWmsCapabilities(ws),
                props.workspace,
                layerDetail.value!.coverage.name,
                layerDetail.value!.coverage
            )
            initialTime = domain.default
        } catch (err) {
            toast.add({ severity: "warn", summary: "Time domain", detail: "Could not resolve time domain; adding without time.", life: 3000 })
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
        toast.add({ severity: "error", summary: "Error", detail: error, life: 3000 })
    }
}

</script>
<style scoped>
</style>

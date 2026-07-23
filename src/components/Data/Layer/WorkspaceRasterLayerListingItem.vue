<template>
    <div v-if="props.item" class="layer-detail first:pt-0 pt-1">
        <Card>
            <template #title>
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="capitalize">{{ cleanLayerName }}</span>
                    <UBadge v-if="hasTimeDimension" color="info" variant="soft" icon="i-lucide-clock" label="Time" title="This layer supports time-based queries" />
                </div>
            </template>
            <template #subtitle v-if="layerDetail">
                <span v-if="layerDetail.coverage.description !== undefined && layerDetail.coverage.description.length > 0">
                    <span class="line-clamp-3 hover:line-clamp-none xl:line-clamp-none">{{ layerDetail.coverage.description }}</span>
                </span>
                <span v-if="layerDetail.coverage.description !== undefined && layerDetail.coverage.description.length > 0">
                    <span class="line-clamp-3 hover:line-clamp-none xl:line-clamp-none">{{ layerDetail.coverage.description }}</span>
                </span>
            </template>
            <template #content v-if="layerDetail">
                <div class="grid grid-cols-4 w-full">
                    <span class="font-bold lg:col-span-2 2xl:col-span-2 3xl:col-span-2 4xl:col-span-1 self-center">Keywords:</span>
                    <span class="lg:col-span-2 2xl:col-span-2 3xl:col-span-2 4xl:col-span-3 pl-1">
                        <UBadge class="mb-1 mr-1 last:mr-0 font-light" color="primary" variant="solid" v-for="(keyword,index) in layerDetail.coverage.keywords.string" :key="index" :label="keyword" />
                    </span>
                </div>
                <div class="grid grid-cols-4 w-full pt-1">
                    <span class="font-bold lg:col-span-2 2xl:col-span-1">Data Type:</span>
                    <span class="lg:col-span-2 2xl:col-span-3 pl-1"> {{layerInformation ? layerInformation.type : "raster"}} </span>
                </div>
            </template>
            <template #footer>
                <div class="flex gap-2 flex-wrap">
                    <UButton size="sm" @click="add2Map(false)">Add to map</UButton>
                    <UButton v-if="hasTimeDimension" size="sm" color="secondary" @click="add2Map(true)">Add with time</UButton>
                </div>
            </template>
        </Card>
    </div>
    <div v-else class="first:pt-0 pt-1 w-full">
        <UAlert class="w-full" color="info" variant="soft" description="No information about layer." />
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { type GeoserverRasterTypeLayerDetail, type GeoserverLayerInfo, type GeoserverLayerListItem, getTimeDimension, resolveTimeDomain, useGeoserverStore } from "@store/geoserver";
import { type GeoServerSourceParams, type LayerParams, useMapStore } from "@store/map";
import Card from "primevue/card";
import { isNullOrEmpty } from "../../../core/helpers/functions";
import { useToast } from "primevue/usetoast";

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

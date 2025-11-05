<template>
    <div v-if="props.item" class="layer-detail first:pt-0 pt-1">
        <Card>
            <template #title>
                <span class="capitalize">{{ cleanLayerName }}</span>
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
                        <Tag class="mb-1 mr-1 last:mr-0 font-light" severity="primary" v-for="(keyword,index) in layerDetail.coverage.keywords.string" :key="index" :value="keyword"></Tag>
                    </span>
                </div>
                <div class="grid grid-cols-4 w-full pt-1">
                    <span class="font-bold lg:col-span-2 2xl:col-span-1">Data Type:</span>
                    <span class="lg:col-span-2 2xl:col-span-3 pl-1"> {{layerInformation ? layerInformation.type : "raster"}} </span>
                </div>
            </template>
            <template #footer>
                <div class="flex gap-2">
                    <Button size="small" @click="add2Map">Add to map</Button>
                    <Button size="small" severity="secondary" @click="startComparison">Compare</Button>
                </div>
            </template>
        </Card>
    </div>
    <div v-else class="first:pt-0 pt-1 w-full">
        <Message class="w-full" severity="info">No information about layer.</Message>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import Tag from "primevue/tag";
import Button from "primevue/button"
import Message from "primevue/message";
import { type GeoserverRasterTypeLayerDetail, type GeoserverLayerInfo, type GeoserverLayerListItem, useGeoserverStore } from "@store/geoserver";
import { type GeoServerSourceParams, type LayerParams, useMapStore } from "@store/map";
import { useComparisonStore } from "@store/comparison";
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
const geoserver = useGeoserverStore()
const layerDetail = ref<GeoserverRasterTypeLayerDetail>()
geoserver.getLayerDetail(props.layerInformation.resource.href).then((detail) => {
    layerDetail.value = detail as GeoserverRasterTypeLayerDetail
}).catch(err => {
    toast.add({ severity: "error", summary: "Error", detail: err, life: 3000 });
})

const mapStore = useMapStore()
const comparisonStore = useComparisonStore()

function resolveComparisonContainer(): HTMLElement | null {
    return document.querySelector(".mapview")
}

function buildLayerPayload(): { source: GeoServerSourceParams, layer: LayerParams } | undefined {
    if (isNullOrEmpty(layerDetail.value)) return undefined
    const detail = layerDetail.value!
    const sourceParams: GeoServerSourceParams = {
        sourceType: "geoserver",
        identifier: detail.coverage.name,
        isFilterLayer: false,
        workspaceName: props.workspace,
        layer: detail,
        sourceDataType: "raster",
        sourceProtocol: "wms",
    }
    const layerParams: LayerParams = {
        sourceType: "geoserver",
        identifier: detail.coverage.name,
        layerType: "raster",
        geoserverLayerDetails: detail,
        sourceLayer: `${detail.coverage.name}`,
        displayName: detail.coverage.title ?? undefined,
        sourceDataType: "raster",
        sourceProtocol: "wms",
        workspaceName: props.workspace,
    }
    return { source: sourceParams, layer: layerParams }
}

function add2Map(): void {
    const payload = buildLayerPayload()
    if (payload === undefined) {
        return
    }
    const { source: sourceParams, layer: layerParams } = payload
    mapStore.addMapDataSource(sourceParams).then(() => {
        mapStore.addMapLayer(layerParams).catch(error => {
            toast.add({ severity: "error", summary: "Error", detail: error, life: 3000 })
        })
    }).catch(error => {
        toast.add({ severity: "error", summary: "Error", detail: error, life: 3000 })
    })
}

async function startComparison(): Promise<void> {
    const payload = buildLayerPayload()
    if (payload === undefined) {
        toast.add({ severity: "warn", summary: "Comparison", detail: "Layer details are not ready yet.", life: 3000 })
        return
    }
    const container = resolveComparisonContainer()
    if (container === null) {
        toast.add({ severity: "error", summary: "Comparison", detail: "Comparison map container not found.", life: 3000 })
        return
    }
    const mainMap = mapStore.map
    if (mainMap === undefined) {
        toast.add({ severity: "error", summary: "Comparison", detail: "Main map is not ready yet.", life: 3000 })
        return
    }
    try {
        await comparisonStore.startComparison({
            mainMap,
            container,
            source: payload.source,
            layer: payload.layer,
        })
        toast.add({ severity: "success", summary: "Comparison", detail: "Layer loaded in comparison map.", life: 3000 })
    } catch (error) {
        toast.add({ severity: "error", summary: "Comparison", detail: String(error), life: 3000 })
    }
}

</script>
<style scoped>
</style>

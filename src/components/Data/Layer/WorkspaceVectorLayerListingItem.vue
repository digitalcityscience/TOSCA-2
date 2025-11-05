<template>
    <div v-if="props.item" class="first:pt-0 pt-1">
        <Card>
            <template #title>
                <span class="capitalize">{{ cleanLayerName }}</span>
            </template>
            <template #subtitle v-if="layerDetail && layerDetail?.featureType.abstract?.length > 0">
                <span class="line-clamp-3 hover:line-clamp-none xl:line-clamp-none">{{ layerDetail.featureType.abstract }}</span></template>
            <template #content v-if="layerDetail">
                <div class="grid grid-cols-4 w-full pt-1">
                    <span class="font-bold lg:col-span-2 2xl:col-span-2 3xl:col-span-2 4xl:col-span-1 self-center">Keywords:</span>
                    <span class="lg:col-span-2 2xl:col-span-2 3xl:col-span-2 4xl:col-span-3 pl-1">
                        <Tag class="mb-1 mr-1 last:mr-0" severity="primary" v-for="(keyword,index) in layerDetail.featureType.keywords.string" :key="index" :value="keyword"></Tag>
                    </span>
                </div>
                <div class="grid grid-cols-4 w-full pt-1" v-if="dataType">
                    <span class="font-bold lg:col-span-2 2xl:col-span-1">Data Type:</span>
                    <span class="lg:col-span-2 2xl:col-span-3 pl-1">{{ dataType }}</span>
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
import { type GeoServerVectorTypeLayerDetail, type GeoserverLayerInfo, type GeoserverLayerListItem, useGeoserverStore } from "@store/geoserver";
import { type GeoServerSourceParams, type LayerParams, type LayerStyleOptions, useMapStore } from "@store/map";
import { useComparisonStore } from "@store/comparison";
import Card from "primevue/card";
import { isNullOrEmpty } from "../../../core/helpers/functions";
import { useToast } from "primevue/usetoast";

export interface Props {
    item: GeoserverLayerListItem
    workspace: string
    layerInformation: GeoserverLayerInfo,
    layerStyling?: LayerStyleOptions
}
export interface LayerStylingPaint {
    paint: object
}
const props = defineProps<Props>()
const toast = useToast()
const cleanLayerName = computed(() => {
    return ((layerDetail.value?.featureType.title) != null) ? layerDetail.value?.featureType.title.replaceAll("_", " ") : props.item.name.replaceAll("_", " ")
})
const geoserver = useGeoserverStore()
const layerDetail = ref<GeoServerVectorTypeLayerDetail>()
geoserver.getLayerDetail(props.layerInformation.resource.href).then((detail) => {
    layerDetail.value = detail as GeoServerVectorTypeLayerDetail
}).catch(err => {
    toast.add({ severity: "error", summary: "Error", detail: err, life: 3000 });
})

const dataType = computed(() => {
    if (!isNullOrEmpty(layerDetail.value)) {
        const feature = layerDetail.value!.featureType.attributes.attribute.filter((att) => { return att.name.includes("geom") })
        return feature.length > 0 ? sanitizeDataType(feature[0].binding.split(".").slice(-1)[0]) : ""
    } else { return "" }
})
const sanitizeDataType = (type: string): string => {
    return type.replace(/multi|string/gi, "");
}

const mapStore = useMapStore()
const comparisonStore = useComparisonStore()

function resolveComparisonContainer(): HTMLElement | null {
    return document.querySelector(".mapview")
}

function buildLayerPayload(): { source: GeoServerSourceParams, layer: LayerParams } | undefined {
    if (isNullOrEmpty(layerDetail.value) || isNullOrEmpty(dataType.value)) return undefined
    const detail = layerDetail.value!
    const sourceParams: GeoServerSourceParams = {
        sourceType: "geoserver",
        identifier: detail.featureType.name,
        isFilterLayer: false,
        workspaceName: props.workspace,
        layer: detail,
        sourceDataType: "vector",
        sourceProtocol: "wmts",
    }
    const layerParams: LayerParams = {
        sourceType: "geoserver",
        identifier: detail.featureType.name,
        layerType: mapStore.geometryConversion(dataType.value),
        layerStyle: !isNullOrEmpty(props.layerStyling) ? { ...props.layerStyling } : undefined,
        geoserverLayerDetails: detail,
        sourceLayer: `${detail.featureType.name}`,
        displayName: detail.featureType.title ?? undefined,
        sourceDataType: "vector",
        sourceProtocol: "wmts",
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

<template>
    <div v-if="props.item" class="first:pt-0 pt-1">
        <UCard class="workspace-layer-card bg-default/95 dark:bg-elevated/80" :ui="{ header: 'p-3', body: 'p-3', footer: 'p-3' }">
            <template #header>
                <div class="space-y-1">
                    <span class="capitalize">{{ cleanLayerName }}</span>
                    <span v-if="layerDetail && layerDetail?.featureType.abstract?.length > 0" class="block line-clamp-3 hover:line-clamp-none xl:line-clamp-none text-muted text-sm">{{ layerDetail.featureType.abstract }}</span>
                </div>
            </template>
            <template v-if="layerDetail">
                <div class="grid grid-cols-4 w-full pt-1">
                    <span class="font-bold lg:col-span-2 2xl:col-span-2 3xl:col-span-2 4xl:col-span-1 self-center">Keywords:</span>
                    <span class="lg:col-span-2 2xl:col-span-2 3xl:col-span-2 4xl:col-span-3 pl-1">
                        <UBadge class="mb-1 mr-1 last:mr-0" color="primary" variant="solid" v-for="(keyword,index) in layerDetail.featureType.keywords.string" :key="index" :label="keyword" />
                    </span>
                </div>
                <div class="grid grid-cols-4 w-full pt-1" v-if="dataType">
                    <span class="font-bold lg:col-span-2 2xl:col-span-1">Data Type:</span>
                    <span class="lg:col-span-2 2xl:col-span-3 pl-1">{{ dataType }}</span>
                </div>
            </template>
            <template #footer>
                <UButton size="sm" @click="add2Map">Add to map</UButton>
            </template>
        </UCard>
    </div>
    <div v-else class="first:pt-0 pt-1 w-full">
        <UAlert class="w-full" color="info" variant="soft" description="No information about layer." />
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { type GeoServerVectorTypeLayerDetail, type GeoserverLayerInfo, type GeoserverLayerListItem, useGeoserverStore } from "@store/geoserver";
import { type GeoServerSourceParams, type LayerParams, type LayerStyleOptions, useMapStore } from "@store/map";
import { isNullOrEmpty } from "../../../core/helpers/functions";
import { useToast } from "@helpers/toast";

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
function add2Map(): void{
    if (!isNullOrEmpty(layerDetail.value)) {
        const sourceParams: GeoServerSourceParams = {
            sourceType:"geoserver",
            identifier:layerDetail.value!.featureType.name,
            isFilterLayer:false,
            workspaceName:props.workspace,
            layer:layerDetail.value!,
            sourceDataType:"vector",
            sourceProtocol:"wmts"
        }
        mapStore.addMapDataSource(sourceParams).then(() => {
            if (!isNullOrEmpty(dataType) && !isNullOrEmpty(layerDetail.value)) {
                const layerParams: LayerParams = {
                    sourceType:"geoserver",
                    identifier:layerDetail.value!.featureType.name,
                    layerType:mapStore.geometryConversion(dataType.value),
                    layerStyle:!isNullOrEmpty(props.layerStyling) ? { ...props.layerStyling }: undefined,
                    geoserverLayerDetails:layerDetail.value!,
                    sourceLayer:`${layerDetail.value!.featureType.name}`,
                    displayName:layerDetail.value?.featureType.title ?? undefined,
                    sourceDataType:"vector",
                    sourceProtocol:"wmts",
                    workspaceName:props.workspace,
                }
                mapStore.addMapLayer(layerParams).then(()=>{
                }).catch(error => {
                    toast.add({ severity: "error", summary: "Error", detail: error, life: 3000 });
                })
            }
        }).catch(error => {
            toast.add({ severity: "error", summary: "Error", detail: error, life: 3000 });
        })
    }
}
</script>

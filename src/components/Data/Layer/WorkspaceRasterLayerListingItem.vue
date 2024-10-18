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
                <Button size="small" @click="add2Map">Add to map</button>
            </template>
        </Card>
    </div>
    <div v-else class="first:pt-0 pt-1 w-full">
        <InlineMessage class="w-full" severity="info">No information about layer.</InlineMessage>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import Tag from "primevue/tag";
import Button from "primevue/button"
import InlineMessage from "primevue/inlinemessage";
import { type GeoserverRasterTypeLayerDetail, type GeoserverLayerInfo, type GeoserverLayerListItem, useGeoserverStore } from "@store/geoserver";
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
const geoserver = useGeoserverStore()
const layerDetail = ref<GeoserverRasterTypeLayerDetail>()
geoserver.getLayerDetail(props.layerInformation.resource.href).then((detail) => {
    layerDetail.value = detail as GeoserverRasterTypeLayerDetail
}).catch(err => {
    toast.add({ severity: "error", summary: "Error", detail: err, life: 3000 });
})

const mapStore = useMapStore()
function add2Map(): void{
    if (!isNullOrEmpty(layerDetail.value)) {
        const sourceParams: GeoServerSourceParams = {
            sourceType:"geoserver",
            identifier:layerDetail.value!.coverage.name,
            isFilterLayer:false,
            workspaceName:props.workspace,
            layer:layerDetail.value!,
            sourceDataType:"raster",
            sourceProtocol:"wms"
        }
        mapStore.addMapDataSource(sourceParams).then(() => {
            if (!isNullOrEmpty(layerDetail.value)) {
                const layerParams: LayerParams = {
                    sourceType:"geoserver",
                    identifier:layerDetail.value!.coverage.name,
                    layerType:"raster",
                    geoserverLayerDetails:layerDetail.value!,
                    sourceLayer:`${layerDetail.value!.coverage.name}`,
                    displayName:layerDetail.value?.coverage.title ?? undefined,
                    sourceDataType:"raster",
                    sourceProtocol:"wms",
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
<style scoped>
</style>

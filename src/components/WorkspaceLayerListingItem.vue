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
                    <span class="font-bold col-span-1 self-center">Keywords:</span>
                    <span class="col-span-3 pl-1">
                        <Chip class="ml-1 first:ml-0" v-for="(keyword,index) in layerDetail.featureType.keywords.string" :key="index" :label="keyword" :pt="passThroughChip"></Chip>
                    </span>
                </div>
                <div class="grid grid-cols-4 w-full pt-1" v-if="dataType">
                    <span class="font-bold col-span-1">Data Type:</span>
                    <span class="col-span-3 pl-1">{{ dataType }}</span>
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
import Chip from "primevue/chip";
import Button from "primevue/button"
import InlineMessage from "primevue/inlinemessage";
import { type GeoServerFeatureType, type GeoserverLayerInfo, type GeoserverLayerListItem, useGeoserverStore } from "../store/geoserver";
import { type LayerStyleOptions, useMapStore } from "../store/map";
import Card from "primevue/card";
import { isNullOrEmpty } from "../core/helpers/functions";

export interface Props {
    item: GeoserverLayerListItem
    workspace: string
}
export interface LayerStylingPaint {
    paint: object
}
const props = defineProps<Props>()
const cleanLayerName = computed(() => {
    return props.item.name.replaceAll("_", " ")
})
const geoserver = useGeoserverStore()
const layerInformation = ref<GeoserverLayerInfo>()
const layerDetail = ref<GeoServerFeatureType>()
const layerStyling = ref<LayerStyleOptions>()
geoserver.getLayerInformation(props.item, props.workspace).then((response) => {
    layerInformation.value = response.layer
    // Currently we are just picking styles which has include mbstyle in name. Further optimization needed after some period
    // TODO: remove mbstyle selector
    if (response.layer.defaultStyle.href.includes("mbstyle")){
        const regex = /\.json\b/;
        const url = response.layer.defaultStyle.href.replace(regex, ".mbstyle")
        geoserver.getLayerStyling(url).then(style => {
            if (style.layers.length > 0){
                const obj: LayerStyleOptions = {
                    paint:{ ...style.layers[0].paint }
                }
                if (Object.prototype.hasOwnProperty.call(style.layers[0] as LayerStyleOptions, "layout")){
                    obj.layout = style.layers[0].layout
                }
                if (Object.prototype.hasOwnProperty.call(style.layers[0] as LayerStyleOptions, "minzoom")){
                    obj.minzoom = style.layers[0].minzoom
                }
                if (Object.prototype.hasOwnProperty.call(style.layers[0] as LayerStyleOptions, "maxzoom")){
                    obj.maxzoom = style.layers[0].maxzoom
                }
                layerStyling.value = obj
            }
        }).catch((error) => {
            window.alert(error)
        })
    }
    if (layerInformation.value !== undefined) {
        geoserver.getLayerDetail(layerInformation.value?.resource.href).then((detail) => {
            layerDetail.value = detail
        }).catch(err => { window.alert(err) })
    }
}).catch(err => { window.alert(err) })

const dataType = computed(() => {
    if (!isNullOrEmpty(layerDetail.value)) {
        const feature = layerDetail.value!.featureType.attributes.attribute.filter((att) => { return att.name === "geom" })
        return feature.length > 0 ? feature[0].binding.split(".").slice(-1)[0] : ""
    } else { return "" }
})

const mapStore = useMapStore()
function add2Map(): void{
    if (!isNullOrEmpty(layerDetail.value)) {
        mapStore.addMapDataSource(
            "geoserver",
            layerDetail.value!.featureType.name,
            false,
            props.workspace,
            layerDetail.value).then(() => {
            if (!isNullOrEmpty(dataType) && !isNullOrEmpty(layerDetail.value)) {
                mapStore.addMapLayer(
                    "geoserver",
                    layerDetail.value!.featureType.name,
                    mapStore.geometryConversion(dataType.value),
                    !isNullOrEmpty(layerStyling.value) ? { ...layerStyling.value }: undefined,
                    layerDetail.value,
                    `${layerDetail.value!.featureType.name}`,
                    undefined,
                    false,
                    layerDetail.value?.featureType.title ?? undefined
                ).then(()=>{
                }).catch(error => {
                    window.alert(error)
                })
            }
        }).catch(error => {
            window.alert(error)
        })
    }
}
// special styling variable for chip component
const passThroughChip = ref({
    root: {
        class: [
        // Flexbox
            "inline-flex items-center",

            // Spacing
            "px-2",

            // Shape
            "rounded-[1rem]",

            // Colors
            "text-white dark:text-surface-700",
            "bg-primary-500 dark:bg-primary-400/85"
        ]
    }
})
</script>

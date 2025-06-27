<template>
    <div v-if="props.item && layerInformation" class="first:pt-0 pt-1">
        <div v-if="layerInformation.type ==='RASTER'">
            <WorkspaceRasterLayerListingItem :item="props.item" :workspace="props.workspace" :layerInformation="layerInformation"></WorkspaceRasterLayerListingItem>
        </div>
        <div v-if="layerInformation.type ==='VECTOR'">
            <WorkspaceVectorLayerListingItem :item="props.item" :workspace="props.workspace" :layerInformation="layerInformation" :layerStyling="layerStyling"></WorkspaceVectorLayerListingItem>
        </div>
    </div>
    <div v-else class="first:pt-0 pt-1 w-full">
        <Message class="w-full" severity="info">No information about layer.</Message>
    </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import Message from "primevue/message";
import { type GeoServerVectorTypeLayerDetail, type GeoserverLayerInfo, type GeoserverLayerListItem, useGeoserverStore } from "@store/geoserver";
import { type LayerStyleOptions } from "@store/map";
import { useToast } from "primevue/usetoast";
import WorkspaceRasterLayerListingItem from "./WorkspaceRasterLayerListingItem.vue";
import WorkspaceVectorLayerListingItem from "./WorkspaceVectorLayerListingItem.vue";

export interface Props {
    item: GeoserverLayerListItem
    workspace: string
}
export interface LayerStylingPaint {
    paint: object
}
const props = defineProps<Props>()
const toast = useToast()
const geoserver = useGeoserverStore()
const layerInformation = ref<GeoserverLayerInfo>()
const layerDetail = ref<GeoServerVectorTypeLayerDetail>()
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
            toast.add({ severity: "error", summary: "Error", detail: error, life: 3000 });
        })
    }
    if (layerInformation.value !== undefined) {
        geoserver.getLayerDetail(layerInformation.value?.resource.href).then((detail) => {
            layerDetail.value = detail as GeoServerVectorTypeLayerDetail
        }).catch(err => {
            toast.add({ severity: "error", summary: "Error", detail: err, life: 3000 });
        })
    }
}).catch(err => {
    toast.add({ severity: "error", summary: "Error", detail: err, life: 3000 });
})
</script>

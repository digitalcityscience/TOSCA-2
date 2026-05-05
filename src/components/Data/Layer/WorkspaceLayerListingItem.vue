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
import { type GeoserverLayerInfo, type GeoserverLayerListItem, useGeoserverStore } from "@store/geoserver";
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
const layerStyling = ref<LayerStyleOptions>()
logWorkspaceTiming("layer-item:setup", {
    workspace: props.workspace,
    layer: props.item.name,
})
const layerInfoStartedAt = performance.now()
logWorkspaceTiming("layer-info:request", {
    workspace: props.workspace,
    layer: props.item.name,
})
geoserver.getLayerInformation(props.item, props.workspace).then((response) => {
    layerInformation.value = response.layer
    logWorkspaceTiming("layer-info:loaded", {
        workspace: props.workspace,
        layer: props.item.name,
        type: response.layer?.type,
        durationMs: Math.round(performance.now() - layerInfoStartedAt),
    })
    // Currently we are just picking styles which has include mbstyle in name. Further optimization needed after some period
    // TODO: remove mbstyle selector
    if (response.layer.defaultStyle.href.includes("mbstyle")){
        const regex = /\.json\b/;
        const url = response.layer.defaultStyle.href.replace(regex, ".mbstyle")
        const styleStartedAt = performance.now()
        logWorkspaceTiming("layer-style:request", {
            workspace: props.workspace,
            layer: props.item.name,
            url,
        })
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
            logWorkspaceTiming("layer-style:loaded", {
                workspace: props.workspace,
                layer: props.item.name,
                durationMs: Math.round(performance.now() - styleStartedAt),
            })
        }).catch((error) => {
            toast.add({ severity: "error", summary: "Error", detail: error, life: 3000 });
        })
    }
}).catch(err => {
    toast.add({ severity: "error", summary: "Error", detail: err, life: 3000 });
})
function logWorkspaceTiming(message: string, details?: Record<string, unknown>): void {
    console.log(
        `[tosca-perf ${new Date().toISOString()} +${performance.now().toFixed(1)}ms] workspace:${message}`,
        details ?? ""
    )
}
</script>

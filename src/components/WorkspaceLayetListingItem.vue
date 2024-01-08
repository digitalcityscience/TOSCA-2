<template>
    <Card v-if="props.item">
        <template #title>
            <span class="capitalize">{{ cleanLayerName }}</span>
        </template>
        <template #subtitle v-if="props.workspace">{{ props.workspace }}</template>
        <template #content v-if="layerDetail">
            <p>Meta: {{ layerDetail.featureType.abstract }}</p>
            <p>Keywords: {{ layerDetail.featureType.keywords.string }}</p>
            <p v-if="dataType">Data Type: {{ dataType }}</p>
        </template>
        <template #footer>
            <button @click="add2Map">Add to map</button>
        </template>
    </Card>
    <div v-else>
        No information about layer
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
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
        mapStore.addSrc(layerDetail.value!, props.workspace, layerDetail.value!.featureType.name).then(() => {
            if (!isNullOrEmpty(dataType) && !isNullOrEmpty(layerDetail.value)) {
                mapStore.addLyr(layerDetail.value!.featureType.name, mapStore.geometryConversion(dataType.value), layerDetail.value!, `${layerDetail.value!.featureType.name}`, !isNullOrEmpty(layerStyling.value) ? { ...layerStyling.value }: undefined).then(()=>{
                    console.info(mapStore.map)
                }).catch(error => {
                    console.log(mapStore.map.value.getStyle().layers)
                    window.alert(error)
                })
            }
        }).catch(error => {
            window.alert(error)
        })
    }
}
</script>

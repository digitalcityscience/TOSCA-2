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
import { useMapStore } from "../store/map";
import Card from "primevue/card";
import { isNullOrEmpty } from "../core/helpers/functions";

export interface Props {
    item: GeoserverLayerListItem
    workspace: string
}
const props = defineProps<Props>()
const cleanLayerName = computed(() => {
    return props.item.name.replaceAll("_", " ")
})
const geoserver = useGeoserverStore()
const layerInformation = ref<GeoserverLayerInfo>()
const layerDetail = ref<GeoServerFeatureType>()
geoserver.getLayerInformation(props.item, props.workspace).then((response) => {
    layerInformation.value = response.layer
    if (layerInformation.value !== undefined) {
        geoserver.getLayerDetail(layerInformation.value?.resource.href).then((detail) => {
            layerDetail.value = detail
        }).catch(err => { console.error(err) })
    }
}).catch(err => { console.log(err) })

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
                mapStore.addLyr(layerDetail.value!.featureType.name, mapStore.geometryConversion(dataType.value), layerDetail.value!, `${layerDetail.value!.featureType.name}`).then(()=>{
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

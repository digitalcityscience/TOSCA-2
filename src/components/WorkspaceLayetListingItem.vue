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
            
        </template>
    </Card>
    <div v-else>
        No information about layer
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { GeoServerFeatureType, GeoserverLayerInfo, GeoserverLayerListItem, useGeoserverStore } from '../store/geoserver';
import Card from 'primevue/card';

export interface Props {
    item: GeoserverLayerListItem
    workspace: string
}
const props = defineProps<Props>()
const cleanLayerName = computed(() => {
    return props.item ? props.item.name.replaceAll('_', ' ') : 'No name'
})
const geoserver = useGeoserverStore()
const layerInformation = ref<GeoserverLayerInfo>()
const layerDetail = ref<GeoServerFeatureType>()
geoserver.getLayerInformation(props.item, props.workspace).then((response) => {
    layerInformation.value = response.layer
    if (layerInformation.value) {
        geoserver.getLayerDetail(layerInformation.value?.resource.href).then((detail) => {
            layerDetail.value = detail
        }).catch(err => console.error(err))
    }
}).catch(err => console.log(err))

const dataType = computed(() => {
    if (layerDetail.value) {
        let feature = layerDetail.value.featureType.attributes.attribute.filter((att) => { return att.name == "geom" })
        return feature ? feature[0].binding.split('.').slice(-1)[0] : ''
    } else { return '' }
})
</script>

<style scoped></style>
<template>
	<div class="geometry-filter" v-if="(props.layer.filterLayer === undefined)">
		<div class="new-filter">
			<Card>
				<template #title>Geometry Filtering</template>
				<template #subtitle>Select geometry layer to filter this layer</template>
				<template #content>
						<div>{{ Object.prototype.hasOwnProperty.call(props.layer,"filterLayer") }}</div>
						<div v-if="filterLayerList.length>0">
							<Dropdown v-model="selectedFilterLayer" @change="dropdownFitter" :options="filterLayerList" option-label="source" show-clear
							placeholder="Select an filter layer"></Dropdown>
						</div>
					<div v-else>There is no layer for filter. Please draw a layer first!</div>
				</template>
				<template #footer>
					<Button :disabled="selectedFilterLayer === undefined">Add Filter</Button>
				</template>
			</Card>
		</div>
	</div>
</template>

<script setup lang="ts">
import Dropdown, { type DropdownChangeEvent } from "primevue/dropdown";
import Card from "primevue/card";
import Button from "primevue/button";
import { type CustomAddLayerObject, useMapStore, type LayerObjectWithAttributes } from "../store/map";
import { computed, ref } from "vue";
import bbox from "@turf/bbox"
import { type FeatureCollection } from "geojson";
import { isNullOrEmpty } from "../core/helpers/functions";
export interface Props {
    layer: LayerObjectWithAttributes
}
const props = defineProps<Props>()
const mapStore = useMapStore()
const selectedFilterLayer = ref<CustomAddLayerObject>()
const filterLayerList = computed(() => {
    return mapStore.layersOnMap.filter((layer) => { return layer.filterLayer === true })
})
function dropdownFitter(event: DropdownChangeEvent): void{
    if (!isNullOrEmpty(event.value)){
        fitToFilterLayer((event.value as CustomAddLayerObject).filterLayerData!)
    }
}
/**
 * Gets target layer, creates bbox and fits map to this bbox
 * @param layerName
 */
function fitToFilterLayer(filterLayerData: FeatureCollection): void{
    // const features = mapStore.map.querySourceFeatures(layerName)
    console.log(filterLayerData)
    if (filterLayerData.features.length > 0){
        const box = bbox(filterLayerData)
        console.log(box)
        mapStore.map.fitBounds(box, { padding: { top: 40, bottom:40, left: 40, right: 40 } })
    }
}
</script>

<style scoped></style>

<template>
	<div class="geometry-filter" v-if="(props.layer.filterLayer === undefined)">
		<div class="new-filter" v-if="!hasGeometryFilter">
			<Card>
				<template #title>Geometry Filtering</template>
				<template #subtitle>Select geometry layer to filter this layer</template>
				<template #content>
					<div class="filterlayer-dropdown">
						<div v-if="filterLayerList.length>0">
							<Dropdown v-model="selectedFilterLayer" @change="dropdownFitter" :options="filterLayerList" option-label="source" show-clear
							placeholder="Select an filter layer"></Dropdown>
						</div>
						<div v-else>There is no layer for filter. Please draw a layer first!</div>
					</div>
					<div v-if="selectedFilterLayer"  class="identifier-dropdown">
							<Dropdown v-model="selectedProperty" @change="checker" :options="filteredAttributes" option-label="name" show-clear placeholder="Select Identifier">
							</Dropdown>
					</div>
				</template>
				<template #footer>
					<Button :disabled="(isNullOrEmpty(selectedFilterLayer) || isNullOrEmpty(selectedProperty))" @click="applyGeometryFilter">Add Filter</Button>
				</template>
			</Card>
		</div>
        <div class="existing-filter" v-else>
            You have a geometry filter
            <Button @click="removeGeometryFilter">Delete</Button>
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
import { type GeometryFilterItem, useFilterStore } from "../store/filter";
import { type GeoServerFeatureTypeAttribute } from "../store/geoserver";
export interface Props {
    layer: LayerObjectWithAttributes
}
const props = defineProps<Props>()
const mapStore = useMapStore()
const selectedFilterLayer = ref<CustomAddLayerObject>()
const filterLayerList = computed(() => {
    return mapStore.layersOnMap.filter((layer) => { return layer.filterLayer === true })
})
const hasGeometryFilter = computed(()=>{
    return filterStore.appliedFiltersList.filter((layer)=> { return layer.layerName === props.layer.id && layer.geometryFilters !== undefined }).length > 0
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
        mapStore.map.fitBounds(box, { padding: { top: 40, bottom:40, left: 40, right: 40 }, minZoom:16 })
        mapStore.map.once("data", `layer-${props.layer.source}`, (event: any)=>{
            console.log("once event is: ", event)
        })
    }
}

// Identifier selection logic
/**
 * First we are going to check has layer any attribute named 'id', 'gid' or 'uuid' in order.
 * If there is no match we are showing dropdown empty. Then users can select their own identifier.
 */
const filterStore = useFilterStore()
const filteredAttributes = computed(() => {
    return props.layer.details.featureType.attributes.attribute.filter(attr => filterStore.allowedIDBindings.includes(attr.binding))
})
const selectedProperty = ref<GeoServerFeatureTypeAttribute>()
function checker(event: DropdownChangeEvent): void{
    console.log("selected attr :", event.value)
}
/**
 * Checks geometry filter result array and other variables. If all variables checks populates geometry filter. Otherwise deletes filter.
 */
function applyGeometryFilter(): void{
    console.log("applying geometry filter")
    if (selectedFilterLayer.value?.filterLayerData != null && selectedProperty.value?.name != null && selectedProperty.value.name !== ""){
        const filterArray: Array<string|number> = filterStore.createGeometryFilter(props.layer.id, {
            filterGeoJSON: selectedFilterLayer.value.filterLayerData,
            identifier: selectedProperty.value?.name
        })
        if (filterArray.length > 0){
            const item: GeometryFilterItem = {
                filterGeoJSON: selectedFilterLayer.value.filterLayerData,
                identifier: selectedProperty.value?.name,
                filterArray
            }
            filterStore.addGeometryFilter(props.layer.id, item).then((response)=>{
                filterStore.populateLayerFilter(response, "AND").then((expression)=> {
                    if (expression.length > 1){
                        mapStore.map.setFilter(props.layer.id, expression)
                    } else {
                        mapStore.map.setFilter(props.layer.id, null)
                    }
                }).catch((error)=>{
                    mapStore.map.setFilter(props.layer.id, null)
                    window.alert(error)
                })
            }).catch((error)=>{
                window.alert(error)
            })
        }
    }
}
function removeGeometryFilter(): void{
    filterStore.removeGeometryFilter(props.layer.id).then((response)=>{
        filterStore.populateLayerFilter(response, "AND").then((expression)=>{
            if (expression.length > 1){
                mapStore.map.setFilter(props.layer.id, expression)
            } else {
                mapStore.map.setFilter(props.layer.id, null)
            }
        }).catch((error)=>{ window.alert(error) })
    }).catch((error)=>{
        mapStore.map.setFilter(props.layer.id, null)
        window.alert(error)
    })
}
</script>

<style scoped></style>

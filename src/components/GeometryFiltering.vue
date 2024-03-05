<template>
	<div class="geometry-filter" v-if="(props.layer.filterLayer === undefined && isPolygonTiles)">
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
                        <div class="w-full no-current-filter py-2" v-else>
                            <InlineMessage class="w-full" severity="info">There is no layer for filter. Draw a layer first!</InlineMessage>
                        </div>
					</div>
					<div v-if="selectedFilterLayer"  class="identifier-dropdown">
							<Dropdown v-model="selectedProperty" @change="checker" :options="filteredAttributes" option-label="name" show-clear placeholder="Select Identifier">
							</Dropdown>
					</div>
				</template>
				<template #footer>
                    <div class="w-full flex flex-row-reverse pt-2">
                        <Button :disabled="(isNullOrEmpty(selectedFilterLayer) || isNullOrEmpty(selectedProperty))" @click="applyGeometryFilter">Add Filter</Button>
                    </div>
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
import InlineMessage from "primevue/inlinemessage";
import { type CustomAddLayerObject, useMapStore, type LayerObjectWithAttributes } from "../store/map";
import { computed, ref } from "vue";
import bbox from "@turf/bbox"
import bboxPolygon from "@turf/bbox-polygon"
import { type FeatureCollection, type Feature } from "geojson";
import { isNullOrEmpty } from "../core/helpers/functions";
import { type GeometryFilterItem, useFilterStore } from "../store/filter";
import { type GeoServerFeatureTypeAttribute } from "../store/geoserver";
import { type LngLatBounds } from "maplibre-gl";
import booleanWithin from "@turf/boolean-within";
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
const isPolygonTiles = computed(()=>{
    const sourceID = props.layer.id.split("-").slice(1).join("")
    if (mapStore.map.getSource(sourceID) !== undefined && mapStore.map.getSource(sourceID).type === "vector" && props.layer.type === "fill"){
        return true
    } else {
        return false
    }
})
function dropdownFitter(event: DropdownChangeEvent): void{
    if (!isNullOrEmpty(event.value)){
        fitToFilterLayer((event.value as CustomAddLayerObject).filterLayerData!).then(
            () => {},
            () => {},
        )
    }
}
/**
 * Gets target layer, creates bbox and fits map to this bbox
 * @param layerName
 */
async function fitToFilterLayer(filterLayerData: FeatureCollection): Promise<void>{
    if (filterLayerData.features.length > 0){
        const box = bbox(filterLayerData)
        mapStore.map.fitBounds(box, { padding: { top: 40, bottom:40, left: 40, right: 40 }, minZoom:16 })
        await new Promise<void>((resolve) => {
            mapStore.map.once("moveend", () => {
                resolve();
            });
        });
    }
}
function isFilterLayerInView(filterLayerData: FeatureCollection): boolean{
    const mapBounds: LngLatBounds = mapStore.map.getBounds()
    const screenBox: Feature = bboxPolygon([mapBounds.getWest(), mapBounds.getSouth(), mapBounds.getEast(), mapBounds.getNorth()])
    for (const feature of filterLayerData.features) {
        const featureBox: Feature = bboxPolygon(bbox(feature))
        if (booleanWithin(featureBox, screenBox)){
            return true
        }
    }
    return false
}
// Identifier selection logic
/**
 * First we are going to check has layer any attribute named 'id', 'gid' or 'uuid' in order.
 * If there is no match we are showing dropdown empty. Then users can select their own identifier.
 */
const filterStore = useFilterStore()
const filteredAttributes = computed(() => {
    return props.layer.details?.featureType.attributes.attribute.filter(attr => filterStore.allowedIDBindings.includes(attr.binding))
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
        if (!isFilterLayerInView(selectedFilterLayer.value.filterLayerData)){
            fitToFilterLayer(selectedFilterLayer.value.filterLayerData).then(() => {
                geomFilterApplier()
            }).catch((error)=>{ window.alert(error) })
        } else {
            geomFilterApplier()
        }
    }
}
function geomFilterApplier(): void{
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

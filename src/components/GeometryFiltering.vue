<template>
	<div class="geometry-filter w-full" v-if="(props.layer.filterLayer === undefined && isPolygonTiles)">
		<div class="new-filter w-full pt-2" v-if="!hasGeometryFilter">
			<Card>
				<template #title>Geometry Filtering</template>
				<template #subtitle>Select geometry layer to filter this layer</template>
				<template #content>
					<div class="filterlayer-dropdown w-full">
						<div v-if="filterLayerList.length>0">
							<Dropdown class="w-full" v-model="selectedFilterLayer" @change="dropdownFitter" :options="filterLayerList" option-label="source" show-clear
							placeholder="Select a filter layer"></Dropdown>
						</div>
                        <div class="w-full no-current-filter py-2" v-else>
                            <InlineMessage class="w-full" severity="info">There is no layer for filter. Draw a layer first!</InlineMessage>
                        </div>
					</div>
					<div v-if="selectedFilterLayer && props.layer.type==='fill'"  class="identifier-dropdown w-full py-2">
							<Dropdown class="w-full" v-model="selectedProperty" :options="filteredAttributes" option-label="name" show-clear placeholder="Select Identifier">
							</Dropdown>
					</div>
				</template>
				<template #footer>
                    <div class="w-full flex flex-row-reverse">
                        <Button size="small" :disabled="(isNullOrEmpty(selectedFilterLayer) || (props.layer.type === 'fill' && isNullOrEmpty(selectedProperty)))" @click="applyGeometryFilter">Add Filter</Button>
                    </div>
				</template>
			</Card>
		</div>
        <div class="existing-filter pt-2" v-else>
            <Card>
                <template #content>
                    <div class="flex flex-row justify-between w-full">
                        <span class="self-center">You have a geometry filter</span>
                        <Button @click="removeGeometryFilter" severity="danger" text rounded>
                            <template #icon>
                                <i class="pi pi-times"></i>
                            </template></Button>
                    </div>
                </template>
            </Card>
        </div>
	</div>
</template>

<script setup lang="ts">
import Dropdown, { type DropdownChangeEvent } from "primevue/dropdown";
import Card from "primevue/card";
import Button from "primevue/button";
import InlineMessage from "primevue/inlinemessage";
import { type CustomAddLayerObject, useMapStore, type LayerObjectWithAttributes } from "../store/map";
import { computed, onMounted, ref } from "vue";
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
    const sourceID = props.layer.source
    if (mapStore.map.getSource(sourceID) !== undefined && mapStore.map.getSource(sourceID).type === "vector" && (props.layer.type === "fill" || props.layer.type === "circle" || props.layer.type === "line")){
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
/**
Checks if the geometry of a filter layer is currently visible
within the map bounds.
@param {FeatureCollection} filterLayerData - The filter layer data
@returns {boolean} True if the layer is within the bounds, false otherwise
*/
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
onMounted(()=>{
    identifierChecker()
})
/**
Checks if the layer details contain an identifier attribute
(either "gid" or "id") and sets the selected property value
accordingly.
@param {Object} props - The component props
@returns {void}
*/
function identifierChecker(): void{
    if (props.layer.details !== undefined) {
        const hasGID = props.layer.details?.featureType.attributes.attribute.some(attr => {
            if (attr.name === "gid"){
                return true
            }
            return false
        })
        const hasID = props.layer.details?.featureType.attributes.attribute.some(attr => {
            if (attr.name === "id"){
                return true
            }
            return false
        })
        if (hasGID) {
            selectedProperty.value = filteredAttributes.value?.filter((attr) => { return attr.name === "gid" })[0]
        } else {
            if (hasID) {
                selectedProperty.value = filteredAttributes.value?.filter((attr) => { return attr.name === "gid" })[0]
            }
        }
    }
}
const selectedProperty = ref<GeoServerFeatureTypeAttribute>()
/**
 * Checks geometry filter result array and other variables. If all variables checks populates geometry filter. Otherwise deletes filter.
 */
function applyGeometryFilter(): void{
    if (selectedFilterLayer.value?.filterLayerData != null && ((selectedProperty.value?.name != null && selectedProperty.value.name !== "" && props.layer.type === "fill") || props.layer.type === "circle" || props.layer.type ==="line")){
        if (!isFilterLayerInView(selectedFilterLayer.value.filterLayerData)){
            fitToFilterLayer(selectedFilterLayer.value.filterLayerData).then(() => {
                geomFilterApplier()
            }).catch((error)=>{ window.alert(error) })
        } else {
            geomFilterApplier()
        }
    }
}
/**
Applies a geometry filter to the layer by creating and adding
a filter to the store, then setting the filter on the map.
@param {Object} props - The component props
@returns {void}
 */
function geomFilterApplier(): void{
    console.log("applying geom filter")
    console.log("layer type is: ", props.layer.type)
    if (props.layer.type === "fill"){
        if (selectedFilterLayer.value?.filterLayerData != null && selectedProperty.value?.name != null && selectedProperty.value.name !== ""){
            const filterArray: Array<string|number> = filterStore.createGeometryFilter(props.layer.id, {
                filterGeoJSON: selectedFilterLayer.value.filterLayerData,
                identifier: selectedProperty.value?.name
            })
            if (filterArray.length > 0){
                const item: GeometryFilterItem = {
                    filterGeoJSON: selectedFilterLayer.value.filterLayerData,
                    targetLayerSourceType: props.layer.type,
                    identifier: selectedProperty.value?.name,
                    filterArray
                }
                filterStore.addGeometryFilter(props.layer.id, item).then((response)=>{
                    console.log("geom filter added to list proceeding to apply filter", response)
                    filterStore.populateLayerFilter(response, "AND").then((expression)=> {
                        console.log("expression is :", expression)
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
    if (props.layer.type === "circle" || props.layer.type === "line"){
        if (selectedFilterLayer.value?.filterLayerData != null){
            const item: GeometryFilterItem = {
                filterGeoJSON: selectedFilterLayer.value.filterLayerData,
                targetLayerSourceType: props.layer.type
            }
            filterStore.addGeometryFilter(props.layer.id, item).then((response)=>{
                console.log("geom filter added to list proceeding to apply filter", response)
                filterStore.populateLayerFilter(response, "AND").then((expression)=> {
                    console.log("expression is :", expression)
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
/**
Removes any existing geometry filter applied to the layer by
calling the filter store remove method and updating the map filter.
@param {Object} props - The component props
@returns {void}
*/
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

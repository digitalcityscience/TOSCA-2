<template>
    <div class="attribute-filtering">
        <div class="current-filters">
            <div v-if="filterStore.appliedFiltersList.find((listItem)=>{return listItem.layerName === props.layer.id})">
                <div v-for="(filter, index) in currentFilters" :key="index"
                    style="width: 100%;display: flex;flex-direction: row;justify-content: space-between;">
                    <div>
                        {{ filter.attribute.name }} {{ filterStore.filterNames[filter.operand] }} {{ filter.value }}
                    </div>
                    <div>
                        <Button @click="deleteAttributeFilter(filter)">x</Button>
                    </div>
                </div>
            </div>
            <div v-else>You have no filter</div>
        </div>
        <div class="filter-control">
            <div class="relation-control">
                <span v-if="relationType==='AND'">(Match all selections)</span>
                <span v-else>(Match at least one selection)</span>
                <SelectButton v-model="relationType" :options="relationList" :allow-empty="false" @change="applyAttributeFilter"></SelectButton>
            </div>
            <Button @click="initNewFilter">Add New</Button>
            <Button v-if="newFilterProcess" @click="cancelNewFilter">Cancel</Button>
        </div>
        <div v-if="newFilterProcess" class="new-filter">
            <div class="attribute">
                <Dropdown v-model="selectedAttribute" :options="filteredAttributes" option-label="name" filter show-clear
                    placeholder="Select an attribute" :virtual-scroller-options="{ itemSize: 30 }" @change="clearOperand">
                </Dropdown>
            </div>
            <div class="operand">
                <Dropdown v-if="selectedAttribute && selectedAttribute.binding == 'java.lang.String'"
                    v-model="selectedOperand" :options="filterStore.stringFilters" show-clear
                    placeholder="Select an operand"></Dropdown>
                <Dropdown
                    v-else-if="selectedAttribute && (selectedAttribute.binding == 'java.lang.Integer' || selectedAttribute.binding == 'java.lang.Long' || selectedAttribute.binding == 'java.lang.Double')"
                    v-model="selectedOperand" :options="filterStore.integerFilters" show-clear
                    placeholder="Select an operand"></Dropdown>
            </div>
            <div class="value" v-if="selectedOperand">
                <input v-if="selectedAttribute && selectedAttribute.binding == 'java.lang.String'" type="text"
                    v-model="filterValue">
                <input v-else type="number" v-model="filterValue">
            </div>
            <div class="applier">
                <Button @click=applyAttributeFilter :disabled="!(selectedAttribute && selectedOperand && filterValue)">Apply</Button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import Dropdown from "primevue/dropdown";
import Button from "primevue/button";
import SelectButton from "primevue/selectbutton";
import { computed, ref } from "vue";
import { type GeoServerFeatureTypeAttribute } from "../store/geoserver";
import { type IntegerFilters, type StringFilters, useFilterStore, type RelationTypes, type AttributeFilterItem } from "../store/filter";
import { type LayerObjectWithAttributes, useMapStore } from "../store/map";
import { isNullOrEmpty } from "../core/helpers/functions"

interface Props {
    layer: LayerObjectWithAttributes;
}
interface AppliedFilter {
    attribute: GeoServerFeatureTypeAttribute;
    operand: IntegerFilters | StringFilters;
    value: string
}
const props = defineProps<Props>()
const filterStore = useFilterStore()
const mapStore = useMapStore()

const currentFilters = computed(()=>{
    if (filterStore.appliedFiltersList.length>0){
        const layerFilters = filterStore.appliedFiltersList.find((listItem)=>{ return listItem.layerName === props.layer.id })
        if (layerFilters?.attributeFilters !== undefined){
            return layerFilters.attributeFilters
        } else {
            return [] as AppliedFilter[]
        }
    } else {
        return [] as AppliedFilter[]
    }
})
const relationList = ["AND", "OR"]
const relationType = ref<RelationTypes>("AND")
const selectedAttribute = ref<GeoServerFeatureTypeAttribute>()
const selectedOperand = ref<IntegerFilters | StringFilters>()
const filterValue = ref<any>("")
const filteredAttributes = computed(() => {
    return props.layer.details.featureType.attributes.attribute.filter(attr => filterStore.allowedBindings.includes(attr.binding))
})
/**
 * Create current filters list then push this list to apply attribute filter function in filter store. wait for response
 * and based on response handle
 */
async function applyAttributeFilter(): Promise<void> {
    if (!isNullOrEmpty(selectedAttribute.value) && !isNullOrEmpty(selectedOperand.value) && !isNullOrEmpty(filterValue.value)) {
        const filter: AttributeFilterItem = {
            attribute: selectedAttribute.value!,
            operand: selectedOperand.value!,
            value: filterValue.value.toString()
        }
        await filterStore.addAttributeFilter(props.layer.id, filter).then((response)=>{
            if (response.attributeFilters !== undefined || response.geometryFilters !== undefined) {
                filterStore.populateLayerFilter(response, relationType.value).then((expression)=>{
                    mapStore.map.setFilter(props.layer.id, expression)
                }).catch((error)=>{
                    mapStore.map.setFilter(props.layer.id, null)
                    window.alert(error)
                })
            } else {
                mapStore.map.setFilter(props.layer.id, null)
            }
        }).catch((error)=> {
            window.alert(error)
        })
        cancelNewFilter()
    } else {
        const appliedFilters = filterStore.appliedFiltersList.find((applied)=>{
            return applied.layerName === props.layer.id
        })
        if (appliedFilters !== undefined){
            await filterStore.populateLayerFilter(appliedFilters, relationType.value).then((expression)=>{
                mapStore.map.setFilter(props.layer.id, expression)
            }).catch((error)=>{
                mapStore.map.setFilter(props.layer.id, null)
                window.alert(error)
            })
        } else {
            mapStore.map.setFilter(props.layer.id, null)
        }
        cancelNewFilter()
    }
}
const newFilterProcess = ref<boolean>(false)
function initNewFilter(): void {
    newFilterProcess.value = true
    selectedAttribute.value = undefined
    selectedOperand.value = undefined
    filterValue.value = undefined
}
function cancelNewFilter(): void {
    newFilterProcess.value = false
    selectedAttribute.value = undefined
    selectedOperand.value = undefined
    filterValue.value = ""
}
function clearOperand(): void {
    selectedOperand.value = undefined
    filterValue.value = undefined
}
async function deleteAttributeFilter(targetFilter: AppliedFilter): Promise<void> {
    await filterStore.removeAttributeFilter(props.layer.id, targetFilter).then((response)=>{
        filterStore.populateLayerFilter(response, relationType.value).then((expression)=>{
            mapStore.map.setFilter(props.layer.id, expression)
        }).catch((error)=>{
            mapStore.map.setFilter(props.layer.id, null)
            window.alert(error)
        })
    }).catch((error)=>{
        window.alert(error)
    })
}
</script>

<style scoped>
.attribute-filtering {
    margin: 10px 0;
    width: 100%;
}

.current-filters {
    padding: 10px 0;
}

.new-filter {
    display: flex;
    flex-direction: column;
    margin: 10px 0;
    width: 100%;
}

.new-filter :deep(input) {
    width: 100%;
    height: 2rem;
}

.relation-control {
    display: flex;
    align-items: baseline;
}
</style>

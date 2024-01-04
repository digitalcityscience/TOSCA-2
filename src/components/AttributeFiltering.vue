<template>
    <div class="current-filters">
        <div v-if="currentFilters">
            <div v-for="(filter,index) in currentFilters" :key="index">
                <div>
                    {{ filter.attribute.name }} is {{ filter.operand }} {{ filter.value }}
                </div>
                <div>
                    <button @click="deleteFilter(filter)">Delete</button>
                </div>
            </div>
        </div>
        <div v-else>You have no filter</div>
    </div>
    <div class="filter-control">
        <button @click="initNewFilter">Add New</button>
        <button v-if="newFilterProcess" @click="cancelNewFilter">Cancel</button>
    </div>
    <div v-if="newFilterProcess" style="display: flex;flex-direction: column;margin-top: 10px;margin-bottom: 10px;width: 100%;">
        <div class="attribute">
            <Dropdown v-model="selectedAttribute" :options="filteredAttributes" option-label="name" filter show-clear
                placeholder="Select an attribute" :virtual-scroller-options="{ itemSize: 30 }" @change="clearOperand">
            </Dropdown>
        </div>
        <div class="operand">
            <Dropdown v-if="selectedAttribute && selectedAttribute.binding=='java.lang.String'" v-model="selectedOperand" :options="filterStore.stringFilters" show-clear placeholder="Select an operand"></Dropdown>
            <Dropdown v-else-if="selectedAttribute && (selectedAttribute.binding=='java.lang.Integer'||selectedAttribute.binding=='java.lang.Long'||selectedAttribute.binding=='java.lang.Double')" v-model="selectedOperand" :options="filterStore.integerFilters" show-clear placeholder="Select an operand"></Dropdown>
        </div>
        <div class="value" v-if="selectedOperand">
            <input v-if="selectedAttribute && selectedAttribute.binding=='java.lang.String'" type="text" v-model="filterValue">
            <input v-else type="number" v-model="filterValue">
        </div>
        <div class="applier">
            <button @click=applyFilter :disabled="!(selectedAttribute && selectedOperand && filterValue)">Apply</button>
        </div>
    </div>
</template>

<script setup lang="ts">
import Dropdown from 'primevue/dropdown';
import { computed, ref } from 'vue';
import { GeoServerFeatureTypeAttribute } from '../store/geoserver';
import {IntegerFilters, StringFilters, useFilterStore} from '../store/filter'
import { LayerObjectWithAttributes,useMapStore } from '../store/map';

interface Props {
    layer:LayerObjectWithAttributes
}
interface AppliedFilter {
    attribute:GeoServerFeatureTypeAttribute,
    operand:IntegerFilters|StringFilters,
    value:string
}
const props = defineProps<Props>()
const filterStore = useFilterStore()
const mapStore = useMapStore()

const currentFilters = ref<Array<AppliedFilter>>([])
const selectedAttribute = ref<GeoServerFeatureTypeAttribute>()
const selectedOperand = ref<IntegerFilters|StringFilters>()
const filterValue = ref<any>()
const filteredAttributes = computed(()=>{
    return props.layer.details.featureType.attributes.attribute.filter(attr => filterStore.allowedBindings.includes(attr.binding))
})
function applyFilter(){
    if(selectedAttribute.value && selectedOperand.value && filterValue.value){
        let filter:AppliedFilter = {
            attribute:selectedAttribute.value,
            operand:selectedOperand.value,
            value:filterValue.value.toString()
        }
        currentFilters.value.push(filter)
        let f = createFilter()
        if(f.length==0){
            mapStore.map.setFilter(props.layer.id,null)
        } else {
            mapStore.map.setFilter(props.layer.id,f)
        }
        cancelNewFilter()
    } else {
        let f = createFilter()
        if(f.length==0){
            mapStore.map.setFilter(props.layer.id,null)
        } else {
            mapStore.map.setFilter(props.layer.id,f)
        }
        cancelNewFilter()
    }
}
function createFilter(){
    if(currentFilters.value.length>0){
        let filterBlock:Array<any> = ["all"]
        currentFilters.value.forEach((filter)=>{
            if(filter.attribute.binding == "java.lang.String"){
                filterBlock.push([filter.operand,["downcase",["get",filter.attribute.name]],filter.value.toLowerCase()])
            } else {
                filterBlock.push([filter.operand,["get",filter.attribute.name],parseFloat(filter.value)])
            }
        })
        return filterBlock
    } else {
        return []
    }
}
const newFilterProcess = ref<Boolean>(false)
function initNewFilter(){
    newFilterProcess.value = true
    selectedAttribute.value = undefined
    selectedOperand.value = undefined
    filterValue.value= undefined
}
function cancelNewFilter(){
    newFilterProcess.value = false
    selectedAttribute.value = undefined
    selectedOperand.value = undefined
    filterValue.value= undefined

}
function clearOperand(){
    selectedOperand.value = undefined
    filterValue.value = undefined
}
function deleteFilter(targetFilter:AppliedFilter){
    console.log("before cleaning: ",currentFilters)
    currentFilters.value.splice(currentFilters.value.findIndex((filter=>targetFilter.attribute.name == filter.attribute.name)),1)
    console.log("after cleaning: ",currentFilters)
    applyFilter()
    console.log(mapStore.map.getFilter(props.layer.id))
}
</script>

<style scoped></style>
<template>
    <div class="attribute-filtering">
        <div class="current-filters">
            <div v-if="currentFilters">
                <div v-for="(filter, index) in currentFilters" :key="index"
                    style="width: 100%;display: flex;flex-direction: row;justify-content: space-between;">
                    <div>
                        {{ filter.attribute.name }} {{ filterStore.filterNames[filter.operand] }} {{ filter.value }}
                    </div>
                    <div>
                        <Button @click="deleteFilter(filter)">x</Button>
                    </div>
                </div>
            </div>
            <div v-else>You have no filter</div>
        </div>
        <div class="filter-control">
            <div class="relation-control">
                <ToggleButton v-model="relationType" onLabel="AND" offLabel="OR" @change="applyFilter" />
                <span v-if="relationType">(Match all selections)</span>
                <span v-else>(Match at least one selection)</span>
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
                <Button @click=applyFilter :disabled="!(selectedAttribute && selectedOperand && filterValue)">Apply</Button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import Dropdown from "primevue/dropdown";
import Button from "primevue/button";
import ToggleButton from "primevue/togglebutton";
import { computed, ref } from "vue";
import { type GeoServerFeatureTypeAttribute } from "../store/geoserver";
import { type IntegerFilters, type StringFilters, useFilterStore, } from "../store/filter";
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

const currentFilters = ref<AppliedFilter[]>([])
const relationType = ref<boolean>(true)
const selectedAttribute = ref<GeoServerFeatureTypeAttribute>()
const selectedOperand = ref<IntegerFilters | StringFilters>()
const filterValue = ref<any>("")
const filteredAttributes = computed(() => {
    return props.layer.details.featureType.attributes.attribute.filter(attr => filterStore.allowedBindings.includes(attr.binding))
})
function applyFilter(): void {
    if (!isNullOrEmpty(selectedAttribute.value) && !isNullOrEmpty(selectedOperand.value) && !isNullOrEmpty(filterValue.value)) {
        const filter: AppliedFilter = {
            attribute: selectedAttribute.value!,
            operand: selectedOperand.value!,
            value: filterValue.value.toString()
        }
        currentFilters.value.push(filter)
        const f = createFilter()
        if (f.length === 0) {
            mapStore.map.setFilter(props.layer.id, null)
        } else {
            mapStore.map.setFilter(props.layer.id, f)
        }
        cancelNewFilter()
    } else {
        const f = createFilter()
        if (f.length === 0) {
            mapStore.map.setFilter(props.layer.id, null)
        } else {
            mapStore.map.setFilter(props.layer.id, f)
        }
        cancelNewFilter()
    }
}
function createFilter(): any[] {
    if (currentFilters.value.length > 0) {
        const filterBlock: any[] = []
        if (relationType.value) {
            filterBlock.push("all")
        } else {
            filterBlock.push("any")
        }
        currentFilters.value.forEach((filter) => {
            if (filter.attribute.binding === "java.lang.String") {
                filterBlock.push([filter.operand, ["downcase", ["get", filter.attribute.name]], filter.value.toLowerCase()])
            } else {
                filterBlock.push([filter.operand, ["get", filter.attribute.name], parseFloat(filter.value)])
            }
        })
        return filterBlock
    } else {
        return []
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
function deleteFilter(targetFilter: AppliedFilter): void {
    currentFilters.value.splice(currentFilters.value.findIndex((filter => targetFilter.attribute.name === filter.attribute.name)), 1)
    applyFilter()
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

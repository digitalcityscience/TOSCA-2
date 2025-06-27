<template>
    <Card class="attribute-filtering w-full">
        <template #title>Attribute Filtering</template>
        <template #subtitle>Select an attribute and operand to filter this layer</template>
        <template #content>
            <div class="current-filters" v-if="filterStore.appliedFiltersList.find((listItem)=>{return listItem.layerName === props.layer.id && ((listItem.attributeFilters !== undefined && listItem.attributeFilters?.length > 0) || listItem.geometryFilters !== undefined)})">
                <DataTable :value="currentFilters" stripedRows class="w-full" size="small" table-class="w-full">
                    <template #header></template>
                    <Column header="">
                        <template #body="filter">
                            <span>{{ filter.data.attribute.name }} {{ filterStore.filterNames[filter.data.operand as IntegerFilters | StringFilters] }} {{ filter.data.value }}</span>
                        </template>
                    </Column>
                    <Column header="">
                        <template #body="filter">
                            <div class="w-full flex flex-row-reverse">
                                <Button @click="deleteAttributeFilter(filter.data)" severity="danger" text rounded>
                                    <template #icon>
                                        <i class="pi pi-times"></i>
                                    </template>
                                </Button>
                            </div>
                        </template>
                    </Column>
                </DataTable>
            </div>
            <div class="w-full no-current-filter py-1" v-else>
                <Message class="w-full" severity="info">You have no filter</Message>
            </div>
            <div class="filter-control py-1">
                <div v-if="currentFilters.length" class="relation-control w-full flex flex-row ml-auto py-1 justify-between">
                    <span class="self-center" v-if="relationType==='AND'">(Match all selections)</span>
                    <span class="self-center" v-else>(Match at least one selection)</span>
                    <SelectButton v-model="relationType" :options="relationList" :allow-empty="false" @change="applyAttributeFilter"></SelectButton>
                </div>
            </div>
            <div class="new-filter flex flex-col w-full">
                <div class="w-full font-thin italic text-sm py-1 text-surface-600/50 dark:text-surface-0/50">
                    <p>Add new attribute filter</p>
                </div>
                <div class="attribute w-full">
                    <Select class="min-w-32 w-full h-10" v-model="selectedAttribute" :options="filteredAttributes" option-label="name" filter show-clear
                        placeholder="Select an attribute" :virtual-scroller-options="{ itemSize: 30 }" @change="clearOperand">
                    </Select>
                </div>
                <div class="operand w-full pt-2">
                    <Select class="min-w-32 w-full h-10" v-if="selectedAttribute && selectedAttribute.binding == 'java.lang.String'"
                        v-model="selectedOperand" :options="filterStore.stringFilters" show-clear
                        placeholder="Select an operand">
                        <template #option="slotProps">
                            <div class="flex align-items-center">
                                <div>{{ filterStore.filterNames[slotProps.option as OptionKey] }}</div>
                            </div>
                        </template>
                    </Select>
                    <Select
                        class="min-w-32 w-full h-10"
                        v-else-if="selectedAttribute && (selectedAttribute.binding == 'java.lang.Integer' || selectedAttribute.binding == 'java.lang.Long' || selectedAttribute.binding == 'java.lang.Double' || selectedAttribute.binding == 'java.lang.BigDecimal')"
                        v-model="selectedOperand" :options="filterStore.integerFilters" show-clear
                        placeholder="Select an operand">
                        <template #option="slotProps">
                            <div class="flex align-items-center">
                                <div>{{ filterStore.filterNames[slotProps.option as OptionKey] }}</div>
                            </div>
                        </template>
                    </Select>
                </div>
                <div class="value w-full pt-2" v-if="selectedOperand">
                    <InputText class="min-w-32 w-full h-10" v-if="selectedAttribute && selectedAttribute.binding == 'java.lang.String'" type="text"
                        v-model="filterValue"></InputText>
                    <InputText class="min-w-32 w-full h-10" v-else type="number" v-model="filterValue"></InputText>
                </div>
                <div class="applier w-full flex flex-row-reverse pt-2">
                    <Button size="small" @click=applyAttributeFilter :disabled="!(selectedAttribute && selectedOperand && filterValue)">Apply</Button>
                </div>
            </div>
        </template>
    </Card>
</template>

<script setup lang="ts">
import Select from "primevue/select";
import Button from "primevue/button";
import SelectButton from "primevue/selectbutton";
import Card from "primevue/card"
import DataTable from "primevue/datatable";
import Column from "primevue/column";
import Message from "primevue/message";
import InputText from "primevue/inputtext";
import { computed, ref } from "vue";
import { type GeoServerVectorTypeLayerDetail, type GeoServerFeatureTypeAttribute } from "@store/geoserver";
import { type IntegerFilters, type StringFilters, useFilterStore, type RelationTypes, type AttributeFilterItem } from "@store/filter";
import { type LayerObjectWithAttributes, useMapStore } from "@store/map";
import { isNullOrEmpty } from "@helpers/functions"
import { useToast } from "primevue/usetoast";
type OptionKey = keyof typeof filterStore.filterNames
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
const toast = useToast();

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
    return (props.layer.details as GeoServerVectorTypeLayerDetail)?.featureType.attributes.attribute.filter(attr => filterStore.allowedBindings.includes(attr.binding))
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
        await filterStore.addAttributeFilter(props.layer.id, filter, relationType.value).then((response)=>{
            if (response.attributeFilters !== undefined || response.geometryFilters !== undefined) {
                filterStore.populateLayerFilter(response, relationType.value).then((expression)=>{
                    if (expression.length > 1){
                        mapStore.map.setFilter(props.layer.id, expression)
                    } else {
                        mapStore.map.setFilter(props.layer.id, null)
                    }
                }).catch((error)=>{
                    mapStore.map.setFilter(props.layer.id, null)
                    toast.add({ severity: "error", summary: "Error", detail: error, life: 3000 });
                })
            } else {
                mapStore.map.setFilter(props.layer.id, null)
            }
        }).catch((error)=> {
            toast.add({ severity: "error", summary: "Error", detail: error, life: 3000 });
        })
        cancelNewFilter()
    } else {
        const appliedFilters = filterStore.appliedFiltersList.find((applied)=>{
            return applied.layerName === props.layer.id
        })
        if (appliedFilters !== undefined){
            await filterStore.populateLayerFilter(appliedFilters, relationType.value).then((expression)=>{
                if (expression.length > 1){
                    mapStore.map.setFilter(props.layer.id, expression)
                } else {
                    mapStore.map.setFilter(props.layer.id, null)
                }
            }).catch((error)=>{
                mapStore.map.setFilter(props.layer.id, null)
                toast.add({ severity: "error", summary: "Error", detail: error, life: 3000 });
            })
        } else {
            mapStore.map.setFilter(props.layer.id, null)
        }
        cancelNewFilter()
    }
}
function cancelNewFilter(): void {
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
            if (expression.length > 1){
                mapStore.map.setFilter(props.layer.id, expression)
            } else {
                mapStore.map.setFilter(props.layer.id, null)
            }
        }).catch((error)=>{
            mapStore.map.setFilter(props.layer.id, null)
            toast.add({ severity: "error", summary: "Error", detail: error, life: 3000 });
        })
    }).catch((error)=>{
        toast.add({ severity: "error", summary: "Error", detail: error, life: 3000 });
    })
}
</script>

<style scoped>
.current-filters:deep([data-pc-section="header"]){
    display: none
}
.current-filters:deep([data-pc-section="headerrow"]){
    display: none
}
</style>

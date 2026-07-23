<template>
    <UCard class="attribute-filtering w-full">
        <template #header>
            <div class="space-y-1">
                <div class="font-semibold text-highlighted">Attribute Filtering</div>
                <div class="text-muted text-sm">Select an attribute and operand to filter this layer</div>
            </div>
        </template>
        <template #default>
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
                                <UButton
                                    icon="i-lucide-x"
                                    color="error"
                                    variant="ghost"
                                    aria-label="Delete attribute filter"
                                    @click="deleteAttributeFilter(filter.data)"
                                />
                            </div>
                        </template>
                    </Column>
                </DataTable>
            </div>
            <div class="w-full no-current-filter py-1" v-else>
                <UAlert class="w-full" color="info" variant="soft" description="You have no filter" />
            </div>
            <div class="filter-control py-1">
                <div v-if="currentFilters.length" class="relation-control w-full flex flex-row ml-auto py-1 justify-between">
                    <span class="self-center" v-if="relationType==='AND'">(Match all selections)</span>
                    <span class="self-center" v-else>(Match at least one selection)</span>
                    <URadioGroup
                        v-model="relationType"
                        :items="relationOptions"
                        variant="card"
                        orientation="horizontal"
                        @update:model-value="applyAttributeFilter"
                    />
                </div>
            </div>
            <div class="new-filter flex flex-col w-full">
                <div class="w-full font-thin italic text-sm py-1 text-surface-600/50 dark:text-surface-0/50">
                    <p>Add new attribute filter</p>
                </div>
                <div class="attribute w-full">
                    <div class="flex w-full">
                        <USelect
                            class="min-w-32 w-full h-10"
                            v-model="selectedAttributeName"
                            :items="filteredAttributeOptions"
                            placeholder="Select an attribute"
                            @update:model-value="clearOperand"
                        />
                        <UButton
                            v-if="selectedAttributeName !== undefined"
                            class="ml-1"
                            icon="i-lucide-x"
                            color="neutral"
                            variant="ghost"
                            aria-label="Clear selected attribute"
                            @click="clearSelectedAttribute"
                        />
                    </div>
                </div>
                <div class="operand w-full pt-2">
                    <div
                        v-if="selectedAttribute && (selectedAttribute.binding == 'java.lang.String' || selectedAttribute.binding == 'java.lang.Integer' || selectedAttribute.binding == 'java.lang.Long' || selectedAttribute.binding == 'java.lang.Double' || selectedAttribute.binding == 'java.lang.BigDecimal')"
                        class="flex w-full"
                    >
                        <USelect
                            class="min-w-32 w-full h-10"
                            v-model="selectedOperand"
                            :items="operandOptions"
                            placeholder="Select an operand"
                        />
                        <UButton
                            v-if="selectedOperand !== undefined"
                            class="ml-1"
                            icon="i-lucide-x"
                            color="neutral"
                            variant="ghost"
                            aria-label="Clear selected operand"
                            @click="selectedOperand = undefined"
                        />
                    </div>
                </div>
                <div class="value w-full pt-2" v-if="selectedOperand">
                    <UInput class="min-w-32 w-full h-10" v-if="selectedAttribute && selectedAttribute.binding == 'java.lang.String'" type="text"
                        v-model="filterValue" />
                    <UInput class="min-w-32 w-full h-10" v-else type="number" v-model="filterValue" />
                </div>
                <div class="applier w-full flex flex-row-reverse pt-2">
                    <UButton size="sm" @click="applyAttributeFilter" :disabled="!(selectedAttribute && selectedOperand && filterValue)">Apply</UButton>
                </div>
            </div>
        </template>
    </UCard>
</template>

<script setup lang="ts">
import DataTable from "primevue/datatable";
import Column from "primevue/column";
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
const relationType = ref<RelationTypes>("AND")
const selectedAttribute = ref<GeoServerFeatureTypeAttribute>()
const selectedOperand = ref<IntegerFilters | StringFilters>()
const filterValue = ref<any>("")
const filteredAttributes = computed(() => {
    return (props.layer.details as GeoServerVectorTypeLayerDetail)?.featureType.attributes.attribute.filter(attr => filterStore.allowedBindings.includes(attr.binding))
})
const selectedAttributeName = computed({
    get: () => selectedAttribute.value?.name,
    set: (name: string | undefined) => {
        selectedAttribute.value = filteredAttributes.value?.find((attribute) => attribute.name === name)
    }
})
const filteredAttributeOptions = computed(() => {
    return filteredAttributes.value?.map((attribute) => ({
        label: attribute.name,
        value: attribute.name,
    })) ?? []
})
const relationOptions = computed(() => {
    return (["AND", "OR"] as RelationTypes[]).map((relation) => ({
        label: relation,
        value: relation,
    }))
})
const operandOptions = computed(() => {
    const filters = selectedAttribute.value?.binding === "java.lang.String"
        ? filterStore.stringFilters
        : filterStore.integerFilters
    return filters.map((filter) => ({
        label: filterStore.filterNames[filter as OptionKey],
        value: filter,
    }))
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
function clearSelectedAttribute(): void {
    selectedAttribute.value = undefined
    clearOperand()
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
.attribute-filtering :deep(.p-card-title) {
    font-size: 0.95rem;
    font-weight: 600;
}
.attribute-filtering :deep(.p-card-subtitle) {
    font-size: 0.8rem;
    margin-top: 0.15rem;
}
.attribute-filtering :deep(.p-card-body) {
    padding: 0.75rem;
}
</style>

<template>
    <div>
        <div class="w-full 2xl:flex 2xl:justify-between 2xl:grid-cols-none lg:grid lg:grid-cols-4 lg:gap-2 2xl:gap-0 py-1 ">
            <div class="w-full lg:col-span-2 2xl:pr-2">
                <Button class="w-full" size="small" @click="createTable">Get Table</Button>
            </div>
            <div class="w-full lg:col-span-2 2xl:pl -2">
                <Button class="w-full" v-if="tableData" size="small" @click="isOpen = true">Open Table</Button>
            </div>
        </div>
        <Dialog v-model:visible="isOpen" modal closable close-on-escape :style="{ width: 'calc(100vw - 200px)' }">
            <div class="w-full">
                <div v-if="tableData !== undefined">
                    <div v-if="tableData?.features.length > 0">
                        <DataTable :value="tableData.features" paginator :rows="10" :rowsPerPageOptions="[10, 20, 50]"
                            class="w-full" size="small" table-class="w-full"
                            paginatorTemplate="RowsPerPageDropdown FirstPageLink PrevPageLink NextPageLink LastPageLink">
                            <template #header>
                                <div class="w-full pb-2">
                                    <span>
                                        {{ tableData.features.length }} results
                                    </span>
                                </div>
                                <div v-if="tableUsedFilters !== undefined" class="w-full flex flex-row pb-1">
                                    <p>Used Filters:</p>
                                </div>
                                <div v-if="tableUsedFilters !== undefined" class="w-full flex flex-row">
                                    <div v-if="tableUsedFilters.attributeFilters" class="flex flex-row">
                                        <div v-for="(filter, index) in tableUsedFilters?.attributeFilters" :key="index">
                                            <span class="mx-1"
                                                v-if="index > 0 && index < tableUsedFilters.attributeFilters?.length">
                                                {{ tableUsedFilters.attributeRelation }}
                                            </span>
                                            <Chip class="first:ml-0 ml-1 px-1">
                                                <span>{{ filter.attribute.name }} {{
                                                    filterStore.filterNames[filter.operand as IntegerFilters |
                                                    StringFilters] }} {{ filter.value }}</span>
                                            </Chip>
                                        </div>
                                    </div>
                                    <div v-if="tableUsedFilters.geometryFilters">
                                        <span v-if="tableUsedFilters.attributeFilters" class="mx-1">AND</span>
                                        <Chip class="px-1">
                                            <span>Geometry filter applied</span>
                                        </Chip>
                                    </div>
                                </div>
                            </template>
                            <span v-for="(column, index) in tableHeaderList" :key="`col-${index}`">
                                <Column :field="`properties.${column.value}`" :header="column.name"
                                    :key="`column-${index}`"
                                    :dataType="column.binding !== 'java.lang.String' ? 'numeric' : undefined"
                                    resizableColumns columnResizeMode="fit">
                                    <template #body="{ data }">
                                        <span>
                                            {{ data.properties[`${column.name}`] }}
                                        </span>
                                    </template>
                                </Column>
                            </span>
                        </DataTable>
                    </div>
                    <div class="w-full flex justify-around" v-else>
                        <InlineMessage severity="info">There is no result</InlineMessage>
                    </div>
                </div>
            </div>

            <div class="w-full 2xl:flex 2xl:justify-between 2xl:grid-cols-none lg:grid lg:grid-cols-4 lg:gap-2 2xl:gap-0 p-1 ">
                <div class="w-full lg:col-span-2">
                </div>
                <div class="w-full flex lg:col-span-2">
                    <InputText class="h-10 mr-4 ml-auto" type="text" v-model="fileName" placeholder="File name"></InputText>
                    <Button @click="downloadAsGeojson" :disabled="fileName.length === 0" class="lg:w-full 2xl:w-auto"
                        size="small">Download as GeoJSON</Button>
                </div>

            </div>
        </Dialog>
    </div>
</template>

<script setup lang="ts">
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import DataTable from "primevue/datatable";
import Column from "primevue/column";
import InlineMessage from "primevue/inlinemessage";
import InputText from "primevue/inputtext";
import Chip from "primevue/chip";
import { type FeatureCollection } from "geojson";
import { computed, ref } from "vue";
import { type AttributeFilterItem, useFilterStore, type AppliedFiltersListItem, type IntegerFilters, type StringFilters, type RelationTypes } from "@store/filter";
import { type LayerObjectWithAttributes } from "@store/map";
import bbox from "@turf/bbox";
import { type GeoserverRasterTypeLayerDetail, type GeoServerVectorTypeLayerDetail, useGeoserverStore } from "@store/geoserver";
import booleanWithin from "@turf/boolean-within";

interface TableHeader {
    name: string,
    value: string,
    binding?: string
}
interface Props {
    layer: LayerObjectWithAttributes
}
const props = defineProps<Props>()
const filterStore = useFilterStore()
const geoserverStore = useGeoserverStore()
const layerFilters = computed(() => {
    if (filterStore.appliedFiltersList.length > 0) {
        const layerFilters = filterStore.appliedFiltersList.find((listItem) => { return listItem.layerName === props.layer.id })
        if (layerFilters !== undefined) {
            return layerFilters
        } else {
            return undefined
        }
    } else {
        return undefined
    }
})
const tableData = ref<FeatureCollection | undefined>(undefined)
const tableHeaderList = ref<TableHeader[]>([])
const tableUsedFilters = ref<AppliedFiltersListItem | undefined>(undefined)
function createTable(): void {
    getTableData().then(() => {
        applyFilters()
        isOpen.value = true
    }).catch((error) => {
        console.error(error)
    })
}
/**
 * Fetches the table data for the layer from the source and sets the `tableData` and `tableHeaderList` refs.
 */
async function getTableData(): Promise<void> {
    if (props.layer.sourceType === "geojson") {
        tableData.value = props.layer.layerData!
        tableHeaderList.value = createTableHeaderList(tableData.value)
    } else if (props.layer.sourceType === "geoserver") {
        // if we have geometry filter on layer, get filter geojson bbox else leave empty
        const boundingbox = findBbox()
        if (boundingbox === undefined) {
            console.log("There is no bounding box to get table data")
            throw new Error("There is no bounding box to get table data")
        }
        if (props.layer.workspaceName === undefined) {
            console.log("There is no workspace name to get table data")
        } else {
            const data = await geoserverStore.getGeoJSONLayerSource(props.layer.id, props.layer.workspaceName, boundingbox)
            tableData.value = data as FeatureCollection
            if (props.layer.type === "raster") {
                tableHeaderList.value = createTableHeaderList(tableData.value)
            } else {
                tableHeaderList.value = (props.layer.details as GeoServerVectorTypeLayerDetail).featureType.attributes.attribute.filter(attr => attr.name.toLowerCase() !== "geom").map(attr => {
                    return {
                        name: attr.name,
                        value: attr.name,
                        binding: attr.binding
                    }
                })
            }
        }
    }
}
/**
 * Extracts unique property names from a GeoJSON FeatureCollection and returns them
 * as an array of `TableHeader` objects, where both `text` and `value` keys
 * correspond to the property names.
 *
 * @param featureCollection - The GeoJSON FeatureCollection from which to extract unique property names.
 * @returns An array of `TableHeader` objects, each representing a unique property name with `text` and `value` keys.
 */
function createTableHeaderList(tableData: FeatureCollection): TableHeader[] {
    const uniqueProperties = new Set<string>();
    tableData.features.forEach(feature => {
        if (feature.properties !== undefined && feature.properties !== null) {
            Object.keys(feature.properties).forEach(key => {
                uniqueProperties.add(key);
            });
        }
    });
    console.log(uniqueProperties)
    return Array.from(uniqueProperties).map(prop => ({
        name: prop,
        value: prop,
        binding: "java.lang.String"
    }));
}
/**
 * Find bounding box of the layer. If there is geometry filter on layer, return filter geojson bbox else return layer bbox.
 * @returns string
 */
function findBbox(): string | undefined {
    if (layerFilters.value?.geometryFilters !== undefined) {
        return bbox(layerFilters.value.geometryFilters?.filterGeoJSON).join(",")
    } else {
        if (props.layer.sourceType === "geojson") {
            return bbox(props.layer.layerData!).join(",")
        }
        if (props.layer.sourceType === "geoserver") {
            if (props.layer.type === "raster") {
                const box = (props.layer.details as GeoserverRasterTypeLayerDetail).coverage.latLonBoundingBox
                return [box.minx, box.miny, box.maxx, box.maxy].join(",")
            }
            if (props.layer.type === "fill" || props.layer.type === "line" || props.layer.type === "circle") {
                const box = (props.layer.details as GeoServerVectorTypeLayerDetail).featureType.latLonBoundingBox
                return [box.minx, box.miny, box.maxx, box.maxy].join(",")
            }
        }
    }
    return undefined
}
function applyFilters(): void {
    if (layerFilters.value !== undefined && tableData.value !== undefined) {
        let data = tableData.value
        if (layerFilters.value.geometryFilters !== undefined) {
            data = applyGeometryFilter(tableData.value, layerFilters.value.geometryFilters.filterGeoJSON)
        }
        if (layerFilters.value.attributeFilters !== undefined) {
            data = applyAttributeFilters(data, layerFilters.value.attributeFilters, layerFilters.value.attributeRelation!)
        }
        tableData.value = data
        tableUsedFilters.value = layerFilters.value
    }
}
function applyGeometryFilter(data: FeatureCollection, aoi: FeatureCollection): FeatureCollection {
    const filteredData = data.features.filter((feature) => {
        const featureGeometry = feature.geometry;
        return aoi.features.some((polygon) => {
            return booleanWithin(featureGeometry, polygon.geometry);
        });
    })
    return {
        type: "FeatureCollection",
        features: filteredData
    }
}
function applyAttributeFilters(data: FeatureCollection, attributeFilters: AttributeFilterItem[], relation: RelationTypes): FeatureCollection {
    const filteredFeatures = data.features.filter((feature) => {
        if (feature.properties === null) return false
        const results = attributeFilters.map((filter) => {
            const attributeValue = feature.properties![filter.attribute.name];
            if (filter.attribute.binding === "java.lang.String") {
                const filterValue = filter.value;
                return applyOperator(attributeValue, filter.operand as StringFilters, filterValue);
            } else {
                const filterValue = Number(filter.value);
                return applyOperator(attributeValue, filter.operand as IntegerFilters, filterValue);
            }
        });
        // Combine the filter results using either AND or OR logic
        return relation === "AND" ? results.every((res) => res) : results.some((res) => res);
    });

    return {
        ...data,
        features: filteredFeatures,
    };
}
function applyOperator(
    attributeValue: any,
    operand: IntegerFilters | StringFilters,
    filterValue: any
): boolean {
    switch (operand) {
        case ">":
            return attributeValue > filterValue;
        case ">=":
            return attributeValue >= filterValue;
        case "<":
            return attributeValue < filterValue;
        case "<=":
            return attributeValue <= filterValue;
        case "==":
            return attributeValue === filterValue;
        case "!=":
            return attributeValue !== filterValue;
        case "in":
            return Array.isArray(filterValue) && filterValue.includes(attributeValue);
        default:
            return false;
    }
}
const fileName = ref<string>("")
function downloadAsGeojson(): void {
    const sanitizedFileName = fileName.value.replace(/[^a-zA-Z0-9-_]/g, "");
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(tableData.value));
    const downloadAnchorNode = document.createElement("a");
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", sanitizedFileName.length > 0 ? `${sanitizedFileName.trim()}.geojson` : "geojson-data.geojson");
    document.body.appendChild(downloadAnchorNode); // required for Firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

const isOpen = ref<boolean>(false)

</script>

<style scoped></style>

<template>
    <div>
        <div class="w-full 2xl:flex 2xl:justify-between 2xl:grid-cols-none lg:grid lg:grid-cols-4 lg:gap-2 2xl:gap-0 py-1 ">
            <div class="w-full lg:col-span-2 2xl:pr-2">
                <UButton class="w-full" size="sm" @click="createTable">{{ t('map.resultTable.getTable') }}</UButton>
            </div>
            <div class="w-full lg:col-span-2 2xl:pl -2">
                <UButton class="w-full" v-if="tableData" size="sm" @click="isOpen = true">{{ t('map.resultTable.openTable') }}</UButton>
            </div>
        </div>
        <UModal
            v-model:open="isOpen"
            :ui="{
                overlay: 'z-[70]',
                content: 'z-[70] h-[calc(100dvh-2rem)] sm:h-[calc(100dvh-4rem)] w-[calc(100vw-200px)] max-w-[calc(100vw-200px)]',
                body: 'flex min-h-0 flex-1 flex-col overflow-hidden p-4 sm:p-6',
                footer: 'shrink-0 justify-end',
            }"
        >
            <template #body>
                <div class="flex min-h-0 w-full flex-1 flex-col">
                    <div
                        v-if="tableData !== undefined && tableData.features.length > 0"
                        class="flex min-h-0 flex-1 flex-col"
                    >
                        <div class="w-full shrink-0 pb-2">
                            <span>
                                {{ t('map.resultTable.resultsCount', { count: tableData.features.length }) }}
                            </span>
                        </div>
                        <div v-if="tableUsedFilters !== undefined" class="flex w-full shrink-0 flex-row pb-1">
                            <p>{{ t('map.resultTable.usedFilters') }}</p>
                        </div>
                        <div v-if="tableUsedFilters !== undefined" class="flex w-full shrink-0 flex-row flex-wrap pb-2">
                            <div v-if="tableUsedFilters.attributeFilters" class="flex flex-row flex-wrap">
                                <div v-for="(filter, index) in tableUsedFilters?.attributeFilters" :key="index">
                                    <span class="mx-1"
                                        v-if="index > 0 && index < tableUsedFilters.attributeFilters?.length">
                                        {{ tableUsedFilters.attributeRelation }}
                                    </span>
                                    <UBadge class="first:ml-0 ml-1 px-1" color="neutral" variant="soft">
                                        <span>{{ filter.attribute.name }} {{
                                            filterStore.operandLabel(filter.operand as IntegerFilters |
                                            StringFilters) }} {{ filter.value }}</span>
                                    </UBadge>
                                </div>
                            </div>
                            <div v-if="tableUsedFilters.geometryFilters">
                                <span v-if="tableUsedFilters.attributeFilters" class="mx-1">{{ t('filter.attribute.and') }}</span>
                                <UBadge class="px-1" color="neutral" variant="soft">
                                    <span>{{ t('map.resultTable.geometryFilterApplied') }}</span>
                                </UBadge>
                            </div>
                        </div>
                        <UTable
                            :data="paginatedResultRows"
                            :columns="resultColumns"
                            sticky="header"
                            class="min-h-0 w-full flex-1"
                            :ui="{ th: 'px-2 py-2', td: 'px-2 py-2' }"
                        />
                        <div class="flex shrink-0 items-center justify-end gap-2 border-t border-muted p-2">
                            <USelect
                                :model-value="tablePagination.pageSize"
                                :items="pageSizeOptions"
                                class="w-24"
                                :aria-label="t('map.resultTable.rowsPerPage')"
                                @update:model-value="updateResultPageSize"
                            />
                            <UPagination
                                :page="tablePagination.pageIndex + 1"
                                :items-per-page="tablePagination.pageSize"
                                :total="resultRows.length"
                                @update:page="updateResultPage"
                            />
                        </div>
                    </div>
                    <div v-else class="flex min-h-0 flex-1 items-center justify-around">
                        <UAlert color="info" variant="soft" :description="t('map.resultTable.noResult')" />
                    </div>
                </div>
            </template>
            <template #footer>
                <div class="flex w-full items-center justify-end gap-2">
                    <UInput
                        v-model="fileName"
                        class="w-full max-w-sm"
                        type="text"
                        :placeholder="t('map.resultTable.fileNamePlaceholder')"
                    />
                    <UButton
                        size="sm"
                        :disabled="fileName.length === 0"
                        @click="downloadAsGeojson"
                    >
                        {{ t('map.resultTable.downloadAsGeojson') }}
                    </UButton>
                </div>
            </template>
        </UModal>
    </div>
</template>

<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import { type Feature, type FeatureCollection } from "@helpers/geojson";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { type AttributeFilterItem, useFilterStore, type AppliedFiltersListItem, type IntegerFilters, type StringFilters, type RelationTypes } from "@store/filter";
import { type LayerObjectWithAttributes } from "@store/map";
import bbox from "@turf/bbox";
import { type GeoserverRasterTypeLayerDetail, type GeoServerVectorTypeLayerDetail, useGeoserverStore } from "@store/geoserver";
import booleanWithin from "@turf/boolean-within";

const { t } = useI18n();

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
const tablePagination = ref({
    pageIndex: 0,
    pageSize: 10,
})
const pageSizeOptions = [
    { label: "10", value: 10 },
    { label: "20", value: 20 },
    { label: "50", value: 50 },
]
const resultRows = computed(() => {
    return tableData.value?.features ?? []
})
const paginatedResultRows = computed(() => {
    const start = tablePagination.value.pageIndex * tablePagination.value.pageSize
    const end = start + tablePagination.value.pageSize
    return resultRows.value.slice(start, end)
})
const resultColumns = computed<TableColumn<Feature>[]>(() => {
    return tableHeaderList.value.map((column) => ({
        id: column.value,
        accessorFn: (row) => row.properties?.[column.value],
        header: column.name,
    }))
})
function createTable(): void {
    getTableData().then(() => {
        applyFilters()
        tablePagination.value.pageIndex = 0
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
            const data = await geoserverStore.getGeoJSONLayerSource(
                props.layer.id,
                props.layer.workspaceName,
                boundingbox,
                undefined,
                props.layer.details?.catalog?.provider.id
            )
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
        if (featureGeometry.type === "MultiPolygon") {
            return featureGeometry.coordinates.some((polygon) => {
                return aoi.features.some((aoiPolygon) => {
                    return booleanWithin({ type: "Polygon", coordinates: polygon }, aoiPolygon.geometry);
                });
            });
        } else {
            return aoi.features.some((polygon) => {
                return booleanWithin(featureGeometry, polygon.geometry);
            });
        }
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
            if (typeof attributeValue === "string" && typeof filterValue === "string") {
                return attributeValue.toLowerCase() === filterValue.toLowerCase();
            }
            return attributeValue === filterValue;
        case "!=":
            if (typeof attributeValue === "string" && typeof filterValue === "string") {
                return attributeValue.toLowerCase() !== filterValue.toLowerCase();
            }
            return attributeValue !== filterValue;
        case "in":
            if (Array.isArray(filterValue) && typeof attributeValue === "string") {
                const lowerCaseAttributeValue = attributeValue.toLowerCase();
                return filterValue.some(value => value.toLowerCase() === lowerCaseAttributeValue);
            }
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
function updateResultPage(page: number): void {
    tablePagination.value.pageIndex = page - 1
}
function updateResultPageSize(pageSize: string | number | boolean | undefined): void {
    if (typeof pageSize !== "number") return
    tablePagination.value.pageIndex = 0
    tablePagination.value.pageSize = pageSize
}

const isOpen = ref<boolean>(false)

</script>

<style scoped></style>

<template>
    <div v-if="props.item">
        <UCard class="workspace-layer-card bg-default/95 dark:bg-elevated/80" :ui="{ header: 'p-3 pb-2', body: 'p-3 pt-0', footer: 'p-3 pt-0' }">
            <template #header>
                <div class="min-w-0 space-y-1">
                    <div class="flex min-w-0 flex-wrap items-center gap-2">
                        <span class="truncate font-semibold text-highlighted capitalize">{{ cleanLayerName }}</span>
                        <UBadge color="neutral" variant="soft" size="sm" label="Vector" />
                        <UBadge v-if="dataType" color="info" variant="soft" size="sm" :label="dataType" />
                    </div>
                    <p v-if="layerDetail && layerDetail?.featureType.abstract?.length > 0" class="line-clamp-2 hover:line-clamp-none xl:line-clamp-3 text-muted text-sm">{{ layerDetail.featureType.abstract }}</p>
                </div>
            </template>
            <div v-if="layerDetail" class="space-y-3 text-sm">
                <div class="grid grid-cols-[5.5rem_1fr] gap-3">
                    <span class="font-semibold uppercase tracking-wide text-muted text-xs self-start pt-1">Keywords</span>
                    <div class="flex min-w-0 flex-wrap gap-x-2 gap-y-1">
                        <span v-for="(keyword,index) in layerDetail.featureType.keywords.string" :key="index" class="italic text-muted">
                            #{{ keyword }}
                        </span>
                    </div>
                </div>
            </div>
            <div v-else class="space-y-2">
                <USkeleton class="h-4 w-full" />
                <USkeleton class="h-4 w-3/4" />
            </div>
            <template #footer>
                <div class="flex justify-end">
                    <UButton size="sm" @click="add2Map">Add to map</UButton>
                </div>
            </template>
        </UCard>
    </div>
    <div v-else class="w-full">
        <UAlert class="w-full" color="info" variant="soft" description="No information about layer." />
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { type GeoServerVectorTypeLayerDetail, type GeoserverLayerInfo, type GeoserverLayerListItem, useGeoserverStore } from "@store/geoserver";
import { type GeoServerSourceParams, type LayerParams, type LayerStyleOptions, useMapStore } from "@store/map";
import { isNullOrEmpty } from "../../../core/helpers/functions";
import { useToast } from "@helpers/toast";

export interface Props {
    item: GeoserverLayerListItem
    workspace: string
    layerInformation: GeoserverLayerInfo,
    layerStyling?: LayerStyleOptions
}
export interface LayerStylingPaint {
    paint: object
}
const props = defineProps<Props>()
const toast = useToast()
const cleanLayerName = computed(() => {
    return ((layerDetail.value?.featureType.title) != null) ? layerDetail.value?.featureType.title.replaceAll("_", " ") : props.item.name.replaceAll("_", " ")
})
const geoserver = useGeoserverStore()
const layerDetail = ref<GeoServerVectorTypeLayerDetail>()
geoserver.getLayerDetail(props.layerInformation.resource.href).then((detail) => {
    layerDetail.value = detail as GeoServerVectorTypeLayerDetail
}).catch(err => {
    toast.add({ severity: "error", summary: "Error", detail: err, life: 3000 });
})

const dataType = computed(() => {
    if (!isNullOrEmpty(layerDetail.value)) {
        const feature = layerDetail.value!.featureType.attributes.attribute.filter((att) => { return att.name.includes("geom") })
        return feature.length > 0 ? sanitizeDataType(feature[0].binding.split(".").slice(-1)[0]) : ""
    } else { return "" }
})
const sanitizeDataType = (type: string): string => {
    return type.replace(/multi|string/gi, "");
}

const mapStore = useMapStore()
function add2Map(): void{
    if (!isNullOrEmpty(layerDetail.value)) {
        const sourceParams: GeoServerSourceParams = {
            sourceType:"geoserver",
            identifier:layerDetail.value!.featureType.name,
            isFilterLayer:false,
            workspaceName:props.workspace,
            layer:layerDetail.value!,
            sourceDataType:"vector",
            sourceProtocol:"wmts"
        }
        mapStore.addMapDataSource(sourceParams).then(() => {
            if (!isNullOrEmpty(dataType) && !isNullOrEmpty(layerDetail.value)) {
                const layerParams: LayerParams = {
                    sourceType:"geoserver",
                    identifier:layerDetail.value!.featureType.name,
                    layerType:mapStore.geometryConversion(dataType.value),
                    layerStyle:!isNullOrEmpty(props.layerStyling) ? { ...props.layerStyling }: undefined,
                    geoserverLayerDetails:layerDetail.value!,
                    sourceLayer:`${layerDetail.value!.featureType.name}`,
                    displayName:layerDetail.value?.featureType.title ?? undefined,
                    sourceDataType:"vector",
                    sourceProtocol:"wmts",
                    workspaceName:props.workspace,
                }
                mapStore.addMapLayer(layerParams).then(()=>{
                }).catch(error => {
                    toast.add({ severity: "error", summary: "Error", detail: error, life: 3000 });
                })
            }
        }).catch(error => {
            toast.add({ severity: "error", summary: "Error", detail: error, life: 3000 });
        })
    }
}
</script>

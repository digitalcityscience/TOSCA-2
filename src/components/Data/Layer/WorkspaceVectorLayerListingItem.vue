<template>
    <div v-if="props.item">
        <UCard class="workspace-layer-card bg-default/95 dark:bg-elevated/80" :ui="{ header: 'p-3 pb-2', body: 'p-3 pt-1', footer: 'p-3 pt-2' }">
            <template #header>
                <div class="min-w-0 space-y-1">
                    <div class="flex min-w-0 flex-wrap items-center gap-2">
                        <span class="truncate font-semibold text-highlighted capitalize">{{ cleanLayerName }}</span>
                        <UBadge color="neutral" variant="soft" size="sm" :label="t('workspace.layerItem.vector')" />
                        <UBadge v-if="dataType" color="info" variant="soft" size="sm" :label="dataType" />
                    </div>
                    <div v-if="hasKeywords" class="flex min-w-0 flex-wrap gap-x-2 gap-y-0.5">
                        <span v-for="(keyword,index) in layerDetail?.featureType.keywords.string" :key="index" class="text-[0.6875rem] italic leading-tight text-muted">
                            #{{ keyword }}
                        </span>
                    </div>
                </div>
            </template>
            <div v-if="layerDetail" class="space-y-2">
                <div v-if="hasDescription" class="space-y-1">
                    <p ref="summaryElement" :class="['text-muted text-sm', isSummaryExpanded ? '' : 'line-clamp-2']">
                        {{ descriptionText }}
                    </p>
                    <UButton v-if="isSummaryTruncated || isSummaryExpanded" size="xs" color="neutral" variant="link" class="h-auto justify-start p-0" @click="isSummaryExpanded = !isSummaryExpanded">
                        {{ isSummaryExpanded ? t('workspace.layerItem.showLess') : t('workspace.layerItem.readMore') }}
                    </UButton>
                </div>
            </div>
            <div v-else class="space-y-2">
                <USkeleton class="h-4 w-full" />
                <USkeleton class="h-4 w-3/4" />
            </div>
            <template #footer>
                <div class="flex justify-end">
                    <UButton size="sm" @click="add2Map">{{ t('workspace.layerItem.addToMap') }}</UButton>
                </div>
            </template>
        </UCard>
    </div>
    <div v-else class="w-full">
        <UAlert class="w-full" color="info" variant="soft" :description="t('workspace.layerItem.noInformation')" />
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
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
const { t } = useI18n();
const toast = useToast()
const cleanLayerName = computed(() => {
    return ((layerDetail.value?.featureType.title) != null) ? layerDetail.value?.featureType.title.replaceAll("_", " ") : props.item.name.replaceAll("_", " ")
})
const geoserver = useGeoserverStore()
const layerDetail = ref<GeoServerVectorTypeLayerDetail>()
const isSummaryExpanded = ref(false)
const isSummaryTruncated = ref(false)
const summaryElement = ref<HTMLElement>()
const descriptionText = computed(() => layerDetail.value?.featureType.abstract ?? "")
const hasDescription = computed(() => descriptionText.value.length > 0)
const hasKeywords = computed(() => (layerDetail.value?.featureType.keywords.string.length ?? 0) > 0)
geoserver.getLayerDetail(props.layerInformation.resource.href).then((detail) => {
    layerDetail.value = detail as GeoServerVectorTypeLayerDetail
}).catch(err => {
    toast.add({ severity: "error", summary: t("toast.error"), detail: err, life: 3000 });
})

const handleResize = (): void => {
    void updateSummaryTruncation()
}

onMounted(() => {
    window.addEventListener("resize", handleResize)
})

onBeforeUnmount(() => {
    window.removeEventListener("resize", handleResize)
})

watch(descriptionText, () => {
    isSummaryExpanded.value = false
    void nextTick(updateSummaryTruncation)
})

async function updateSummaryTruncation(): Promise<void> {
    await nextTick()
    const element = summaryElement.value
    if (element === undefined) {
        isSummaryTruncated.value = false
        return
    }

    isSummaryTruncated.value = element.scrollHeight > element.clientHeight + 1
}

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
                    toast.add({ severity: "error", summary: t("toast.error"), detail: error, life: 3000 });
                })
            }
        }).catch(error => {
            toast.add({ severity: "error", summary: t("toast.error"), detail: error, life: 3000 });
        })
    }
}
</script>

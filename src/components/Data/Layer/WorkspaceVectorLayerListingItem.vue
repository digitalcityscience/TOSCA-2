<template>
    <div v-if="props.item">
        <UCard class="workspace-layer-card bg-default/95 dark:bg-elevated/80" :ui="{ header: 'p-3 pb-2', body: 'p-3 pt-1', footer: 'p-3 pt-2' }">
            <template #header>
                <div class="min-w-0 space-y-1">
                    <p class="layer-card-title font-semibold text-highlighted capitalize">{{ cleanLayerName }}</p>
                    <div class="flex flex-wrap items-center gap-2">
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
                    <RichDescription
                        ref="summaryElement"
                        :content="layerDetail.featureType.description_content"
                        :fallback="descriptionText"
                        :clamp-lines="isSummaryExpanded ? undefined : 2"
                    />
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
import { useMapStore } from "@store/map";
import { addCatalogVectorLayer, type LayerStylingBundle } from "@helpers/catalogLayerLoader";
import { isNullOrEmpty } from "../../../core/helpers/functions";
import { useToast } from "@helpers/toast";
import { openSlideoverSidebar } from "@helpers/slideoverSidebarRegistry";
import RichDescription from "@components/Base/RichDescription.vue";

export interface Props {
    item: GeoserverLayerListItem
    workspace: string
    layerInformation: GeoserverLayerInfo,
    layerStyling?: LayerStylingBundle
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
const summaryElement = ref<InstanceType<typeof RichDescription>>()
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
    isSummaryTruncated.value = summaryElement.value?.isTruncated() ?? false
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
async function add2Map(): Promise<void> {
    if (isNullOrEmpty(layerDetail.value)) return
    try {
        const { runtimeId } = await addCatalogVectorLayer({
            detail: layerDetail.value!,
            workspace: props.workspace,
            styling: props.layerStyling,
        })
        mapStore.requestLayerPanelExpansion(runtimeId)
        openSlideoverSidebar("maplayerListing")
    } catch (error) {
        toast.add({ severity: "error", summary: t("toast.error"), detail: error, life: 3000 });
    }
}

</script>

<style scoped>
.layer-card-title {
    min-width: 0;
    overflow-wrap: anywhere;
    line-height: 1.35;
}
</style>

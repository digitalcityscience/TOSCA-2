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
import {
    createMapRuntimeId,
    mbStyleLayerOptions,
    rewriteSpriteLayout,
    rewriteSpritePaint,
    type GeoServerSourceParams,
    type LayerParams,
    type MapLibreLayerTypes,
    useMapStore,
} from "@store/map";
import type { AddLayerObject } from "maplibre-gl";
import type { LayerStylingBundle } from "./WorkspaceLayerListingItem.vue";
import { isNullOrEmpty } from "../../../core/helpers/functions";
import { useToast } from "@helpers/toast";
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
    if (!isNullOrEmpty(layerDetail.value)) {
        const resourceKey = `${layerDetail.value!.catalog?.provider.id ?? "provider"}:${props.workspace}:${layerDetail.value!.featureType.name}`
        const runtimeId = createMapRuntimeId("layer", resourceKey)
        const sourceParams: GeoServerSourceParams = {
            sourceType:"geoserver",
            identifier:runtimeId,
            isFilterLayer:false,
            workspaceName:props.workspace,
            layer:layerDetail.value!,
            sourceDataType:"vector",
            sourceProtocol:"wmts"
        }
        let spriteRuntimeId: string | undefined
        let spriteRegisteredOnLayer = false
        try {
            await mapStore.addMapDataSource(sourceParams)
            if (!isNullOrEmpty(dataType) && !isNullOrEmpty(layerDetail.value)) {
                const selectedStyleLayers = (props.layerStyling?.layers ?? []).map((layer) => ({
                    ...layer,
                    metadata: {
                        ...(layer.metadata ?? {}),
                        "tosca:member-id": "standalone",
                        "tosca:style-id": "standalone-style",
                    },
                }))
                if (props.layerStyling?.spriteUrl !== undefined) {
                    spriteRuntimeId = await mapStore.acquireMapSprite(
                        props.layerStyling.spriteUrl,
                        `sprite-${runtimeId.replace(/[^a-zA-Z0-9_-]+/g, "-")}`
                    )
                }
                const firstStyleLayer = selectedStyleLayers[0]
                const layerParams: LayerParams = {
                    sourceType:"geoserver",
                    identifier:runtimeId,
                    sourceIdentifier:runtimeId,
                    layerType:(firstStyleLayer?.type as MapLibreLayerTypes | undefined) ?? mapStore.geometryConversion(dataType.value),
                    layerStyle:firstStyleLayer === undefined ? undefined : mbStyleLayerOptions(firstStyleLayer, spriteRuntimeId),
                    geoserverLayerDetails:layerDetail.value!,
                    sourceLayer:`${layerDetail.value!.featureType.name}`,
                    displayName:layerDetail.value?.featureType.title ?? undefined,
                    sourceDataType:"vector",
                    sourceProtocol:"wmts",
                    workspaceName:props.workspace,
                }
                await mapStore.addMapLayer(layerParams)
                const logicalLayer = mapStore.layersOnMap.find((layer) => layer.id === runtimeId)
                if (logicalLayer !== undefined && selectedStyleLayers.length > 0) {
                    logicalLayer.mbStyleLayers = selectedStyleLayers
                    logicalLayer.mbStyleLegendContext = {
                        members: [{ id: "standalone", title: cleanLayerName.value }],
                        styles: {
                            "standalone-style": {
                                sprite_id: props.layerStyling?.spriteUrl === undefined
                                    ? null
                                    : "standalone-sprite",
                            },
                        },
                        sprites: props.layerStyling?.spriteUrl === undefined
                            ? {}
                            : { "standalone-sprite": { url: props.layerStyling.spriteUrl } },
                    }
                    if (spriteRuntimeId !== undefined) {
                        logicalLayer.spriteRuntimeIds = [spriteRuntimeId]
                        spriteRegisteredOnLayer = true
                    }
                }
                selectedStyleLayers.slice(1).forEach((styleLayer, index) => {
                    mapStore.addCompanionLayer(runtimeId, {
                        ...styleLayer,
                        id: `${runtimeId}:style:${index + 1}`,
                        type: styleLayer.type as MapLibreLayerTypes,
                        source: runtimeId,
                        "source-layer": layerDetail.value!.featureType.name,
                        ...(styleLayer.paint === undefined
                            ? {}
                            : { paint: rewriteSpritePaint(styleLayer.paint, spriteRuntimeId) }),
                        ...(styleLayer.layout === undefined
                            ? {}
                            : { layout: rewriteSpriteLayout(styleLayer.layout, spriteRuntimeId) }),
                    } as AddLayerObject)
                })
                if (spriteRuntimeId !== undefined && !spriteRegisteredOnLayer) {
                    // The sprite was acquired but never attached to a logical
                    // layer (e.g. the layer record could not be resolved), so
                    // its owning layer will never release it. Drop the
                    // reference now to avoid leaking the sprite.
                    mapStore.releaseMapSprite(spriteRuntimeId)
                    spriteRuntimeId = undefined
                }
            }
        } catch (error) {
            if (spriteRuntimeId !== undefined && !spriteRegisteredOnLayer) {
                mapStore.releaseMapSprite(spriteRuntimeId)
            }
            toast.add({ severity: "error", summary: t("toast.error"), detail: error, life: 3000 });
        }
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

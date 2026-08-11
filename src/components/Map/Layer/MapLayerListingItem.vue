<template>
    <div class="py-1">
        <div class="map-layer-listing-panel">
            <div class="map-layer-listing-header" :class="{ 'map-layer-listing-header-open': layerPanelOpen }">
                <span
                    class="layer-color-rail"
                    :class="`layer-color-rail-${layerHeaderIndicator.kind}`"
                    :style="layerHeaderIndicatorStyle"
                    :title="layerHeaderIndicatorTitle"
                    aria-hidden="true"
                ></span>
                <UButton class="layer-drag-handle layer-icon-btn cursor-move" icon="i-lucide-grip-vertical" color="neutral" variant="ghost" :aria-label="t('map.layerItem.reorderLayer')"
                    @click.stop />
                <USwitch class="shrink-0" v-model="checked" @update:model-value="changeLayerVisibility" />
                <div class="layer-name-area">
                    <span class="layer-name capitalize truncate">
                        {{ (props.layer.displayName ?? props.layer.source).replaceAll("_", " ") }}
                    </span>
                    <UIcon
                       v-if="isGroupLayer"
                       name="i-lucide-layers-3"
                       class="layer-time-badge"
                       :title="t('map.layerItem.groupLayer')"
                    />
                    <UIcon
                       v-if="hasTimeDimension"
                       name="i-lucide-clock"
                       class="layer-time-badge"
                       :title="t('map.layerItem.temporalLayer')"
                       :aria-label="t('map.layerItem.temporalLayer')"
                    />
                </div>
                <div class="layer-actions">
                    <UButton class="layer-icon-btn" icon="i-lucide-trash-2" color="error" variant="ghost" :aria-label="t('common.delete')"
                        @click="confirmDialogVisibility = true" />
                    <UButton class="layer-icon-btn" icon="i-lucide-zoom-in" color="neutral" variant="ghost" :aria-label="t('map.layerItem.zoom')"
                        @click="zoomToLayer" />
                    <UButton
                        class="layer-icon-btn"
                        :icon="layerPanelOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                        color="neutral"
                        variant="ghost"
                        :aria-label="layerPanelOpen ? t('map.layerItem.collapseControls') : t('map.layerItem.expandControls')"
                        @click="layerPanelOpen = !layerPanelOpen"
                    />
                </div>
                <UModal v-model:open="confirmDialogVisibility" :title="t('map.layerItem.deleteLayerTitle')" :ui="{ content: 'max-w-[25rem]' }">
                    <template #body>
                    <span class="text-muted block">{{ t('map.layerItem.deleteLayerConfirm', { name: props.layer.displayName ?? props.layer.source }) }}</span>
                    </template>
                    <template #footer>
                    <div class="flex justify-end gap-2 w-full">
                        <UButton size="sm" type="button" color="neutral" variant="soft" @click="confirmDialogVisibility = false">{{ t('common.cancel') }}</UButton>
                        <UButton size="sm" type="button" color="error" @click="deleteLayerConfirmation(props.layer)">{{ t('common.delete') }}</UButton>
                    </div>
                    </template>
                </UModal>
            </div>
            <div v-show="layerPanelOpen" class="layer-panel-body">
                <section class="layer-section">
                    <h4 class="layer-section-title">{{ t('map.layerItem.style') }}</h4>
                    <label v-if="hasEditableLayerColor" class="layer-row pointer-events-none">
                        <span class="layer-row-label">{{ t('map.layerItem.color') }}</span>
                        <div class="layer-color-controls pointer-events-auto">
                            <UColorPicker :aria-label="t('map.layerItem.changeColor')" format="hex" v-model="colorPickerValue" />
                            <UInput
                                class="layer-color-input"
                                :aria-label="t('map.layerItem.layerColorHex')"
                                v-model="colorHexInput"
                                maxlength="7"
                                @update:model-value="applyColorHexInput"
                            />
                        </div>
                    </label>
                    <label class="layer-row">
                        <span class="layer-row-label">{{ t('map.layerItem.opacity') }}</span>
                        <USlider :aria-label="t('map.layerItem.changeOpacity')" class="grow" v-model="opacity" :step="0.1" :min=0
                            :max=1 @update:model-value="changeLayerOpac" />
                    </label>
                </section>
                <section v-if="showLegend" class="layer-section">
                    <h4 class="layer-section-title">{{ t('map.layerItem.legend') }}</h4>
                    <div v-if="showCentralGroupLegend" class="layer-legend-wrapper">
                        <img
                            :src="centralGroupLegendUrl"
                            :alt="t('map.layerItem.legendAlt')"
                            class="layer-legend-image group-central-legend-image"
                            @error="handleCentralGroupLegendError"
                        />
                    </div>
                    <div v-if="showServerLegend && !isGroupLayer" class="layer-legend-wrapper">
                        <img :src="legendUrl" :alt="t('map.layerItem.legendAlt')" class="layer-legend-image" @error="legendError = true" />
                    </div>
                    <div v-if="showServerLegend && isGroupLayer" class="group-legend-list">
                        <figure
                            v-for="legend in visibleGroupLegendImages"
                            :key="legend.key"
                            class="group-legend-item"
                        >
                            <figcaption class="group-legend-label">{{ legend.label }}</figcaption>
                            <div class="layer-legend-wrapper">
                                <img
                                    :src="legend.url"
                                    :alt="`${legend.label}: ${t('map.layerItem.legendAlt')}`"
                                    class="layer-legend-image"
                                    @error="markGroupLegendFailed(legend.key)"
                                />
                            </div>
                        </figure>
                    </div>
                    <MapStyleLegend v-if="mbStyleLegendEntries.length > 0" :entries="mbStyleLegendEntries" />
                </section>
                <section v-if="hasTimeDimension" class="layer-section">
                    <h4 class="layer-section-title">{{ t('map.layerItem.time') }}</h4>
                    <RasterLayerTimeControl :layer="props.layer" />
                </section>
                <section v-if="isGroupLayer" class="layer-section">
                    <h4 class="layer-section-title">{{ t('map.layerItem.groupMembers') }}</h4>
                    <div class="flex flex-wrap gap-1.5">
                        <UBadge
                            v-for="member in props.layer.groupManifest?.members"
                            :key="member.id"
                            color="neutral"
                            variant="soft"
                            size="sm"
                            :label="member.title"
                        />
                    </div>
                </section>
                <section v-if="showFiltering" class="layer-section">
                    <h4 class="layer-section-title">{{ t('map.layerItem.filtering') }}</h4>
                    <AttributeFiltering :layer="props.layer"></AttributeFiltering>
                    <GeometryFiltering :layer="props.layer"></GeometryFiltering>
                </section>
                <section v-if="props.layer.type !== 'raster' && !isGroupLayer" class="layer-section">
                    <h4 class="layer-section-title">{{ t('map.layerItem.data') }}</h4>
                    <MapLayerResultTable :layer="props.layer"></MapLayerResultTable>
                </section>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { type LayerObjectWithAttributes, type MapLibreLayerTypes, useMapStore } from "@store/map"
import { useToast } from "@helpers/toast";
import { isNullOrEmpty } from "@helpers/functions";
import {
    createMapStyleLegendEntries,
    hasSingleEditableMapStyleColor,
} from "@helpers/mapStyleLegend";
import {
    type GeoserverRasterTypeLayerDetail,
    type GeoServerVectorTypeLayerDetail,
    getTimeDimension,
    resolveLegendUrl,
    useGeoserverStore,
} from "@store/geoserver";

const AttributeFiltering = defineAsyncComponent(async () => await import("./Filter/AttributeFiltering.vue"));
const GeometryFiltering = defineAsyncComponent(async () => await import("@components/Map/Layer/Filter/GeometryFiltering.vue"));
const MapLayerResultTable = defineAsyncComponent(async () => await import("./MapLayerResultTable.vue"));
const RasterLayerTimeControl = defineAsyncComponent(async () => await import("./RasterLayerTimeControl.vue"));
const MapStyleLegend = defineAsyncComponent(async () => await import("./MapStyleLegend.vue"));

export interface Props {
    layer: LayerObjectWithAttributes
}
const props = defineProps<Props>()
const { t } = useI18n();
const mapStore = useMapStore()
const geoserver = useGeoserverStore()
const legendUrl = ref<string>()
const legendError = ref<boolean>(false)
const groupLegendImages = ref<GroupLegendImage[]>([])
const failedGroupLegendKeys = ref<Set<string>>(new Set())
const groupLegendLoading = ref<boolean>(false)
const centralGroupLegendError = ref<boolean>(false)
const layerPanelOpen = ref<boolean>(false)
const color = ref<string>("000000")
const colorHexInput = ref<string>("#000000")
const colorPickerValue = computed({
    get: () => `#${color.value}`,
    set: (value: string | undefined) => {
        const normalizedColor = normalizeHexColorInput(value);
        if (normalizedColor === undefined) return;
        color.value = normalizedColor;
        colorHexInput.value = `#${normalizedColor}`;
        queueLayerColorChange(normalizedColor);
    }
})
const opacity = ref<number>(1)
const checked = ref<boolean>(true)
const initialLayerHeaderIndicator = ref<LayerHeaderIndicator>()
const isGroupLayer = computed(() => props.layer.logicalKind === "group")
let pendingColorChangeTimeout: ReturnType<typeof setTimeout> | undefined;

type LayerHeaderIndicatorKind = "single" | "multi" | "raster" | "heatmap" | "unknown";

interface LayerHeaderIndicator {
    kind: LayerHeaderIndicatorKind;
    colors: string[];
}

interface GroupLegendImage {
    key: string;
    label: string;
    url: string;
}

const fallbackHeatmapColors = ["#313695", "#74add1", "#ffffbf", "#f46d43", "#a50026"];
const namedColorLiterals = new Set([
    "black",
    "blue",
    "brown",
    "cyan",
    "gray",
    "green",
    "grey",
    "lime",
    "magenta",
    "orange",
    "purple",
    "red",
    "transparent",
    "white",
    "yellow"
]);

const layerHeaderIndicator = computed<LayerHeaderIndicator>(() => {
    // Touch paintVersion so the rail re-evaluates whenever any
    // setPaintProperty / addLayer / removeLayer call fires `styledata`.
    void mapStore.paintVersion;
    void initialLayerHeaderIndicator.value;
    if (isGroupLayer.value) return { kind: "multi", colors: [] };
    const editableColorProperty = getEditableColorPaintProperty(props.layer.type);
    if (editableColorProperty !== "" && initialLayerHeaderIndicator.value?.kind === "single") {
        return { kind: "single", colors: [`#${color.value}`] };
    }

    if (initialLayerHeaderIndicator.value !== undefined) {
        return resolveLayerHeaderIndicator(props.layer.type);
    }

    return resolveLayerHeaderIndicator(props.layer.type);
})
const layerHeaderIndicatorStyle = computed<Record<string, string>>(() => {
    return {
        background: createLayerHeaderIndicatorBackground(layerHeaderIndicator.value)
    }
})
const layerHeaderIndicatorTitle = computed<string>(() => {
    switch (layerHeaderIndicator.value.kind) {
        case "single":
            return t("map.layerItem.indicatorSingle", { color: layerHeaderIndicator.value.colors[0] });
        case "multi":
            return t("map.layerItem.indicatorMulti");
        case "heatmap":
            return t("map.layerItem.indicatorHeatmap");
        case "raster":
            return t("map.layerItem.indicatorRaster");
        default:
            return t("map.layerItem.indicatorUnknown");
    }
})
const hasTimeDimension = computed<boolean>(() => {
    if (isGroupLayer.value) return false
    if (props.layer.type !== "raster") return false
    const details = props.layer.details as GeoserverRasterTypeLayerDetail | undefined
    if (details?.coverage === undefined) return false
    return getTimeDimension(details.coverage) !== null
})
const hasEditableLayerColor = computed<boolean>(() => {
    if (isGroupLayer.value) return false
    void mapStore.paintVersion;
    const colorProperty = getEditableColorPaintProperty(props.layer.type);
    if (colorProperty === "" || typeof getLayerPaintProperty(colorProperty) !== "string") {
        return false;
    }

    const catalogStyleLayers = props.layer.mbStyleLayers;
    return catalogStyleLayers === undefined ||
        hasSingleEditableMapStyleColor(catalogStyleLayers, colorProperty);
})
const visibleGroupLegendImages = computed<GroupLegendImage[]>(() => {
    return groupLegendImages.value.filter((legend) => !failedGroupLegendKeys.value.has(legend.key))
})
const centralGroupLegendUrl = computed<string | undefined>(() => {
    return props.layer.groupManifest?.legend?.url
})
const showCentralGroupLegend = computed<boolean>(() => {
    return isGroupLayer.value &&
        centralGroupLegendUrl.value !== undefined &&
        !centralGroupLegendError.value
})
const mbStyleLegendEntries = computed(() => {
    const manifest = props.layer.groupManifest
    if (isGroupLayer.value && manifest !== undefined) {
        if (showCentralGroupLegend.value) return []
        return createMapStyleLegendEntries(manifest.layers, {
            members: manifest.members,
            styles: manifest.styles,
            sprites: manifest.sprites,
        })
    }
    return createMapStyleLegendEntries(
        props.layer.mbStyleLayers ?? [],
        props.layer.mbStyleLegendContext
    )
})
/**
 * Only show GeoServer's legend image when the rendered map color matches
 * what the SLD describes. For vector layers whose single editable color we
 * override client-side (circle/fill/line with a string color), the SLD
 * swatch would lie about the on-map color — suppress it in that case. The
 * header color rail already conveys the active color.
 *
 * Raster layers and layers with non-string color expressions keep using the
 * server-rendered legend, since we don't repaint them.
 */
const showServerLegend = computed<boolean>(() => {
    if (isGroupLayer.value) {
        return !showCentralGroupLegend.value && visibleGroupLegendImages.value.length > 0
    }
    if ((props.layer.mbStyleLayers?.length ?? 0) > 0) return false
    if (legendUrl.value === undefined || legendError.value) return false
    if (hasEditableLayerColor.value) return false
    return true
})
const showLegend = computed<boolean>(() => {
    return showCentralGroupLegend.value ||
        showServerLegend.value ||
        mbStyleLegendEntries.value.length > 0
})
const showFiltering = computed<boolean>(() => {
    if (isGroupLayer.value) return false
    if (props.layer.type === "raster") return false
    return props.layer.filterLayer !== true
})
/**
 * Exposes the editable color paint property when it is an expression (array).
 * Reserved for a future legend component; consumers can read this via
 * `defineExpose` if/when an MBStyleLegend is added to this repo.
 */
const _layerLegendStyle = computed<unknown[] | undefined>(() => {
    void mapStore.paintVersion;
    const prop = getEditableColorPaintProperty(props.layer.type);
    if (prop === "") return undefined;
    const value = getLayerPaintProperty(prop);
    if (!Array.isArray(value)) return undefined;
    return value as unknown[];
})
void _layerLegendStyle.value;

onMounted(() => {
    const colorProperty = getEditableColorPaintProperty(props.layer.type);
    const opacityProperty = getOpacityPaintProperty(props.layer.type);

    if (colorProperty !== "" && typeof getLayerPaintProperty(colorProperty) === "string") {
        color.value = normalizeColorPickerValue(getLayerPaintProperty(colorProperty) as string);
        colorHexInput.value = `#${color.value}`;
    }
    initialLayerHeaderIndicator.value = resolveLayerHeaderIndicator(props.layer.type);
    if (opacityProperty !== "" && !isNullOrEmpty(getLayerPaintProperty(opacityProperty))) {
        opacity.value = getLayerPaintProperty(opacityProperty) as number;
    }
    if (mapStore.map.getLayoutProperty(props.layer.id, "visibility") === "none") {
        checked.value = false
    }
    void loadLegend()
})
/**
 * Resolves a legend image URL via WMS GetCapabilities (or the GetLegendGraphic
 * fallback) for any layer bound to a GeoServer workspace. We render whatever
 * GeoServer can produce — if the request 404s at the <img>, `legendError`
 * suppresses the section so we don't show a broken icon.
 */
async function loadLegend(): Promise<void> {
    if (isGroupLayer.value) {
        await loadGroupLegend()
        return
    }
    if (props.layer.workspaceName === undefined) return
    const details = props.layer.details
    const layerName = (details as GeoserverRasterTypeLayerDetail | undefined)?.coverage?.name ??
        (details as GeoServerVectorTypeLayerDetail | undefined)?.featureType?.name
    if (layerName === undefined || layerName === "") return
    try {
        legendUrl.value = await resolveLegendUrl(
            async (ws) => await geoserver.fetchWmsCapabilities(
                ws,
                false,
                details?.catalog?.provider.id
            ),
            props.layer.workspaceName,
            layerName,
            details?.catalog?.provider.base_url
        )
    } catch (error) {
        console.error("Could not resolve legend URL", error)
    }
}

async function loadGroupLegend(useGeneratedFallback = false): Promise<void> {
    const manifest = props.layer.groupManifest
    if (manifest === undefined) return
    if (!useGeneratedFallback) centralGroupLegendError.value = false
    if (manifest.legend !== null && !useGeneratedFallback) return
    groupLegendLoading.value = true
    failedGroupLegendKeys.value = new Set()
    try {
        const rasterMembers = manifest.members.filter((member) => {
            const style = manifest.styles[member.style_assignment.style_id]
            return member.data_type === "RASTER" && style?.format === "sld"
        })
        groupLegendImages.value = await Promise.all(rasterMembers.map(async (member) => {
            const style = manifest.styles[member.style_assignment.style_id]
            return {
                key: member.id,
                label: member.title,
                url: await resolveLegendUrl(
                    async (workspace) => await geoserver.fetchWmsCapabilities(
                        workspace,
                        false,
                        manifest.provider.id
                    ),
                    manifest.workspace.name,
                    member.name,
                    manifest.provider.base_url,
                    style.name
                ),
            }
        }))
    } catch (error) {
        groupLegendImages.value = []
        console.error("Could not resolve group legend URLs", error)
    } finally {
        groupLegendLoading.value = false
    }
}

function handleCentralGroupLegendError(): void {
    centralGroupLegendError.value = true
    void loadGroupLegend(true)
}

function markGroupLegendFailed(key: string): void {
    failedGroupLegendKeys.value = new Set([...failedGroupLegendKeys.value, key])
}
function changeLayerColor(color: string): void {
    const prop = getEditableColorPaintProperty(props.layer.type);
    if (prop === "") {
        return;
    }

    const nextColor = `#${color}`;
    if (getLayerPaintProperty(prop) === nextColor) {
        return;
    }

    try {
        mapStore.map.setPaintProperty(props.layer.id, prop, nextColor)
    } catch (error) {
        console.error(`Could not update ${props.layer.id} layer color`, error);
    }
}
function queueLayerColorChange(nextColor: unknown): void {
    const normalizedColor = normalizeHexColorInput(nextColor);
    if (normalizedColor === undefined) {
        return;
    }

    if (pendingColorChangeTimeout !== undefined) {
        clearTimeout(pendingColorChangeTimeout);
    }

    pendingColorChangeTimeout = setTimeout(() => {
        pendingColorChangeTimeout = undefined;
        changeLayerColor(normalizedColor);
    }, 120);
}
function applyColorHexInput(value: string | number | undefined): void {
    if (typeof value !== "string") return;
    const normalizedColor = normalizeHexColorInput(value);
    if (normalizedColor === undefined) return;
    color.value = normalizedColor;
    colorHexInput.value = `#${normalizedColor}`;
    queueLayerColorChange(normalizedColor);
}
function changeLayerOpac(layerOpacity: any): void {
    if (isGroupLayer.value) {
        mapStore.setLogicalLayerOpacity(props.layer, Number(layerOpacity))
        return
    }
    const opac = getOpacityPaintProperty(props.layer.type);
    mapStore.map.setPaintProperty(props.layer.id, opac, layerOpacity)
}
function changeLayerVisibility(layerVisibility: boolean): void {
    const value = layerVisibility ? "visible" : "none";
    mapStore.map.setLayoutProperty(props.layer.id, "visibility", value);
    // Mirror visibility on every companion so children (outlines, labels,
    // cluster counts, etc.) hide and show with their parent.
    props.layer.companionLayerIds?.forEach((companionId: string) => {
        if (mapStore.map.getLayer(companionId) !== undefined) {
            mapStore.map.setLayoutProperty(companionId, "visibility", value);
        }
    });
}
const confirmDialogVisibility = ref<boolean>(false)
const toast = useToast();
function deleteLayerConfirmation(layer: LayerObjectWithAttributes): void {
    mapStore.deleteMapLayer(layer.id, true).then(() => {
        if (layer.logicalKind === "group") return
        try {
            mapStore.deleteMapDataSource(layer.source)
        } catch (error) {
            toast.add({ severity: "error", summary: t("toast.error"), detail: error, life: 3000 })
        }
    }).catch((error)=>{
        toast.add({ severity: "error", summary: t("toast.error"), detail: error, life: 3000 });
    })
    confirmDialogVisibility.value = false
}
function zoomToLayer(): void {
    if (isGroupLayer.value) {
        const boxes = props.layer.groupManifest?.members.flatMap((member) => {
            const details = member.details
            const bbox = details !== undefined && "coverage" in details
                ? details.coverage.latLonBoundingBox
                : details !== undefined && "featureType" in details
                    ? details.featureType.latLonBoundingBox
                    : undefined
            return bbox === undefined ? [] : [bbox]
        }) ?? []
        if (boxes.length > 0) {
            mapStore.map.fitBounds([
                [Math.min(...boxes.map((box) => box.minx)), Math.min(...boxes.map((box) => box.miny))],
                [Math.max(...boxes.map((box) => box.maxx)), Math.max(...boxes.map((box) => box.maxy))],
            ], { padding: 20 })
        }
        return
    }
    if (props.layer.type === "raster") {
        const bbox = (props.layer.details as GeoserverRasterTypeLayerDetail).coverage.latLonBoundingBox;
        mapStore.map.fitBounds([[bbox.minx, bbox.miny], [bbox.maxx, bbox.maxy]], { padding: 20 });
    } else {
        const bbox = (props.layer.details as GeoServerVectorTypeLayerDetail).featureType.latLonBoundingBox;
        mapStore.map.fitBounds([[bbox.minx, bbox.miny], [bbox.maxx, bbox.maxy]], { padding: 20 });
    }
}

onBeforeUnmount(() => {
    if (pendingColorChangeTimeout !== undefined) {
        clearTimeout(pendingColorChangeTimeout);
    }
})

function resolveLayerHeaderIndicator(layerType: MapLibreLayerTypes): LayerHeaderIndicator {
    if (layerType === "raster") {
        return { kind: "raster", colors: [] };
    }

    if (layerType === "heatmap") {
        const colors = extractColorLiterals(getLayerPaintProperty("heatmap-color"));

        return {
            kind: "heatmap",
            colors: colors.length > 0 ? colors : fallbackHeatmapColors
        };
    }

    const colorProperty = getEditableColorPaintProperty(layerType);
    if (colorProperty === "") {
        return { kind: "unknown", colors: [] };
    }

    const paintColor = getLayerPaintProperty(colorProperty);
    if (typeof paintColor === "string") {
        return { kind: "single", colors: [paintColor] };
    }

    const colors = extractColorLiterals(paintColor);
    if (colors.length > 0) {
        return { kind: "multi", colors };
    }

    return { kind: "unknown", colors: [] };
}

function getEditableColorPaintProperty(layerType: MapLibreLayerTypes): string {
    if (layerType === "circle") {
        return "circle-color";
    }
    if (layerType === "fill") {
        return "fill-color";
    }
    if (layerType === "line") {
        return "line-color";
    }

    return "";
}

function getOpacityPaintProperty(layerType: MapLibreLayerTypes): string {
    if (layerType === "circle") {
        return "circle-opacity";
    }
    if (layerType === "fill") {
        return "fill-opacity";
    }
    if (layerType === "line") {
        return "line-opacity";
    }
    if (layerType === "heatmap") {
        return "heatmap-opacity";
    }
    if (layerType === "raster") {
        return "raster-opacity";
    }

    return "";
}

function getLayerPaintProperty(property: string): unknown {
    if (property === "") {
        return undefined;
    }

    return mapStore.map.getPaintProperty(props.layer.id, property);
}

function normalizeColorPickerValue(value: string): string {
    return value.startsWith("#") ? value.substring(1) : value;
}

function normalizeHexColorInput(value: unknown): string | undefined {
    if (typeof value !== "string") {
        return undefined;
    }

    const normalizedColor = normalizeColorPickerValue(value);

    return /^[0-9a-f]{6}$/i.test(normalizedColor) ? normalizedColor : undefined;
}

function extractColorLiterals(value: unknown): string[] {
    const colors: string[] = [];
    const seenObjects = new WeakSet<object>();

    collectColorLiterals(value, colors, seenObjects);

    return [...new Set(colors)].slice(0, 4);
}

function collectColorLiterals(value: unknown, colors: string[], seenObjects: WeakSet<object>): void {
    if (colors.length >= 4) {
        return;
    }

    if (typeof value === "string") {
        if (isColorLiteral(value)) {
            colors.push(value);
        }

        return;
    }

    if (Array.isArray(value)) {
        value.forEach((item) => {
            collectColorLiterals(item, colors, seenObjects);
        });

        return;
    }

    if (value !== null && typeof value === "object") {
        if (seenObjects.has(value)) {
            return;
        }
        seenObjects.add(value);

        Object.values(value).forEach((item) => {
            collectColorLiterals(item, colors, seenObjects);
        });
    }
}

function isColorLiteral(value: string): boolean {
    return /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ||
        /^rgba?\([^)]+\)$/i.test(value) ||
        /^hsla?\([^)]+\)$/i.test(value) ||
        namedColorLiterals.has(value.toLowerCase());
}

function createLayerHeaderIndicatorBackground(indicator: LayerHeaderIndicator): string {
    if (indicator.kind === "raster") {
        return "repeating-linear-gradient(135deg, #64748b 0 4px, #cbd5e1 4px 8px)";
    }
    if (indicator.kind === "unknown") {
        return "repeating-linear-gradient(135deg, #94a3b8 0 3px, #e2e8f0 3px 6px)";
    }
    if (indicator.colors.length <= 1) {
        return indicator.colors[0] ?? "#94a3b8";
    }

    const segmentSize = 100 / indicator.colors.length;
    const segments = indicator.colors.map((color, index) => {
        const start = index * segmentSize;
        const end = (index + 1) * segmentSize;

        return `${color} ${start}% ${end}%`;
    });

    return `linear-gradient(to bottom, ${segments.join(", ")})`;
}
</script>

<style scoped>
.layer-color-rail {
    align-self: stretch;
    border-radius: 9999px;
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.08);
    flex: 0 0 6px;
    margin: 0.25rem 0.75rem 0.25rem 0;
    min-height: 2.5rem;
}

.map-layer-listing-header {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    border: 1px solid rgb(0 0 0 / 0.08);
    border-radius: 0.375rem;
    padding: 0.35rem 0.5rem 0.35rem 0.35rem;
    background: rgb(255 255 255 / 0.08);
}
.map-layer-listing-header-open {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
}

.map-layer-listing-header {
    padding-left: 0.35rem;
}

.layer-color-rail-multi,
.layer-color-rail-heatmap,
.layer-color-rail-raster,
.layer-color-rail-unknown {
    border: 1px solid rgb(255 255 255 / 0.7);
}

.layer-panel-body {
    display: flex;
    flex-direction: column;
    border: 1px solid rgb(0 0 0 / 0.1);
    border-top: 0;
    border-radius: 0 0 0.375rem 0.375rem;
    padding: 0.65rem;
    background: rgb(255 255 255 / 0.06);
}
.layer-section {
    padding: 0.65rem;
    border: 1px solid rgb(0 0 0 / 0.08);
    border-radius: 0.375rem;
    background: rgb(255 255 255 / 0.06);
}
.layer-section + .layer-section {
    margin-top: 0.65rem;
}
.layer-section-title {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    opacity: 0.6;
    margin: 0 0 0.4rem 0;
}
.layer-color-controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    flex-wrap: wrap;
}
.layer-color-input {
    width: 8rem;
    flex: 0 0 auto;
}
.layer-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 1.75rem;
    padding: 0.15rem 0;
}
.layer-row + .layer-row {
    margin-top: 0.25rem;
}
.layer-row-label {
    font-weight: 600;
    min-width: 25%;
}

/* Header row: fixed-size controls so trash/zoom align across layers */
.layer-icon-btn {
    width: 2rem;
    height: 2rem;
    padding: 0;
    flex: 0 0 auto;
}
.layer-name-area {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-left: 0.25rem;
}
.layer-name {
    min-width: 0;
    flex: 0 1 auto;
}
.layer-time-badge {
    flex: 0 0 auto;
    font-size: 0.75rem;
    opacity: 0.55;
    cursor: default;
}
.layer-legend-wrapper {
    display: inline-block;
    max-width: 100%;
    overflow-x: auto;
    /* No background — GeoServer renders the legend transparent so any residual
       canvas padding blends with the side panel. */
}
.layer-legend-image {
    display: block;
    /* Constrain to a side-panel-friendly footprint while preserving aspect
       ratio. `object-fit: contain` keeps the swatch sharp without cropping
       when the natural image is larger than the box. */
    width: auto;
    height: auto;
    max-width: 100%;
    max-height: 200px;
    object-fit: contain;
}
.group-central-legend-image {
    max-height: 360px;
}
.group-legend-list {
    display: grid;
    gap: 0.75rem;
}
.group-legend-item {
    display: grid;
    gap: 0.3rem;
    margin: 0;
}
.group-legend-label {
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--ui-text-muted);
}
.layer-actions {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    flex: 0 0 auto;
}
</style>

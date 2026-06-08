<template>
    <div class="py-1">
        <Panel class="map-layer-listing-panel" :collapsed="true" @update:collapsed="collapsedState" toggleable>
            <template #header>
                <span
                    class="layer-color-rail"
                    :class="`layer-color-rail-${layerHeaderIndicator.kind}`"
                    :style="layerHeaderIndicatorStyle"
                    :title="layerHeaderIndicatorTitle"
                    aria-hidden="true"
                ></span>
                <Button class="layer-drag-handle layer-icon-btn cursor-move" icon="pi pi-bars" text rounded aria-label="Reorder layer"
                    @click.stop></Button>
                <ToggleSwitch class="shrink-0" v-model="checked" @update:model-value="changeLayerVisibility" />
                <div class="layer-name-area">
                    <span class="layer-name capitalize truncate">
                        {{ (props.layer.displayName ?? props.layer.source).replaceAll("_", " ") }}
                    </span>
                    <i v-if="hasTimeDimension"
                       class="pi pi-clock layer-time-badge"
                       title="Temporal layer"
                       aria-label="Temporal layer"></i>
                </div>
                <div class="layer-actions">
                    <Button class="layer-icon-btn" icon="pi pi-trash" severity="danger" text rounded aria-label="Delete"
                        @click="confirmDialogVisibility = true"></Button>
                    <Button class="layer-icon-btn" icon="pi pi-search-plus" text rounded aria-label="Zoom"
                        @click="zoomToLayer"></Button>
                </div>
                <Dialog v-model:visible="confirmDialogVisibility" modal header="Delete Map Layer" :style="{ width: '25rem' }">
                    <span class="p-text-secondary block mb-5">Are you sure want to delete {{ props.layer.displayName ?? props.layer.source }} layer?</span>
                    <div class="flex justify-content-end gap-2">
                        <Button size="small" type="button" label="Cancel" severity="secondary" @click="confirmDialogVisibility = false"></Button>
                        <Button size="small" type="button" label="Delete" severity="danger" @click="deleteLayerConfirmation(props.layer)"></Button>
                    </div>
                </Dialog>
            </template>
            <div class="layer-panel-body">
                <section class="layer-section">
                    <h4 class="layer-section-title">Style</h4>
                    <label v-if="hasEditableLayerColor" class="layer-row pointer-events-none">
                        <span class="layer-row-label">Color</span>
                        <ColorPicker aria-label="Change Color" class="pointer-events-auto" format="hex" v-model="color"
                            :baseZIndex="10" @update:model-value="queueLayerColorChange" @hide="flushLayerColorChange"></ColorPicker>
                    </label>
                    <label class="layer-row">
                        <span class="layer-row-label">Opacity</span>
                        <Slider aria-label="Change Opacity" class="flex-grow" v-model="opacity" :step="0.1" :min=0
                            :max=1 @update:model-value="changeLayerOpac" :pt="{
                                range: { style: { 'background': `#${color}` } },
                                handle: { style: { 'background': `#${color}`, 'border-color': `#${color}` } }
                            }"
                        />
                    </label>
                </section>
                <section v-if="showServerLegend" class="layer-section">
                    <h4 class="layer-section-title">Legend</h4>
                    <div class="layer-legend-wrapper">
                        <img :src="legendUrl" alt="Layer legend" class="layer-legend-image" @error="legendError = true" />
                    </div>
                </section>
                <section v-if="hasTimeDimension" class="layer-section">
                    <h4 class="layer-section-title">Time</h4>
                    <RasterLayerTimeControl :layer="props.layer" />
                </section>
                <section v-if="showFiltering" class="layer-section">
                    <h4 class="layer-section-title">Filtering</h4>
                    <AttributeFiltering :layer="props.layer"></AttributeFiltering>
                    <GeometryFiltering :layer="props.layer"></GeometryFiltering>
                </section>
                <section v-if="props.layer.type !== 'raster'" class="layer-section">
                    <h4 class="layer-section-title">Data</h4>
                    <MapLayerResultTable :layer="props.layer"></MapLayerResultTable>
                </section>
            </div>
        </Panel>
    </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from "vue";
import { type LayerObjectWithAttributes, type MapLibreLayerTypes, useMapStore } from "@store/map"
import Panel from "primevue/panel";
import Slider from "primevue/slider";
import ToggleSwitch from "primevue/toggleswitch";
import Button from "primevue/button"
import { useToast } from "primevue/usetoast";
import { isNullOrEmpty } from "@helpers/functions";
import {
    type GeoserverRasterTypeLayerDetail,
    type GeoServerVectorTypeLayerDetail,
    getTimeDimension,
    resolveLegendUrl,
    useGeoserverStore,
} from "@store/geoserver";

const ColorPicker = defineAsyncComponent(async () => await import("primevue/colorpicker"));
const Dialog = defineAsyncComponent(async () => await import("primevue/dialog"));
const AttributeFiltering = defineAsyncComponent(async () => await import("./Filter/AttributeFiltering.vue"));
const GeometryFiltering = defineAsyncComponent(async () => await import("@components/Map/Layer/Filter/GeometryFiltering.vue"));
const MapLayerResultTable = defineAsyncComponent(async () => await import("./MapLayerResultTable.vue"));
const RasterLayerTimeControl = defineAsyncComponent(async () => await import("./RasterLayerTimeControl.vue"));

export interface Props {
    layer: LayerObjectWithAttributes
}
const props = defineProps<Props>()
const mapStore = useMapStore()
const geoserver = useGeoserverStore()
const legendUrl = ref<string>()
const legendError = ref<boolean>(false)
const collapsed = ref<boolean>(false)
const color = ref<string>("000000")
const opacity = ref<number>(1)
const checked = ref<boolean>(true)
const initialLayerHeaderIndicator = ref<LayerHeaderIndicator>()
let pendingColorChangeTimeout: ReturnType<typeof setTimeout> | undefined;

type LayerHeaderIndicatorKind = "single" | "multi" | "raster" | "heatmap" | "unknown";

interface LayerHeaderIndicator {
    kind: LayerHeaderIndicatorKind;
    colors: string[];
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
            return `Layer color ${layerHeaderIndicator.value.colors[0]}`;
        case "multi":
            return "Layer uses multiple style colors";
        case "heatmap":
            return "Heatmap layer colors";
        case "raster":
            return "Raster layer";
        default:
            return "Layer style color unavailable";
    }
})
const hasTimeDimension = computed<boolean>(() => {
    if (props.layer.type !== "raster") return false
    const details = props.layer.details as GeoserverRasterTypeLayerDetail | undefined
    if (details?.coverage === undefined) return false
    return getTimeDimension(details.coverage) !== null
})
const hasEditableLayerColor = computed<boolean>(() => {
    void mapStore.paintVersion;
    return getEditableColorPaintProperty(props.layer.type) !== "" &&
        typeof getLayerPaintProperty(getEditableColorPaintProperty(props.layer.type)) === "string";
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
    if (legendUrl.value === undefined || legendError.value) return false
    if (hasEditableLayerColor.value) return false
    return true
})
const showFiltering = computed<boolean>(() => {
    if (props.layer.type === "raster") return false
    return props.layer.filterLayer === undefined || props.layer.filterLayer === false
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
void _layerLegendStyle;

onMounted(() => {
    const colorProperty = getEditableColorPaintProperty(props.layer.type);
    const opacityProperty = getOpacityPaintProperty(props.layer.type);

    if (colorProperty !== "" && typeof getLayerPaintProperty(colorProperty) === "string") {
        color.value = normalizeColorPickerValue(getLayerPaintProperty(colorProperty) as string);
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
    if (props.layer.workspaceName === undefined) return
    const details = props.layer.details
    const layerName = (details as GeoserverRasterTypeLayerDetail | undefined)?.coverage?.name
        ?? (details as GeoServerVectorTypeLayerDetail | undefined)?.featureType?.name
    if (layerName === undefined || layerName === "") return
    try {
        legendUrl.value = await resolveLegendUrl(
            async (ws) => await geoserver.fetchWmsCapabilities(ws),
            props.layer.workspaceName,
            layerName
        )
    } catch (error) {
        console.error("Could not resolve legend URL", error)
    }
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
function flushLayerColorChange(): void {
    if (pendingColorChangeTimeout !== undefined) {
        clearTimeout(pendingColorChangeTimeout);
        pendingColorChangeTimeout = undefined;
    }

    const normalizedColor = normalizeHexColorInput(color.value);
    if (normalizedColor !== undefined) {
        changeLayerColor(normalizedColor);
    }
}
function changeLayerOpac(layerOpacity: any): void {
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
function collapsedState(isCollapsed: boolean): void {
    collapsed.value = isCollapsed
}
const confirmDialogVisibility = ref<boolean>(false)
const toast = useToast();
function deleteLayerConfirmation(layer: LayerObjectWithAttributes): void {
    mapStore.deleteMapLayer(layer.id, true).then(() => {
        try {
            mapStore.deleteMapDataSource(layer.source)
        } catch (error) {
            toast.add({ severity: "error", summary: "Error", detail: error, life: 3000 })
        }
    }).catch((error)=>{
        toast.add({ severity: "error", summary: "Error", detail: error, life: 3000 });
    })
    confirmDialogVisibility.value = false
}
function zoomToLayer(): void {
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

.map-layer-listing-panel :deep(.p-panel-header) {
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
}
.layer-section {
    padding: 0.5rem 0;
}
.layer-section + .layer-section {
    border-top: 1px solid var(--p-content-border-color, rgb(0 0 0 / 0.08));
}
.layer-section-title {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    opacity: 0.6;
    margin: 0 0 0.4rem 0;
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
.map-layer-listing-panel :deep(.p-panel-header) {
    gap: 0.25rem;
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
.layer-actions {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    flex: 0 0 auto;
}
</style>

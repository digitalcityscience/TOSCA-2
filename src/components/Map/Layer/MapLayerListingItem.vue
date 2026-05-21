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
                <Button class="layer-drag-handle w-8 h-8 p-0 mr-1 cursor-move" icon="pi pi-bars" text rounded aria-label="Reorder layer"
                    @click.stop></Button>
                <div class="flex">
                    <ToggleSwitch v-model="checked" @update:model-value="changeLayerVisibility" />
                </div>
                <span v-if="props.layer.displayName" class="capitalize mr-auto ml-2 truncate ...">{{ props.layer.displayName.replaceAll("_", " ") }}</span>
                <span v-else class="capitalize mr-auto ml-2 truncate ...">{{ props.layer.source.replaceAll("_", " ") }}</span>
                <Button class="w-8 h-8 p-0 mr-1" icon="pi pi-trash" severity="danger" text rounded aria-label="Delete"
                    @click="confirmDialogVisibility = true"></Button>
                    <Button class="w-8 h-8 p-0 mr-1" icon="pi pi-search-plus" text rounded aria-label="Zoom"
                        @click="zoomToLayer"></Button>
                <Dialog v-model:visible="confirmDialogVisibility" modal header="Delete Map Layer" :style="{ width: '25rem' }">
                    <span class="p-text-secondary block mb-5">Are you sure want to delete {{ props.layer.displayName ?? props.layer.source }} layer?</span>
                    <div class="flex justify-content-end gap-2">
                        <Button size="small" type="button" label="Cancel" severity="secondary" @click="confirmDialogVisibility = false"></Button>
                        <Button size="small" type="button" label="Delete" severity="danger" @click="deleteLayerConfirmation(props.layer)"></Button>
                    </div>
                </Dialog>
            </template>
            <div>
                <div v-if="hasEditableLayerColor">
                    <label class="flex w-full leading-none pointer-events-none items-baseline">
                        <span class="font-bold mt-2 min-w-[25%]">Color</span>
                        <ColorPicker aria-label="Change Color" class="pointer-events-auto" format="hex" v-model="color"
                            :baseZIndex="10" @update:model-value="queueLayerColorChange" @hide="flushLayerColorChange"></ColorPicker>
                    </label>
                </div>
                    <label class="flex w-full leading-none items-center mt-2">
                        <span class="font-bold mt-2 min-w-[25%]">Opacity</span>
                        <Slider aria-label="Change Opacity" class="mt-2 ml-2 flex-grow" v-model="opacity" :step="0.1" :min=0
                            :max=1 @update:model-value="changeLayerOpac" :pt="{
                                range: { style: { 'background': `#${color}` } },
                                handle: { style: { 'background': `#${color}`, 'border-color': `#${color}` } }
                            }"
                        />
                    </label>
            </div>
            <div v-if="(props.layer.filterLayer == undefined || props.layer.filterLayer === false) && (props.layer.type !== 'raster')" class="py-2">
                <AttributeFiltering :layer="props.layer"></AttributeFiltering>
                <GeometryFiltering :layer="props.layer"></GeometryFiltering>
            </div>
            <div class="py-1" v-else></div>
            <div v-if="props.layer.type !== 'raster'" class="w-full py-3">
                <MapLayerResultTable :layer="props.layer"></MapLayerResultTable>
            </div>
        </Panel>
    </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from "vue";
import { type LayerObjectWithAttributes, type MapLibreLayerTypes, useMapStore } from "@store/map"
import Panel from "primevue/panel";
import ColorPicker from "primevue/colorpicker";
import Slider from "primevue/slider";
import ToggleSwitch from "primevue/toggleswitch";
import Button from "primevue/button"
import Dialog from "primevue/dialog";
import { useToast } from "primevue/usetoast";
import AttributeFiltering from "./Filter/AttributeFiltering.vue";
import { isNullOrEmpty } from "@helpers/functions";
import { type GeoserverRasterTypeLayerDetail, type GeoServerVectorTypeLayerDetail } from "@store/geoserver";
import MapLayerResultTable from "./MapLayerResultTable.vue";

const GeometryFiltering = defineAsyncComponent(async () => await import("@components/Map/Layer/Filter/GeometryFiltering.vue"));

export interface Props {
    layer: LayerObjectWithAttributes
}
const props = defineProps<Props>()
const mapStore = useMapStore()
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
    const editableColorProperty = getEditableColorPaintProperty(props.layer.type);
    if (editableColorProperty !== "" && initialLayerHeaderIndicator.value?.kind === "single") {
        return { kind: "single", colors: [`#${color.value}`] };
    }

    if (initialLayerHeaderIndicator.value !== undefined) {
        return initialLayerHeaderIndicator.value;
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
const hasEditableLayerColor = computed<boolean>(() => {
    return getEditableColorPaintProperty(props.layer.type) !== "" &&
        typeof getLayerPaintProperty(getEditableColorPaintProperty(props.layer.type)) === "string";
})

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
})
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
    if (layerVisibility) {
        mapStore.map.setLayoutProperty(props.layer.id, "visibility", "visible")
    } else {
        mapStore.map.setLayoutProperty(props.layer.id, "visibility", "none")
    }
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
</style>

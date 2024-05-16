<template>
    <div class="py-1">
        <Panel @update:collapsed="collapsedState" toggleable>
            <template #header>
                <Checkbox v-model="checked" :binary="true" @update:model-value="changeLayerVisibility" />
                <h3 class="capitalize mr-auto ml-2">{{ props.layer.source.replaceAll("_", " ") }}</h3>
            </template>
            <div>
                <label class="flex w-full leading-none pointer-events-none items-baseline">
                    <span class="mt-2 min-w-[25%]">Color</span>
                    <ColorPicker aria-label="Change Color" class="pointer-events-auto" format="hex" v-model="color" :baseZIndex="10"
                        @update:model-value="changeLayerColor"></ColorPicker>
                </label>
                <label class="flex w-full leading-none items-center mt-2">
                    <span class="mt-2 min-w-[25%]">Opacity</span>
                    <Slider aria-label="Change Opacity" class="mt-2 ml-2 flex-grow" v-model="opacity" :step="0.1" :min=0 :max=1
                        @update:model-value="changeLayerOpac" :pt="{
                            range: { style: { 'background': `#${color}` } },
                            handle: { style: { 'background': `#${color}`, 'border-color': `#${color}` } }
                        }" />
                </label>
            </div>
            <div v-if="props.layer.filterLayer == undefined || props.layer.filterLayer === false" class="py-2">
                <AttributeFiltering :layer="props.layer"></AttributeFiltering>
                <GeometryFiltering :layer="props.layer"></GeometryFiltering>
            </div>
            <div class="py-1" v-else></div>
        </Panel>
    </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent, onMounted, ref } from "vue";
import { type LayerObjectWithAttributes, useMapStore } from "../store/map"
import Panel from "primevue/panel";
import ColorPicker from "primevue/colorpicker";
import Slider from "primevue/slider";
import Checkbox from "primevue/checkbox";
import AttributeFiltering from "./AttributeFiltering.vue";
import { isNullOrEmpty } from "../core/helpers/functions";

const GeometryFiltering = defineAsyncComponent(async () => await import("../components/GeometryFiltering.vue"));

export interface Props {
    layer: LayerObjectWithAttributes
}
const props = defineProps<Props>()
const mapStore = useMapStore()
const collapsed = ref<boolean>(false)
const color = ref<string>("000000")
const opacity = ref<number>(1)
const checked = ref<boolean>(true)
onMounted(() => {
    let prop = ""
    let opac = ""
    if (props.layer.type === "circle") {
        prop = "circle-color"
        opac = "circle-opacity"
    }
    if (props.layer.type === "fill") {
        prop = "fill-color"
        opac = "fill-opacity"
    }
    if (props.layer.type === "line") {
        prop = "line-color"
        opac = "line-opacity"
    }
    if (!isNullOrEmpty(mapStore.map.getPaintProperty(props.layer.id, prop))) {
        color.value = (mapStore.map.getPaintProperty(props.layer.id, prop) as string).substring(1)
    }
    if (!isNullOrEmpty(mapStore.map.getPaintProperty(props.layer.id, opac))) {
        opacity.value = mapStore.map.getPaintProperty(props.layer.id, opac)
    }
    if (!isNullOrEmpty(mapStore.map.getLayoutProperty(props.layer.id, "visibility"))){
        if (mapStore.map.getLayoutProperty(props.layer.id, "visibility") === "none"){
            checked.value = false
        }
    }
})
function changeLayerColor(color: any): void {
    let prop = ""
    if (props.layer.type === "circle") {
        prop = "circle-color"
    }
    if (props.layer.type === "fill") {
        prop = "fill-color"
    }
    if (props.layer.type === "line") {
        prop = "line-color"
    }
    mapStore.map.setPaintProperty(props.layer.id, prop, `#${color}`)
}
function changeLayerOpac(layerOpacity: any): void {
    let opac = ""
    if (props.layer.type === "circle") {
        opac = "circle-opacity"
    }
    if (props.layer.type === "fill") {
        opac = "fill-opacity"
    }
    if (props.layer.type === "line") {
        opac = "line-opacity"
    }
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
</script>

<style scoped></style>

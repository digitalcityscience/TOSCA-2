<template>
    <div>
        <Popover ref="op" :dismissable="false" >
            <BufferPanel v-if="contentLoaded"></BufferPanel>
        </Popover>
    </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent, nextTick, ref } from "vue";
import Popover from "primevue/popover";
import { useMapStore } from "@store/map";
import { BufferControl } from "@helpers/bufferControl";
const BufferPanel = defineAsyncComponent(async () => await import("./BufferPanel.vue"));
const mapStore = useMapStore()
// Overlay Panel operations
const op = ref()
const contentLoaded = ref(false)
function toggle(event: Event): void {
    contentLoaded.value = true
    nextTick(() => {
        op.value.toggle(event)
    }).then(() => {}, () => {})
}

// Terradraw operations
const bufferControl = new BufferControl(toggle)
if (mapStore.map !== null || mapStore.map !== undefined) {
    mapStore.map.addControl(bufferControl, "top-right")
}
</script>

<style scoped></style>

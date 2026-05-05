<template>
    <div>
        <Popover ref="op" :dismissable="false" showCloseIcon :pt="closeButtonStyles">
            <DrawPanel v-if="contentLoaded"></DrawPanel>
        </Popover>
    </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent, nextTick, ref } from "vue";
import Popover from "primevue/popover";
import { useMapStore } from "@store/map";
import { DrawControl } from "@helpers/drawControl";
const DrawPanel = defineAsyncComponent(async () => await import("./DrawPanel.vue"));
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
const drawControl = new DrawControl(toggle)
if (mapStore.map !== null || mapStore.map !== undefined) {
    mapStore.map.addControl(drawControl, "top-right")
}
const closeButtonStyles= {
    closeButton:{
        class: [
            "absolute top-2 left-2 p-2",
            "rounded-full",
            "bg-transparent",
            "text-primary-500 dark:text-primary-400",
            "hover:bg-primary-600 dark:hover:bg-primary-300 hover:text-white hover:border-primary-600 dark:hover:border-primary-300 text-primary-300 dark:text-primary-600",
            "focus:ring-primary-400/50 dark:focus:ring-primary-300/50"
        ]
    }
}
</script>

<style scoped></style>

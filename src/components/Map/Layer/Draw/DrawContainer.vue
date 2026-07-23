<template>
    <div>
        <Popover ref="op" :dismissable="false" showCloseIcon :pt="closeButtonStyles">
            <div v-if="drawTool.externalAppOnProgress" class="flex flex-col min-w-72 max-h-[90vh] overflow-y-auto py-6">
                <UAlert class="w-full" color="info" variant="soft" description="Drawing tool currently in use." />
            </div>
            <div v-else class="flex flex-col min-w-72 max-h-[90vh] overflow-y-auto">
                <div class="w-full">
                    <UCard>
                        <template #header>
                            <div class="space-y-1">
                                <div class="font-semibold text-highlighted">Create</div>
                                <div class="text-muted text-sm">Select a mode and start drawing</div>
                            </div>
                        </template>
                        <template #default>
                                <div class="flex justify-between">
                                    <div v-for="draw in drawTool.drawTypes" :key="draw.name" class="flex align-items-center">
                                        <RadioButton :disabled="drawTool.drawOnProgress||drawTool.editOnProgress" v-model="drawTool.drawMode" :inputId="draw.name" :value="draw.name" />
                                        <label :for="draw.name" class="ml-2">{{ draw.mode }}</label>
                                    </div>
                                </div>
                        </template>
                        <template #footer>
                            <div class="w-full flex justify-between">
                                <UButton size="sm" class="col" :disabled="drawTool.drawOnProgress" @click="drawTool.changeMode(drawTool.drawMode)">
                                    <span v-if="!(drawTool.drawOnProgress || drawTool.editOnProgress)">Start Drawing</span>
                                    <span v-else>Continue</span>
                                </UButton>
                                <UButton size="sm" v-if="(drawTool.drawOnProgress||drawTool.editOnProgress)" :disabled="!drawTool.drawOnProgress" color="secondary" @click="drawTool.changeMode('select')">Edit</UButton>
                                <UButton size="sm" v-if="(drawTool.drawOnProgress || drawTool.editOnProgress)" :disabled="!(drawTool.drawOnProgress || drawTool.editOnProgress)" color="neutral" variant="soft" @click="drawTool.stopTerradraw">Cancel</UButton>
                            </div>
                        </template>
                    </UCard>
                </div>
                <div class="w-full pt-1">
                    <UCard v-if="drawTool.drawOnProgress || drawTool.editOnProgress">
                        <template #header>
                            <div class="space-y-1">
                                <div class="font-semibold text-highlighted">Save</div>
                                <div class="text-muted text-sm">Save your drawing as a Layer</div>
                            </div>
                        </template>
                        <template #default>
                            <InputText v-model="drawTool.layerName" placeholder="Layer Name"></InputText>
                        </template>
                        <template #footer>
                            <UButton size="sm" @click="drawTool.saveAsLayer" :disabled="drawTool.layerName.length === 0">Add Layer</UButton>
                        </template>
                    </UCard>
                </div>
            </div>
        </Popover>
    </div>
</template>

<script setup lang="ts">
import RadioButton from "primevue/radiobutton";
import Popover from "primevue/popover";
import InputText from "primevue/inputtext";
import { ref } from "vue";
import { useDrawStore } from "@store/draw"
import { useMapStore } from "@store/map";
import { DrawControl } from "@helpers/drawControl";
const mapStore = useMapStore()
const drawTool = useDrawStore()
// Overlay Panel operations
const op = ref()
function toggle(event: Event): void {
    op.value.toggle(event)
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

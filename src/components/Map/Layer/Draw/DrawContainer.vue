<template>
    <div>
        <OverlayPanel ref="op" :dismissable="false" showCloseIcon :pt="closeButtonStyles">
            <div v-if="drawTool.externalAppOnProgress" class="flex flex-col min-w-72 max-h-[90vh] overflow-y-auto py-6">
                <Message class="w-full" severity="info">Drawing tool currently in use.</Message>
            </div>
            <div v-else class="flex flex-col min-w-72 max-h-[90vh] overflow-y-auto">
                <div class="w-full">
                    <Card>
                        <template #title>Create</template>
                        <template #subtitle>Select a mode and start drawing</template>
                        <template #content>
                                <div class="flex justify-between">
                                    <div v-for="draw in drawTool.drawTypes" :key="draw.name" class="flex align-items-center">
                                        <RadioButton :disabled="drawTool.drawOnProgress||drawTool.editOnProgress" v-model="drawTool.drawMode" :inputId="draw.name" :value="draw.name" />
                                        <label :for="draw.name" class="ml-2">{{ draw.mode }}</label>
                                    </div>
                                </div>
                        </template>
                        <template #footer>
                            <div class="w-full flex justify-between">
                                <Button size="small" class="col" :disabled="drawTool.drawOnProgress" @click="drawTool.changeMode(drawTool.drawMode)">
                                    <span v-if="!(drawTool.drawOnProgress || drawTool.editOnProgress)">Start Drawing</span>
                                    <span v-else>Continue</span>
                                </Button>
                                <Button size="small" v-if="(drawTool.drawOnProgress||drawTool.editOnProgress)" :disabled="!drawTool.drawOnProgress" @click="drawTool.changeMode('select')">Edit</Button>
                                <Button size="small" v-if="(drawTool.drawOnProgress || drawTool.editOnProgress)" :disabled="!(drawTool.drawOnProgress || drawTool.editOnProgress)" @click="drawTool.stopTerradraw">Cancel</Button>
                            </div>
                        </template>
                    </Card>
                </div>
                <div class="w-full pt-1">
                    <Card v-if="drawTool.drawOnProgress || drawTool.editOnProgress">
                        <template #title>Save</template>
                        <template #subtitle>Save your drawing as a Layer</template>
                        <template #content>
                            <InputText v-model="drawTool.layerName" placeholder="Layer Name"></InputText>
                        </template>
                        <template #footer>
                            <Button size="small" @click="drawTool.saveAsLayer" :disabled="drawTool.layerName.length === 0">Add Layer</Button>
                        </template>
                    </Card>
                </div>
            </div>
        </OverlayPanel>
    </div>
</template>

<script setup lang="ts">
import Card from "primevue/card";
import RadioButton from "primevue/radiobutton";
import OverlayPanel from "primevue/overlaypanel";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
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

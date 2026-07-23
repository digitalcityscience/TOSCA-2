<template>
    <div>
        <UPopover v-model:open="popoverOpen" :reference="popoverReference" :dismissible="false">
            <template #content>
            <UButton
                class="absolute top-2 left-2 z-10"
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                aria-label="Close drawing controls"
                @click="popoverOpen = false"
            />
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
                                <URadioGroup
                                    v-model="drawTool.drawMode"
                                    :items="drawModeOptions"
                                    :disabled="drawTool.drawOnProgress||drawTool.editOnProgress"
                                    orientation="horizontal"
                                />
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
                            <UInput v-model="drawTool.layerName" placeholder="Layer Name" />
                        </template>
                        <template #footer>
                            <UButton size="sm" @click="drawTool.saveAsLayer" :disabled="drawTool.layerName.length === 0">Add Layer</UButton>
                        </template>
                    </UCard>
                </div>
            </div>
            </template>
        </UPopover>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useDrawStore } from "@store/draw"
import { useMapStore } from "@store/map";
import { DrawControl } from "@helpers/drawControl";
const mapStore = useMapStore()
const drawTool = useDrawStore()
const drawModeOptions = computed(() => {
    return drawTool.drawTypes.map((draw) => ({
        label: draw.mode,
        value: draw.name,
    }))
})
// Overlay Panel operations
function toggle(event: Event): void {
    popoverReference.value = event.currentTarget as HTMLElement
    popoverOpen.value = !popoverOpen.value
}
const popoverOpen = ref(false)
const popoverReference = ref<HTMLElement>()

// Terradraw operations
const drawControl = new DrawControl(toggle)
if (mapStore.map !== null || mapStore.map !== undefined) {
    mapStore.map.addControl(drawControl, "top-right")
}
</script>

<style scoped></style>

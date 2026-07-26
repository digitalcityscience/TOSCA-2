<template>
    <div v-if="drawTool.externalAppOnProgress" class="flex flex-col py-2">
        <UAlert class="w-full" color="info" variant="soft" description="Drawing tool currently in use." />
    </div>
    <div v-else class="flex flex-col gap-3">
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
                <div class="w-full flex flex-wrap justify-between gap-2">
                    <UButton size="sm" :disabled="drawTool.drawOnProgress" @click="drawTool.changeMode(drawTool.drawMode)">
                        <span v-if="!(drawTool.drawOnProgress || drawTool.editOnProgress)">Start Drawing</span>
                        <span v-else>Continue</span>
                    </UButton>
                    <UButton size="sm" v-if="(drawTool.drawOnProgress||drawTool.editOnProgress)" :disabled="!drawTool.drawOnProgress" color="secondary" @click="drawTool.changeMode('select')">Edit</UButton>
                    <UButton size="sm" v-if="(drawTool.drawOnProgress || drawTool.editOnProgress)" :disabled="!(drawTool.drawOnProgress || drawTool.editOnProgress)" color="neutral" variant="soft" @click="drawTool.stopTerradraw">Cancel</UButton>
                </div>
            </template>
        </UCard>
        <UCard v-if="drawTool.drawOnProgress || drawTool.editOnProgress">
            <template #header>
                <div class="space-y-1">
                    <div class="font-semibold text-highlighted">Save</div>
                    <div class="text-muted text-sm">Save your drawing as a layer</div>
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
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useDrawStore } from "@store/draw"
const drawTool = useDrawStore()
const drawModeOptions = computed(() => {
    return drawTool.drawTypes.map((draw) => ({
        label: draw.mode,
        value: draw.name,
    }))
})
</script>

<style scoped></style>

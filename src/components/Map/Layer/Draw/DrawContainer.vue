<template>
    <div v-if="drawTool.externalAppOnProgress" class="flex flex-col py-2">
        <UAlert class="w-full" color="info" variant="soft" :description="t('draw.toolInUse')" />
    </div>
    <div v-else class="flex flex-col gap-3">
        <UCard>
            <template #header>
                <div class="space-y-1">
                    <div class="font-semibold text-highlighted">{{ t('draw.createTitle') }}</div>
                    <div class="text-muted text-sm">{{ t('draw.createDescription') }}</div>
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
                        <span v-if="!(drawTool.drawOnProgress || drawTool.editOnProgress)">{{ t('draw.startDrawing') }}</span>
                        <span v-else>{{ t('draw.continue') }}</span>
                    </UButton>
                    <UButton size="sm" v-if="(drawTool.drawOnProgress||drawTool.editOnProgress)" :disabled="!drawTool.drawOnProgress" color="secondary" @click="drawTool.changeMode('select')">{{ t('draw.edit') }}</UButton>
                    <UButton size="sm" v-if="(drawTool.drawOnProgress || drawTool.editOnProgress)" :disabled="!(drawTool.drawOnProgress || drawTool.editOnProgress)" color="neutral" variant="soft" @click="drawTool.stopTerradraw">{{ t('draw.cancel') }}</UButton>
                </div>
            </template>
        </UCard>
        <UCard v-if="drawTool.drawOnProgress || drawTool.editOnProgress">
            <template #header>
                <div class="space-y-1">
                    <div class="font-semibold text-highlighted">{{ t('draw.saveTitle') }}</div>
                    <div class="text-muted text-sm">{{ t('draw.saveDescription') }}</div>
                </div>
            </template>
            <template #default>
                <UInput v-model="drawTool.layerName" :placeholder="t('draw.layerNamePlaceholder')" />
            </template>
            <template #footer>
                <UButton size="sm" @click="drawTool.saveAsLayer" :disabled="drawTool.layerName.length === 0">{{ t('draw.addLayer') }}</UButton>
            </template>
        </UCard>
    </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useDrawStore } from "@store/draw"
const { t } = useI18n();
const drawTool = useDrawStore()
const drawModeOptions = computed(() => {
    return drawTool.drawTypes.map((draw) => ({
        label: draw.mode,
        value: draw.name,
    }))
})
</script>

<style scoped></style>

<template>
    <UCard>
        <template #header>
            <div class="space-y-1">
                <div class="font-semibold text-highlighted">{{ t('buffer.title') }}</div>
                <div class="text-muted text-sm">{{ t('buffer.description') }}</div>
            </div>
        </template>
        <template #default>
            <div class="w-full" v-if="filteredLayers.length > 0">
                <div class="buffer-target">
                    <label id="label_targetLayer" class="font-bold">{{ t('buffer.selectTargetLayer') }}</label>
                    <p class="text-sm font-light italic">{{ t('buffer.selectTargetLayerHelp') }}</p>
                    <div class="pt-2 w-full flex">
                        <USelect
                            class="w-full max-w-64"
                            aria-labelledby="label_targetLayer"
                            :disabled="bufferStore.isTmpDataCreated"
                            :model-value="bufferStore.selectedLayer?.id"
                            :items="filteredLayerOptions"
                            :placeholder="t('buffer.selectLayerPlaceholder')"
                            @update:model-value="selectBufferLayer"
                        />
                        <UButton
                            v-if="bufferStore.selectedLayer !== null && !bufferStore.isTmpDataCreated"
                            class="ml-1"
                            icon="i-lucide-x"
                            color="neutral"
                            variant="ghost"
                            :aria-label="t('buffer.clearSelectedLayer')"
                            @click="bufferStore.selectedLayer = null"
                        />
                    </div>
                </div>
                <div class="buffer-radius pt-4">
                    <label id="label_radius" class="font-bold">{{ t('buffer.radius') }}</label>
                    <p class="text-sm font-light italic">{{ t('buffer.radiusHelp') }}</p>
                    <div class="pt-2 w-full flex items-center">
                        <UInputNumber class="w-full max-w-64" aria-labelledby="label_radius" :disabled="bufferStore.isTmpDataCreated" v-model="bufferStore.bufferRadius" :min="0" :step="1" />
                        <span class="ml-2 text-sm text-muted">m</span>
                    </div>
                </div>
                <div v-if="bufferStore.isTmpDataCreated">
                    <div class="buffer-layer pt-4">
                        <label id="label_bufferLayer" class="font-bold">{{ t('buffer.bufferLayerName') }}</label>
                        <p class="text-sm font-light italic">{{ t('buffer.bufferLayerNameHelp') }}</p>
                        <UInput v-model="bufferStore.bufferLayerName" :placeholder="t('buffer.bufferLayerNamePlaceholder')" />
                    </div>
                </div>
            </div>
            <div v-else>
                <p>{{ t('buffer.noSuitableLayer') }}</p>
            </div>
        </template>
        <template #footer>
            <div v-if="!bufferStore.isTmpDataCreated">
                <UButton size="sm" :disabled="bufferStore.selectedLayer === null || !(bufferStore.bufferRadius > 0)" @click="bufferStore.temporaryBufferHandler(bufferStore.selectedLayer!,bufferStore.bufferRadius)">{{ t('buffer.createBuffer') }}</UButton>
            </div>
            <div v-else class="grid w-full grid-cols-2 gap-2">
                <UButton size="sm" class="w-full" color="neutral" variant="soft" @click="bufferStore.clearTmpBufferLayer">{{ t('buffer.reset') }}</UButton>
                <UButton size="sm" class="w-full" :disabled="bufferStore.selectedLayer === null || !(bufferStore.bufferRadius > 0) || bufferStore.bufferLayerName ===''" @click="bufferStore.addToMapLayer(bufferStore.selectedLayer!, bufferStore.bufferRadius, bufferStore.bufferLayerName)">{{ t('buffer.addAsLayer') }}</UButton>
            </div>
        </template>
    </UCard>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useMapStore } from "@store/map";
import { useBufferStore } from "@store/buffer";
const { t } = useI18n();
const mapStore = useMapStore()
const bufferStore = useBufferStore()
const filteredLayers = computed(() => {
    if (mapStore.layersOnMap.length > 0) {
        return mapStore.layersOnMap.filter(layer => {
            return layer.sourceType ==="geojson";
        });
    }
    return [];
});
const filteredLayerOptions = computed(() => {
    return filteredLayers.value.map((layer) => ({
        label: layer.displayName ?? layer.id,
        value: layer.id,
    }))
})
function selectBufferLayer(layerId: string | number | boolean | undefined): void {
    bufferStore.selectedLayer = filteredLayers.value.find((layer) => layer.id === layerId) ?? null
}
</script>

<style scoped></style>

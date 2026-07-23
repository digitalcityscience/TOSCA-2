<template>
    <div>
        <UPopover v-model:open="popoverOpen" :reference="popoverReference" :dismissible="false">
            <template #content>
            <div class="block min-w-72 max-h-[90vh] overflow-y-auto">
                <div class="w-full">
                    <UCard>
                        <template #header>
                            <div class="space-y-1">
                                <div class="font-semibold text-highlighted">Buffer</div>
                                <div class="text-muted text-sm">Select a layer to apply buffer</div>
                            </div>
                        </template>
                        <template #default>
                            <div class="w-full" v-if="filteredLayers.length > 0">
                                <div class="buffer-target">
                                    <label id="label_targetLayer" class="font-bold">Select target Layer</label>
                                    <p class="text-sm font-light italic">Your selection will be used to create buffer areas</p>
                                    <div class="pt-2 w-full flex">
                                        <USelect
                                            class="w-full max-w-64"
                                            aria-labelledby="label_targetLayer"
                                            :disabled="bufferStore.isTmpDataCreated"
                                            :model-value="bufferStore.selectedLayer?.id"
                                            :items="filteredLayerOptions"
                                            placeholder="Select a layer"
                                            @update:model-value="selectBufferLayer"
                                        />
                                        <UButton
                                            v-if="bufferStore.selectedLayer !== null && !bufferStore.isTmpDataCreated"
                                            class="ml-1"
                                            icon="i-lucide-x"
                                            color="neutral"
                                            variant="ghost"
                                            aria-label="Clear selected layer"
                                            @click="bufferStore.selectedLayer = null"
                                        />
                                    </div>
                                </div>
                                <div class="buffer-radius pt-4">
                                    <label id="label_radius" class="font-bold">Radius</label>
                                    <p class="text-sm font-light italic">Buffer radius as a meter</p>
                                    <div class="pt-2 w-full flex items-center">
                                        <UInputNumber class="w-full max-w-64" aria-labelledby="label_radius" :disabled="bufferStore.isTmpDataCreated" v-model="bufferStore.bufferRadius" :min="0" :step="1" />
                                        <span class="ml-2 text-sm text-muted">m</span>
                                    </div>
                                </div>
                                <div v-if="bufferStore.isTmpDataCreated">
                                    <div class="buffer-layer pt-4">
                                        <label id="label_bufferLayer" class="font-bold">Buffer Layer Name</label>
                                        <p class="text-sm font-light italic">Name of the buffer layer</p>
                                        <UInput v-model="bufferStore.bufferLayerName" placeholder="Buffer Layer Name" />
                                    </div>
                                </div>
                            </div>
                            <div v-else>
                                <p>There is no suitable layer for buffering.</p>
                            </div>
                        </template>
                        <template #footer>
                            <div v-if="!bufferStore.isTmpDataCreated">
                                <UButton size="sm" :disabled="bufferStore.selectedLayer === null || !(bufferStore.bufferRadius > 0)" @click="bufferStore.temporaryBufferHandler(bufferStore.selectedLayer!,bufferStore.bufferRadius)">Create Buffer</UButton>
                            </div>
                            <div v-else class="w-full grid-cols-2">
                                <div  class="md:col-span-2 2xl:col-span-1 md:p-1 2xl:p-0">
                                    <UButton size="sm" class="w-full" color="neutral" variant="soft" @click="bufferStore.clearTmpBufferLayer">Reset</UButton>
                                </div>
                                <div  class="md:col-span-2 2xl:col-span-1  md:p-1 2xl:p-0">
                                    <UButton size="sm" class="w-full" :disabled="bufferStore.selectedLayer === null || !(bufferStore.bufferRadius > 0) || bufferStore.bufferLayerName ===''" @click="bufferStore.addToMapLayer(bufferStore.selectedLayer!, bufferStore.bufferRadius, bufferStore.bufferLayerName)">Add as a Layer</UButton>
                                </div>
                            </div>
                        </template>
                    </UCard>
                </div>
            </div>
            </template>
        </UPopover>
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useMapStore } from "@store/map";
import { useBufferStore } from "@store/buffer";
import { BufferControl } from "@helpers/bufferControl";
const mapStore = useMapStore()
const bufferStore = useBufferStore()
// Overlay Panel operations
function toggle(event: Event): void {
    popoverReference.value = event.currentTarget as HTMLElement
    popoverOpen.value = !popoverOpen.value
}
const popoverOpen = ref(false)
const popoverReference = ref<HTMLElement>()

// Terradraw operations
const bufferControl = new BufferControl(toggle)
if (mapStore.map !== null || mapStore.map !== undefined) {
    mapStore.map.addControl(bufferControl, "top-right")
}
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

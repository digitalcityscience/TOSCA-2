<template>
    <div>
        <Popover ref="op" :dismissable="false" >
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
                                        <Select class="w-full max-w-64" aria-labelledby="label_targetLayer" :disabled="bufferStore.isTmpDataCreated" v-model="bufferStore.selectedLayer" :options="filteredLayers" optionLabel="displayName" placeholder="Select a layer" showClear></Select>
                                    </div>
                                </div>
                                <div class="buffer-radius pt-4">
                                    <label id="label_radius" class="font-bold">Radius</label>
                                    <p class="text-sm font-light italic">Buffer radius as a meter</p>
                                    <div class="pt-2 w-full flex">
                                        <InputNumber class="w-full max-w-64" aria-labelledby="label_radius" :disabled="bufferStore.isTmpDataCreated" v-model="bufferStore.bufferRadius" mode="decimal" :min="0" :step="1" suffix=" m"/>
                                    </div>
                                </div>
                                <div v-if="bufferStore.isTmpDataCreated">
                                    <div class="buffer-layer pt-4">
                                        <label id="label_bufferLayer" class="font-bold">Buffer Layer Name</label>
                                        <p class="text-sm font-light italic">Name of the buffer layer</p>
                                        <InputText v-model="bufferStore.bufferLayerName" placeholder="Buffer Layer Name" />
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
        </Popover>
    </div>
</template>

<script setup lang="ts">
import Popover from "primevue/popover";
import Select from "primevue/select";
import InputNumber from "primevue/inputnumber";
import InputText from "primevue/inputtext";
import { ref, computed } from "vue";
import { useMapStore } from "@store/map";
import { useBufferStore } from "@store/buffer";
import { BufferControl } from "@helpers/bufferControl";
const mapStore = useMapStore()
const bufferStore = useBufferStore()
// Overlay Panel operations
const op = ref()
function toggle(event: Event): void {
    op.value.toggle(event)
}

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
</script>

<style scoped></style>

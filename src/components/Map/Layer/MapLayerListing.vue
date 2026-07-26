<template>
    <BaseSlideoverSidebarComponent :id="sidebarID" side="right" :collapsed="true">
        <template #header>
            <p>Layers</p>
        </template>
        <div class="w-full" v-if="visibleLayers.length > 0">
            <draggable
                :model-value="visibleLayers"
                item-key="id"
                handle=".layer-drag-handle"
                ghost-class="map-layer-drag-ghost"
                @change="reorderLayer"
            >
                <template #item="{ element }">
                    <MapLayerListingItem :layer="element"></MapLayerListingItem>
                </template>
            </draggable>
        </div>
        <div class="w-full p-3" v-else>
            <UEmpty
                icon="i-lucide-layers"
                title="No layers on map"
                description="Add a layer from datastores to start working with map layers."
                :ui="{ root: 'py-8', description: 'text-sm' }"
            />
            <div class="flex justify-center pt-3">
                <UButton size="sm" icon="i-lucide-database" @click="openSlideoverSidebar('workspaceListing')">
                    Open datastores
                </UButton>
            </div>
        </div>
    </BaseSlideoverSidebarComponent>
</template>

<script setup lang="ts">
import { computed } from "vue";
import draggable from "vuedraggable";
// components
import BaseSlideoverSidebarComponent from "../../Base/BaseSlideoverSidebarComponent.vue";
import MapLayerListingItem from "./MapLayerListingItem.vue";
// JS imports
import { useMapStore } from "@store/map";
import { openSlideoverSidebar } from "@helpers/slideoverSidebarRegistry";

const mapStore = useMapStore()
const visibleLayers = computed(() => mapStore.getReorderableVisibleLayersTopToBottom())

const sidebarID = "maplayerListing"

interface DraggableChangeEvent {
    moved?: {
        element: {
            id: string;
        };
        newIndex: number;
    };
}

/**
 * Applies a completed drag operation to the map store.
 *
 * @param {DraggableChangeEvent} event - vue.draggable.next change payload.
 */
function reorderLayer(event: DraggableChangeEvent): void {
    if (event.moved === undefined) {
        return;
    }

    mapStore.reorderVisibleMapLayer(
        event.moved.element.id,
        event.moved.newIndex
    )
}
</script>

<style scoped>
.map-layer-drag-ghost {
    opacity: 0.5;
}
</style>

<template>
    <BaseSidebarComponent :id="sidebarID" position="right" :collapsed="true">
        <template #header>
            <p>Layers</p>
        </template>
        <div class="w-full" v-if="contentLoaded && visibleLayers.length > 0">
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
        <div class="w-full" v-else-if="contentLoaded">
            <Message class="w-full" severity="info">There is no layer on map</Message>
        </div>
    </BaseSidebarComponent>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from "vue";
import Message from "primevue/message";
import draggable from "vuedraggable";
// components
import BaseSidebarComponent from "../../Base/BaseSidebarComponent.vue";
import MapLayerListingItem from "./MapLayerListingItem.vue";
// JS imports
import { useMapStore } from "@store/map";
import { SidebarControl } from "@helpers/sidebarControl"

const mapStore = useMapStore()
const contentLoaded = ref(false)
const visibleLayers = computed(() => mapStore.getReorderableVisibleLayersTopToBottom())

const sidebarID = "maplayerListing"
const iconElement = document.createElement("span")
iconElement.classList.add("material-icons-outlined")
iconElement.textContent = "layers"
const sidebarControl = new SidebarControl("", sidebarID, document.createElement("div"), iconElement)
mapStore.map.addControl(sidebarControl, "top-right")

onMounted(() => {
    document.getElementById(sidebarID)?.addEventListener("tosca:sidebar-toggle", (event) => {
        if ((event as CustomEvent<{ expanded: boolean }>).detail.expanded) {
            contentLoaded.value = true
        }
    });
})

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

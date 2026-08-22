<template>
    <div class="collab-table">
        <div v-if="!syncStore.connected" class="collab-table-disconnected">
            <UIcon name="i-lucide-plug-zap" class="size-5 shrink-0" />
            <span>{{ t("collab.table.disconnected") }}</span>
        </div>
        <div class="collab-table-map">
            <MapContainer></MapContainer>
        </div>
    </div>
</template>

<script setup lang="ts">
/**
 * `/collab/table` — the projector-facing window (plan §9/§11, ticket 06). A separate app
 * instance with its own MapLibre map (the one-map rule is per document, plan §0): a pure
 * `BroadcastChannel` subscriber that renders `useCollabSessionStore` and never mutates it. Once
 * the map is up, its viewport is locked (no pan/zoom/rotate) so the projected image stays put.
 */
import { onBeforeUnmount, onMounted, watch } from "vue";
import { useI18n } from "vue-i18n";
import MapContainer from "@components/Map/MapContainer.vue";
import { useMapStore } from "@store/map";
import { useCollabSyncStore } from "@store/collabSync";
import { useCollabTrackingRenderStore } from "@store/collabTrackingRender";

const { t } = useI18n();
const mapStore = useMapStore();
const syncStore = useCollabSyncStore();
const trackingRenderStore = useCollabTrackingRenderStore();

let viewportLocked = false;

function lockViewport(): void {
    const map = mapStore.map;
    if (map === undefined || viewportLocked) {
        return;
    }
    map.dragPan.disable();
    map.dragRotate.disable();
    map.scrollZoom.disable();
    map.doubleClickZoom.disable();
    map.touchZoomRotate.disable();
    map.keyboard.disable();
    map.boxZoom.disable();
    viewportLocked = true;
}

const stopMapWatch = watch(() => mapStore.map, lockViewport, { immediate: true });

onMounted(() => {
    syncStore.startAsTable();
    trackingRenderStore.startRendering("table");
});

onBeforeUnmount(() => {
    stopMapWatch();
    syncStore.stop();
    trackingRenderStore.stop();
});
</script>

<style scoped>
.collab-table {
    position: relative;
    width: 100%;
    height: 100%;
}
.collab-table-map {
    width: 100%;
    height: 100%;
}
.collab-table-disconnected {
    position: absolute;
    top: 1rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 30;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    background: var(--tosca-app-chrome-bg);
    color: var(--tosca-app-chrome-text);
    border: 1px solid var(--tosca-app-border);
    font-size: 0.875rem;
}
</style>

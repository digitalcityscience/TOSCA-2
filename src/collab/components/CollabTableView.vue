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
import { useCollabSessionStore } from "../stores/collabSession";
import { useCollabSyncStore } from "../stores/collabSync";
import { useCollabTrackingRenderStore } from "../stores/collabTrackingRender";
import { aoiBoundingBox } from "../stores/collabCalibration";

const { t } = useI18n();
const mapStore = useMapStore();
const session = useCollabSessionStore();
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

/**
 * Fits the Table map to the Control-selected AOI (A1/A2) and only then locks the viewport, so the
 * projector shows the exact Collab AOI instead of the generic `VITE_MAP_START_*` viewport before
 * being frozen in place. Runs again on every `map`/`session.calibration.aoi` change so it also
 * covers the (re)load/localStorage-recovery path (`collabSync.startAsTable` may populate `aoi`
 * before or after the map itself becomes ready).
 */
function fitToAoiThenLock(): void {
    const map = mapStore.map;
    const aoi = session.calibration.aoi;
    // Intentionally never locks while `aoi` is null (A1/A2: lock only AFTER the AOI is
    // established) — if Control never selects an AOI, the Table stays pannable on its generic
    // startup viewport rather than freezing on the wrong one. This is a deliberate behavior
    // change from the pre-fix "lock unconditionally once the map is ready".
    if (map === undefined || aoi === null || viewportLocked) {
        return;
    }
    const [minLng, minLat, maxLng, maxLat] = aoiBoundingBox(aoi);
    map.fitBounds(
        [
            [minLng, minLat],
            [maxLng, maxLat],
        ],
        { padding: 0, animate: false }
    );
    lockViewport();
}

const stopFitWatch = watch(() => [mapStore.map, session.calibration.aoi] as const, fitToAoiThenLock, { immediate: true });

onMounted(() => {
    syncStore.startAsTable();
    trackingRenderStore.startRendering("table");
});

onBeforeUnmount(() => {
    stopFitWatch();
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

<template>
    <div class="collab-table" :class="{ 'collab-table--presenting': session.calibration.phase === 'presenting' }">
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
 * the map is up, its viewport is fit to the AOI and locked (`collabTableViewport.ts`) so the
 * projected image stays put. While `session.calibration.phase === "presenting"` (ticket 11),
 * `collabTrackingRender.ts` additionally hides the basemap/scenario layers and renders the four
 * calibration marker images — this component only supplies the high-contrast backdrop for that
 * via the `.collab-table--presenting` class below.
 */
import { onBeforeUnmount, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import MapContainer from "@components/Map/MapContainer.vue";
import { useMapStore } from "@store/map";
import { useCollabSessionStore } from "../stores/collabSession";
import { useCollabSyncStore } from "../stores/collabSync";
import { useCollabTrackingRenderStore } from "../stores/collabTrackingRender";
import { startTableViewportSync } from "../stores/collabTableViewport";

const { t } = useI18n();
const mapStore = useMapStore();
const session = useCollabSessionStore();
const syncStore = useCollabSyncStore();
const trackingRenderStore = useCollabTrackingRenderStore();

let stopViewportSync: (() => void) | undefined;

onMounted(() => {
    syncStore.startAsTable();
    trackingRenderStore.startRendering("table");
    stopViewportSync = startTableViewportSync(session, mapStore);
});

onBeforeUnmount(() => {
    stopViewportSync?.();
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
/* ticket 11: clean, high-contrast backdrop once the basemap/scenario layers are hidden for
   calibration presentation — the cameras need to read the marker images reliably. */
.collab-table--presenting .collab-table-map {
    background: #050505;
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

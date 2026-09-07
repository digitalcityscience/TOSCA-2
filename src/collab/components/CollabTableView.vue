<template>
    <div
        class="collab-table"
        :class="{
            'collab-table--presenting': session.calibration.phase === 'presenting',
            'collab-table--blacked-out': blackedOut,
        }"
    >
        <div v-if="!syncStore.connected" class="collab-table-disconnected">
            <UIcon name="i-lucide-plug-zap" class="size-5 shrink-0" />
            <span>{{ t("collab.table.disconnected") }}</span>
        </div>
        <div class="collab-table-map">
            <MapContainer></MapContainer>
        </div>
        <div v-if="blackedOut" class="collab-table-blackout">
            <UIcon :name="blackoutIcon" class="size-10 shrink-0" />
            <p class="collab-table-blackout-title">{{ t(blackoutTitleKey) }}</p>
            <p class="collab-table-blackout-hint">{{ t(blackoutHintKey) }}</p>
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
import { computed, onBeforeUnmount, onMounted } from "vue";
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

/**
 * The blackout (grilling doc 2026-09-01 Q14/Q16): whenever the session is not calibrated, the
 * projector shows a notice instead of a map the operator could mistake for a trustworthy one.
 * Both non-presenting blackout phases share it, so a blackout always looks like a blackout.
 */
const blackedOut = computed(
    () => session.calibration.phase === "needs-calibration" || session.calibration.phase === "unreachable"
);

/**
 * `"unreachable"` and `"needs-calibration"` are one screen with two messages, and the AOI splits the
 * second one further (grilling doc Q8) — deliberately not three separate phases, so there is only
 * ever one blackout to reason about. The distinction that matters to the person at the table is
 * whether pressing "Start calibration" over on Control can fix this: with no AOI it cannot (nothing
 * to calibrate against yet), and with Python unreachable it cannot either (the transport is down).
 */
const blackoutVariant = computed<"unreachable" | "noAoi" | "needsCalibration">(() => {
    if (session.calibration.phase === "unreachable") {
        return "unreachable";
    }
    return session.calibration.aoi === null ? "noAoi" : "needsCalibration";
});

const blackoutTitleKey = computed(() => `collab.table.blackout.${blackoutVariant.value}.title`);
const blackoutHintKey = computed(() => `collab.table.blackout.${blackoutVariant.value}.hint`);
const blackoutIcon = computed(() =>
    blackoutVariant.value === "unreachable" ? "i-lucide-plug-zap" : "i-lucide-crosshair"
);

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
   calibration presentation — mid-gray (not black) maximizes contrast against both the light and
   dark modules of the calibration marker images, so the cameras read corners reliably. */
.collab-table--presenting .collab-table-map {
    background: #808080;
}
.collab-table--blacked-out .collab-table-map {
    background: #050505;
}
/* grilling doc Q14/Q16: the same #050505 backdrop the marker presentation already uses, so an
   uncalibrated table reads as "deliberately off" rather than as a map that failed to draw. The
   map underneath keeps rendering and stays fitted to the AOI — it is covered, not torn down — so
   lifting this on calibration reveals an already-settled view with no reflow. */
.collab-table-blackout {
    position: absolute;
    inset: 0;
    z-index: 20;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 2rem;
    text-align: center;
    background: #050505;
    color: #f5f5f5;
}
.collab-table-blackout-title {
    font-size: clamp(1.5rem, 4vw, 2.5rem);
    font-weight: 600;
}
.collab-table-blackout-hint {
    font-size: clamp(0.9rem, 1.6vw, 1.15rem);
    max-width: 40ch;
    opacity: 0.7;
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

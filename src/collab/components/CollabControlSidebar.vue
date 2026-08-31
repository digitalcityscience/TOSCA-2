<template>
    <BaseSlideoverSidebarComponent
        :id="sidebarID"
        side="left"
        :collapsed="route.meta.sidebar !== sidebarID"
        width-class="w-[min(24rem,calc(100vw-5rem))]"
    >
        <template #header>
            <div class="flex min-w-0 items-center gap-2">
                <UIcon name="i-lucide-table-2" class="size-4 shrink-0 text-primary" />
                <span class="truncate">{{ t("collab.control.title") }}</span>
            </div>
        </template>

        <!-- 1. Connection -->
        <div v-if="isRealTableRoute" class="flex flex-col gap-2 pb-4">
            <h3 class="text-sm font-medium">{{ t("collab.control.python.title") }}</h3>
            <p class="flex items-center gap-1.5 text-xs" :class="pythonStatusTextClass">
                <span class="size-2 shrink-0 rounded-full" :class="pythonStatusDotClass" />
                {{ t(`collab.control.python.${trackingRenderStore.pythonConnectionState}`) }}
            </p>
            <p v-if="configuredWsUrl !== undefined" class="text-xs text-muted break-all">{{ configuredWsUrl }}</p>
            <UButton
                v-if="trackingRenderStore.pythonConnectionState === 'disconnected'"
                :label="t('collab.control.python.retry')"
                icon="i-lucide-refresh-cw"
                size="xs"
                variant="soft"
                class="self-start"
                @click="trackingRenderStore.retryPythonConnection()"
            />

            <h4 class="mt-2 text-xs font-medium text-muted">{{ t("collab.control.python.markers.title") }}</h4>
            <ul class="flex flex-col gap-1 text-xs">
                <li v-for="marker in referenceMarkers" :key="`${marker.cameraId}-${marker.id}`" class="flex items-center gap-1.5">
                    <UIcon
                        :name="isMarkerDetected(marker.id) ? 'i-lucide-check' : 'i-lucide-x'"
                        :class="isMarkerDetected(marker.id) ? 'text-success' : 'text-muted'"
                        class="size-3.5 shrink-0"
                    />
                    <span>{{ t("collab.control.python.markers.camera", { cameraId: marker.cameraId }) }} — {{ marker.id }}</span>
                    <span class="text-muted">({{ marker.position }})</span>
                </li>
            </ul>

            <h4 class="mt-2 text-xs font-medium text-muted">{{ t("collab.control.python.markers.calibration.title") }}</h4>
            <ul class="flex flex-col gap-1 text-xs">
                <li v-for="marker in mapCalibrationMarkers" :key="marker.id" class="flex items-center gap-1.5">
                    <UIcon
                        :name="isMapCalibrationMarkerDetected(marker.id) ? 'i-lucide-check' : 'i-lucide-x'"
                        :class="isMapCalibrationMarkerDetected(marker.id) ? 'text-success' : 'text-muted'"
                        class="size-3.5 shrink-0"
                    />
                    <span>{{ marker.id }} — {{ t(`collab.control.python.markers.calibration.corners.${marker.corner}`) }}</span>
                    <span class="text-muted">
                        {{
                            t(
                                isMapCalibrationMarkerDetected(marker.id)
                                    ? "collab.control.python.markers.calibration.detected"
                                    : "collab.control.python.markers.calibration.waiting"
                            )
                        }}
                        <template v-if="mapCalibrationMarkerReading(marker.id) !== undefined">
                            ({{ mapCalibrationMarkerReading(marker.id)?.pixelX.toFixed(0) }}, {{ mapCalibrationMarkerReading(marker.id)?.pixelY.toFixed(0) }})
                        </template>
                    </span>
                </li>
            </ul>
        </div>

        <!-- 2. Select AOI -->
        <div class="mt-5 flex flex-col gap-2 border-t border-muted pt-4">
            <h3 class="text-sm font-medium">{{ t("collab.control.aoi.title") }}</h3>
            <p class="text-xs text-muted">{{ t("collab.control.aoi.description") }}</p>
            <div class="flex gap-2">
                <UButton
                    v-if="!scenarioStore.aoiSelectionInProgress"
                    :label="t('collab.control.aoi.select')"
                    icon="i-lucide-square-dashed-mouse-pointer"
                    size="sm"
                    variant="soft"
                    @click="scenarioStore.startAoiSelection"
                />
                <template v-else>
                    <UButton
                        :label="t('collab.control.aoi.finish')"
                        icon="i-lucide-check"
                        size="sm"
                        :color="scenarioStore.viewfinderValid ? 'primary' : 'neutral'"
                        :variant="scenarioStore.viewfinderValid ? 'solid' : 'soft'"
                        :disabled="!scenarioStore.viewfinderValid"
                        @click="finishAoi"
                    />
                    <UButton
                        :label="t('collab.control.aoi.cancel')"
                        icon="i-lucide-x"
                        size="sm"
                        variant="ghost"
                        @click="scenarioStore.cancelAoiSelection"
                    />
                </template>
            </div>
            <p
                v-if="scenarioStore.aoiSelectionInProgress"
                class="flex items-center gap-1.5 text-xs"
                :class="scenarioStore.viewfinderValid ? 'text-success' : 'text-error'"
            >
                <span class="size-2 shrink-0 rounded-full" :class="scenarioStore.viewfinderValid ? 'bg-success' : 'bg-error'" />
                {{ t(scenarioStore.viewfinderValid ? "collab.control.aoi.viewfinderReady" : "collab.control.aoi.viewfinderZoomIn") }}
            </p>
            <p v-if="scenarioStore.aoi !== null" class="text-xs text-success">
                {{ t("collab.control.aoi.selected") }}
            </p>
        </div>

        <UModal v-model:open="replaceAoiConfirmVisible" :title="t('collab.control.aoi.replaceConfirmTitle')" :ui="{ content: 'max-w-[25rem]' }">
            <template #body>
                <span class="text-muted block">{{ t("collab.control.aoi.replaceConfirmBody") }}</span>
            </template>
            <template #footer>
                <div class="flex justify-end gap-2 w-full">
                    <UButton size="sm" type="button" color="neutral" variant="soft" @click="replaceAoiConfirmVisible = false">{{ t("common.cancel") }}</UButton>
                    <UButton size="sm" type="button" color="primary" @click="confirmReplaceAoi">{{ t("collab.control.aoi.replaceConfirmAction") }}</UButton>
                </div>
            </template>
        </UModal>

        <!-- 3. Open Table -->
        <div class="mt-5 flex flex-col gap-2 border-t border-muted pt-4">
            <UButton
                :label="t('collab.control.openTable')"
                icon="i-lucide-monitor-play"
                color="primary"
                :disabled="!canOpenTableWindow(scenarioStore.aoi)"
                @click="openTableWindow"
            />
            <p v-if="!canOpenTableWindow(scenarioStore.aoi)" class="text-xs text-muted">
                {{ t("collab.control.openTableDisabledReason") }}
            </p>
        </div>

        <!-- 4. Calibration status -->
        <div v-if="isRealTableRoute" class="mt-5 flex flex-col gap-2 border-t border-muted pt-4">
            <h3 class="text-sm font-medium">{{ t("collab.control.calibration.title") }}</h3>
            <p class="flex items-center gap-1.5 text-xs" :class="calibrationStatusTextClass">
                <span class="size-2 shrink-0 rounded-full" :class="calibrationStatusDotClass" />
                {{ calibrationStatusText }}
            </p>
            <div v-if="collabSession.calibration.phase === 'presenting'" class="flex flex-col gap-2">
                <p v-if="trackingRenderStore.canCalibrateFromMarkers()" class="text-xs text-success">
                    {{ t("collab.control.calibration.allMarkersDetectedHint") }}
                </p>
                <div class="flex gap-2">
                    <UButton
                        v-if="trackingRenderStore.canCalibrateFromMarkers()"
                        :label="t('collab.control.calibration.calibrate')"
                        icon="i-lucide-check"
                        size="xs"
                        color="primary"
                        @click="trackingRenderStore.calibrateFromDetectedMarkers()"
                    />
                    <UButton
                        :label="t('collab.control.calibration.exitPresentation')"
                        icon="i-lucide-x"
                        size="xs"
                        variant="soft"
                        @click="trackingRenderStore.exitCalibrationPresentation()"
                    />
                </div>
            </div>
            <div v-else-if="scenarioStore.aoi !== null" class="flex flex-col gap-2">
                <div class="flex gap-2">
                    <UButton
                        :label="t('collab.control.calibration.recalibrate')"
                        icon="i-lucide-refresh-ccw"
                        size="xs"
                        variant="soft"
                        class="self-start"
                        @click="trackingRenderStore.recalibrate()"
                    />
                    <UButton
                        :label="t('collab.control.calibration.resetPositions')"
                        icon="i-lucide-locate-fixed"
                        size="xs"
                        variant="soft"
                        class="self-start"
                        @click="trackingRenderStore.resetMarkerPositions()"
                    />
                </div>
                <p class="text-xs text-muted">{{ t("collab.control.calibration.resendAssumption") }}</p>
            </div>
        </div>

        <div class="mt-5 flex flex-col gap-2 border-t border-muted pt-4">
            <div class="flex items-center justify-between gap-2">
                <div class="flex flex-col gap-0.5">
                    <h3 class="text-sm font-medium">{{ t("collab.control.debug.title") }}</h3>
                    <p class="text-xs text-muted">{{ t("collab.control.debug.description") }}</p>
                </div>
                <USwitch
                    :model-value="trackingRenderStore.debugOverlaysEnabled"
                    :aria-label="t('collab.control.debug.title')"
                    @update:model-value="trackingRenderStore.setDebugOverlaysEnabled($event)"
                />
            </div>
        </div>
    </BaseSlideoverSidebarComponent>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import BaseSlideoverSidebarComponent from "@components/Base/BaseSlideoverSidebarComponent.vue";
import { useToast } from "@helpers/toast";
import { useCollabSyncStore } from "../stores/collabSync";
import { useCollabSessionStore } from "../stores/collabSession";
import { canOpenTableWindow, useCollabScenarioStore } from "../stores/collabScenario";
import { useCollabTrackingRenderStore } from "../stores/collabTrackingRender";
import { MAP_CALIBRATION_MARKERS, REFERENCE_MARKERS } from "../stores/collabTracking";
import { isRealTableRoute as resolveIsRealTableRoute, resolveCollabTrackingWsUrl } from "../helpers/collabMode";

const sidebarID = "collabControl";
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const toast = useToast();
const syncStore = useCollabSyncStore();
const collabSession = useCollabSessionStore();
const scenarioStore = useCollabScenarioStore();
const trackingRenderStore = useCollabTrackingRenderStore();

const TABLE_WINDOW_NAME = "toscaCollabTable";

const referenceMarkers = REFERENCE_MARKERS;
/** The four map-calibration marker ids (ticket 08) — Control's live-detection rows for them. */
const mapCalibrationMarkers = MAP_CALIBRATION_MARKERS;
/** `undefined` in mock builds (no `:8053` transport at all) — the URL row/section hides via the same `isRealTableRoute` check. */
const configuredWsUrl = resolveCollabTrackingWsUrl();
/**
 * Whether this build is wired to a real Python transport (ticket 09) — the gate for the two
 * sections that only make sense on the real-table route (Connection, Calibration status).
 * Env-driven and never changes at runtime, so a plain constant rather than a reactive `computed`.
 */
const isRealTableRoute = resolveIsRealTableRoute();

function isMarkerDetected(markerId: number): boolean {
    return trackingRenderStore.detectedReferenceMarkerIds.has(markerId);
}

function isMapCalibrationMarkerDetected(markerId: number): boolean {
    return trackingRenderStore.mapCalibrationMarkerHealth.has(markerId);
}

function mapCalibrationMarkerReading(markerId: number) {
    return trackingRenderStore.mapCalibrationMarkerHealth.get(markerId);
}

/** Compact status-dot color for the Python connection row (marker-health-plan §1/§5). */
const pythonStatusDotClass = computed(() => {
    switch (trackingRenderStore.pythonConnectionState) {
        case "connected":
            return "bg-success";
        case "connecting":
        case "reconnecting":
            return "bg-warning";
        default:
            return "bg-error";
    }
});

const pythonStatusTextClass = computed(() => {
    switch (trackingRenderStore.pythonConnectionState) {
        case "connected":
            return "text-success";
        case "connecting":
        case "reconnecting":
            return "text-warning";
        default:
            return "text-error";
    }
});

/**
 * "Calibration status" text (ticket 09, extended by ticket 11): distinguishes "no AOI yet" from
 * "Table is presenting calibration markers" (ticket 11 — takes priority over the plain
 * uncalibrated/calibrated distinction, since it's an active, exitable mode, not just a status
 * reading) from "connected-uncalibrated, recalibration required" from "calibrated" (ticket 12's
 * real four-marker flow, `trackingRenderStore.calibrateFromDetectedMarkers`, is what ever sets
 * `scenarioStore.calibrated`).
 */
const calibrationStatusText = computed(() => {
    if (scenarioStore.aoi === null) {
        return t("collab.control.calibration.noAoi");
    }
    if (collabSession.calibration.phase === "presenting") {
        return t("collab.control.calibration.presenting");
    }
    return t(scenarioStore.calibrated ? "collab.control.calibration.calibrated" : "collab.control.calibration.uncalibrated");
});

const calibrationStatusDotClass = computed(() => {
    if (scenarioStore.aoi === null) {
        return "bg-muted";
    }
    if (collabSession.calibration.phase === "presenting") {
        return "bg-primary";
    }
    return scenarioStore.calibrated ? "bg-success" : "bg-warning";
});

const calibrationStatusTextClass = computed(() => {
    if (scenarioStore.aoi === null) {
        return "text-muted";
    }
    if (collabSession.calibration.phase === "presenting") {
        return "text-primary";
    }
    return scenarioStore.calibrated ? "text-success" : "text-warning";
});

/**
 * Opens (or refocuses) the projector-facing `/collab/table` window (plan §11, ticket 06).
 * A `windowFeatures` string is required here — without one, browsers open a same-window tab
 * instead of a separate OS window, which defeats dragging the table view to a second screen.
 * Best-effort positions it past the primary display's width so it lands on an extended monitor.
 */
function openTableWindow(): void {
    const { href } = router.resolve({ name: "collab-table" });
    const width = window.screen.availWidth;
    const height = window.screen.availHeight;
    const features = `popup=yes,left=${width},top=0,width=${width},height=${height}`;
    const tableWindow = window.open(href, TABLE_WINDOW_NAME, features);
    if (tableWindow === null) {
        toast.add({ severity: "warning", summary: t("collab.control.popupBlocked") });
        return;
    }
    tableWindow.focus();
    // ticket 11 / live-rig diagnosis 2026-08-31: presentation mode is entered by the AOI watcher
    // in collabTrackingRender.ts as soon as an AOI is confirmed, not by opening this window — Table
    // recovers the current `session.calibration` snapshot (phase included) on connect, so it's
    // already showing the right thing by the time this window opens (normal order: pick AOI, then
    // open Table). No separate call needed here.
}

/**
 * Confirming an AOI while one is already live replaces the physical table's calibration (grilling
 * doc, 2026-08-31 recalibration-communication session) — the operator may only be previewing a
 * candidate extent, so this is the one point where committing is irreversible enough to warn about.
 * A first-ever AOI (nothing on the table yet to lose) skips the prompt and commits directly.
 */
const replaceAoiConfirmVisible = ref(false);

function finishAoi(): void {
    if (scenarioStore.aoi !== null) {
        replaceAoiConfirmVisible.value = true;
        return;
    }
    scenarioStore.finishAoiSelection();
}

function confirmReplaceAoi(): void {
    replaceAoiConfirmVisible.value = false;
    scenarioStore.finishAoiSelection();
}

onMounted(() => {
    syncStore.startAsControl();
    trackingRenderStore.startRendering("control");
});

/**
 * Mirrors `CollabTableView`'s cleanup pattern (plan §11/§13): stops broadcasting and rendering
 * when the operator navigates away from Collab, so a lingering sidebar doesn't keep publishing
 * snapshots or writing map layers after the route/view it belongs to is gone.
 */
onBeforeUnmount(() => {
    syncStore.stop();
    trackingRenderStore.stop();
});
</script>

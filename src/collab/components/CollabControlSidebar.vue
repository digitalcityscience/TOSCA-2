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

        <p class="text-sm text-muted">{{ t("collab.control.placeholder") }}</p>
        <UButton
            :label="t('collab.control.openTable')"
            icon="i-lucide-monitor-play"
            color="primary"
            class="mt-3"
            @click="openTableWindow"
        />

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

        <div class="mt-5 flex flex-col gap-2 border-t border-muted pt-4">
            <h3 class="text-sm font-medium">{{ t("collab.control.footprints.title") }}</h3>
            <UButton
                :label="t('collab.control.footprints.load')"
                icon="i-lucide-building-2"
                size="sm"
                variant="soft"
                :disabled="scenarioStore.aoi === null"
                @click="scenarioStore.loadFixtureFootprints"
            />
            <p v-if="scenarioStore.aoi === null" class="text-xs text-muted">
                {{ t("collab.control.footprints.loadRequiresAoi") }}
            </p>
            <ul v-if="collabSession.base.loaded" class="mt-2 flex max-h-64 flex-col gap-1 overflow-y-auto text-sm">
                <li
                    v-for="building in scenarioStore.selectableBuildings"
                    :key="building.properties.id"
                    class="flex items-center justify-between gap-2"
                >
                    <span :class="{ 'line-through text-muted': isRemoved(building.properties.id) }">
                        {{ building.properties.id }}
                    </span>
                    <UButton
                        v-if="!isRemoved(building.properties.id)"
                        :label="t('collab.control.footprints.remove')"
                        icon="i-lucide-trash-2"
                        size="xs"
                        color="error"
                        variant="ghost"
                        @click="scenarioStore.removeBuilding(building.properties.id)"
                    />
                    <UButton
                        v-else
                        :label="t('collab.control.footprints.restore')"
                        icon="i-lucide-undo-2"
                        size="xs"
                        variant="ghost"
                        @click="scenarioStore.restoreBuilding(building.properties.id)"
                    />
                </li>
            </ul>
        </div>

        <div class="mt-5 flex flex-col gap-2 border-t border-muted pt-4">
            <h3 class="text-sm font-medium">{{ t("collab.control.masking.title") }}</h3>
            <p class="text-xs text-muted">{{ t("collab.control.masking.description") }}</p>
            <USelect
                v-model="tableMaskingMode"
                :items="maskingModeItems"
                value-key="value"
                :aria-label="t('collab.control.masking.title')"
                class="w-full"
            />
        </div>

        <div class="mt-5 flex flex-col gap-2 border-t border-muted pt-4">
            <h3 class="text-sm font-medium">{{ t("collab.control.tracking.title") }}</h3>
            <UButton
                v-if="!trackingRenderStore.active"
                :label="t('collab.control.tracking.start')"
                icon="i-lucide-play"
                size="sm"
                color="primary"
                variant="soft"
                :disabled="!collabSession.base.loaded"
                @click="trackingRenderStore.startMockTracking()"
            />
            <UButton
                v-else
                :label="t('collab.control.tracking.stop')"
                icon="i-lucide-square"
                size="sm"
                variant="ghost"
                @click="trackingRenderStore.stopMockTracking()"
            />
            <p v-if="!collabSession.base.loaded" class="text-xs text-muted">
                {{ t("collab.control.tracking.requiresFootprints") }}
            </p>
            <p v-else-if="trackingRenderStore.trackingAvailability === 'suppressed'" class="text-xs text-warning">
                {{ t("collab.control.tracking.suppressed") }}
            </p>
            <p v-else-if="trackingRenderStore.trackingAvailability === 'disconnected'" class="text-xs text-warning">
                {{ t("collab.control.tracking.disconnected") }}
            </p>
            <p v-else-if="trackingRenderStore.active" class="text-xs text-success">
                {{ t("collab.control.tracking.active") }}
            </p>
        </div>

        <div v-if="trackingRenderStore.pythonConnectionState !== 'mock'" class="mt-5 flex flex-col gap-2 border-t border-muted pt-4">
            <h3 class="text-sm font-medium">{{ t("collab.control.python.title") }}</h3>
            <p class="flex items-center gap-1.5 text-xs" :class="pythonStatusTextClass">
                <span class="size-2 shrink-0 rounded-full" :class="pythonStatusDotClass" />
                {{ t(`collab.control.python.${trackingRenderStore.pythonConnectionState}`) }}
            </p>

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
        </div>

        <div class="mt-5 flex flex-col gap-2 border-t border-muted pt-4">
            <h3 class="text-sm font-medium">{{ t("collab.control.simulation.title") }}</h3>
            <p class="text-xs text-muted">{{ t("collab.control.simulation.description") }}</p>
            <UButton
                :label="collabSession.simulation.running ? t('collab.control.simulation.running') : t('collab.control.simulation.run')"
                icon="i-lucide-play-circle"
                size="sm"
                color="primary"
                variant="soft"
                :loading="collabSession.simulation.running"
                :disabled="!collabSession.base.loaded || collabSession.simulation.running"
                @click="simulationStore.runSimulation()"
            />
            <p v-if="collabSession.simulation.lastRunAt !== null" class="text-xs text-success">
                {{ t("collab.control.simulation.resultCount", { count: collabSession.simulation.results.length }) }}
            </p>
        </div>
    </BaseSlideoverSidebarComponent>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import BaseSlideoverSidebarComponent from "@components/Base/BaseSlideoverSidebarComponent.vue";
import { useToast } from "@helpers/toast";
import { useCollabSyncStore } from "../stores/collabSync";
import { useCollabSessionStore } from "../stores/collabSession";
import { useCollabScenarioStore } from "../stores/collabScenario";
import { useCollabTrackingRenderStore } from "../stores/collabTrackingRender";
import { useCollabSimulationStore } from "../stores/collabSimulation";
import { REFERENCE_MARKERS } from "../stores/collabTracking";

const sidebarID = "collabControl";
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const toast = useToast();
const syncStore = useCollabSyncStore();
const collabSession = useCollabSessionStore();
const scenarioStore = useCollabScenarioStore();
const trackingRenderStore = useCollabTrackingRenderStore();
const simulationStore = useCollabSimulationStore();

const TABLE_WINDOW_NAME = "toscaCollabTable";

/** Table-masking options (ticket 10, OD-2): "hide" is the M1 default; "mask" is the M3 subtract option. */
const maskingModeItems = [
    { label: t("collab.control.masking.show"), value: "show" },
    { label: t("collab.control.masking.hide"), value: "hide" },
    { label: t("collab.control.masking.mask"), value: "mask" },
];

/**
 * Bridges the sidebar's show/hide/mask selector to `collabSession.layerPolicy.scenarioFootprint`
 * (ticket 10): lets an operator A/B the OD-2 masking options live on the real projector without a
 * code change.
 */
const referenceMarkers = REFERENCE_MARKERS;

function isMarkerDetected(markerId: number): boolean {
    return trackingRenderStore.detectedReferenceMarkerIds.has(markerId);
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

const tableMaskingMode = computed<"show" | "hide" | "mask">({
    get: () => {
        const mode = collabSession.layerPolicy.scenarioFootprint.table;
        if (mode === "mask") {
            return "mask";
        }
        return mode ? "show" : "hide";
    },
    set: (mode) => {
        collabSession.setLayerTableMode("scenarioFootprint", mode === "mask" ? "mask" : mode === "show");
    },
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
}

function finishAoi(): void {
    scenarioStore.finishAoiSelection();
}

function isRemoved(id: string): boolean {
    return collabSession.scenario.removedBuildings.includes(id);
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

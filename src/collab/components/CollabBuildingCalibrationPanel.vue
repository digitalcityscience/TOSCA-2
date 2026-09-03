<template>
    <div class="flex flex-col gap-2">
        <div class="flex flex-col gap-0.5">
            <h3 class="text-sm font-medium">{{ t("collab.control.buildingCalibration.title") }}</h3>
            <p class="text-xs text-muted">{{ t("collab.control.buildingCalibration.description") }}</p>
        </div>

        <!-- Nothing to calibrate until Python has actually reported a building on the table. -->
        <p v-if="trackedBuildings.length === 0" class="text-xs text-muted">
            {{ t("collab.control.buildingCalibration.noBuildings") }}
        </p>

        <ul v-else-if="active === null" class="flex flex-col gap-1">
            <li v-for="building in trackedBuildings" :key="building.buildingId" class="flex items-center justify-between gap-2 text-xs">
                <span class="truncate">{{ building.buildingId }} <span class="text-muted">— {{ building.markerId }}</span></span>
                <UButton
                    :label="t('collab.control.buildingCalibration.select')"
                    icon="i-lucide-crosshair"
                    size="xs"
                    variant="soft"
                    @click="trackingRenderStore.startBuildingCalibration(building.buildingId)"
                />
            </li>
        </ul>

        <!--
            The adjustment surface. `tabindex` + the keydown handler live here, not on `window`:
            arrow keys must nudge the building only while the operator is actually working in this
            panel, never while they are panning the map or typing somewhere else.
        -->
        <div
            v-else
            ref="adjustmentSurface"
            class="flex flex-col gap-2 rounded-md border border-warning/60 p-2 outline-none focus:ring-2 focus:ring-warning/60"
            tabindex="0"
            @keydown="onKeydown"
        >
            <p class="text-xs font-medium">
                {{ t("collab.control.buildingCalibration.selected", { buildingId: active.buildingId }) }}
            </p>
            <p class="text-xs text-muted">{{ t("collab.control.buildingCalibration.instructions") }}</p>
            <p class="text-xs text-muted">{{ t("collab.control.buildingCalibration.holdNotice") }}</p>

            <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs tabular-nums">
                <dt class="text-muted">{{ t("collab.control.buildingCalibration.readout.offset") }}</dt>
                <dd>
                    {{ t("collab.control.buildingCalibration.readout.east") }} {{ formatCm(readout.offsetEastCm) }} cm
                    ·
                    {{ t("collab.control.buildingCalibration.readout.north") }} {{ formatCm(readout.offsetNorthCm) }} cm
                </dd>
                <dt class="text-muted">{{ t("collab.control.buildingCalibration.readout.rotation") }}</dt>
                <dd>{{ formatDegrees(readout.rotationOffsetDeg) }}°</dd>
                <dt class="text-muted">{{ t("collab.control.buildingCalibration.readout.scale") }}</dt>
                <dd>{{ formatPercent(readout.scalePercent) }}%</dd>
            </dl>

            <div class="flex flex-wrap gap-1">
                <UButton
                    :label="t('collab.control.buildingCalibration.save')"
                    icon="i-lucide-save"
                    size="xs"
                    @click="save()"
                />
                <UButton
                    :label="t('collab.control.buildingCalibration.reset')"
                    icon="i-lucide-rotate-ccw"
                    size="xs"
                    variant="soft"
                    @click="trackingRenderStore.resetBuildingCalibrationDraft()"
                />
                <UButton
                    :label="t('collab.control.buildingCalibration.cancel')"
                    icon="i-lucide-x"
                    size="xs"
                    variant="ghost"
                    @click="trackingRenderStore.cancelBuildingCalibration()"
                />
            </div>
        </div>

        <!--
            Which thirds of the table have been measured this sitting. The point is the *gaps*:
            a homography error grows toward the edges, so an all-centre sample set cannot tell a
            per-building constant apart from a position-dependent one.
        -->
        <div class="mt-1 flex flex-col gap-1">
            <h4 class="text-xs font-medium text-muted">{{ t("collab.control.buildingCalibration.coverage.title") }}</h4>
            <div class="grid w-full max-w-40 grid-cols-3 gap-0.5" :aria-label="coverageSummary">
                <div
                    v-for="cell in coverage.cells"
                    :key="`${cell.column}-${cell.row}`"
                    class="aspect-2/1 rounded-xs border border-muted"
                    :class="cell.count > 0 ? 'bg-success/70' : 'bg-transparent'"
                    :title="t('collab.control.buildingCalibration.coverage.cell', { count: cell.count })"
                />
            </div>
            <p class="text-xs text-muted">
                {{ coverage.sampledCellCount === 0 ? t("collab.control.buildingCalibration.coverage.empty") : coverageSummary }}
            </p>
        </div>
    </div>
</template>

<script setup lang="ts">
/**
 * The admin panel's per-building calibration (workflow step 4).
 *
 * Deliberately *not* Vanilla's calibration pad in the middle of the table: the operator stands at
 * the table and seats each building against its own block by looking at the projection, so the
 * adjustment is per building and the readout is the only thing on screen worth reading.
 *
 * This component owns the interaction and nothing else. The arithmetic is in
 * `collabBuildingCalibration.ts`, the draft and the transport are in `collabTrackingRender`, and
 * the units the numbers are stored in are Python's business.
 */
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useToast } from "@helpers/toast";
import { useCollabSessionStore } from "../stores/collabSession";
import { useCollabTrackingRenderStore } from "../stores/collabTrackingRender";
import { BUILDING_CALIBRATION_NUDGE_MM, draftReadout } from "../stores/collabBuildingCalibration";

const { t } = useI18n();
const toast = useToast();
const session = useCollabSessionStore();
const trackingRenderStore = useCollabTrackingRenderStore();

const adjustmentSurface = ref<HTMLElement | null>(null);

const active = computed(() => trackingRenderStore.buildingCalibration);

/**
 * Every building Python has reported a marker for. Only these can be calibrated: a
 * `building_calibration` addresses a marker id, and Python refuses a measurement for a building
 * it has never seen on the table (there would be no position to record it at).
 */
const trackedBuildings = computed(() =>
    Object.entries(session.tracking)
        .filter(([, tracked]) => tracked.markerId !== undefined)
        .map(([buildingId, tracked]) => ({ buildingId, markerId: tracked.markerId as number }))
        .sort((a, b) => a.buildingId.localeCompare(b.buildingId))
);

const readout = computed(() =>
    draftReadout(active.value?.draft ?? { offsetEastMm: 0, offsetNorthMm: 0, rotationOffsetDeg: 0, scaleResidual: 1 })
);

const coverage = computed(() => trackingRenderStore.buildingCalibrationCoverage());

const coverageSummary = computed(() =>
    t("collab.control.buildingCalibration.coverage.summary", {
        sampled: coverage.value.sampledCellCount,
        total: coverage.value.cells.length,
    })
);

// Focus the adjustment surface the moment a building is picked, so the very first arrow key the
// operator presses moves the building instead of scrolling the sidebar.
watch(active, async (current) => {
    if (current !== null) {
        await nextTick();
        adjustmentSurface.value?.focus();
    }
});

/**
 * Table-frame directions, not compass ones: "up" is toward the top of the table image, which is
 * where the operator is pushing. `collabBuildingCalibration` rotates that into the building's own
 * frame — the panel never has to think about which way the block happens to be turned.
 *
 * Screen "up" is decreasing table y, and the table's north is decreasing y too, so up is +north.
 */
const NUDGE_BY_KEY: Record<string, { eastMm: number; northMm: number }> = {
    ArrowLeft: { eastMm: -BUILDING_CALIBRATION_NUDGE_MM, northMm: 0 },
    ArrowRight: { eastMm: BUILDING_CALIBRATION_NUDGE_MM, northMm: 0 },
    ArrowUp: { eastMm: 0, northMm: BUILDING_CALIBRATION_NUDGE_MM },
    ArrowDown: { eastMm: 0, northMm: -BUILDING_CALIBRATION_NUDGE_MM },
};

function onKeydown(event: KeyboardEvent): void {
    const nudge = NUDGE_BY_KEY[event.key];
    if (nudge !== undefined) {
        event.preventDefault();
        trackingRenderStore.nudgeBuildingCalibration(nudge);
        return;
    }
    const key = event.key.toLowerCase();
    if (key === "q" || key === "e") {
        event.preventDefault();
        trackingRenderStore.rotateBuildingCalibration(key === "q" ? 1 : -1);
        return;
    }
    if (event.key === "+" || event.key === "=" || event.key === "-") {
        event.preventDefault();
        trackingRenderStore.resizeBuildingCalibration(event.key === "-" ? -1 : 1);
        return;
    }
    if (event.key === "Escape") {
        event.preventDefault();
        trackingRenderStore.cancelBuildingCalibration();
    }
}

/**
 * Saving reports whether the bytes actually left. A failure here means the socket was closed, so
 * nothing was written anywhere — telling the operator that plainly matters more than a spinner,
 * because they are about to walk away believing the building is calibrated.
 */
function save(): void {
    const sent = trackingRenderStore.saveBuildingCalibration();
    toast.add(
        sent
            ? {
                severity: "success",
                summary: t("collab.control.buildingCalibration.savedSummary"),
                detail: t("collab.control.buildingCalibration.savedDetail"),
                life: 6000,
            }
            : {
                severity: "warn",
                summary: t("collab.control.buildingCalibration.saveFailedSummary"),
                detail: t("collab.control.buildingCalibration.saveFailedDetail"),
                life: 8000,
            }
    );
}

function formatCm(value: number): string {
    return value.toFixed(2);
}

function formatDegrees(value: number): string {
    return value.toFixed(1);
}

function formatPercent(value: number): string {
    return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}
</script>

<template>
    <div class="grid gap-4">
        <USkeleton v-if="loading && !comparison" class="h-72 w-full rounded-lg" />
        <UAlert v-else-if="failed" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="t('geosimulations.comparison.unavailable')" />

        <template v-else-if="comparison">
            <div class="grid gap-1">
                <p class="text-xs font-medium uppercase tracking-wide text-muted">{{ comparison.model.title }}</p>
                <h2 class="text-xl font-semibold leading-tight text-highlighted">{{ comparison.title }}</h2>
                <div class="flex flex-wrap items-center gap-2">
                    <UBadge color="neutral" variant="subtle" icon="i-lucide-git-compare" :label="t('geosimulations.comparison.badge')" />
                    <UBadge v-if="comparison.status !== 'published'" color="warning" variant="subtle" :label="t(`geosimulations.status.${comparison.status}`)" />
                </div>
            </div>

            <EditorJsReadonly v-if="comparison.description_content.blocks.length > 0" :data="comparison.description_content" />

            <UAlert
                v-if="reused"
                color="info"
                variant="subtle"
                icon="i-lucide-recycle"
                :title="t('geosimulations.comparison.reused')"
            />
            <section v-if="inProgress" class="run-progress" aria-live="polite">
                <UIcon name="i-lucide-loader-circle" class="size-5 shrink-0 animate-spin text-primary" aria-hidden="true" />
                <div class="grid gap-0.5">
                    <p class="text-sm font-semibold text-highlighted">{{ progressTitle }}</p>
                    <p v-if="comparison.execution?.message" class="text-xs text-toned">{{ comparison.execution.message }}</p>
                    <p class="text-xs text-muted">{{ t("geosimulations.comparison.progressHelp") }}</p>
                </div>
            </section>
            <UAlert
                v-else-if="comparison.execution_state === 'failed'"
                color="error"
                variant="subtle"
                icon="i-lucide-circle-alert"
                :title="t('geosimulations.comparison.failed')"
                :description="comparison.execution?.error || undefined"
            />

            <section class="compared-runs" :aria-label="t('geosimulations.comparison.runs')">
                <div v-for="side in sides" :key="side.key" class="compared-run">
                    <div class="flex items-center justify-between gap-2">
                        <p class="text-xs font-medium uppercase tracking-wide text-muted">{{ side.label }}</p>
                        <UBadge
                            v-if="side.run.execution_state !== 'succeeded' && side.run.execution_state !== 'imported'"
                            size="sm"
                            :color="side.run.execution_state === 'failed' ? 'error' : 'neutral'"
                            variant="subtle"
                            :label="t(`geosimulations.comparison.runState.${side.run.execution_state}`)"
                        />
                    </div>
                    <p class="text-sm font-semibold leading-snug text-highlighted">{{ side.run.title }}</p>
                    <p v-if="formatSimulatedTime(side.run.time, locale)" class="text-xs text-muted">{{ formatSimulatedTime(side.run.time, locale) }}</p>
                    <ULink class="w-fit text-xs text-primary hover:underline" :to="{ name: 'geosimulation-run', params: { runId: side.run.id } }">
                        {{ t("geosimulations.openRun") }}
                    </ULink>
                </div>
            </section>

            <section v-if="kpiRows.length > 0" class="grid gap-2">
                <h3 class="text-sm font-semibold text-highlighted">{{ t("geosimulations.comparison.keyFigureChanges") }}</h3>
                <div class="overflow-x-auto">
                    <table class="kpi-change-table">
                        <thead>
                            <tr>
                                <th>{{ t("geosimulations.comparison.metric") }}</th>
                                <th class="numeric">{{ t("geosimulations.comparison.baseline") }}</th>
                                <th class="numeric">{{ t("geosimulations.comparison.candidate") }}</th>
                                <th class="numeric">{{ t("geosimulations.comparison.change") }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="row in kpiRows" :key="row.key">
                                <th scope="row">
                                    {{ row.label }}<span v-if="row.unit" class="ml-1 font-normal text-muted">({{ row.unit }})</span>
                                </th>
                                <td class="numeric">{{ row.baseline }}</td>
                                <td class="numeric">{{ row.candidate }}</td>
                                <td :class="['numeric', 'change', `change-${row.direction}`]">
                                    <UIcon v-if="row.direction !== 'none'" :name="row.direction === 'up' ? 'i-lucide-arrow-up-right' : 'i-lucide-arrow-down-right'" class="size-3.5" aria-hidden="true" />
                                    {{ row.delta }}<span v-if="row.percent" class="ml-1 text-muted">{{ row.percent }}</span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <SimulationMapLayerList
                v-if="mapOutputs.length > 0"
                :owner="comparison"
                :outputs="mapOutputs"
                :title="t('geosimulations.comparison.differenceLayers')"
            />
            <p v-else-if="!inProgress && comparison.execution_state !== 'failed'" class="text-xs text-muted">
                {{ t("geosimulations.comparison.noDifferenceLayers") }}
            </p>

            <SimulationTable v-for="table in tables" :key="table.id" :table="table" />
        </template>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import EditorJsReadonly from "@components/Base/EditorJsReadonly.vue";
import SimulationMapLayerList from "./SimulationMapLayerList.vue";
import SimulationTable from "./SimulationTable.vue";
import { useMapStore } from "@store/map";
import {
    isRunInProgress,
    isTableOutput,
    isVectorLayerOutput,
    type SimulationComparisonDetail,
    useGeosimulationStore,
} from "@store/geosimulation";
import {
    addSimulationOutputLayer,
    fitToSimulationBounds,
    msUntilRefresh,
    refreshSimulationSourceUrls,
    removeSimulationRunLayers,
    waitForMapStyle,
} from "@helpers/geosimulationLayers";
import { formatSimulatedTime, simulationKpiChangeRows } from "@helpers/simulationFormat";
import { reportDeveloperError } from "@helpers/userFacingError";
import { forgetRun } from "@helpers/simulationMyRuns";

/** While a started comparison waits for its runs or the runner, the page polls this often. */
const POLL_MS = 5000;

const props = defineProps<{ comparisonId: string }>();
const { t, locale } = useI18n();
const route = useRoute();
const mapStore = useMapStore();
const geosimulation = useGeosimulationStore();

const comparison = ref<SimulationComparisonDetail>();
const loading = ref(false);
const failed = ref(false);
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let pollTimer: ReturnType<typeof setTimeout> | undefined;

const reused = computed(() => route.query.reused === "1");
const inProgress = computed(() => {
    const state = comparison.value?.execution_state;
    return state !== undefined && isRunInProgress(state);
});
/** Which step a started comparison is at: its runs, or the comparison itself. */
const progressTitle = computed(() => {
    const detail = comparison.value;
    if (detail === undefined) return "";
    const runsBusy = [detail.baseline, detail.candidate].some((run) => isRunInProgress(run.execution_state));
    return t(runsBusy ? "geosimulations.comparison.waitingForRuns" : "geosimulations.comparison.comparing");
});

const sides = computed(() => {
    const detail = comparison.value;
    if (detail === undefined) return [];
    return [
        { key: "baseline", label: t("geosimulations.comparison.baseline"), run: detail.baseline },
        { key: "candidate", label: t("geosimulations.comparison.candidate"), run: detail.candidate },
    ];
});
const kpiRows = computed(() => simulationKpiChangeRows(comparison.value?.kpi_changes ?? [], locale.value));
const mapOutputs = computed(() =>
    (comparison.value?.outputs ?? []).filter(isVectorLayerOutput).sort((a, b) => a.display_order - b.display_order)
);
const tables = computed(() => (comparison.value?.outputs ?? []).filter(isTableOutput));

/** File URLs are presigned; fetch fresh ones a minute before they expire. */
function scheduleUrlRefresh(detail: SimulationComparisonDetail): void {
    if (refreshTimer !== undefined) clearTimeout(refreshTimer);
    const firstFile = detail.outputs.find((output) => "url_expires_at" in output);
    const delay = msUntilRefresh(firstFile && "url_expires_at" in firstFile ? firstFile.url_expires_at : null);
    if (delay === undefined) return;
    refreshTimer = setTimeout(() => {
        void refreshUrls(detail.id);
    }, delay);
}

async function refreshUrls(comparisonId: string): Promise<void> {
    try {
        const fresh = await geosimulation.loadComparison(comparisonId);
        if (comparison.value?.id !== fresh.id) return;
        comparison.value = fresh;
        refreshSimulationSourceUrls(mapStore, fresh);
        scheduleUrlRefresh(fresh);
    } catch (error) {
        reportDeveloperError("Refreshing comparison file URLs", error);
    }
}

async function showOnMap(detail: SimulationComparisonDetail): Promise<void> {
    await waitForMapStyle(mapStore.map);
    fitToSimulationBounds(mapStore.map, detail.bounds);
    const first = mapOutputs.value[0];
    if (first !== undefined) addSimulationOutputLayer(mapStore, detail, first);
    scheduleUrlRefresh(detail);
}

function stopFollowing(): void {
    if (pollTimer !== undefined) clearTimeout(pollTimer);
    pollTimer = undefined;
}

/** Poll a started comparison until it finished, then show its difference layers. */
function follow(comparisonId: string): void {
    stopFollowing();
    const poll = async (): Promise<void> => {
        try {
            const fresh = await geosimulation.loadComparison(comparisonId);
            if (props.comparisonId !== comparisonId) return;
            comparison.value = fresh;
            if (fresh.execution_state !== undefined && isRunInProgress(fresh.execution_state)) {
                pollTimer = setTimeout(() => { void poll(); }, POLL_MS);
                return;
            }
            stopFollowing();
            if (fresh.execution_state === "succeeded") await showOnMap(fresh);
        } catch (error) {
            reportDeveloperError(`Following simulation comparison ${comparisonId}`, error);
            pollTimer = setTimeout(() => { void poll(); }, POLL_MS * 2);
        }
    };
    pollTimer = setTimeout(() => { void poll(); }, POLL_MS);
}

async function openComparison(comparisonId: string, previousId?: string): Promise<void> {
    stopFollowing();
    // Difference layers are keyed by the comparison id, like a run's layers by the run id.
    if (previousId !== undefined) await removeSimulationRunLayers(mapStore, previousId);
    loading.value = true;
    failed.value = false;
    try {
        const detail = await geosimulation.loadComparison(comparisonId);
        comparison.value = detail;
        if (detail.execution_state !== undefined && isRunInProgress(detail.execution_state)) follow(comparisonId);
        else await showOnMap(detail);
    } catch (error) {
        failed.value = true;
        if (String(error).includes("(404")) forgetRun(comparisonId);
        reportDeveloperError(`Opening simulation comparison ${comparisonId}`, error);
    } finally {
        loading.value = false;
    }
}

watch(() => props.comparisonId, (comparisonId, previousId) => {
    void openComparison(comparisonId, previousId);
}, { immediate: true });

onBeforeUnmount(() => {
    stopFollowing();
    if (refreshTimer !== undefined) clearTimeout(refreshTimer);
    if (comparison.value !== undefined && mapStore.map !== undefined) {
        void removeSimulationRunLayers(mapStore, comparison.value.id);
    }
    geosimulation.clearComparison();
});
</script>

<style scoped>
.run-progress {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.75rem 0.85rem;
    border: 1px solid rgb(148 163 184 / 0.25);
    border-radius: 0.5rem;
}

.compared-runs {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 0.5rem;
}

.compared-run {
    display: grid;
    gap: 0.2rem;
    align-content: start;
    padding: 0.6rem 0.75rem;
    border: 1px solid rgb(148 163 184 / 0.2);
    border-radius: 0.4rem;
}

.kpi-change-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
}

.kpi-change-table th,
.kpi-change-table td {
    padding: 0.35rem 0.45rem;
    border-bottom: 1px solid rgb(148 163 184 / 0.2);
    text-align: left;
    white-space: nowrap;
}

.kpi-change-table thead th {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--ui-text-muted);
}

.kpi-change-table tbody th {
    font-weight: 500;
}

.kpi-change-table .numeric {
    text-align: right;
    font-variant-numeric: tabular-nums;
}

.change {
    font-weight: 600;
}

/*
 * Same direction colours as the diverging difference layers (increase red,
 * decrease blue), in mid tones readable in light and dark mode. They mark the
 * direction only: whether more is better depends on the metric.
 */
.change-up {
    color: #d6604d;
}

.change-down {
    color: #4393c3;
}

.change-none {
    color: var(--ui-text-muted);
}
</style>

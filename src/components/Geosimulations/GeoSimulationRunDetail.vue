<template>
    <div class="grid gap-4">
        <USkeleton v-if="loading && !run" class="h-72 w-full rounded-lg" />
        <UAlert v-else-if="failed" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="t('geosimulations.runUnavailable')" />

        <template v-else-if="run">
            <div class="grid gap-1">
                <p class="text-xs font-medium uppercase tracking-wide text-muted">{{ run.model.title }}</p>
                <h2 class="text-xl font-semibold leading-tight text-highlighted">{{ run.title }}</h2>
                <div class="flex flex-wrap items-center gap-2">
                    <UBadge v-if="simulatedTime" color="neutral" variant="subtle" icon="i-lucide-clock" :label="simulatedTime" />
                    <UBadge v-if="run.status !== 'published'" color="warning" variant="subtle" :label="t(`geosimulations.status.${run.status}`)" />
                </div>
            </div>

            <UAlert
                v-if="reused"
                color="info"
                variant="subtle"
                icon="i-lucide-recycle"
                :title="t('geosimulations.progress.reused')"
            />

            <section v-if="inProgress" class="run-progress" aria-live="polite">
                <UIcon name="i-lucide-loader-circle" class="size-5 shrink-0 animate-spin text-primary" aria-hidden="true" />
                <div class="grid gap-0.5">
                    <p class="text-sm font-semibold text-highlighted">{{ t(`geosimulations.progress.${run.execution_state}`) }}</p>
                    <p v-if="run.execution?.message" class="text-xs text-toned">{{ run.execution.message }}</p>
                    <p class="text-xs text-muted">{{ t("geosimulations.progress.elapsed", { duration: elapsed }) }}</p>
                </div>
            </section>
            <UAlert
                v-else-if="run.execution_state === 'failed'"
                color="error"
                variant="subtle"
                icon="i-lucide-circle-alert"
                :title="t('geosimulations.progress.failed')"
                :description="run.execution?.error || undefined"
            />

            <EditorJsReadonly v-if="run.description_content.blocks.length > 0" :data="run.description_content" />

            <section v-if="kpiRows.length > 0" class="grid gap-2">
                <h3 class="text-sm font-semibold text-highlighted">{{ t("geosimulations.keyFigures") }}</h3>
                <dl class="kpi-grid">
                    <div v-for="row in kpiRows" :key="row.key" class="kpi-card">
                        <dt class="text-xs text-muted">{{ row.label }}</dt>
                        <dd class="text-base font-semibold text-highlighted">
                            {{ row.value }}<span v-if="row.unit" class="ml-1 text-xs font-normal text-muted">{{ row.unit }}</span>
                        </dd>
                    </div>
                </dl>
            </section>

            <SimulationReplayPanel v-if="tripsOutput" :key="run.id" :run="run" :output="tripsOutput" />

            <SimulationMapLayerList v-if="mapOutputs.length > 0" :owner="run" :outputs="mapOutputs" />

            <SimulationTable v-for="table in otherTables" :key="table.id" :table="table" />

            <section v-if="comparisons.length > 0" class="grid gap-2">
                <h3 class="text-sm font-semibold text-highlighted">{{ t("geosimulations.comparedIn") }}</h3>
                <ul class="grid gap-1">
                    <li v-for="comparison in comparisons" :key="comparison.id">
                        <ULink
                            class="text-sm text-primary hover:underline"
                            :to="{ name: 'geosimulation-comparison', params: { comparisonId: comparison.id } }"
                        >
                            {{ comparison.title }}
                        </ULink>
                        <span class="ml-1 text-xs text-muted">
                            ({{ comparison.baseline.id === run.id ? t("geosimulations.comparison.asBaseline") : t("geosimulations.comparison.asCandidate") }})
                        </span>
                    </li>
                </ul>
            </section>

            <details class="parameters">
                <summary class="cursor-pointer text-sm font-semibold text-highlighted">{{ t("geosimulations.parameters") }}</summary>
                <dl class="parameter-list">
                    <template v-for="(value, key) in run.parameters" :key="key">
                        <dt>{{ String(key).replaceAll("_", " ") }}</dt>
                        <dd>{{ formatParameter(value, locale) }}</dd>
                    </template>
                    <dt>{{ t("geosimulations.modelVersion") }}</dt>
                    <dd>{{ run.model_version }}</dd>
                </dl>
            </details>
        </template>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import EditorJsReadonly from "@components/Base/EditorJsReadonly.vue";
import SimulationReplayPanel from "./SimulationReplayPanel.vue";
import SimulationMapLayerList from "./SimulationMapLayerList.vue";
import SimulationTable from "./SimulationTable.vue";
import { useMapStore } from "@store/map";
import {
    isRunInProgress,
    isTableOutput,
    isTripsOutput,
    isVectorLayerOutput,
    type SimulationComparisonSummary,
    type SimulationRunDetail,
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
import { formatDuration, formatParameter, formatSimulatedTime, simulationKpiRows } from "@helpers/simulationFormat";
import { forgetRun } from "@helpers/simulationMyRuns";
import { reportDeveloperError } from "@helpers/userFacingError";

/** While a started run is queued or running, the page polls its detail this often. */
const POLL_MS = 5000;

const props = defineProps<{ runId: string }>();
const { t, locale } = useI18n();
const route = useRoute();
const mapStore = useMapStore();
const geosimulation = useGeosimulationStore();

const run = ref<SimulationRunDetail>();
const loading = ref(false);
const failed = ref(false);
const comparisons = ref<SimulationComparisonSummary[]>([]);
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let clockTimer: ReturnType<typeof setInterval> | undefined;
const now = ref(Date.now());

const inProgress = computed(() => run.value !== undefined && isRunInProgress(run.value.execution_state));
const reused = computed(() => route.query.reused === "1");
const simulatedTime = computed(() => (run.value ? formatSimulatedTime(run.value.time, locale.value) : ""));
const elapsed = computed(() => {
    const since = run.value?.execution?.started_at ?? run.value?.created_at;
    if (since === undefined) return "";
    const seconds = Math.max(0, (now.value - Date.parse(since)) / 1000);
    return seconds < 60 ? t("geosimulations.progress.seconds", { count: Math.round(seconds) }) : formatDuration(seconds);
});

const mapOutputs = computed(() => (run.value?.outputs ?? []).filter(isVectorLayerOutput));
const tripsOutput = computed(() => run.value?.outputs.find(isTripsOutput));
const kpiRows = computed(() => (run.value ? simulationKpiRows(run.value, locale.value) : []));
const otherTables = computed(() => (run.value?.outputs ?? []).filter(isTableOutput).filter((table) => table.role !== "kpis"));

/** File URLs are presigned; fetch fresh ones a minute before they expire. */
function scheduleUrlRefresh(detail: SimulationRunDetail): void {
    if (refreshTimer !== undefined) clearTimeout(refreshTimer);
    const firstFile = detail.outputs.find((output) => "url_expires_at" in output);
    const delay = msUntilRefresh(firstFile && "url_expires_at" in firstFile ? firstFile.url_expires_at : null);
    if (delay === undefined) return;
    refreshTimer = setTimeout(() => {
        void refreshUrls(detail.id);
    }, delay);
}

async function refreshUrls(runId: string): Promise<void> {
    try {
        const fresh = await geosimulation.loadRun(runId);
        if (run.value?.id !== fresh.id) return;
        run.value = fresh;
        refreshSimulationSourceUrls(mapStore, fresh);
        scheduleUrlRefresh(fresh);
    } catch (error) {
        reportDeveloperError("Refreshing simulation file URLs", error);
    }
}

/** Fit the map and show the first map layer of a finished run. */
async function showOnMap(detail: SimulationRunDetail): Promise<void> {
    await waitForMapStyle(mapStore.map);
    fitToSimulationBounds(mapStore.map, detail.bounds);
    const first = detail.outputs.filter(isVectorLayerOutput).sort((a, b) => a.display_order - b.display_order)[0];
    if (first !== undefined) addSimulationOutputLayer(mapStore, detail, first);
    scheduleUrlRefresh(detail);
}

function stopFollowing(): void {
    if (pollTimer !== undefined) clearTimeout(pollTimer);
    if (clockTimer !== undefined) clearInterval(clockTimer);
    pollTimer = clockTimer = undefined;
}

/** Poll a queued or running run until it finishes, then show its outputs. */
function follow(runId: string): void {
    stopFollowing();
    now.value = Date.now();
    clockTimer = setInterval(() => { now.value = Date.now(); }, 1000);
    const poll = async (): Promise<void> => {
        try {
            const fresh = await geosimulation.loadRun(runId);
            if (props.runId !== runId) return;
            run.value = fresh;
            if (isRunInProgress(fresh.execution_state)) {
                pollTimer = setTimeout(() => { void poll(); }, POLL_MS);
                return;
            }
            stopFollowing();
            if (fresh.execution_state === "succeeded") await showOnMap(fresh);
        } catch (error) {
            // Keep following through network hiccups.
            reportDeveloperError(`Following simulation run ${runId}`, error);
            pollTimer = setTimeout(() => { void poll(); }, POLL_MS * 2);
        }
    };
    pollTimer = setTimeout(() => { void poll(); }, POLL_MS);
}

async function openRun(runId: string, previousRunId?: string): Promise<void> {
    stopFollowing();
    if (previousRunId !== undefined) await removeSimulationRunLayers(mapStore, previousRunId);
    loading.value = true;
    failed.value = false;
    try {
        const detail = await geosimulation.loadRun(runId);
        run.value = detail;
        void loadComparisons(runId);
        if (isRunInProgress(detail.execution_state)) follow(runId);
        else await showOnMap(detail);
    } catch (error) {
        failed.value = true;
        // A remembered run that no longer exists (retention) is dropped from "My runs".
        if (String(error).includes("(404")) forgetRun(runId);
        reportDeveloperError(`Opening simulation run ${runId}`, error);
    } finally {
        loading.value = false;
    }
}

/** Optional: the run page works without its comparisons. */
async function loadComparisons(runId: string): Promise<void> {
    comparisons.value = [];
    try {
        const results = await geosimulation.loadRunComparisons(runId);
        if (props.runId === runId) comparisons.value = results;
    } catch (error) {
        reportDeveloperError(`Loading comparisons of simulation run ${runId}`, error);
    }
}

watch(() => props.runId, (runId, previousRunId) => {
    void openRun(runId, previousRunId);
}, { immediate: true });

onBeforeUnmount(() => {
    stopFollowing();
    if (refreshTimer !== undefined) clearTimeout(refreshTimer);
    if (run.value !== undefined && mapStore.map !== undefined) {
        void removeSimulationRunLayers(mapStore, run.value.id);
    }
    geosimulation.clearRun();
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

.kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
    gap: 0.5rem;
    margin: 0;
}

.kpi-card {
    display: grid;
    gap: 0.15rem;
    padding: 0.55rem 0.7rem;
    border: 1px solid rgb(148 163 184 / 0.2);
    border-radius: 0.4rem;
}

.kpi-card dd {
    margin: 0;
}

.parameter-list {
    display: grid;
    grid-template-columns: minmax(8rem, auto) minmax(0, 1fr);
    gap: 0.25rem 0.75rem;
    margin: 0.6rem 0 0;
    font-size: 0.8rem;
}

.parameter-list dt {
    color: var(--ui-text-muted);
    text-transform: capitalize;
}

.parameter-list dd {
    margin: 0;
    overflow-wrap: anywhere;
}
</style>

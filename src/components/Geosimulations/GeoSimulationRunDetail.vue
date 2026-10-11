<template>
    <div class="grid gap-4">
        <USkeleton v-if="loading && !run" class="h-72 w-full rounded-lg" />
        <UAlert v-else-if="failed" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="t('geosimulations.runUnavailable')" />

        <template v-else-if="run">
            <div class="grid gap-1">
                <p class="text-xs font-medium uppercase tracking-wide text-muted">{{ run.model.title }}</p>
                <h2 class="text-xl font-semibold leading-tight text-highlighted">{{ run.title }}</h2>
                <div class="flex flex-wrap items-center gap-2">
                    <UBadge color="neutral" variant="subtle" icon="i-lucide-clock" :label="formatSimulatedTime(run.time, locale)" />
                    <UBadge v-if="run.status !== 'published'" color="warning" variant="subtle" :label="t(`geosimulations.status.${run.status}`)" />
                </div>
            </div>

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

            <section v-if="mapOutputs.length > 0" class="grid gap-2">
                <h3 class="text-sm font-semibold text-highlighted">{{ t("geosimulations.mapLayers") }}</h3>
                <p class="text-xs text-muted">{{ t("geosimulations.mapLayersHint") }}</p>
                <ul class="grid gap-1">
                    <li v-for="output in mapOutputs" :key="output.id" class="output-row">
                        <USwitch
                            :model-value="isOnMap(output)"
                            :loading="pendingOutputId === output.id"
                            :aria-label="output.title"
                            @update:model-value="(on: boolean) => toggleOutput(output, on)"
                        />
                        <span class="min-w-0 truncate text-sm">{{ output.title }}</span>
                        <span v-if="output.features !== null" class="text-xs text-muted">{{ formatNumber(output.features, locale) }}</span>
                    </li>
                </ul>
            </section>

            <section v-for="table in otherTables" :key="table.id" class="grid gap-2">
                <h3 class="text-sm font-semibold text-highlighted">{{ table.title }}</h3>
                <div class="table-scroll">
                    <table class="sim-table">
                        <thead>
                            <tr><th v-for="column in table.data.columns" :key="column">{{ column.replaceAll("_", " ") }}</th></tr>
                        </thead>
                        <tbody>
                            <tr v-for="(row, index) in table.data.rows" :key="index">
                                <td v-for="(cell, cellIndex) in row" :key="cellIndex">{{ formatCell(cell) }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
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
import EditorJsReadonly from "@components/Base/EditorJsReadonly.vue";
import SimulationReplayPanel from "./SimulationReplayPanel.vue";
import { useMapStore } from "@store/map";
import {
    isTableOutput,
    isTripsOutput,
    isVectorLayerOutput,
    type SimulationRunDetail,
    type SimulationVectorLayerOutput,
    useGeosimulationStore,
} from "@store/geosimulation";
import {
    addSimulationOutputLayer,
    msUntilRefresh,
    refreshSimulationSourceUrls,
    removeSimulationOutputLayer,
    removeSimulationRunLayers,
    waitForMapStyle,
} from "@helpers/geosimulationLayers";
import { formatNumber, formatParameter, formatSimulatedTime, simulationKpiRows } from "@helpers/simulationFormat";
import { useToast } from "@helpers/toast";
import { reportDeveloperError } from "@helpers/userFacingError";

const props = defineProps<{ runId: string }>();
const { t, locale } = useI18n();
const mapStore = useMapStore();
const geosimulation = useGeosimulationStore();
const toast = useToast();

const run = ref<SimulationRunDetail>();
const loading = ref(false);
const failed = ref(false);
const pendingOutputId = ref<string>();
let refreshTimer: ReturnType<typeof setTimeout> | undefined;

const mapOutputs = computed(() => (run.value?.outputs ?? []).filter(isVectorLayerOutput));
const tripsOutput = computed(() => run.value?.outputs.find(isTripsOutput));
const kpiRows = computed(() => (run.value ? simulationKpiRows(run.value, locale.value) : []));
const otherTables = computed(() => (run.value?.outputs ?? []).filter(isTableOutput).filter((table) => table.role !== "kpis"));

function isOnMap(output: SimulationVectorLayerOutput): boolean {
    return mapStore.layersOnMap.some((layer) => layer.simulationOutput?.outputId === output.id);
}

async function toggleOutput(output: SimulationVectorLayerOutput, on: boolean): Promise<void> {
    if (run.value === undefined) return;
    pendingOutputId.value = output.id;
    try {
        await waitForMapStyle(mapStore.map);
        if (on) {
            addSimulationOutputLayer(mapStore, run.value, output);
        } else {
            const layer = mapStore.layersOnMap.find((item) => item.simulationOutput?.outputId === output.id);
            if (layer !== undefined) await removeSimulationOutputLayer(mapStore, layer);
        }
    } catch (error) {
        reportDeveloperError(`Toggling simulation output ${output.role}`, error);
        toast.add({ severity: "error", summary: t("toast.error"), detail: t("geosimulations.layerError"), life: 4000 });
    } finally {
        pendingOutputId.value = undefined;
    }
}

/** The open sidebar (38.75rem) overlays the map's left side; keep the run in the visible part. */
const SIDEBAR_WIDTH_PX = 620;

function fitToRun(detail: SimulationRunDetail): void {
    if (detail.bounds === null || mapStore.map === undefined) return;
    const [west, south, east, north] = detail.bounds;
    const mapWidth = mapStore.map.getContainer().clientWidth as number;
    const left = Math.min(SIDEBAR_WIDTH_PX, Math.max(0, mapWidth - 320)) + 40;
    mapStore.map.fitBounds([[west, south], [east, north]], {
        padding: { top: 40, bottom: 40, right: 40, left },
        duration: 800,
    });
}

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

async function openRun(runId: string, previousRunId?: string): Promise<void> {
    if (previousRunId !== undefined) await removeSimulationRunLayers(mapStore, previousRunId);
    loading.value = true;
    failed.value = false;
    try {
        const detail = await geosimulation.loadRun(runId);
        run.value = detail;
        await waitForMapStyle(mapStore.map);
        fitToRun(detail);
        const first = detail.outputs.filter(isVectorLayerOutput).sort((a, b) => a.display_order - b.display_order)[0];
        if (first !== undefined) addSimulationOutputLayer(mapStore, detail, first);
        scheduleUrlRefresh(detail);
    } catch (error) {
        failed.value = true;
        reportDeveloperError(`Opening simulation run ${runId}`, error);
    } finally {
        loading.value = false;
    }
}

watch(() => props.runId, (runId, previousRunId) => {
    void openRun(runId, previousRunId);
}, { immediate: true });

onBeforeUnmount(() => {
    if (refreshTimer !== undefined) clearTimeout(refreshTimer);
    if (run.value !== undefined && mapStore.map !== undefined) {
        void removeSimulationRunLayers(mapStore, run.value.id);
    }
    geosimulation.clearRun();
});

function formatCell(cell: string | number | null): string {
    if (cell === null) return "—";
    return typeof cell === "number" ? formatNumber(cell, locale.value) : cell;
}
</script>

<style scoped>
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

.output-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.6rem;
    padding: 0.3rem 0;
}

.table-scroll {
    overflow-x: auto;
}

.sim-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.75rem;
}

.sim-table th,
.sim-table td {
    padding: 0.3rem 0.45rem;
    border-bottom: 1px solid rgb(148 163 184 / 0.2);
    text-align: left;
    white-space: nowrap;
}

.sim-table th {
    font-weight: 600;
    text-transform: capitalize;
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

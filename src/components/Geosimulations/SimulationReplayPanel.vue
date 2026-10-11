<template>
    <section class="grid gap-3">
        <div class="flex items-center justify-between gap-2">
            <h3 class="text-sm font-semibold text-highlighted">{{ t("geosimulations.replay.title") }}</h3>
            <span class="text-xs text-muted">
                {{ t("geosimulations.replay.agents", { count: props.output.metadata.agents ?? 0 }) }}
            </span>
        </div>

        <UButton
            v-if="replay === undefined"
            class="w-fit"
            icon="i-lucide-play"
            :label="loading ? loadingLabel : t('geosimulations.replay.load')"
            :loading="loading"
            :disabled="loading"
            @click="openReplay"
        />
        <UAlert v-if="loadFailed" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="t('geosimulations.replay.failed')" />

        <template v-if="replay !== undefined">
            <div class="replay-bar">
                <UButton
                    class="size-8 shrink-0"
                    :icon="playing ? 'i-lucide-pause' : 'i-lucide-play'"
                    :aria-label="playing ? t('geosimulations.replay.pause') : t('geosimulations.replay.play')"
                    color="primary"
                    variant="soft"
                    @click="togglePlay"
                />
                <USlider
                    class="grow"
                    :model-value="time"
                    :min="0"
                    :max="replay.timeEnd"
                    :step="1"
                    :aria-label="t('geosimulations.replay.position')"
                    @update:model-value="onSlider"
                />
                <span class="replay-clock" aria-live="off">{{ clock }}</span>
            </div>

            <div class="flex flex-wrap items-center gap-2">
                <span class="text-xs text-muted">{{ t("geosimulations.replay.speed") }}</span>
                <UButton
                    v-for="option in SPEEDS"
                    :key="option"
                    size="xs"
                    :color="speed === option ? 'primary' : 'neutral'"
                    :variant="speed === option ? 'soft' : 'outline'"
                    :label="`${option}×`"
                    @click="setSpeed(option)"
                />
            </div>

            <label class="replay-row">
                <span class="text-xs text-muted">{{ t("geosimulations.replay.colorBy") }}</span>
                <USelect v-model="colorBy" class="grow min-w-0" size="sm" :items="colorByItems" value-key="value" />
            </label>
            <ul v-if="coloring.legend.length > 0" class="replay-legend">
                <li v-for="entry in coloring.legend" :key="entry.value">
                    <span class="replay-swatch" :style="{ background: rgbaToCss(entry.color) }" aria-hidden="true"></span>
                    <span>{{ valueLabel(entry.value) }}</span>
                    <span class="text-muted">{{ entry.count }}</span>
                </li>
            </ul>

            <div class="grid gap-1">
                <label class="replay-row">
                    <USwitch v-model="showStops" size="sm" />
                    <span class="text-xs">{{ t("geosimulations.replay.signalStops") }}</span>
                </label>
                <ul v-if="showStops" class="replay-legend">
                    <li v-for="kind in STOP_KINDS" :key="kind">
                        <span class="replay-swatch replay-swatch-round" :style="{ background: rgbaToCss(STOP_COLORS[kind]) }" aria-hidden="true"></span>
                        <span>{{ t(`geosimulations.replay.stop.${kind}`) }}</span>
                    </li>
                </ul>
            </div>
        </template>
    </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { useMapStore } from "@store/map";
import {
    isTripsOutput,
    labelForValue,
    type SimulationRunDetail,
    type SimulationTripsOutput,
    useGeosimulationStore,
} from "@store/geosimulation";
import {
    colorTripsBy,
    rgbaToCss,
    STOP_COLORS,
    STOP_KINDS,
    type ReplayData,
} from "@helpers/simulationReplay";
import { loadSimulationReplay, ReplayLoadError } from "@helpers/simulationReplayLoader";
import { formatReplayClock, humanizeMetric } from "@helpers/simulationFormat";
import { reportDeveloperError } from "@helpers/userFacingError";

const props = defineProps<{ run: SimulationRunDetail; output: SimulationTripsOutput }>();
const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const mapStore = useMapStore();
const geosimulation = useGeosimulationStore();

const SPEEDS = [1, 10, 60, 300] as const;
const TRAIL_SECONDS = 120;
const layerId = computed(() => `geosim-replay:${props.run.id}`);

const replay = ref<ReplayData>();
const loading = ref(false);
const loadedBytes = ref(0);
const loadFailed = ref(false);
const playing = ref(false);
const time = ref(initialNumber(route.query.t, 0));
const speed = ref<number>(SPEEDS.includes(initialNumber(route.query.speed, 60) as (typeof SPEEDS)[number]) ? initialNumber(route.query.speed, 60) : 60);
const colorBy = ref<string>("none");
const showStops = ref(true);
let frame: number | undefined;
let lastFrameAt: number | undefined;
let colorVersion = 0;

const loadingLabel = computed(() =>
    t("geosimulations.replay.loading", { mb: (loadedBytes.value / 1e6).toFixed(1) })
);
const clock = computed(() => formatReplayClock(props.run.time.start, time.value, props.run.time.timezone, locale.value));
const colorByItems = computed(() => [
    { label: t("geosimulations.replay.colorNone"), value: "none" },
    ...(replay.value?.attributeNames ?? []).map((name) => ({ label: humanizeMetric(name), value: name })),
]);
const coloring = computed(() =>
    replay.value === undefined
        ? { colors: [], legend: [] }
        : colorTripsBy(replay.value, colorBy.value === "none" ? null : colorBy.value)
);

function initialNumber(value: unknown, fallback: number): number {
    const parsed = Number(Array.isArray(value) ? value[0] : value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function valueLabel(value: string): string {
    return labelForValue(props.run.labels, colorBy.value, value, locale.value);
}

function layerOnMap(): boolean {
    return mapStore.layersOnMap.some((layer) => layer.id === layerId.value);
}

function pushLayerProps(update: Record<string, unknown>): void {
    if (layerOnMap()) mapStore.setDeckLayerProps(layerId.value, update);
}

async function fetchReplay(url: string): Promise<ReplayData> {
    return await loadSimulationReplay(url, { onProgress: (bytes) => { loadedBytes.value = bytes; } });
}

async function openReplay(): Promise<void> {
    loading.value = true;
    loadFailed.value = false;
    loadedBytes.value = 0;
    try {
        let data: ReplayData;
        try {
            data = await fetchReplay(props.output.url);
        } catch (error) {
            // Presigned URLs expire after about an hour: fetch a fresh one once.
            if (!(error instanceof ReplayLoadError) || error.status !== 403) throw error;
            const fresh = await geosimulation.loadRun(props.run.id);
            const output = fresh.outputs.find(isTripsOutput);
            if (output === undefined) throw error;
            data = await fetchReplay(output.url);
        }
        replay.value = data;
        time.value = Math.min(time.value, data.timeEnd);
        mapStore.addDeckReplayLayer({
            identifier: layerId.value,
            displayName: props.output.title,
            props: {
                replay: data,
                currentTime: time.value,
                trailLength: TRAIL_SECONDS,
                tripColors: coloring.value.colors,
                colorVersion,
                showStops: showStops.value,
            },
            simulationOutput: {
                runId: props.run.id,
                outputId: props.output.id,
                role: props.output.role,
                legend: null,
                labels: props.run.labels,
                bounds: props.run.bounds,
            },
        });
        play();
    } catch (error) {
        loadFailed.value = true;
        reportDeveloperError("Loading the simulation replay", error);
    } finally {
        loading.value = false;
    }
}

function tick(now: number): void {
    const data = replay.value;
    if (data === undefined || !playing.value) return;
    const elapsed = lastFrameAt === undefined ? 0 : (now - lastFrameAt) / 1000;
    lastFrameAt = now;
    // Long gaps (tab in the background) must not jump the replay forward.
    time.value = Math.min(time.value + Math.min(elapsed, 0.25) * speed.value, data.timeEnd);
    pushLayerProps({ currentTime: time.value });
    if (time.value >= data.timeEnd) {
        pause();
        return;
    }
    frame = requestAnimationFrame(tick);
}

function play(): void {
    if (replay.value === undefined || playing.value) return;
    if (time.value >= replay.value.timeEnd) time.value = 0;
    playing.value = true;
    lastFrameAt = undefined;
    frame = requestAnimationFrame(tick);
}

function pause(): void {
    playing.value = false;
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    rememberPosition();
}

function togglePlay(): void {
    if (playing.value) pause();
    else play();
}

function seek(value: number): void {
    time.value = value;
    pushLayerProps({ currentTime: value });
    if (!playing.value) rememberPosition();
}

function onSlider(value: number | number[] | undefined): void {
    seek(Number(Array.isArray(value) ? value[0] : value));
}

function setSpeed(value: number): void {
    speed.value = value;
    rememberPosition();
}

/** Keep the moment shareable: `?t=<seconds>&speed=<factor>`. */
function rememberPosition(): void {
    void router.replace({ query: { ...route.query, t: String(Math.round(time.value)), speed: String(speed.value) } });
}

watch(coloring, (value) => {
    colorVersion += 1;
    pushLayerProps({ tripColors: value.colors, colorVersion });
});
watch(showStops, (value) => pushLayerProps({ showStops: value }));
// Removing the replay from the layer list resets the panel.
watch(() => layerOnMap(), (onMap) => {
    if (!onMap && replay.value !== undefined && !loading.value) {
        pause();
        replay.value = undefined;
    }
});

onBeforeUnmount(() => {
    if (frame !== undefined) cancelAnimationFrame(frame);
    if (layerOnMap()) void mapStore.deleteMapLayer(layerId.value, false);
});
</script>

<style scoped>
.replay-bar {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.75rem;
}

.replay-clock {
    min-width: 4.8rem;
    font-variant-numeric: tabular-nums;
    font-size: 0.85rem;
    font-weight: 600;
    text-align: right;
}

.replay-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
}

.replay-legend {
    display: grid;
    gap: 0.2rem;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 0.78rem;
}

.replay-legend li {
    display: grid;
    grid-template-columns: 1rem minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.5rem;
}

.replay-swatch {
    width: 0.9rem;
    height: 0.35rem;
    border-radius: 9999px;
}

.replay-swatch-round {
    width: 0.7rem;
    height: 0.7rem;
    border: 1px solid rgb(255 255 255 / 0.8);
}
</style>

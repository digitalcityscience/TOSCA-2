<template>
    <li
        class="grid gap-2 rounded-md border border-muted px-3 py-2"
        :data-entry-key="props.entry.key"
        :data-state="entryState"
        :data-in-chapter="props.inChapter ? 'true' : undefined"
    >
        <div class="flex items-start justify-between gap-2">
            <div class="flex min-w-0 items-start gap-2">
                <UIcon :name="geometryIcon" class="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
                <span class="min-w-0 break-words text-sm font-medium text-highlighted">
                    {{ localize(props.entry.title, locale) }}
                </span>
            </div>
            <UBadge
                v-if="statusBadge !== undefined"
                :color="statusBadge.color"
                variant="soft"
                size="sm"
                :label="statusBadge.label"
                :title="statusBadge.title"
                data-testid="entry-status"
            />
        </div>

        <div class="flex flex-wrap items-center gap-1">
            <UBadge
                v-if="props.inChapter"
                color="primary"
                variant="soft"
                size="sm"
                :label="t('urbanStories.explore.inChapter')"
                data-testid="in-chapter"
            />
            <UBadge
                v-if="props.entry.minZoom !== undefined"
                color="neutral"
                variant="outline"
                size="sm"
                :label="t('urbanStories.explore.visibleFromZoom', { zoom: props.entry.minZoom })"
                data-testid="zoom-hint"
            />
            <UBadge
                v-if="props.entry.mvt !== 'verified'"
                color="warning"
                variant="soft"
                size="sm"
                :label="t(`urbanStories.explore.mvt.${props.entry.mvt}`)"
            />
            <UBadge
                v-if="zoomFloorMissing"
                color="warning"
                variant="outline"
                size="sm"
                :label="t('urbanStories.explore.noZoomFloor')"
                data-testid="no-zoom-floor"
            />
        </div>

        <p
            v-if="missingAttributes.length > 0"
            class="text-xs text-warning"
            data-testid="missing-attributes"
        >
            {{ t("urbanStories.explore.attributesMissing", { columns: missingAttributes.join(", ") }) }}
        </p>

        <details v-if="caveats.length > 0" class="text-xs text-muted" data-testid="entry-caveats">
            <summary class="cursor-pointer select-none">{{ t("urbanStories.explore.caveats") }}</summary>
            <ul class="mt-1 list-disc space-y-1 pl-4">
                <li v-for="(caveat, index) in caveats" :key="index">{{ localize(caveat, locale) }}</li>
            </ul>
        </details>

        <label v-if="props.entry.metrics.length > 0" class="grid gap-1">
            <span class="text-xs font-medium text-muted">{{ t("urbanStories.explore.metric") }}</span>
            <USelect
                :model-value="shownMetric"
                :items="metricItems"
                size="sm"
                class="w-full"
                :aria-label="t('urbanStories.explore.ariaMetric', { title: localize(props.entry.title, locale) })"
                data-testid="metric-select"
                :disabled="metricBusy || blocked"
                @update:model-value="onMetricChange"
            />
        </label>
        <p v-if="pendingMetricReason !== undefined" class="text-xs text-muted" data-testid="metric-reason">
            {{ pendingMetricReason }}
        </p>
        <p v-if="walkLegend !== undefined" class="text-xs font-medium" data-testid="map-metric-status">
            {{ runtimeId === undefined ? (locale === 'de' ? 'Vorschau' : 'Preview') : mapLayerVisible ? (locale === 'de' ? 'Kartenfarben' : 'Map colours') : (locale === 'de' ? 'Ebene ausgeblendet' : 'Layer hidden') }}:
            {{ currentMetricLabel }}
        </p>
        <FifteenMinuteLegend v-if="walkLegend !== undefined" :legend="walkLegend" />

        <UAlert
            v-if="message !== undefined"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :description="message"
            data-testid="entry-message"
        />

        <div class="flex flex-wrap items-center gap-2">
            <template v-if="runtimeId !== undefined">
                <UButton
                    size="xs"
                    color="neutral"
                    variant="soft"
                    icon="i-lucide-sliders-horizontal"
                    data-testid="toggle-settings"
                    @click="settingsOpen = !settingsOpen"
                >
                    {{ settingsOpen ? t("urbanStories.explore.hideSettings") : t("urbanStories.explore.showSettings") }}
                </UButton>
                <UButton
                    size="xs"
                    color="error"
                    variant="ghost"
                    icon="i-lucide-trash-2"
                    data-testid="remove-layer"
                    @click="remove"
                >
                    {{ t("urbanStories.explore.remove") }}
                </UButton>
            </template>
            <UButton
                v-else
                size="xs"
                icon="i-lucide-plus"
                data-testid="add-layer"
                :loading="adding"
                :disabled="addDisabled"
                @click="add"
            >
                {{ addLabel }}
            </UButton>
        </div>

        <div v-if="runtimeId !== undefined && record !== undefined && settingsOpen" class="urban-story-inline-settings" data-testid="inline-settings">
            <MapLayerListingItem :layer="record" sync-with-store />
        </div>
    </li>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import MapLayerListingItem from "@components/Map/Layer/MapLayerListingItem.vue";
import { styleLacksZoomFloor, type MetricPendingReason } from "@helpers/urbanStoryLayers";
import { useMapStore } from "@store/map";
import { useUrbanStoriesStore } from "@store/urbanStories";
import { localize, type ExploreEntry, type RuntimeReadiness, type UrbanStoryKey } from "../../config/urbanStories";
import { walkLegendFor } from "../../config/urbanStories/styles/walkabilitySafety";
import FifteenMinuteLegend from "./FifteenMinuteLegend.vue";

interface Props {
    storyKey: UrbanStoryKey
    entry: ExploreEntry
    /** The entry belongs to the chapter currently playing (UST-07). */
    inChapter?: boolean
}

const props = withDefaults(defineProps<Props>(), { inChapter: false });
const { t, locale } = useI18n();
const urbanStories = useUrbanStoriesStore();
const mapStore = useMapStore();
const mapLayerVisible = computed(() => runtimeId.value !== undefined && mapStore.getLayerUiState(runtimeId.value)?.visible !== false);
const currentMetricLabel = computed(() => {
    const metric = props.entry.metrics.find((item) => item.key === shownMetric.value);
    return metric === undefined ? "" : localize(metric.label, locale.value);
});

const settingsOpen = ref(false);
const message = ref<string>();
const metricBusy = ref(false);
/** Metric picked before the layer exists; applied when the layer is added. */
const pendingMetric = ref<string | undefined>(props.entry.defaultMetric);

const runtimeId = computed(() => urbanStories.runtimeIdFor(props.storyKey, props.entry));
const record = computed(() => urbanStories.recordOf(runtimeId.value));
const readiness = computed(() => urbanStories.readinessOf(props.storyKey, props.entry));
const layerState = computed(() => urbanStories.layerStatus[`${props.entry.layer.providerId}:${props.entry.layer.workspace}:${props.entry.layer.layerName}`]);
const adding = computed(() => layerState.value === "adding");
const missingAttributes = computed(() => readiness.value?.missingAttributes ?? []);
const blocked = computed(() => (
    readiness.value?.readiness === "temporarily-unavailable"
    || readiness.value?.readiness === "tiles-unavailable"
));

const geometryIcon = computed(() => ({
    point: "i-lucide-map-pin",
    line: "i-lucide-route",
    polygon: "i-lucide-square",
}[props.entry.geometry]));

const entryState = computed(() => {
    if (runtimeId.value !== undefined) return "added";
    if (adding.value) return "adding";
    if (readiness.value?.readiness === "temporarily-unavailable") return "unavailable";
    if (readiness.value?.readiness === "tiles-unavailable") return "tiles-unavailable";
    return "idle";
});

const STATUS_COLORS: Partial<Record<RuntimeReadiness, "success" | "neutral" | "warning" | "error">> = {
    available: "success",
    unstyled: "neutral",
    "attributes-missing": "warning",
    "temporarily-unavailable": "warning",
    "tiles-unavailable": "error",
    error: "warning",
};

const statusBadge = computed(() => {
    const state = readiness.value?.readiness;
    if (state === undefined) return undefined;
    return {
        color: STATUS_COLORS[state] ?? "neutral",
        label: t(`urbanStories.explore.status.${state}`),
        title: state === "temporarily-unavailable" ? t("urbanStories.explore.unavailableHint") : undefined,
    };
});

const caveats = computed(() => {
    const shown = props.entry.metrics.find((metric) => metric.key === shownMetric.value);
    const all = [...(props.entry.caveats ?? []), ...(shown?.caveats ?? [])];
    // Entry and metric caveats can repeat the same rule; show each text once.
    return all.filter((caveat, index) => all.findIndex((other) => other.en === caveat.en) === index);
});

const zoomFloorMissing = computed(() => (
    record.value !== undefined && styleLacksZoomFloor(record.value, props.entry.minZoom)
));

const metricItems = computed(() => props.entry.metrics.map((metric) => {
    const probe = readiness.value?.metrics[metric.key];
    const label = localize(metric.label, locale.value);
    const available = probe?.readiness === "available";
    return {
        label: probe === undefined || available
            ? label
            : t(probe.readiness === "attributes-missing"
                ? "urbanStories.explore.metricAttributesMissing"
                : "urbanStories.explore.metricPending", { label }),
        value: metric.key,
        // Only verified, loaded styles can be chosen; unknown (not yet probed) is not selectable either.
        disabled: !available,
    };
}));

const shownMetric = computed(() => (
    urbanStories.activeMetricOf(props.storyKey, props.entry) ?? pendingMetric.value
));
const walkLegend = computed(() => ["walkability-safety", "building-walking"].includes(props.storyKey) ? walkLegendFor(shownMetric.value) : undefined);

const pendingMetricReason = computed(() => {
    const probe = shownMetric.value === undefined ? undefined : readiness.value?.metrics[shownMetric.value];
    if (probe === undefined || probe.readiness === "available") return undefined;
    if (probe.readiness === "attributes-missing") return undefined;
    const reason: MetricPendingReason = probe.reason ?? "no-style-name";
    return t(`urbanStories.explore.pendingReason.${reason}`);
});

const addDisabled = computed(() => adding.value || blocked.value);
const addLabel = computed(() => {
    if (adding.value) return t("urbanStories.explore.adding");
    if (readiness.value?.readiness === "temporarily-unavailable") return t("urbanStories.explore.status.temporarily-unavailable");
    if (readiness.value?.readiness === "tiles-unavailable") return t("urbanStories.explore.status.tiles-unavailable");
    return t("urbanStories.explore.add");
});

onMounted(() => {
    void urbanStories.loadReadiness(props.storyKey, props.entry);
});

async function add(): Promise<void> {
    message.value = undefined;
    const result = await urbanStories.addEntry(props.storyKey, props.entry.key, pendingMetric.value);
    if (result.status === "added") {
        settingsOpen.value = true;
    } else if (result.status === "error") {
        message.value = t("urbanStories.explore.addError");
    } else if (result.status === "map-not-ready") {
        message.value = t("urbanStories.explore.mapNotReady");
    }
}

async function remove(): Promise<void> {
    message.value = undefined;
    settingsOpen.value = false;
    await urbanStories.removeEntry(props.storyKey, props.entry.key);
}

async function onMetricChange(value: unknown): Promise<void> {
    if (typeof value !== "string") return;
    message.value = undefined;
    pendingMetric.value = value;
    if (runtimeId.value === undefined) return;
    metricBusy.value = true;
    try {
        const result = await urbanStories.applyMetric(props.storyKey, props.entry.key, value, true);
        if (result.status === "error" || result.status === "metric-unavailable") {
            message.value = t("urbanStories.explore.metricError");
        }
    } finally {
        metricBusy.value = false;
    }
}
</script>

<style scoped>
/* The panel is not a drag-and-drop list: hide the inert reorder handle of the shared item. */
.urban-story-inline-settings :deep(.layer-drag-handle) {
    display: none;
}
</style>

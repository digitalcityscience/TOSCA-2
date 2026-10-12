import { defineStore } from "pinia";
import { computed, ref, shallowRef, watch } from "vue";
import { logOnce } from "@helpers/urbanStoryLayers";
import { useMapStore, type LayerObjectWithAttributes } from "./map";
import { useUrbanStoriesStore } from "./urbanStories";
import { frontendStylingFor, getStoryConfig, type ChapterInteraction, type ExploreEntry } from "../config/urbanStories";
import {
    buildBuildingProfile,
    BUILDING_HEIGHT_FIELD,
    BUILDING_SCORE_FIELD,
    buildingStyleOptionId,
    CATEGORY_FIELDS,
    FIFTEEN_MINUTE_CATEGORY_IDS,
    NO_GAP_FILTER,
    type AdministrativeLevel,
    type AdministrativeMetric,
    type FifteenMinuteCategoryId,
    type GapFilterSelection,
} from "../config/urbanStories/styles/fifteenMinute";
import { categoryMetricKey } from "../config/urbanStories/fifteenMinute";

/**
 * Interaction state of the 15-Minute City story: category selection, accessibility-gap filter,
 * building selection and the building-to-neighbourhood transition.
 *
 * @remarks
 * This store owns no layers. It decides what the existing layers should look like and drives them
 * through the Urban Stories store (`addEntry`, `applyMetric`) and the map store
 * (`setStandaloneLayerStyle`, visibility). All thematic styling comes from the local
 * `config/urbanStories/styles/fifteenMinute` module; no GeoServer style is read or applied.
 *
 * Map changes go through one coalescing `sync()`: whatever the user did last wins, and two style
 * swaps of the same layer never overlap, so fast category or chapter switching cannot leave the map
 * and the panel disagreeing.
 */

export const FIFTEEN_MINUTE_STORY_KEY = "fifteen-minute" as const;
export const BUILDINGS_ENTRY_KEY = "buildings-15min";
const ADMIN_ENTRY_KEYS: Record<AdministrativeLevel, string> = {
    stadtteile: "stadtteile-15min",
    bezirke: "bezirke-15min",
};

/** Illustrative starting threshold of the gap filter (chapter 5); users change it. Not a standard. */
export const DEFAULT_GAP_MAX_SCORE = 3;

export const SELECTION_SOURCE_ID = "urban-stories-15min-selection";
export const SELECTION_FILL_LAYER_ID = `${SELECTION_SOURCE_ID}-fill`;
export const SELECTION_LINE_LAYER_ID = `${SELECTION_SOURCE_ID}-line`;
const SELECTION_COLOR = "#ff6f00";

const CATEGORY_MODES: readonly ChapterInteraction[] = ["category", "gaps"];
const SELECTION_MODES: readonly ChapterInteraction[] = ["building", "gaps"];

export interface SelectedBuilding {
    /** The tile feature id when GeoServer encodes one; the building key `gml_id` is not a published attribute. */
    featureId: string | number | null;
    properties: Record<string, unknown>;
    geometry: GeoJSON.Geometry;
}

interface ClickEvent {
    point: unknown;
}

interface RenderedFeature {
    id?: string | number;
    properties?: Record<string, unknown> | null;
    geometry: GeoJSON.Geometry;
}

export const useFifteenMinuteStore = defineStore("urbanStoriesFifteenMinute", () => {
    const urbanStories = useUrbanStoriesStore();
    const mapStore = useMapStore();

    const category = ref<FifteenMinuteCategoryId | null>(null);
    const gapEnabled = ref(false);
    const gapMaxScore = ref(DEFAULT_GAP_MAX_SCORE);
    const gapMissingCategoryOnly = ref(false);
    const adminLevel = ref<AdministrativeLevel>("stadtteile");
    const adminMetric = ref<AdministrativeMetric>("m15_categories_mean");
    const selection = shallowRef<SelectedBuilding>();

    // --- derived state --------------------------------------------------------------------

    const storyConfig = getStoryConfig(FIFTEEN_MINUTE_STORY_KEY);
    function entryOf(key: string): ExploreEntry | undefined {
        return storyConfig?.explore.find((entry) => entry.key === key);
    }
    const buildingsEntry = entryOf(BUILDINGS_ENTRY_KEY);

    /** The interaction of the active chapter; `undefined` unless this story is running. */
    const mode = computed<ChapterInteraction | undefined>(() => (
        urbanStories.runState === "running" && urbanStories.runningStoryKey === FIFTEEN_MINUTE_STORY_KEY
            ? urbanStories.activeChapter?.interaction
            : undefined
    ));

    const buildingsReadiness = computed(() => (
        buildingsEntry === undefined ? undefined : urbanStories.readinessOf(FIFTEEN_MINUTE_STORY_KEY, buildingsEntry)
    ));

    /** True when a category's attribute is published; unknown readiness counts as available. */
    function categoryAvailable(id: FifteenMinuteCategoryId): boolean {
        const metric = buildingsReadiness.value?.metrics[categoryMetricKey(id)];
        return metric === undefined || metric.readiness !== "attributes-missing";
    }

    const categoryOptions = computed(() => FIFTEEN_MINUTE_CATEGORY_IDS.map((id) => ({
        id,
        label: CATEGORY_FIELDS[id].label,
        available: categoryAvailable(id),
    })));

    /** The category the map actually shows: the selection, if this chapter offers it and its field is published. */
    const effectiveCategory = computed<FifteenMinuteCategoryId | null>(() => (
        mode.value !== undefined && CATEGORY_MODES.includes(mode.value)
        && category.value !== null && categoryAvailable(category.value)
            ? category.value
            : null
    ));

    const effectiveGap = computed<GapFilterSelection>(() => {
        if (mode.value !== "gaps") return NO_GAP_FILTER;
        return {
            maxScore: gapEnabled.value ? gapMaxScore.value : null,
            missingCategory: gapMissingCategoryOnly.value ? effectiveCategory.value : null,
        };
    });

    const selectionEnabled = computed(() => mode.value !== undefined && SELECTION_MODES.includes(mode.value));
    const profile = computed(() => (selection.value === undefined ? undefined : buildBuildingProfile(selection.value.properties)));

    const buildingRuntimeId = computed(() => (
        buildingsEntry === undefined ? undefined : urbanStories.runtimeIdFor(FIFTEEN_MINUTE_STORY_KEY, buildingsEntry)
    ));

    /** `tiles-unavailable` once the building tiles reported an error; no substitute layer is ever shown. */
    const buildingsState = computed<"ready" | "tiles-unavailable" | "not-on-map">(() => {
        if (buildingsReadiness.value?.readiness === "tiles-unavailable") return "tiles-unavailable";
        return buildingRuntimeId.value === undefined ? "not-on-map" : "ready";
    });

    // --- the one place that changes the map ------------------------------------------------

    /** Entry keys of layers this store made visible, so it only ever hides what it showed. */
    const shownByController = new Set<string>();
    let syncing: Promise<void> | undefined;
    let dirty = false;

    function recordOf(runtimeId: string | undefined): LayerObjectWithAttributes | undefined {
        return urbanStories.recordOf(runtimeId);
    }

    async function syncBuildingStyle(): Promise<void> {
        const record = recordOf(buildingRuntimeId.value);
        if (buildingsEntry === undefined || record === undefined) return;
        const metricKey = effectiveCategory.value === null ? BUILDING_SCORE_FIELD : categoryMetricKey(effectiveCategory.value);
        const metric = buildingsEntry.metrics.find((option) => option.key === metricKey);
        const bundle = frontendStylingFor(buildingsEntry, effectiveGap.value);
        if (metric?.styleName == null || bundle === undefined) return;
        const targetId = buildingStyleOptionId(metric.styleName, effectiveGap.value);
        if (record.activeStyleId === targetId) return;
        // The gap filter lives inside the local style layers, so the swap carries it and the
        // existing style-swap code keeps visibility, opacity and the user's attribute filters.
        record.availableStyles = bundle.styles;
        try {
            await mapStore.setStandaloneLayerStyle(record.id, targetId);
        } catch (error) {
            logOnce(`15min-style:${record.id}:${targetId}`, `Switching the 15-minute building style to ${targetId}`, error);
        }
    }

    async function showEntry(entryKey: string, metricKey?: string, track = true): Promise<void> {
        const requestedMode = mode.value;
        const result = metricKey === undefined
            ? await urbanStories.addEntry(FIFTEEN_MINUTE_STORY_KEY, entryKey)
            : await urbanStories.applyMetric(FIFTEEN_MINUTE_STORY_KEY, entryKey, metricKey);
        const runtimeId = "runtimeId" in result ? result.runtimeId : undefined;
        const record = recordOf(runtimeId);
        if (record === undefined || mode.value === undefined || mode.value !== requestedMode) return;
        if (track) shownByController.add(entryKey);
        if (mapStore.getLayerUiState(record.id)?.visible === false) mapStore.setLogicalLayerVisibility(record, true);
    }

    function hideEntry(entryKey: string): void {
        const entry = entryOf(entryKey);
        const record = entry === undefined ? undefined : recordOf(urbanStories.runtimeIdFor(FIFTEEN_MINUTE_STORY_KEY, entry));
        shownByController.delete(entryKey);
        if (record !== undefined && mapStore.getLayerUiState(record.id)?.visible !== false) {
            mapStore.setLogicalLayerVisibility(record, false);
        }
    }

    async function syncOverlays(): Promise<void> {
        const wantedPoi = effectiveCategory.value === null ? undefined : CATEGORY_FIELDS[effectiveCategory.value].poiEntryKey;
        for (const id of FIFTEEN_MINUTE_CATEGORY_IDS) {
            const key = CATEGORY_FIELDS[id].poiEntryKey;
            if (key !== wantedPoi && shownByController.has(key)) hideEntry(key);
        }
        if (wantedPoi !== undefined) await showEntry(wantedPoi);

        // The transition chapter keeps the building layer on: zooming past level 14 returns to single buildings.
        // It is the story's main layer, so it is never part of what the controller puts away again.
        if (mode.value === "neighbourhoods") await showEntry(BUILDINGS_ENTRY_KEY, undefined, false);

        const wantedAdmin = mode.value === "neighbourhoods" ? ADMIN_ENTRY_KEYS[adminLevel.value] : undefined;
        for (const key of Object.values(ADMIN_ENTRY_KEYS)) {
            if (key !== wantedAdmin && (shownByController.has(key) || wantedAdmin !== undefined)) hideEntry(key);
        }
        if (wantedAdmin !== undefined) await showEntry(wantedAdmin, adminMetric.value);
    }

    /** While a chapter inspects buildings in the side panel, the generic attribute popup stays closed for them. */
    function syncPopupSuppression(): void {
        const record = recordOf(buildingRuntimeId.value);
        if (record !== undefined && record.attributePopupSuppressed !== selectionEnabled.value) {
            record.attributePopupSuppressed = selectionEnabled.value;
        }
    }

    async function syncOnce(): Promise<void> {
        syncPopupSuppression();
        if (mode.value === undefined) {
            // Not running: put away what this store showed, drop the selection, leave the layers on the map.
            for (const key of [...shownByController]) hideEntry(key);
            clearSelection();
            return;
        }
        await syncBuildingStyle();
        await syncOverlays();
        if (!selectionEnabled.value || buildingRuntimeId.value === undefined) clearSelection();
    }

    /** Apply the current state to the map. Overlapping calls coalesce; the last state wins. */
    function sync(): Promise<void> {
        dirty = true;
        if (syncing === undefined) {
            syncing = (async () => {
                try {
                    while (dirty) {
                        dirty = false;
                        try {
                            await syncOnce();
                        } catch (error) {
                            logOnce("15min-sync", "Synchronising the 15-Minute City map state", error);
                        }
                    }
                } finally {
                    syncing = undefined;
                }
            })();
        }
        return syncing;
    }

    // --- user actions ----------------------------------------------------------------------

    function selectCategory(id: FifteenMinuteCategoryId | null): Promise<void> {
        category.value = id;
        if (id === null) gapMissingCategoryOnly.value = false;
        return sync();
    }

    function setGapEnabled(enabled: boolean): Promise<void> {
        gapEnabled.value = enabled;
        return sync();
    }

    function setGapMaxScore(maxScore: number): Promise<void> {
        gapMaxScore.value = Math.min(8, Math.max(0, Math.trunc(maxScore)));
        return sync();
    }

    function setGapMissingCategoryOnly(only: boolean): Promise<void> {
        gapMissingCategoryOnly.value = only && category.value !== null;
        return sync();
    }

    function setAdminLevel(level: AdministrativeLevel): Promise<void> {
        adminLevel.value = level;
        return sync();
    }

    function setAdminMetric(metric: AdministrativeMetric): Promise<void> {
        adminMetric.value = metric;
        return sync();
    }

    // --- building selection -----------------------------------------------------------------

    function ensureSelectionOverlay(): boolean {
        const map = mapStore.map;
        if (map === undefined || map === null) return false;
        if (map.getSource(SELECTION_SOURCE_ID) === undefined) {
            map.addSource(SELECTION_SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        }
        if (map.getLayer(SELECTION_FILL_LAYER_ID) === undefined) {
            // Same height as the selected building, a little above it, so the highlight is not hidden inside the 3D building.
            map.addLayer({
                id: SELECTION_FILL_LAYER_ID,
                type: "fill-extrusion",
                source: SELECTION_SOURCE_ID,
                paint: {
                    "fill-extrusion-color": SELECTION_COLOR,
                    "fill-extrusion-height": ["+", ["coalesce", ["get", "height"], 0], 0.5],
                    "fill-extrusion-base": 0,
                    "fill-extrusion-opacity": 0.85,
                },
            });
        }
        if (map.getLayer(SELECTION_LINE_LAYER_ID) === undefined) {
            map.addLayer({
                id: SELECTION_LINE_LAYER_ID,
                type: "line",
                source: SELECTION_SOURCE_ID,
                paint: { "line-color": SELECTION_COLOR, "line-width": 3 },
            });
        }
        return true;
    }

    function setOverlayData(geometry: GeoJSON.Geometry | undefined, height?: number): void {
        const map = mapStore.map;
        if (map === undefined || map === null) return;
        const source = map.getSource(SELECTION_SOURCE_ID) as { setData?: (data: unknown) => void } | undefined;
        source?.setData?.({
            type: "FeatureCollection",
            features: geometry === undefined ? [] : [{ type: "Feature", geometry, properties: { height: height ?? 0 } }],
        });
    }

    function removeSelectionOverlay(): void {
        const map = mapStore.map;
        if (map === undefined || map === null) return;
        for (const id of [SELECTION_LINE_LAYER_ID, SELECTION_FILL_LAYER_ID]) {
            if (map.getLayer(id) !== undefined) map.removeLayer(id);
        }
        if (map.getSource(SELECTION_SOURCE_ID) !== undefined) map.removeSource(SELECTION_SOURCE_ID);
    }

    /** Select a rendered building feature: highlight it with the local selection style and keep it. */
    function selectBuilding(feature: RenderedFeature): void {
        selection.value = {
            featureId: feature.id ?? null,
            properties: { ...(feature.properties ?? {}) },
            geometry: feature.geometry,
        };
        const height = feature.properties?.[BUILDING_HEIGHT_FIELD];
        if (ensureSelectionOverlay()) setOverlayData(feature.geometry, typeof height === "number" && height > 0 ? height : 0);
    }

    function clearSelection(): void {
        if (selection.value === undefined) return;
        selection.value = undefined;
        setOverlayData(undefined);
    }

    function onMapClick(event: ClickEvent): void {
        const map = mapStore.map;
        const record = recordOf(buildingRuntimeId.value);
        if (!selectionEnabled.value || map === undefined || map === null || record === undefined) return;
        const layerIds = [record.id, ...(record.companionLayerIds ?? [])].filter((id) => map.getLayer(id) !== undefined);
        if (layerIds.length === 0) return;
        const hit = (map.queryRenderedFeatures(event.point as never, { layers: layerIds }) as RenderedFeature[])[0];
        if (hit !== undefined) selectBuilding(hit);
    }

    // The click handler exists only while a chapter offers selection.
    let clickMap: { on: (type: string, listener: unknown) => void; off: (type: string, listener: unknown) => void } | undefined;
    function detachClick(): void {
        clickMap?.off("click", onMapClick);
        clickMap = undefined;
    }
    watch([selectionEnabled, () => mapStore.map], ([enabled, map]) => {
        detachClick();
        if (!enabled || map === undefined || map === null) return;
        clickMap = map as unknown as typeof clickMap;
        clickMap?.on("click", onMapClick);
    }, { immediate: true });

    // --- chapter changes --------------------------------------------------------------------

    /** Each chapter starts from its own defaults; the selection never carries over. */
    function resetForChapter(interaction: ChapterInteraction | undefined): void {
        category.value = null;
        gapMissingCategoryOnly.value = false;
        gapMaxScore.value = DEFAULT_GAP_MAX_SCORE;
        gapEnabled.value = interaction === "gaps";
        adminLevel.value = "stadtteile";
        adminMetric.value = "m15_categories_mean";
        clearSelection();
    }

    watch(() => [urbanStories.runState, urbanStories.runningStoryKey, urbanStories.activeChapter?.chapterKey] as const, () => {
        resetForChapter(mode.value);
        if (mode.value === undefined) removeSelectionOverlay();
        void sync();
    });

    // A layer added or removed later (a chapter finishing its add, "Remove" in the panel) re-syncs.
    watch(() => urbanStories.trackedLayers.map((tracked) => tracked.runtimeId).join("|"), () => {
        if (mode.value !== undefined) void sync();
    });
    // Attributes found missing after a probe turn a selected category back into the overall view.
    watch(effectiveCategory, () => { void sync(); });

    return {
        category,
        gapEnabled,
        gapMaxScore,
        gapMissingCategoryOnly,
        adminLevel,
        adminMetric,
        selection,
        mode,
        effectiveCategory,
        effectiveGap,
        categoryOptions,
        selectionEnabled,
        profile,
        buildingRuntimeId,
        buildingsState,
        sync,
        selectCategory,
        setGapEnabled,
        setGapMaxScore,
        setGapMissingCategoryOnly,
        setAdminLevel,
        setAdminMetric,
        selectBuilding,
        clearSelection,
        onMapClick,
    };
});

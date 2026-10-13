import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { useMapStore, type LayerObjectWithAttributes } from "./map";
import { useUrbanStoriesStore } from "./urbanStories";
import { getStoryConfig } from "../config/urbanStories";
import { WALK_SELECTED_STATE } from "../config/urbanStories/styles/walkabilitySafety/cartography";

const STORY_KEY = "building-walking" as const;
const BUILDING_ENTRY_KEY = "buildings-comfort-safety";

interface RenderedFeature {
    id?: string | number;
    properties?: Record<string, unknown> | null;
}

export const useWalkabilitySafetyStore = defineStore("urbanStoriesWalkabilitySafety", () => {
    const urbanStories = useUrbanStoriesStore();
    const mapStore = useMapStore();
    const selected = ref<{ id: string | number | null; properties: Record<string, unknown> }>();
    let selectedFeatureId: string | number | undefined;
    const story = getStoryConfig(STORY_KEY);
    const buildingsEntry = story?.explore.find((entry) => entry.key === BUILDING_ENTRY_KEY);

    const buildingRuntimeId = computed(() => buildingsEntry === undefined ? undefined : urbanStories.runtimeIdFor(STORY_KEY, buildingsEntry));
    const selectionEnabled = computed(() => (
        urbanStories.activeStoryKey === STORY_KEY
        && buildingRuntimeId.value !== undefined
        && mapStore.getLayerUiState(buildingRuntimeId.value)?.visible === true
    ));
    const profile = computed(() => {
        if (selected.value === undefined) return undefined;
        const value = (name: string): number | undefined => {
            const raw = selected.value!.properties[name];
            return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
        };
        const text = (name: string): string | undefined => {
            const raw = selected.value!.properties[name];
            return typeof raw === "string" && raw.trim() !== "" ? raw : typeof raw === "number" && Number.isFinite(raw) ? String(raw) : undefined;
        };
        const residential = selected.value.properties.is_residential;
        return {
            alkisId: text("gml_id"),
            functionCode: text("building_function_code"),
            residential: residential === true || residential === 1 ? true : residential === false || residential === 0 ? false : undefined,
            height: value("building_height_m"),
            footprintArea: value("footprint_area_m2"),
            id: selected.value.id,
            safety: value("safety_index_400m"),
            comfort: value("comfort_mean_400m"),
            coveredLength: value("safety_covered_len_400m_m"),
            scoredShare: value("comfort_scored_share_400m"),
            reason: selected.value.properties.safety_null_reason_400m ?? selected.value.properties.comfort_null_reason_400m ?? selected.value.properties.score_null_reason,
        };
    });

    function buildingRecord(): LayerObjectWithAttributes | undefined {
        return urbanStories.recordOf(buildingRuntimeId.value);
    }

    function selectBuilding(feature: RenderedFeature): void {
        clearFeatureState();
        selected.value = { id: feature.id ?? null, properties: { ...(feature.properties ?? {}) } };
        const record = buildingRecord();
        if (feature.id !== undefined && record !== undefined && mapStore.map !== undefined && mapStore.map !== null) {
            selectedFeatureId = feature.id;
            mapStore.map.setFeatureState({ source: record.source, sourceLayer: "hamburg_buildings", id: feature.id }, { [WALK_SELECTED_STATE]: true });
        }
    }
    function clearFeatureState(): void {
        const record = buildingRecord();
        if (selectedFeatureId !== undefined && record !== undefined && mapStore.map !== undefined && mapStore.map !== null) {
            mapStore.map.removeFeatureState({ source: record.source, sourceLayer: "hamburg_buildings", id: selectedFeatureId }, WALK_SELECTED_STATE);
        }
        selectedFeatureId = undefined;
    }
    function clearSelection(): void { clearFeatureState(); selected.value = undefined; }

    function onMapClick(event: { point: unknown }): void {
        const map = mapStore.map;
        const record = buildingRecord();
        if (!selectionEnabled.value || map === undefined || map === null || record === undefined) return;
        const layerIds = [record.id, ...(record.companionLayerIds ?? [])].filter((id) => map.getLayer(id) !== undefined);
        const hit = (map.queryRenderedFeatures(event.point as never, { layers: layerIds }) as RenderedFeature[])[0];
        if (hit !== undefined) selectBuilding(hit);
        else clearSelection();
    }

    let clickMap: { on: (type: string, listener: unknown) => void; off: (type: string, listener: unknown) => void } | undefined;
    function detachClick(): void { clickMap?.off("click", onMapClick); clickMap = undefined; }
    watch([selectionEnabled, () => mapStore.map, buildingRuntimeId], (_next, _previous, onCleanup) => {
        const record = buildingRecord();
        if (record !== undefined) record.attributePopupSuppressed = selectionEnabled.value;
        onCleanup(() => {
            if (record !== undefined) record.attributePopupSuppressed = false;
            clearSelection();
            detachClick();
        });
        detachClick();
        if (!selectionEnabled.value || mapStore.map === undefined || mapStore.map === null) return;
        const nextMap = mapStore.map as unknown as NonNullable<typeof clickMap>;
        clickMap = nextMap;
        nextMap.on("click", onMapClick);
    }, { immediate: true });
    watch(selectionEnabled, (enabled) => { if (!enabled) clearSelection(); });

    return { selected, profile, selectionEnabled, selectBuilding, clearSelection };
});

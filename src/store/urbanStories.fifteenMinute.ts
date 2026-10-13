import { defineStore } from "pinia";
import { Popup, type MapMouseEvent } from "maplibre-gl";
import { computed, ref, shallowRef, watch } from "vue";
import { sceneCameraMove } from "@helpers/geostoryScenes";
import {
    fetchBuilding,
    fetchStadtteilGeometry,
    fetchStadtteilRows,
    summariseStadtteile,
    type StadtteilRow,
} from "@helpers/fifteenMinuteData";
import { FifteenMinuteOverlays, type AreaOutline } from "@helpers/fifteenMinuteOverlays";
import { logOnce } from "@helpers/urbanStoryLayers";
import { flyToAdminArea, flyToPoint, reducedMotion, viewInsets } from "@helpers/urbanStoryCamera";
import { i18n } from "../core/i18n";
import { useMapStore, type LayerObjectWithAttributes } from "./map";
import { useUrbanStoriesStore } from "./urbanStories";
import { frontendStylingFor, getStoryConfig, type ExploreEntry, type OverviewCamera } from "../config/urbanStories";
import { FIFTEEN_MINUTE_STORY_KEY } from "../config/urbanStories/fifteenMinute";
import {
    LANGENBEK,
    SCENE_EXAMPLES,
    WILHELMSBURG,
    type SceneExample,
    type VerifiedArea,
    type VerifiedBuilding,
} from "../config/urbanStories/fifteenMinuteLocations";
import {
    ENTRY_BUILDINGS,
    ENTRY_STADTTEILE,
    adminField,
    buildBuildingProfile,
    categoryMeasure,
    formatMeasureValue,
    measureInfo,
    styleNameOf,
    type BuildingProfile,
    type CategoryId,
    type GreenMeasure,
    type MeasureId,
    type ThemeId,
} from "../config/urbanStories/styles/fifteenMinute";

/**
 * Scene state of the 15-Minute City story: which measure the map shows, the selected building or Stadtteil, the data
 * each scene reads, and the overlays (selection, compared places) next to the catalog layers.
 *
 * @remarks
 * This store owns no catalog layer. Chapters stage the Stadtteil and building layers through the Urban Stories store;
 * this store only decides which measure both layers show (a style swap through `setStandaloneLayerStyle`, which keeps
 * the camera, the selection and the layer state), draws its own `fm-*` overlays and reads attribute data from the
 * existing WFS. Every number in the panel comes from that data at runtime. Map changes go through one coalescing `sync()`.
 */

export const SCENE_KEYS = [
    "passes-the-test",
    "same-score-different-neighbourhood",
    "the-weakest-link",
    "accessible-but-comfortable",
    "accessible-but-safe",
    "explore-beyond-the-score",
] as const;
export type SceneKey = typeof SCENE_KEYS[number];

export type ComfortView = "access" | "comfort";
export type SafetyView = "access" | "safety";

/** Scenes in which a click on a Stadtteil selects it (the others keep their two compared places). */
const AREA_CLICK_SCENES: readonly SceneKey[] = ["passes-the-test", "explore-beyond-the-score"];
const HOVER_SCENES: readonly SceneKey[] = ["passes-the-test", "explore-beyond-the-score"];

export interface SelectedBuilding {
    profile: BuildingProfile;
    geometry: GeoJSON.Geometry;
}

type DataStatus = "idle" | "loading" | "ready" | "error";

interface RenderedFeature {
    id?: string | number;
    properties?: Record<string, unknown> | null;
    geometry: GeoJSON.Geometry;
}

/** The category with the lowest published share in a Stadtteil: the weakest link of its score. */
export function weakestCategory(row: StadtteilRow | undefined): CategoryId | undefined {
    if (row === undefined) return undefined;
    let weakest: CategoryId | undefined;
    for (const [id, share] of Object.entries(row.shares) as [CategoryId, number | null][]) {
        if (share === null) continue;
        if (weakest === undefined || share < (row.shares[weakest] as number)) weakest = id;
    }
    return weakest;
}

export const useFifteenMinuteStore = defineStore("urbanStoriesFifteenMinute", () => {
    const urbanStories = useUrbanStoriesStore();
    const mapStore = useMapStore();
    const localeCode = (): string => String(i18n.global.locale.value ?? i18n.global.locale);

    const storyConfig = getStoryConfig(FIFTEEN_MINUTE_STORY_KEY);
    const entryOf = (key: string): ExploreEntry | undefined => storyConfig?.explore.find((entry) => entry.key === key);

    // --- scene ------------------------------------------------------------------------------

    const running = computed(() => urbanStories.runState === "running" && urbanStories.runningStoryKey === FIFTEEN_MINUTE_STORY_KEY);
    const sceneKey = computed<SceneKey | undefined>(() => {
        const key = running.value ? urbanStories.activeChapter?.chapterKey : undefined;
        return (SCENE_KEYS as readonly string[]).includes(key ?? "") ? key as SceneKey : undefined;
    });
    const sceneNumber = computed(() => (sceneKey.value === undefined ? 0 : SCENE_KEYS.indexOf(sceneKey.value) + 1));

    // --- what the reader chose ----------------------------------------------------------------

    const category = ref<CategoryId>("culture");
    const focusAreaId = ref<string>(LANGENBEK.id);
    const comfortView = ref<ComfortView>("access");
    const safetyView = ref<SafetyView>("access");
    const theme = ref<ThemeId>("access");
    const greenMeasure = ref<GreenMeasure>("green");

    /** The measure both map layers show in the active scene. */
    const measure = computed<MeasureId | undefined>(() => {
        switch (sceneKey.value) {
            case "passes-the-test":
            case "same-score-different-neighbourhood":
                return "access";
            case "the-weakest-link":
                return categoryMeasure(category.value);
            case "accessible-but-comfortable":
                return comfortView.value === "comfort" ? "comfort" : "access";
            case "accessible-but-safe":
                return safetyView.value === "safety" ? "safety" : "access";
            case "explore-beyond-the-score":
                if (theme.value === "category") return categoryMeasure(category.value);
                if (theme.value === "green") return greenMeasure.value;
                return theme.value;
            default:
                return undefined;
        }
    });

    // --- data -------------------------------------------------------------------------------

    const rows = shallowRef<StadtteilRow[]>([]);
    const dataStatus = ref<DataStatus>("idle");
    const summary = computed(() => summariseStadtteile(rows.value));
    const rowOf = (id: string): StadtteilRow | undefined => rows.value.find((row) => row.id === id);

    /** Map zoom, to show the legend of the layer that is drawn (Stadtteile below the footprint zoom, buildings above). */
    const zoom = ref(0);

    const selection = shallowRef<SelectedBuilding>();
    const selectedAreaId = ref<string>();
    const selectedArea = computed(() => (selectedAreaId.value === undefined ? undefined : rowOf(selectedAreaId.value)));
    const examples = shallowRef<Record<string, SelectedBuilding>>({});

    /** Late answers of an older scene are dropped. */
    let sceneToken = 0;

    async function loadRows(): Promise<void> {
        if (dataStatus.value === "ready" || dataStatus.value === "loading") return;
        dataStatus.value = "loading";
        try {
            rows.value = await fetchStadtteilRows();
            dataStatus.value = "ready";
        } catch (error) {
            dataStatus.value = "error";
            logOnce("15min-stadtteile", "Reading the Stadtteil attributes", error);
        }
    }

    async function loadExample(example: VerifiedBuilding): Promise<SelectedBuilding | undefined> {
        const known = examples.value[example.id];
        if (known !== undefined) return known;
        try {
            const detail = await fetchBuilding(example.id);
            if (detail === undefined) return undefined;
            const loaded: SelectedBuilding = { profile: buildBuildingProfile(detail.properties), geometry: detail.geometry };
            examples.value = { ...examples.value, [example.id]: loaded };
            return loaded;
        } catch (error) {
            logOnce(`15min-example:${example.id}`, `Reading building ${example.id}`, error);
            return undefined;
        }
    }

    /** The worked examples of the active scene (empty when the scene has none). */
    const sceneExamples = computed<readonly SceneExample[]>(() => {
        switch (sceneKey.value) {
            case "the-weakest-link": return SCENE_EXAMPLES.weakest;
            case "accessible-but-comfortable": return SCENE_EXAMPLES.comfort;
            case "accessible-but-safe": return SCENE_EXAMPLES.safety;
            default: return [];
        }
    });

    // --- the map ----------------------------------------------------------------------------

    type MapLike = NonNullable<typeof mapStore.map>;

    let overlays: FifteenMinuteOverlays | undefined;
    let overlayMap: unknown;
    let popup: Popup | undefined;
    let listening: (() => void) | undefined;

    function ensureOverlays(): FifteenMinuteOverlays | undefined {
        const map = mapStore.map;
        if (map === undefined || map === null) return undefined;
        if (overlays !== undefined && overlayMap !== map) overlays = undefined;
        if (overlays === undefined) {
            overlays = new FifteenMinuteOverlays(map);
            overlayMap = map;
        }
        return overlays;
    }

    const recordOf = (runtimeId: string | undefined): LayerObjectWithAttributes | undefined => urbanStories.recordOf(runtimeId);
    function runtimeIdOf(entryKey: string): string | undefined {
        const entry = entryOf(entryKey);
        return entry === undefined ? undefined : urbanStories.runtimeIdFor(FIFTEEN_MINUTE_STORY_KEY, entry);
    }
    function layerIdsOf(entryKey: string): string[] {
        const map = mapStore.map;
        const record = recordOf(runtimeIdOf(entryKey));
        if (record === undefined || map === undefined || map === null) return [];
        return [record.id, ...(record.companionLayerIds ?? [])].filter((id) => map.getLayer(id) !== undefined);
    }

    let syncing: Promise<void> | undefined;
    let dirty = false;

    /** Swap one layer to the style of the active measure. The style id is the style name. */
    async function syncStyle(entryKey: string, level: "building" | "admin", wanted: MeasureId): Promise<void> {
        const entry = entryOf(entryKey);
        const record = recordOf(runtimeIdOf(entryKey));
        const bundle = entry === undefined ? undefined : frontendStylingFor(entry);
        if (record === undefined || bundle === undefined) return;
        const targetId = styleNameOf(level, wanted);
        if (record.activeStyleId === targetId) return;
        record.availableStyles = bundle.styles;
        try {
            await mapStore.setStandaloneLayerStyle(record.id, targetId);
        } catch (error) {
            logOnce(`15min-style:${targetId}`, `Switching the ${level} layer to ${targetId}`, error);
        }
    }

    function syncPopupSuppression(): void {
        for (const key of [ENTRY_BUILDINGS, ENTRY_STADTTEILE]) {
            const record = recordOf(runtimeIdOf(key));
            if (record !== undefined && record.attributePopupSuppressed !== running.value) record.attributePopupSuppressed = running.value;
        }
    }

    const outlineGeometry = new Map<string, GeoJSON.Geometry | undefined>();
    async function geometryOf(id: string): Promise<GeoJSON.Geometry | undefined> {
        if (!outlineGeometry.has(id)) outlineGeometry.set(id, await fetchStadtteilGeometry(id).catch(() => undefined));
        return outlineGeometry.get(id);
    }

    /** The Stadtteile outlined in the active scene: the compared places, or the selected one. */
    function wantedOutlines(): { id: string; name: string; tone: AreaOutline["tone"] }[] {
        switch (sceneKey.value) {
            case "same-score-different-neighbourhood":
                return [{ id: WILHELMSBURG.id, name: WILHELMSBURG.name, tone: "a" }, { id: LANGENBEK.id, name: LANGENBEK.name, tone: "b" }];
            case "the-weakest-link": {
                const focus = focusAreaId.value === WILHELMSBURG.id ? WILHELMSBURG : LANGENBEK;
                return [{ id: focus.id, name: focus.name, tone: "focus" }];
            }
            case "accessible-but-comfortable":
            case "accessible-but-safe":
                return sceneExamples.value.map((example) => ({ id: example.area.id, name: example.area.name, tone: example.tone }));
            case "passes-the-test":
            case "explore-beyond-the-score":
                return selectedArea.value === undefined ? [] : [{ id: selectedArea.value.id, name: selectedArea.value.name, tone: "focus" }];
            default:
                return [];
        }
    }

    let outlineKey: string | undefined;
    async function syncOutlines(bound: FifteenMinuteOverlays): Promise<void> {
        const wanted = wantedOutlines();
        const key = wanted.map((area) => `${area.id}:${area.tone}`).join("|");
        if (key === outlineKey) return;
        outlineKey = key;
        const outlines: AreaOutline[] = [];
        for (const area of wanted) {
            const geometry = await geometryOf(area.id);
            if (geometry !== undefined) outlines.push({ geometry, tone: area.tone, name: area.name });
        }
        if (key !== outlineKey) return;
        bound.setAreaOutlines(outlines);
    }

    async function syncOnce(): Promise<void> {
        syncPopupSuppression();
        const bound = ensureOverlays();
        const wanted = measure.value;
        if (sceneKey.value === undefined || wanted === undefined || bound === undefined) {
            teardownOverlays();
            return;
        }
        await Promise.all([syncStyle(ENTRY_STADTTEILE, "admin", wanted), syncStyle(ENTRY_BUILDINGS, "building", wanted)]);
        await syncOutlines(bound);
        bound.setSelectedBuilding(selection.value === undefined ? undefined : {
            geometry: selection.value.geometry,
            height: selection.value.profile.heightM ?? 0,
        });
        bound.raise();
        attachListeners();
    }

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

    function teardownOverlays(): void {
        detachListeners();
        popup?.remove();
        popup = undefined;
        overlays?.dispose();
        overlays = undefined;
        outlineKey = undefined;
    }

    // --- pointer handling ---------------------------------------------------------------------

    function attachListeners(): void {
        const map = mapStore.map;
        if (listening !== undefined || map === undefined || map === null) return;
        const click = (event: MapMouseEvent): void => onMapClick(event);
        const move = (event: MapMouseEvent): void => onMapMove(event);
        const leave = (): void => { popup?.remove(); };
        const track = (): void => { zoom.value = map.getZoom(); };
        track();
        map.on("click", click);
        map.on("mousemove", move);
        map.on("zoom", track);
        map.getCanvas().addEventListener("mouseleave", leave);
        listening = () => {
            map.off("click", click);
            map.off("mousemove", move);
            map.off("zoom", track);
            map.getCanvas().removeEventListener("mouseleave", leave);
        };
    }

    function detachListeners(): void {
        listening?.();
        listening = undefined;
    }

    function queryAt(event: MapMouseEvent, layers: string[]): RenderedFeature[] {
        const map = mapStore.map;
        const existing = layers.filter((id) => map?.getLayer(id) !== undefined);
        if (map === undefined || map === null || existing.length === 0) return [];
        return map.queryRenderedFeatures(event.point, { layers: existing }) as unknown as RenderedFeature[];
    }

    /** The Stadtteil of a tile feature, resolved to its published row. */
    function areaOfFeature(feature: RenderedFeature): StadtteilRow | undefined {
        const id = feature.properties?.stadtteil_id;
        return typeof id === "string" ? rowOf(id) : undefined;
    }

    function onMapClick(event: MapMouseEvent): void {
        const scene = sceneKey.value;
        if (scene === undefined) return;
        const building = queryAt(event, layerIdsOf(ENTRY_BUILDINGS))[0];
        if (building !== undefined) {
            selection.value = { profile: buildBuildingProfile(building.properties), geometry: building.geometry };
            void sync();
            return;
        }
        if (!AREA_CLICK_SCENES.includes(scene)) return;
        const area = queryAt(event, layerIdsOf(ENTRY_STADTTEILE)).map(areaOfFeature).find((candidate) => candidate !== undefined);
        if (area !== undefined) {
            selectedAreaId.value = area.id;
            void sync();
        }
    }

    function onMapMove(event: MapMouseEvent): void {
        const scene = sceneKey.value;
        const map = mapStore.map;
        const active = measure.value;
        if (scene === undefined || active === undefined || map === undefined || map === null) return;
        const overBuilding = queryAt(event, layerIdsOf(ENTRY_BUILDINGS)).length > 0;
        const hit = HOVER_SCENES.includes(scene) && !overBuilding
            ? queryAt(event, layerIdsOf(ENTRY_STADTTEILE))[0]
            : undefined;
        map.getCanvas().style.cursor = overBuilding || hit !== undefined ? "pointer" : "";
        if (hit === undefined) {
            popup?.remove();
            return;
        }
        const row = areaOfFeature(hit);
        const raw = hit.properties?.[adminField(active)];
        const value = typeof raw === "number" ? formatMeasureValue(active, raw, "admin", localeCode()) : "–";
        const tileName = hit.properties?.stadtteil_name;
        const name = row?.name ?? (typeof tileName === "string" ? tileName : "");
        popup ??= new Popup({ closeButton: false, closeOnClick: false, className: "fifteen-hover", offset: 12 });
        popup.setLngLat(event.lngLat).setHTML(`<strong>${escapeHtml(name)}</strong><br>${escapeHtml(measureInfo(active).label[localeCode() === "de" ? "de" : "en"])}: ${escapeHtml(value)}`).addTo(map);
    }

    function escapeHtml(text: string): string {
        return text.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[char] ?? char);
    }

    // --- camera -----------------------------------------------------------------------------------

    /**
     * TOSCA's sidebars cover the map instead of shrinking it. While the story runs, the map is padded by the open left
     * sidebar so every scene camera centres on the part of the map the reader can see; the padding is removed when
     * the run ends.
     */
    let paddedMap: MapLike | undefined;

    function frameMap(map: MapLike, camera: OverviewCamera): void {
        const padding = viewInsets(map);
        map.setPadding(padding);
        paddedMap = map;
        const move = sceneCameraMove({
            camera: { center: camera.center, zoom: camera.zoom, bearing: camera.bearing ?? 0, pitch: camera.pitch ?? 0, bounds: null },
            transition: { type: "fly", duration_ms: 1500 },
            layers: [],
        }, { reducedMotion: reducedMotion() });
        if (move === undefined || move.method === "fitBounds") return;
        map[move.method]({ ...move.options, padding } as never);
    }

    function frameScene(): void {
        const map = mapStore.map;
        const index = sceneKey.value === undefined ? -1 : SCENE_KEYS.indexOf(sceneKey.value);
        const camera = storyConfig?.chapters[index]?.camera;
        if (map === undefined || map === null || camera === undefined) return;
        try {
            frameMap(map, camera);
        } catch (error) {
            logOnce("15min-frame", "Framing the 15-Minute City scene", error);
        }
    }

    function releasePadding(): void {
        try {
            paddedMap?.setPadding({ left: 0, right: 0, top: 0, bottom: 0 });
        } catch (error) {
            logOnce("15min-padding", "Removing the 15-Minute City map padding", error);
        }
        paddedMap = undefined;
    }

    function flyToBuilding(building: VerifiedBuilding, targetZoom = 16.4, pitch = 55): void {
        const map = mapStore.map;
        if (map === undefined || map === null) return;
        flyToPoint(map, building.center, { zoom: targetZoom, pitch });
    }

    function flyToArea(area: VerifiedArea): void {
        const map = mapStore.map;
        if (map === undefined || map === null) return;
        flyToAdminArea(map, area.bounds, "stadtteil");
    }

    // --- user actions -----------------------------------------------------------------------

    function setComfortView(view: ComfortView): void {
        comfortView.value = view;
        void sync();
    }

    function setSafetyView(view: SafetyView): void {
        safetyView.value = view;
        void sync();
    }

    function setTheme(next: ThemeId): void {
        theme.value = next;
        void sync();
    }

    function setCategory(next: CategoryId): void {
        category.value = next;
        void sync();
    }

    function setGreenMeasure(next: GreenMeasure): void {
        greenMeasure.value = next;
        void sync();
    }

    function setFocusArea(area: VerifiedArea): void {
        focusAreaId.value = area.id;
        const weakest = weakestCategory(rowOf(area.id));
        if (weakest !== undefined) category.value = weakest;
        flyToArea(area);
        void sync();
    }

    function clearSelection(): void {
        selection.value = undefined;
        selectedAreaId.value = undefined;
        void sync();
    }

    /** Show a verified example building: highlight it on the map and read it in the panel. */
    async function selectExample(example: VerifiedBuilding, fly = false): Promise<void> {
        const token = sceneToken;
        const loaded = await loadExample(example);
        if (loaded === undefined || token !== sceneToken) return;
        selection.value = loaded;
        if (fly) flyToBuilding(example);
        await sync();
    }

    // --- scene changes ------------------------------------------------------------------------

    /** Each scene starts from its own state: no selection or view of the previous scene survives. */
    function resetForScene(): void {
        sceneToken += 1;
        selection.value = undefined;
        selectedAreaId.value = undefined;
        comfortView.value = "access";
        safetyView.value = "access";
        theme.value = "access";
        greenMeasure.value = "green";
        focusAreaId.value = LANGENBEK.id;
        category.value = "culture";
        outlineKey = undefined;
        popup?.remove();
    }

    async function enterScene(scene: SceneKey, token: number): Promise<void> {
        await loadRows();
        if (token !== sceneToken) return;
        if (scene === "the-weakest-link") {
            const weakest = weakestCategory(rowOf(LANGENBEK.id));
            if (weakest !== undefined) category.value = weakest;
        }
        const first = sceneExamples.value[0];
        const loads = sceneExamples.value.map((example) => loadExample(example.building));
        void sync();
        await Promise.allSettled(loads);
        if (token !== sceneToken || first === undefined) return;
        await selectExample(first.building);
    }

    watch(() => [running.value, sceneKey.value] as const, ([isRunning, scene]) => {
        resetForScene();
        if (!isRunning || scene === undefined) {
            releasePadding();
            void sync();
            return;
        }
        frameScene();
        void sync();
        void enterScene(scene, sceneToken);
        // The panel creates this store after the run has started, so the first scene is handled right away.
    }, { immediate: true });

    // A layer added or removed later (a scene finishing its add) re-syncs.
    watch(() => urbanStories.trackedLayers.map((tracked) => tracked.runtimeId).join("|"), () => {
        if (sceneKey.value !== undefined) void sync();
    });

    // The compared values are re-read from the rows once they arrive.
    watch(() => dataStatus.value, () => {
        if (sceneKey.value !== undefined) void sync();
    });

    return {
        running,
        sceneKey,
        sceneNumber,
        measure,
        zoom,
        rows,
        dataStatus,
        summary,
        selection,
        selectedArea,
        examples,
        sceneExamples,
        category,
        focusAreaId,
        comfortView,
        safetyView,
        theme,
        greenMeasure,
        rowOf,
        sync,
        selectExample,
        clearSelection,
        setComfortView,
        setSafetyView,
        setTheme,
        setCategory,
        setGreenMeasure,
        setFocusArea,
        flyToArea,
        flyToBuilding,
        onMapClick,
    };
});

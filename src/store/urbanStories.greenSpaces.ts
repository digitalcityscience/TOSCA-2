import { defineStore } from "pinia";
import { Popup, type MapMouseEvent } from "maplibre-gl";
import { computed, ref, shallowRef, watch } from "vue";
import { sceneCameraMove } from "@helpers/geostoryScenes";
import {
    fetchBuilding,
    fetchGreenArea,
    fetchGreenInventory,
    fetchParkDetail,
    fetchStadtteilGeometry,
    fetchStadtteilRows,
    summariseStadtteile,
    type GreenInventory,
    type ParkDetail,
    type StadtteilRow,
} from "@helpers/greenSpacesData";
import { GreenSpacesOverlays, type ExampleMarker } from "@helpers/greenSpacesOverlays";
import type { AreaOutline } from "@helpers/fifteenMinuteOverlays";
import { logOnce } from "@helpers/urbanStoryLayers";
import { flyToAdminArea, flyToPoint, reducedMotion, viewInsets } from "@helpers/urbanStoryCamera";
import { i18n } from "../core/i18n";
import { useMapStore, type LayerObjectWithAttributes } from "./map";
import { useUrbanStoriesStore } from "./urbanStories";
import { frontendStylingFor, getStoryConfig, localize, type ExploreEntry, type OverviewCamera } from "../config/urbanStories";
import { GREEN_SPACES_STORY_KEY } from "../config/urbanStories/greenSpaces";
import {
    EXPLORE_CAMERA,
    HIRSCHPARK,
    NIENSTEDTEN,
    OTHMARSCHEN,
    PARK_CAMERA,
    PARK_EXAMPLES,
    PLAYGROUND_EXAMPLES,
    type VerifiedArea,
    type VerifiedBuilding,
} from "../config/urbanStories/greenSpacesLocations";
import {
    AREA_FIELDS,
    ENTRY_AREAS,
    ENTRY_BUILDINGS,
    ENTRY_FEATURE_LINE,
    ENTRY_FEATURE_POINT,
    ENTRY_FEATURE_POLYGON,
    ENTRY_STADTTEILE,
    FEATURE_MIN_ZOOM,
    SCENE_KEYS,
    adminLegend,
    adminMeasureOf,
    areaClassLabel,
    areaLegend,
    buildGreenAreaProfile,
    buildGreenFeatureProfile,
    buildBuildingProfile,
    buildingLegend,
    buildingMeasureOf,
    detailsVisible,
    featureLegend,
    formatArea,
    formatMinutes,
    formatShare,
    measureText,
    planFor,
    POI_LEGEND_ITEM,
    styleNamesFor,
    type AccessMeasure,
    type BuildingProfile,
    type CoverageMeasure,
    type GreenAreaProfile,
    type GreenFeatureProfile,
    type GreenLegend,
    type SceneKey,
    type ScenePlan,
    type ThemeId,
} from "../config/urbanStories/styles/greenSpaces";

/**
 * Scene state of the Green Spaces story: which look every map layer has, the selected building, Stadtteil, green area
 * or detailed object, the data each scene reads, and the overlays (selection, example markers) next to the catalog layers.
 *
 * @remarks
 * This store owns no catalog layer. Chapters stage the seven layers through the Urban Stories store; this store only
 * decides what each layer shows (a style swap through `setStandaloneLayerStyle`, which keeps the camera, the selection
 * and the layer order), draws its own `gs-*` overlays and reads attribute data from the existing WFS. Every number in the
 * panel comes from that data at runtime. Map changes go through one coalescing `sync()`.
 */

export { SCENE_KEYS };

export interface SelectedBuilding {
    profile: BuildingProfile;
    geometry: GeoJSON.Geometry;
}

export interface SelectedGreenArea {
    profile: GreenAreaProfile;
    geometry?: GeoJSON.Geometry;
}

type DataStatus = "idle" | "loading" | "ready" | "error";

interface RenderedFeature {
    id?: string | number;
    properties?: Record<string, unknown> | null;
    geometry: GeoJSON.Geometry;
}

/** The scenes in which the reader clicks buildings and Stadtteile. */
const HOVER_SCENES: readonly SceneKey[] = SCENE_KEYS;

const escapeHtml = (text: string): string => text.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[char] ?? char);

export const useGreenSpacesStore = defineStore("urbanStoriesGreenSpaces", () => {
    const urbanStories = useUrbanStoriesStore();
    const mapStore = useMapStore();
    const localeCode = (): string => String(i18n.global.locale.value ?? i18n.global.locale);
    const lang = (): "en" | "de" => (localeCode() === "de" ? "de" : "en");

    const storyConfig = getStoryConfig(GREEN_SPACES_STORY_KEY);
    const entryOf = (key: string): ExploreEntry | undefined => storyConfig?.explore.find((entry) => entry.key === key);

    // --- scene ------------------------------------------------------------------------------

    const running = computed(() => urbanStories.runState === "running" && urbanStories.runningStoryKey === GREEN_SPACES_STORY_KEY);
    const sceneKey = computed<SceneKey | undefined>(() => {
        const key = running.value ? urbanStories.activeChapter?.chapterKey : undefined;
        return (SCENE_KEYS as readonly string[]).includes(key ?? "") ? key as SceneKey : undefined;
    });
    const sceneNumber = computed(() => (sceneKey.value === undefined ? 0 : SCENE_KEYS.indexOf(sceneKey.value) + 1));

    // --- what the reader chose ----------------------------------------------------------------

    const compare = ref<AccessMeasure>("park");
    const theme = ref<ThemeId>("classes");
    const coverage = ref<CoverageMeasure>("coverage-recreational");
    /** Map zoom: legends show the layer that is drawn, and the coverage theme reveals the areas below the Stadtteil fill. */
    const zoom = ref(0);

    /** What every layer shows. The coverage theme reads the zoom only through a boolean, so the plan changes once per crossing. */
    const plan = computed<ScenePlan>(() => planFor(sceneKey.value, { theme: theme.value, coverage: coverage.value, compare: compare.value, zoom: zoom.value }));
    const adminMeasure = computed(() => adminMeasureOf(plan.value));
    const buildingMeasure = computed(() => buildingMeasureOf(plan.value));

    // --- data -------------------------------------------------------------------------------

    const rows = shallowRef<StadtteilRow[]>([]);
    const dataStatus = ref<DataStatus>("idle");
    const summary = computed(() => summariseStadtteile(rows.value));
    const rowOf = (id: string): StadtteilRow | undefined => rows.value.find((row) => row.id === id);
    const inventory = shallowRef<GreenInventory>();
    const parkDetail = shallowRef<ParkDetail>();

    const selection = shallowRef<SelectedBuilding>();
    const selectedAreaId = ref<string>();
    const selectedArea = computed(() => (selectedAreaId.value === undefined ? undefined : rowOf(selectedAreaId.value)));
    const selectedGreenArea = shallowRef<SelectedGreenArea>();
    const selectedFeature = shallowRef<GreenFeatureProfile>();
    const examples = shallowRef<Record<string, SelectedBuilding>>({});

    /** Late answers of an older scene are dropped. */
    let sceneToken = 0;
    /** The reader moved the map: the automatic approach flights stop. */
    let userMoved = false;
    let approachTimer: ReturnType<typeof setTimeout> | undefined;

    async function loadRows(): Promise<void> {
        if (dataStatus.value === "ready" || dataStatus.value === "loading") return;
        dataStatus.value = "loading";
        try {
            rows.value = await fetchStadtteilRows();
            dataStatus.value = "ready";
        } catch (error) {
            dataStatus.value = "error";
            logOnce("green-stadtteile", "Reading the Stadtteil attributes", error);
        }
    }

    async function loadInventory(): Promise<void> {
        if (inventory.value !== undefined) return;
        try {
            inventory.value = await fetchGreenInventory();
        } catch (error) {
            logOnce("green-inventory", "Reading the official green-area inventory", error);
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
            logOnce(`green-example:${example.id}`, `Reading building ${example.id}`, error);
            return undefined;
        }
    }

    /** The worked examples of the active scene (empty when the scene has none). */
    const sceneExamples = computed<readonly VerifiedBuilding[]>(() => {
        switch (sceneKey.value) {
            case "park-nearby-how-far": return PARK_EXAMPLES;
            case "where-can-children-play":
            case "park-vs-playground": return PLAYGROUND_EXAMPLES;
            default: return [];
        }
    });

    // --- the map ----------------------------------------------------------------------------

    type MapLike = NonNullable<typeof mapStore.map>;

    let overlays: GreenSpacesOverlays | undefined;
    let overlayMap: unknown;
    let popup: Popup | undefined;
    let listening: (() => void) | undefined;

    function ensureOverlays(): GreenSpacesOverlays | undefined {
        const map = mapStore.map;
        if (map === undefined || map === null) return undefined;
        if (overlays !== undefined && overlayMap !== map) overlays = undefined;
        if (overlays === undefined) {
            overlays = new GreenSpacesOverlays(map);
            overlayMap = map;
        }
        return overlays;
    }

    const recordOf = (runtimeId: string | undefined): LayerObjectWithAttributes | undefined => urbanStories.recordOf(runtimeId);
    function runtimeIdOf(entryKey: string): string | undefined {
        const entry = entryOf(entryKey);
        return entry === undefined ? undefined : urbanStories.runtimeIdFor(GREEN_SPACES_STORY_KEY, entry);
    }
    function layerIdsOf(entryKey: string): string[] {
        const map = mapStore.map;
        const record = recordOf(runtimeIdOf(entryKey));
        if (record === undefined || map === undefined || map === null) return [];
        return [record.id, ...(record.companionLayerIds ?? [])].filter((id) => map.getLayer(id) !== undefined);
    }

    let syncing: Promise<void> | undefined;
    let dirty = false;

    /** Swap one layer to the wanted look. The style id is the style name. */
    async function syncStyle(entryKey: string, targetId: string): Promise<void> {
        const entry = entryOf(entryKey);
        const record = recordOf(runtimeIdOf(entryKey));
        const bundle = entry === undefined ? undefined : frontendStylingFor(entry);
        if (record === undefined || bundle === undefined) return;
        if (record.activeStyleId === targetId) return;
        record.availableStyles = bundle.styles;
        try {
            await mapStore.setStandaloneLayerStyle(record.id, targetId);
        } catch (error) {
            logOnce(`green-style:${targetId}`, `Switching ${entryKey} to ${targetId}`, error);
        }
    }

    function syncPopupSuppression(): void {
        for (const entry of storyConfig?.explore ?? []) {
            const record = recordOf(runtimeIdOf(entry.key));
            if (record !== undefined && record.attributePopupSuppressed !== running.value) record.attributePopupSuppressed = running.value;
        }
    }

    const outlineGeometry = new Map<string, GeoJSON.Geometry | undefined>();
    async function geometryOf(id: string): Promise<GeoJSON.Geometry | undefined> {
        if (!outlineGeometry.has(id)) outlineGeometry.set(id, await fetchStadtteilGeometry(id).catch(() => undefined));
        return outlineGeometry.get(id);
    }

    /** The Stadtteile outlined in the active scene: the two compared ones, or the selected one. */
    function wantedOutlines(): { id: string; name: string; tone: AreaOutline["tone"] }[] {
        switch (sceneKey.value) {
            case "park-vs-playground":
                return [{ id: NIENSTEDTEN.id, name: NIENSTEDTEN.name, tone: "a" }, { id: OTHMARSCHEN.id, name: OTHMARSCHEN.name, tone: "b" }];
            case "park-nearby-how-far":
            case "where-can-children-play":
                return [{ id: NIENSTEDTEN.id, name: NIENSTEDTEN.name, tone: "focus" }];
            default:
                return selectedArea.value === undefined ? [] : [{ id: selectedArea.value.id, name: selectedArea.value.name, tone: "focus" }];
        }
    }

    let outlineKey: string | undefined;
    async function syncOutlines(bound: GreenSpacesOverlays): Promise<void> {
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

    function markers(): ExampleMarker[] {
        return sceneExamples.value.map((example, index) => ({
            center: example.center,
            label: String.fromCharCode(65 + index),
            selected: selection.value?.profile.id === example.id,
        }));
    }

    async function syncOnce(): Promise<void> {
        syncPopupSuppression();
        const bound = ensureOverlays();
        if (bound === undefined) return;
        if (sceneKey.value === undefined) {
            teardownOverlays();
            return;
        }
        bound.ensurePlaygroundIcon();
        const names = styleNamesFor(plan.value);
        await Promise.all(Object.entries(names).map(async ([entryKey, name]) => await syncStyle(entryKey, name)));
        await syncOutlines(bound);
        bound.setSelectedBuilding(selection.value === undefined ? undefined : {
            geometry: selection.value.geometry,
            height: selection.value.profile.heightM ?? 0,
        });
        // The park in focus of scene 2 is already outlined by its style; any other clicked area gets the highlight.
        const focused = sceneKey.value === "inside-the-park" && selectedGreenArea.value?.profile.id === HIRSCHPARK.areaId;
        bound.setHighlightedArea(focused ? undefined : selectedGreenArea.value?.geometry);
        bound.setMarkers(markers());
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
                            logOnce("green-sync", "Synchronising the Green Spaces map state", error);
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
        const touched = (): void => { userMoved = true; };
        track();
        map.on("click", click);
        map.on("mousemove", move);
        map.on("zoom", track);
        map.on("mousedown", touched);
        map.on("touchstart", touched);
        map.on("wheel", touched);
        map.getCanvas().addEventListener("mouseleave", leave);
        listening = () => {
            map.off("click", click);
            map.off("mousemove", move);
            map.off("zoom", track);
            map.off("mousedown", touched);
            map.off("touchstart", touched);
            map.off("wheel", touched);
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

    const featureLayerIds = (): string[] => [ENTRY_FEATURE_POINT, ENTRY_FEATURE_LINE, ENTRY_FEATURE_POLYGON].flatMap(layerIdsOf);

    type Hit =
        | { kind: "building"; feature: RenderedFeature }
        | { kind: "feature"; feature: RenderedFeature }
        | { kind: "area"; feature: RenderedFeature }
        | { kind: "stadtteil"; feature: RenderedFeature };

    /** What the pointer is over, nearest thing first: a building, a detailed object, an official green area, a Stadtteil. */
    function hitAt(event: MapMouseEvent): Hit | undefined {
        const current = plan.value;
        if (current.buildings !== "none") {
            const feature = queryAt(event, layerIdsOf(ENTRY_BUILDINGS))[0];
            if (feature !== undefined) return { kind: "building", feature };
        }
        if (detailsVisible(current, mapStore.map?.getZoom() ?? 0)) {
            const feature = queryAt(event, featureLayerIds())[0];
            if (feature !== undefined) return { kind: "feature", feature };
        }
        if (current.areas !== "none") {
            const feature = queryAt(event, layerIdsOf(ENTRY_AREAS)).find((candidate) => candidate.properties?.[AREA_FIELDS.id] !== undefined);
            if (feature !== undefined) return { kind: "area", feature };
        }
        if (current.admin !== "outline") {
            const feature = queryAt(event, layerIdsOf(ENTRY_STADTTEILE))[0];
            if (feature !== undefined) return { kind: "stadtteil", feature };
        }
        return undefined;
    }

    async function showGreenArea(profile: GreenAreaProfile, token: number): Promise<void> {
        selectedGreenArea.value = { profile };
        selectedFeature.value = undefined;
        if (profile.id === null) return;
        const detail = await fetchGreenArea(profile.id).catch(() => undefined);
        if (detail === undefined || token !== sceneToken || selectedGreenArea.value?.profile.id !== profile.id) return;
        selectedGreenArea.value = { profile: buildGreenAreaProfile(detail.properties), geometry: detail.geometry };
        void sync();
    }

    function onMapClick(event: MapMouseEvent): void {
        if (sceneKey.value === undefined) return;
        const hit = hitAt(event);
        if (hit === undefined) return;
        switch (hit.kind) {
            case "building":
                selection.value = { profile: buildBuildingProfile(hit.feature.properties), geometry: hit.feature.geometry };
                break;
            case "feature":
                selectedFeature.value = buildGreenFeatureProfile(hit.feature.properties);
                break;
            case "area":
                void showGreenArea(buildGreenAreaProfile(hit.feature.properties), sceneToken);
                break;
            default: {
                const id = hit.feature.properties?.stadtteil_id;
                if (typeof id === "string" && rowOf(id) !== undefined) selectedAreaId.value = id;
            }
        }
        void sync();
    }

    function popupHtml(hit: Hit): string | undefined {
        const props = hit.feature.properties ?? {};
        const code = lang();
        switch (hit.kind) {
            case "area": {
                const profile = buildGreenAreaProfile(props);
                const name = profile.name ?? localize(areaClassLabel(profile), code);
                return `<strong>${escapeHtml(name)}</strong><br>${escapeHtml(localize(areaClassLabel(profile), code))} · ${escapeHtml(formatArea(profile.areaM2, localeCode()))}`;
            }
            case "feature": {
                const profile = buildGreenFeatureProfile(props);
                return `<strong>${escapeHtml(profile.type ?? profile.group ?? "")}</strong><br>${escapeHtml(profile.group ?? "")}`;
            }
            case "building": {
                const measure = buildingMeasure.value;
                if (measure === undefined) return undefined;
                const profile = buildBuildingProfile(props);
                const value = measure === "park" ? profile.park : profile.playground;
                const shown = value.state === "ok" ? formatMinutes(value.minutes, localeCode()) : localize({ en: "not computable", de: "nicht berechenbar" }, code);
                return `<strong>${escapeHtml(localize(measureText(measure).label, code))}</strong><br>${escapeHtml(shown)}`;
            }
            default: {
                const measure = adminMeasure.value;
                const id = props.stadtteil_id;
                const row = typeof id === "string" ? rowOf(id) : undefined;
                if (measure === undefined || row === undefined) return undefined;
                return `<strong>${escapeHtml(row.name)}</strong><br>${escapeHtml(localize(measureText(measure).label, code))}: ${escapeHtml(adminValueText(row, measure))}`;
            }
        }
    }

    function adminValueText(row: StadtteilRow, measure: NonNullable<typeof adminMeasure.value>): string {
        switch (measure) {
            case "park": return formatMinutes(row.parkMedian, localeCode());
            case "playground": return formatMinutes(row.playgroundMedian, localeCode());
            case "coverage-recreational": return formatShare(row.coverageRecreational, localeCode());
            case "coverage-green": return formatShare(row.coverageGreen, localeCode());
            default: return formatShare(row.largeGreenShare, localeCode());
        }
    }

    function onMapMove(event: MapMouseEvent): void {
        const scene = sceneKey.value;
        const map = mapStore.map;
        if (scene === undefined || !HOVER_SCENES.includes(scene) || map === undefined || map === null) return;
        const hit = hitAt(event);
        map.getCanvas().style.cursor = hit === undefined ? "" : "pointer";
        const html = hit === undefined ? undefined : popupHtml(hit);
        if (html === undefined) {
            popup?.remove();
            return;
        }
        popup ??= new Popup({ closeButton: false, closeOnClick: false, className: "green-hover", offset: 12 });
        popup.setLngLat(event.lngLat).setHTML(html).addTo(map);
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
            logOnce("green-frame", "Framing the Green Spaces scene", error);
        }
    }

    function releasePadding(): void {
        try {
            paddedMap?.setPadding({ left: 0, right: 0, top: 0, bottom: 0 });
        } catch (error) {
            logOnce("green-padding", "Removing the Green Spaces map padding", error);
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
        flyToAdminArea(map, area.bounds, "stadtteil", { duration: reducedMotion() ? 0 : 1600 });
    }

    function flyToPark(): void {
        const map = mapStore.map;
        if (map === undefined || map === null) return;
        flyToPoint(map, PARK_CAMERA.center, { zoom: PARK_CAMERA.zoom, duration: reducedMotion() ? 0 : 1600 });
    }

    function flyToCamera(camera: OverviewCamera): void {
        const map = mapStore.map;
        if (map === undefined || map === null) return;
        frameMap(map, camera);
    }

    // --- user actions -----------------------------------------------------------------------

    function setCompare(next: AccessMeasure): void {
        compare.value = next;
        void sync();
    }

    function setTheme(next: ThemeId): void {
        theme.value = next;
        selectedFeature.value = undefined;
        // The detailed objects exist from zoom 14: bring the reader to the example park instead of showing an empty map.
        if (next === "details" && (mapStore.map?.getZoom() ?? 0) < FEATURE_MIN_ZOOM) flyToPark();
        void sync();
    }

    function setCoverage(next: CoverageMeasure): void {
        coverage.value = next;
        void sync();
    }

    function clearSelection(): void {
        selection.value = undefined;
        selectedAreaId.value = undefined;
        selectedGreenArea.value = undefined;
        selectedFeature.value = undefined;
        void sync();
    }

    /** Select an official green area by its published id: highlighted on the map and read in the panel. */
    async function selectGreenArea(areaId: string): Promise<void> {
        const token = sceneToken;
        const detail = await fetchGreenArea(areaId).catch(() => undefined);
        if (detail === undefined || token !== sceneToken) return;
        selectedGreenArea.value = { profile: buildGreenAreaProfile(detail.properties), geometry: detail.geometry };
        selectedFeature.value = undefined;
        await sync();
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

    /** Back to the whole city, with nothing selected. */
    function resetOverview(): void {
        theme.value = "classes";
        clearSelection();
        flyToCamera(EXPLORE_CAMERA);
    }

    // --- scene changes ------------------------------------------------------------------------

    /** Each scene starts from its own state: no selection or view of the previous scene survives. */
    function resetForScene(): void {
        sceneToken += 1;
        userMoved = false;
        if (approachTimer !== undefined) clearTimeout(approachTimer);
        approachTimer = undefined;
        selection.value = undefined;
        selectedAreaId.value = undefined;
        selectedGreenArea.value = undefined;
        selectedFeature.value = undefined;
        compare.value = "park";
        theme.value = "classes";
        coverage.value = "coverage-recreational";
        outlineKey = undefined;
        popup?.remove();
    }

    /**
     * Scenes 3 and 4 open at the district scale, where the Stadtteil colours carry the story. Unless the reader takes over,
     * the camera then flies into the neighbourhood and on to the first example building.
     */
    function approach(example: VerifiedBuilding, token: number): void {
        const wait = (ms: number): Promise<void> => new Promise((resolve) => { approachTimer = setTimeout(resolve, reducedMotion() ? 0 : ms); });
        void (async () => {
            await wait(2600);
            if (token !== sceneToken || userMoved) return;
            flyToArea(NIENSTEDTEN);
            await wait(3400);
            if (token !== sceneToken || userMoved) return;
            await selectExample(example, true);
        })();
    }

    async function enterScene(scene: SceneKey, token: number): Promise<void> {
        const loads = [loadRows(), ...sceneExamples.value.map(async (example) => await loadExample(example))];
        if (scene === "what-counts-as-a-park" || scene === "explore-green-hamburg") loads.push(loadInventory());
        void sync();
        if (scene === "inside-the-park") {
            const [detail] = await Promise.all([
                fetchParkDetail(HIRSCHPARK.idnr).catch((error: unknown) => { logOnce("green-park-detail", "Reading the detailed objects of the park", error); return undefined; }),
                selectGreenArea(HIRSCHPARK.areaId),
                ...loads,
            ]);
            if (token === sceneToken) parkDetail.value = detail;
            return;
        }
        await Promise.allSettled(loads);
        if (token !== sceneToken) return;
        const first = sceneExamples.value[0];
        const approachTarget = scene === "park-nearby-how-far" ? sceneExamples.value[1] : first;
        if (scene === "park-nearby-how-far" || scene === "where-can-children-play") {
            if (approachTarget !== undefined) approach(approachTarget, token);
        } else if (scene === "park-vs-playground" && first !== undefined) {
            await selectExample(first);
        }
    }

    // --- legends ------------------------------------------------------------------------------

    /** The legends of the layers that are drawn at this zoom, thematic layer first. */
    const legends = computed<GreenLegend[]>(() => {
        const current = plan.value;
        const result: GreenLegend[] = [];
        const measure = adminMeasure.value;
        const buildings = buildingMeasure.value;
        // Stadtteile below the footprint zoom, buildings above; the coverage themes have no building layer.
        if (buildings !== undefined && zoom.value >= 11.6) result.push(buildingLegend(buildings));
        else if (measure !== undefined) result.push(adminLegend(measure));
        const areas = areaLegend(current.areas);
        if (areas !== undefined) result.push(areas);
        const features = featureLegend(current.features);
        if (features !== undefined && zoom.value >= FEATURE_MIN_ZOOM - 0.5) result.push(features);
        if (current.pois !== "none") {
            result.push({ styleName: "frontend:green:pois:outline", title: { en: "Source comparison", de: "Quellenvergleich" }, items: [POI_LEGEND_ITEM], noData: [] });
        }
        return result;
    });

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

    // Only the plan decides what the map looks like: re-sync when it changes (the coverage theme reacts to the zoom).
    watch(() => JSON.stringify(plan.value), () => {
        if (sceneKey.value !== undefined) void sync();
    });

    return {
        running,
        sceneKey,
        sceneNumber,
        plan,
        adminMeasure,
        buildingMeasure,
        zoom,
        rows,
        dataStatus,
        summary,
        inventory,
        parkDetail,
        selection,
        selectedArea,
        selectedGreenArea,
        selectedFeature,
        examples,
        sceneExamples,
        compare,
        theme,
        coverage,
        legends,
        rowOf,
        sync,
        selectExample,
        selectGreenArea,
        clearSelection,
        setCompare,
        setTheme,
        setCoverage,
        resetOverview,
        flyToArea,
        flyToBuilding,
        flyToPark,
        onMapClick,
    };
});

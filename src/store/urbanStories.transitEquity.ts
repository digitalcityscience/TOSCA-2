import { defineStore } from "pinia";
import { Popup, type MapMouseEvent } from "maplibre-gl";
import { computed, ref, shallowRef, watch } from "vue";
import { sceneCameraMove } from "@helpers/geostoryScenes";
import { activateHamburgRiders, deactivateHamburgRiders, getRidersState, type RidersMode } from "@helpers/hamburgRiders/ridersApi";
import { logOnce } from "@helpers/urbanStoryLayers";
import { flyToAdminArea, flyToBounds, flyToPoint, reducedMotion, viewInsets } from "@helpers/urbanStoryCamera";
import {
    citywideOutside,
    fetchAgreementCounts,
    fetchBuilding,
    fetchCriteriaCounts,
    fetchResidentialValues,
    fetchStadtteile,
    fetchStadtteilGeometry,
    summariseDepartures,
    summariseOutsideWalk,
    type AgreementCounts,
    type DistributionSummary,
    type OutsideWalkSummary,
    type StadtteilRow,
} from "@helpers/transitEquityData";
import type { StopAreaProperties } from "@helpers/hvvOfficialData";
import { TransitEquityOverlays, OVERLAY_LAYER_IDS, type AreaOutline } from "@helpers/transitEquityOverlays";
import { useMapStore, type LayerObjectWithAttributes } from "./map";
import { useUrbanStoriesStore } from "./urbanStories";
import { frontendStylingFor, getStoryConfig, type ExploreEntry, type OverviewCamera } from "../config/urbanStories";
import { EQUITY_STORY_KEY } from "../config/urbanStories/transitEquity";
import {
    GAP_EXAMPLE,
    LANGENHORN,
    OFFICIAL_ONLY_EXAMPLE,
    OHLSDORF,
    SERVICE_HIGH,
    SERVICE_LOW,
    WALKING_ONLY_EXAMPLE,
    type VerifiedArea,
    type VerifiedBuilding,
} from "../config/urbanStories/transitEquityLocations";
import {
    ADMIN_OUTSIDE_SHARE,
    buildBuildingProfile,
    buildingStyleOptionId,
    criteriaActive,
    ENTRY_BUILDINGS,
    ENTRY_STADTTEILE,
    ENTRY_UNITS,
    NO_CRITERIA,
    resolveEquityStyling,
    type BuildingProfile,
    type BuildingView,
    type Criteria,
} from "../config/urbanStories/styles/transitEquity";

/**
 * Scene state of Public Transport Equity: the data each scene reads, the selection, the user's criteria, and the
 * overlays (official stops and catchments, selection, area outlines) next to the catalog layers.
 *
 * @remarks
 * This store owns no catalog layer. Chapters stage the Stadtteil, statistical-area and building layers through the
 * Urban Stories store; this store only decides which view of the building layer is active (a style swap through
 * `setStandaloneLayerStyle`), draws its own `eq-*` overlays and reads attribute data from the existing WFS. All
 * numbers shown in the panel come from that data at runtime. Map changes go through one coalescing `sync()`.
 */

export const EQUITY_CONSUMER = "transit-equity";

export const SCENE_KEYS = [
    "who-is-covered", "where-are-the-gaps", "stop-is-not-service", "coverage-vs-walking", "averages-hide-differences", "explore-the-gaps",
] as const;
export type SceneKey = typeof SCENE_KEYS[number];

/** Starting criteria of the last scene: housing buildings outside every official catchment. */
export const DEFAULT_CRITERIA: Criteria = { ...NO_CRITERIA, coverage: "outside" };

const VIEW_OF_SCENE: Record<SceneKey, BuildingView> = {
    "who-is-covered": "coverage",
    "where-are-the-gaps": "coverage",
    "stop-is-not-service": "departures",
    "coverage-vs-walking": "agreement",
    "averages-hide-differences": "departures",
    "explore-the-gaps": "criteria",
};

const STOPS_IN_SCENE: readonly SceneKey[] = ["where-are-the-gaps", "stop-is-not-service", "coverage-vs-walking", "explore-the-gaps"];
const AREA_CLICK_SCENES: readonly SceneKey[] = ["who-is-covered", "explore-the-gaps"];
const HOVER_SCENES: readonly SceneKey[] = ["who-is-covered", "explore-the-gaps"];

export interface SelectedBuilding {
    profile: BuildingProfile;
    geometry: GeoJSON.Geometry;
}

export interface SelectedArea {
    kind: "stadtteil" | "unit";
    id: string;
    name: string;
    residential: number | null;
    outside: number | null;
    outsideShare: number | null;
}

export interface AreaSummary {
    area: VerifiedArea;
    summary: DistributionSummary;
}

type DataStatus = "idle" | "loading" | "ready" | "error";

interface RenderedFeature {
    id?: string | number;
    properties?: Record<string, unknown> | null;
    geometry: GeoJSON.Geometry;
    layer?: { id: string };
}

export const useTransitEquityStore = defineStore("urbanStoriesTransitEquity", () => {
    const urbanStories = useUrbanStoriesStore();
    const mapStore = useMapStore();

    const storyConfig = getStoryConfig(EQUITY_STORY_KEY);
    const entryOf = (key: string): ExploreEntry | undefined => storyConfig?.explore.find((entry) => entry.key === key);

    // --- scene ------------------------------------------------------------------------------

    const running = computed(() => urbanStories.runState === "running" && urbanStories.runningStoryKey === EQUITY_STORY_KEY);
    const sceneKey = computed<SceneKey | undefined>(() => {
        const key = running.value ? urbanStories.activeChapter?.chapterKey : undefined;
        return (SCENE_KEYS as readonly string[]).includes(key ?? "") ? key as SceneKey : undefined;
    });
    const sceneNumber = computed(() => (sceneKey.value === undefined ? 0 : SCENE_KEYS.indexOf(sceneKey.value) + 1));

    // --- data -------------------------------------------------------------------------------

    const stadtteile = shallowRef<StadtteilRow[]>([]);
    const dataStatus = ref<DataStatus>("idle");
    const citywide = computed(() => citywideOutside(stadtteile.value));
    const rowOf = (id: string): StadtteilRow | undefined => stadtteile.value.find((row) => row.id === id);

    const selectedArea = ref<SelectedArea>();
    const selection = shallowRef<SelectedBuilding>();
    const selectedStop = ref<StopAreaProperties>();
    const examples = shallowRef<Record<string, SelectedBuilding>>({});
    const gapStats = ref<OutsideWalkSummary>();
    const agreement = ref<AgreementCounts>();
    const areaAgreement = ref<AgreementCounts>();
    const comparison = shallowRef<{ first: AreaSummary; second: AreaSummary }>();
    const criteria = ref<Criteria>({ ...DEFAULT_CRITERIA });
    const criteriaCounts = ref<{ matching: number; total: number; city: { matching: number; total: number } }>();
    const countsStatus = ref<DataStatus>("idle");
    const ridersOn = ref(false);
    const ridersModes = ref<RidersMode[]>(["u-bahn", "s-bahn"]);
    const ridersState = computed(() => getRidersState());

    /** Late answers of an older scene or older criteria are dropped. */
    let sceneToken = 0;
    let countsToken = 0;

    async function loadStadtteile(): Promise<void> {
        if (dataStatus.value === "ready" || dataStatus.value === "loading") return;
        dataStatus.value = "loading";
        try {
            stadtteile.value = await fetchStadtteile();
            dataStatus.value = "ready";
        } catch (error) {
            dataStatus.value = "error";
            logOnce("equity-stadtteile", "Reading the Stadtteil attributes", error);
        }
    }

    async function loadExample(example: VerifiedBuilding): Promise<SelectedBuilding | undefined> {
        const cachedExample = examples.value[example.id];
        if (cachedExample !== undefined) return cachedExample;
        try {
            const detail = await fetchBuilding(example.id);
            if (detail === undefined) return undefined;
            const loaded: SelectedBuilding = { profile: buildBuildingProfile(detail.properties), geometry: detail.geometry };
            examples.value = { ...examples.value, [example.id]: loaded };
            return loaded;
        } catch (error) {
            logOnce(`equity-example:${example.id}`, `Reading building ${example.id}`, error);
            return undefined;
        }
    }

    async function loadAreaSummary(area: VerifiedArea): Promise<AreaSummary | undefined> {
        try {
            return { area, summary: summariseDepartures(await fetchResidentialValues(area.id)) };
        } catch (error) {
            logOnce(`equity-values:${area.id}`, `Reading the housing buildings of ${area.name}`, error);
            return undefined;
        }
    }

    // --- the map ----------------------------------------------------------------------------

    let overlays: TransitEquityOverlays | undefined;
    let overlayMap: unknown;
    let popup: Popup | undefined;
    let listening: ReturnType<typeof listenOnMap> | undefined;

    function ensureOverlays(): TransitEquityOverlays | undefined {
        const map = mapStore.map;
        if (map === undefined || map === null) return undefined;
        if (overlays !== undefined && overlayMap !== map) overlays = undefined;
        if (overlays === undefined) {
            overlays = new TransitEquityOverlays(map);
            overlayMap = map;
        }
        return overlays;
    }

    const recordOf = (runtimeId: string | undefined): LayerObjectWithAttributes | undefined => urbanStories.recordOf(runtimeId);
    function runtimeIdOf(entryKey: string): string | undefined {
        const entry = entryOf(entryKey);
        return entry === undefined ? undefined : urbanStories.runtimeIdFor(EQUITY_STORY_KEY, entry);
    }
    function layerIdsOf(entryKey: string): string[] {
        const map = mapStore.map;
        const record = recordOf(runtimeIdOf(entryKey));
        if (record === undefined || map === undefined || map === null) return [];
        return [record.id, ...(record.companionLayerIds ?? [])].filter((id) => map.getLayer(id) !== undefined);
    }

    const activeView = computed<BuildingView | undefined>(() => (sceneKey.value === undefined ? undefined : VIEW_OF_SCENE[sceneKey.value]));

    let syncing: Promise<void> | undefined;
    let dirty = false;

    async function syncBuildingStyle(): Promise<void> {
        const entry = entryOf(ENTRY_BUILDINGS);
        const record = recordOf(runtimeIdOf(ENTRY_BUILDINGS));
        const view = activeView.value;
        if (entry === undefined || record === undefined || view === undefined) return;
        const bundle = resolveEquityStyling(ENTRY_BUILDINGS, criteria.value) ?? frontendStylingFor(entry);
        if (bundle === undefined) return;
        const targetId = buildingStyleOptionId(view, criteria.value);
        if (record.activeStyleId === targetId) return;
        // The criteria live inside the colour expression of the style, so a swap carries them.
        record.availableStyles = bundle.styles;
        try {
            await mapStore.setStandaloneLayerStyle(record.id, targetId);
        } catch (error) {
            logOnce(`equity-style:${targetId}`, `Switching the building view to ${targetId}`, error);
        }
    }

    function syncPopupSuppression(): void {
        for (const key of [ENTRY_BUILDINGS, ENTRY_STADTTEILE, ENTRY_UNITS]) {
            const record = recordOf(runtimeIdOf(key));
            if (record !== undefined && record.attributePopupSuppressed !== running.value) record.attributePopupSuppressed = running.value;
        }
    }

    /** Statistical areas fill the district scale: above the Stadtteile, directly below the footprints. */
    function keepUnitsBelowBuildings(): void {
        const unitsId = runtimeIdOf(ENTRY_UNITS);
        const buildingsId = runtimeIdOf(ENTRY_BUILDINGS);
        if (unitsId === undefined || recordOf(unitsId) === undefined) return;
        try {
            const visible = mapStore.getReorderableVisibleLayersTopToBottom();
            if (!visible.some((layer) => layer.id === unitsId)) return;
            const others = visible.filter((layer) => layer.id !== unitsId);
            const below = others.findIndex((layer) => layer.id === buildingsId);
            const target = below >= 0 ? below + 1 : others.length;
            if (visible.findIndex((layer) => layer.id === unitsId) !== target) mapStore.reorderVisibleMapLayer(unitsId, target);
        } catch (error) {
            logOnce("equity-units-order", "Ordering the statistical-area layer below the buildings", error);
        }
    }

    const areaOutlines = shallowRef<AreaOutline[]>([]);

    async function outlinesFor(areas: { id: string; tone: AreaOutline["tone"] }[]): Promise<AreaOutline[]> {
        const outlines: AreaOutline[] = [];
        for (const area of areas) {
            const geometry = await fetchStadtteilGeometry(area.id).catch(() => undefined);
            if (geometry !== undefined) outlines.push({ geometry, tone: area.tone });
        }
        return outlines;
    }

    function wantedOutlineAreas(): { id: string; tone: AreaOutline["tone"] }[] {
        switch (sceneKey.value) {
            case "where-are-the-gaps":
            case "stop-is-not-service":
                return [{ id: LANGENHORN.id, tone: "focus" }];
            case "averages-hide-differences":
                return [{ id: LANGENHORN.id, tone: "focus" }, { id: OHLSDORF.id, tone: "focus" }];
            case "who-is-covered":
                return selectedArea.value?.kind === "stadtteil" ? [{ id: selectedArea.value.id, tone: "focus" }] : [];
            case "explore-the-gaps":
                return criteria.value.area === null ? [] : [{ id: criteria.value.area, tone: "focus" }];
            default:
                return [];
        }
    }

    let outlineKey: string | undefined;
    async function syncOutlines(): Promise<void> {
        const wanted = wantedOutlineAreas();
        const key = wanted.map((area) => `${area.id}:${area.tone}`).join("|");
        if (key === outlineKey) return;
        outlineKey = key;
        const outlines = await outlinesFor(wanted);
        if (key !== outlineKey) return;
        areaOutlines.value = outlines;
        ensureOverlays()?.setAreaOutlines(outlines);
    }

    async function syncOnce(): Promise<void> {
        syncPopupSuppression();
        const bound = ensureOverlays();
        if (sceneKey.value === undefined || bound === undefined) {
            teardownOverlays();
            return;
        }
        await syncBuildingStyle();
        keepUnitsBelowBuildings();
        const wantStops = STOPS_IN_SCENE.includes(sceneKey.value);
        await Promise.allSettled([
            bound.setStops(wantStops),
            bound.setCatchments(wantStops),
            syncOutlines(),
        ]);
        bound.setSelectedBuilding(selection.value === undefined ? undefined : {
            geometry: selection.value.geometry,
            height: selection.value.profile.heightM ?? 0,
        });
        bound.raise(layerIdsOf(ENTRY_BUILDINGS)[0]);
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
                            logOnce("equity-sync", "Synchronising the Public Transport Equity map state", error);
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
        areaOutlines.value = [];
    }

    // --- pointer handling ---------------------------------------------------------------------

    type MapLike = NonNullable<typeof mapStore.map>;

    function listenOnMap(map: MapLike) {
        const click = (event: MapMouseEvent): void => onMapClick(event);
        const move = (event: MapMouseEvent): void => onMapMove(event);
        const leave = (): void => { popup?.remove(); };
        map.on("click", click);
        map.on("mousemove", move);
        map.getCanvas().addEventListener("mouseleave", leave);
        return () => {
            map.off("click", click);
            map.off("mousemove", move);
            map.getCanvas().removeEventListener("mouseleave", leave);
        };
    }

    function attachListeners(): void {
        const map = mapStore.map;
        if (listening !== undefined || map === undefined || map === null) return;
        listening = listenOnMap(map);
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

    const adminLayerIds = (): string[] => [...layerIdsOf(ENTRY_UNITS), ...layerIdsOf(ENTRY_STADTTEILE)];

    function areaFromTile(feature: RenderedFeature): SelectedArea | undefined {
        const props = feature.properties ?? {};
        const share = typeof props[ADMIN_OUTSIDE_SHARE] === "number" ? props[ADMIN_OUTSIDE_SHARE] as number : null;
        const count = (key: string): number | null => (typeof props[key] === "number" ? props[key] as number : null);
        if (typeof props.stadtteil_id === "string" || typeof props.stadtteil_name === "string") {
            const id = typeof props.stadtteil_id === "string" ? props.stadtteil_id : "";
            const row = rowOf(id);
            return {
                kind: "stadtteil",
                id,
                name: row?.name ?? (typeof props.stadtteil_name === "string" ? props.stadtteil_name : id),
                residential: row?.residentialCount ?? count("ptr_resid_n"),
                outside: row?.outsideCount ?? count("ptr_resid_uncovered_n"),
                outsideShare: row?.outsideShare ?? share,
            };
        }
        if (typeof props.statistical_unit_id === "string") {
            return { kind: "unit", id: props.statistical_unit_id, name: props.statistical_unit_id, residential: count("ptr_resid_n"), outside: count("ptr_resid_uncovered_n"), outsideShare: share };
        }
        return undefined;
    }

    function onMapClick(event: MapMouseEvent): void {
        const scene = sceneKey.value;
        const map = mapStore.map;
        if (scene === undefined || map === undefined || map === null) return;
        const stop = queryAt(event, [OVERLAY_LAYER_IDS.stopPoint])[0];
        if (stop !== undefined) {
            selectedStop.value = { ...(stop.properties as unknown as StopAreaProperties) };
            return;
        }
        const cluster = queryAt(event, [OVERLAY_LAYER_IDS.stopCluster])[0];
        if (cluster !== undefined) {
            map.easeTo({ center: event.lngLat, zoom: Math.min(map.getZoom() + 2, 16) });
            return;
        }
        const building = queryAt(event, layerIdsOf(ENTRY_BUILDINGS))[0];
        if (building !== undefined) {
            selectBuildingFeature(building);
            return;
        }
        if (AREA_CLICK_SCENES.includes(scene)) {
            const area = adminLayerIds().length === 0 ? undefined : queryAt(event, adminLayerIds()).map(areaFromTile).find((candidate) => candidate !== undefined);
            if (area !== undefined) selectArea(area);
        }
    }

    function onMapMove(event: MapMouseEvent): void {
        const scene = sceneKey.value;
        const map = mapStore.map;
        if (scene === undefined || map === undefined || map === null) return;
        const overStop = queryAt(event, [OVERLAY_LAYER_IDS.stopPoint, OVERLAY_LAYER_IDS.stopCluster]).length > 0;
        const overBuilding = queryAt(event, layerIdsOf(ENTRY_BUILDINGS)).length > 0;
        const area = HOVER_SCENES.includes(scene) && !overBuilding && !overStop
            ? queryAt(event, adminLayerIds()).map(areaFromTile).find((candidate) => candidate !== undefined)
            : undefined;
        map.getCanvas().style.cursor = overStop || overBuilding || area !== undefined ? "pointer" : "";
        if (area === undefined) {
            popup?.remove();
            return;
        }
        popup ??= new Popup({ closeButton: false, closeOnClick: false, className: "equity-hover", offset: 12 });
        const share = area.outsideShare === null ? "–" : `${(area.outsideShare * 100).toFixed(1)} %`;
        popup.setLngLat(event.lngLat).setHTML(`<strong>${escapeHtml(area.name)}</strong><br>${share}`).addTo(map);
    }

    function escapeHtml(text: string): string {
        return text.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[char] ?? char);
    }

    // --- user actions -----------------------------------------------------------------------

    function selectBuildingFeature(feature: RenderedFeature): void {
        selection.value = { profile: buildBuildingProfile(feature.properties), geometry: feature.geometry };
        void sync();
    }

    function clearSelection(): void {
        selection.value = undefined;
        selectedStop.value = undefined;
        void sync();
    }

    function selectArea(area: SelectedArea | undefined): void {
        selectedArea.value = area;
        void sync();
    }

    /** Show a verified example building: highlight it on the map and read it in the panel. */
    async function selectExample(example: VerifiedBuilding): Promise<void> {
        const token = sceneToken;
        const loaded = await loadExample(example);
        if (loaded === undefined || token !== sceneToken) return;
        selection.value = loaded;
        await sync();
    }

    function flyToBoundsInView(bounds: [number, number, number, number], options: { maxZoom?: number } = {}): void {
        const map = mapStore.map;
        if (map === undefined || map === null) return;
        flyToBounds(map, bounds, { maxZoom: options.maxZoom ?? 15 });
    }

    function flyToBuilding(example: VerifiedBuilding, zoom = 16.5): void {
        const map = mapStore.map;
        if (map === undefined || map === null) return;
        flyToPoint(map, example.center, { zoom, duration: reducedMotion() ? 0 : 1200 });
    }

    function flyToArea(area: VerifiedArea): void {
        const map = mapStore.map;
        if (map === undefined || map === null) return;
        flyToAdminArea(map, area.bounds, "stadtteil");
    }

    function setCriteria(patch: Partial<Criteria>): void {
        criteria.value = { ...criteria.value, ...patch };
        void sync();
        void refreshCounts();
    }

    function resetCriteria(): void {
        criteria.value = { ...DEFAULT_CRITERIA };
        selection.value = undefined;
        selectedStop.value = undefined;
        selectedArea.value = undefined;
        void sync();
        void refreshCounts();
    }

    function setAreaFilter(id: string | null): void {
        setCriteria({ area: id });
        const row = id === null ? undefined : rowOf(id);
        if (row !== undefined) flyToArea(row);
    }

    async function refreshCounts(): Promise<void> {
        if (sceneKey.value !== "explore-the-gaps") return;
        const token = ++countsToken;
        countsStatus.value = "loading";
        try {
            const scope = await fetchCriteriaCounts(criteria.value);
            const city = criteria.value.area === null ? scope : await fetchCriteriaCounts({ ...criteria.value, area: null });
            if (token !== countsToken) return;
            criteriaCounts.value = { ...scope, city };
            countsStatus.value = "ready";
        } catch (error) {
            if (token !== countsToken) return;
            countsStatus.value = "error";
            logOnce("equity-counts", "Counting the buildings that match the criteria", error);
        }
    }

    // --- HamburgRiders (optional context in scene 3) -------------------------------------------

    function applyRiders(): void {
        if (ridersOn.value && sceneKey.value === "stop-is-not-service" && ridersModes.value.length > 0) {
            activateHamburgRiders({ consumer: EQUITY_CONSUMER, network: [...ridersModes.value], stops: [...ridersModes.value] });
        } else {
            deactivateHamburgRiders(EQUITY_CONSUMER);
        }
    }

    function setRidersOn(on: boolean): void {
        ridersOn.value = on;
        applyRiders();
    }

    function toggleRidersMode(mode: RidersMode): void {
        ridersModes.value = ridersModes.value.includes(mode) ? ridersModes.value.filter((item) => item !== mode) : [...ridersModes.value, mode];
        applyRiders();
    }

    // --- camera framing -------------------------------------------------------------------------

    /**
     * TOSCA's sidebars cover the map instead of shrinking it. While the story runs, the map is padded by the open
     * left sidebar so every scene camera centres on the part of the map the reader can see; the padding is removed
     * when the run ends.
     */
    let paddedMap: MapLike | undefined;

    function frameScene(): void {
        const map = mapStore.map;
        const index = sceneKey.value === undefined ? -1 : SCENE_KEYS.indexOf(sceneKey.value);
        const camera = storyConfig?.chapters[index]?.camera;
        if (map === undefined || map === null || camera === undefined) return;
        try {
            frameMap(map, camera);
        } catch (error) {
            logOnce("equity-frame", "Framing the Public Transport Equity scene", error);
        }
    }

    function frameMap(map: MapLike, camera: OverviewCamera): void {
        const padding = viewInsets(map);
        map.setPadding(padding);
        paddedMap = map;
        const reduced = reducedMotion();
        const move = sceneCameraMove({
            camera: { center: camera.center, zoom: camera.zoom, bearing: camera.bearing ?? 0, pitch: camera.pitch ?? 0, bounds: null },
            transition: { type: "fly", duration_ms: 1500 },
            layers: [],
        }, { reducedMotion: reduced });
        if (move === undefined || move.method === "fitBounds") return;
        map[move.method]({ ...move.options, padding } as never);
    }

    function releasePadding(): void {
        try {
            paddedMap?.setPadding({ left: 0, right: 0, top: 0, bottom: 0 });
        } catch (error) {
            logOnce("equity-padding", "Removing the Public Transport Equity map padding", error);
        }
        paddedMap = undefined;
    }

    // --- scene changes ------------------------------------------------------------------------

    /** Each scene starts from its own state: no selection, criteria or overlay of the previous scene survives. */
    function resetForScene(): void {
        sceneToken += 1;
        selection.value = undefined;
        selectedStop.value = undefined;
        selectedArea.value = undefined;
        criteria.value = { ...DEFAULT_CRITERIA };
        criteriaCounts.value = undefined;
        ridersOn.value = false;
        outlineKey = undefined;
        popup?.remove();
    }

    async function enterScene(scene: SceneKey, token: number): Promise<void> {
        await loadStadtteile();
        if (token !== sceneToken) return;
        const tasks: Promise<unknown>[] = [];
        if (scene === "where-are-the-gaps") {
            tasks.push(loadExample(GAP_EXAMPLE), fetchResidentialValues(LANGENHORN.id).then((values) => {
                if (token === sceneToken) gapStats.value = summariseOutsideWalk(values);
            }));
        }
        if (scene === "stop-is-not-service") tasks.push(loadExample(SERVICE_HIGH), loadExample(SERVICE_LOW));
        if (scene === "coverage-vs-walking") {
            tasks.push(
                loadExample(OFFICIAL_ONLY_EXAMPLE),
                loadExample(WALKING_ONLY_EXAMPLE),
                fetchAgreementCounts().then((counts) => { if (token === sceneToken) agreement.value = counts; }),
                fetchAgreementCounts(LANGENHORN.id).then((counts) => { if (token === sceneToken) areaAgreement.value = counts; }),
            );
        }
        if (scene === "averages-hide-differences") {
            tasks.push(Promise.all([loadAreaSummary(LANGENHORN), loadAreaSummary(OHLSDORF)]).then(([first, second]) => {
                if (token === sceneToken && first !== undefined && second !== undefined) comparison.value = { first, second };
            }));
        }
        if (scene === "explore-the-gaps") tasks.push(refreshCounts());
        await Promise.allSettled(tasks);
        if (token !== sceneToken) return;
        if (scene === "where-are-the-gaps") await selectExample(GAP_EXAMPLE);
        if (scene === "coverage-vs-walking") await selectExample(OFFICIAL_ONLY_EXAMPLE);
    }

    watch(() => [running.value, sceneKey.value] as const, ([isRunning, scene]) => {
        resetForScene();
        applyRiders();
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

    return {
        running,
        sceneKey,
        sceneNumber,
        stadtteile,
        dataStatus,
        citywide,
        selectedArea,
        selection,
        selectedStop,
        examples,
        gapStats,
        agreement,
        areaAgreement,
        comparison,
        criteria,
        criteriaCounts,
        countsStatus,
        ridersOn,
        ridersModes,
        ridersState,
        activeView,
        sync,
        selectExample,
        clearSelection,
        selectArea,
        flyToArea,
        flyToBuilding,
        flyToBounds: flyToBoundsInView,
        setCriteria,
        resetCriteria,
        setAreaFilter,
        setRidersOn,
        toggleRidersMode,
        onMapClick,
        rowOf,
        criteriaActive: computed(() => criteriaActive(criteria.value)),
    };
});

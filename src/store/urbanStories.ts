import { acceptHMRUpdate, defineStore } from "pinia";
import { computed, ref, shallowRef, watch } from "vue";
import { addCatalogVectorLayer, type LayerStylingBundle } from "@helpers/catalogLayerLoader";
import { drawnSceneLayers, sceneCameraMove } from "@helpers/geostoryScenes";
import { matchChapters, splitStoryIntoChapters } from "@helpers/storyChapters";
import {
    activeMetricKey,
    cachedEntryProbe,
    catalogLayerKey,
    logOnce,
    metricStyleOptionId,
    probeEntry,
    resetUrbanStoryProbes,
    styleLacksZoomFloor,
    withZoomFloor,
    type EntryReadiness,
} from "@helpers/urbanStoryLayers";
import { reportDeveloperError } from "@helpers/userFacingError";
import { fetchBackendJson } from "./backend";
import { buildStoryDetailUrl, type GeoStoryDetail } from "./geostory";
import { useGeostorySceneStore } from "./geostoryScenes";
import { useMapStore, type LayerObjectWithAttributes } from "./map";
import {
    frontendStylingFor,
    getStoryConfig,
    isFrontendStyled,
    URBAN_STORIES,
    type ExploreEntry,
    type OverviewCamera,
    type StoryChapter,
    type UrbanStoryConfig,
    type UrbanStoryKey,
} from "../config/urbanStories";

export type RunState = "idle" | "loading" | "running" | "error";

/**
 * Why a run is not playing. `not-configured` = unknown story key.
 * `unpublished` / `fetch-failed` only occur when a story opts into a backend GeoStory (`geostory.id`).
 */
export type RunIssue = "not-configured" | "unpublished" | "fetch-failed" | "empty" | "map-not-ready";

/** `chapters`: frontend-defined chapters (default). `geostory`: an optional published backend GeoStory. */
export type RunMode = "chapters" | "geostory";

export type StartStoryResult =
    | { status: "started" }
    | { status: "superseded" }
    | { status: "failed"; issue: RunIssue };

/** Where the camera goes when a run ends. Interruptions never move it. */
export type RunExitCamera = "previous" | "overview" | "none";

export interface PrioritisedEntries {
    /** The active chapter when a run is playing and the chapter is configured. */
    chapter?: StoryChapter;
    related: ExploreEntry[];
    others: ExploreEntry[];
}

interface RunSnapshot {
    camera?: OverviewCamera;
    /** `runtimeId → visible` of every tracked layer when focus mode hid them. Only while focus is on. */
    visibility?: Record<string, boolean>;
}

/** 404/403 from the stories API: the story does not exist for this viewer, e.g. it is not published. */
const HIDDEN_STORY_ERROR = /\((401|403|404) /;

const CHAPTER_FLY_MS = 1500;

function prefersReducedMotion(): boolean {
    return typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export type AddEntryResult =
    | { status: "added" | "exists"; runtimeId: string }
    | { status: "busy" | "unknown-entry" | "map-not-ready" | "tiles-unavailable" | "temporarily-unavailable" | "error" };

export type ApplyMetricResult =
    | { status: "applied" | "unchanged"; runtimeId: string }
    | { status: "metric-unavailable" | "unknown-entry" | "error" }
    | Exclude<AddEntryResult, { status: "exists" }>;

export interface TrackedLayer {
    runtimeId: string;
    storyKey: UrbanStoryKey;
    entry: ExploreEntry;
    record: LayerObjectWithAttributes;
}

function findEntry(storyKey: UrbanStoryKey, entryKey: string): ExploreEntry | undefined {
    return getStoryConfig(storyKey)?.explore.find((entry) => entry.key === entryKey);
}

/**
 * Session state of the Urban Stories panel.
 *
 * @remarks
 * The panel only keeps ids and UI selection. Layer state (visibility, opacity, style,
 * filters) stays in `mapStore`; scene playback stays in `geostorySceneStore`.
 * The route (`/urban-stories/:storyKey?`) is the source of truth for the selected story:
 * the sidebar pushes the route and calls `selectStory` when the route changes, so deep
 * links and browser history behave the same as a click.
 *
 * Explore layers are ordinary `mapStore.layersOnMap` records. `addedByStory` maps
 * `storyKey → entryKey → runtimeId` and nothing else; a layer added from one story is
 * recognised from every other story that lists the same catalog layer.
 */
export const useUrbanStoriesStore = defineStore("urbanStories", () => {
    const mapStore = useMapStore();
    const activeStoryKey = ref<UrbanStoryKey>();
    /** Runtime map layer ids added from each story's Explore section, by entry key (UST-04). */
    const addedByStory = ref<Partial<Record<UrbanStoryKey, Record<string, string>>>>({});
    /** Bumped on every story change so late async results for an older story can be ignored. */
    const generation = ref(0);
    /** Transient per-catalog-layer state of an add in progress or a failed add. */
    const layerStatus = ref<Record<string, "adding" | "error">>({});
    /** Latest probe result per `storyKey/entryKey` (UST-05). */
    const readiness = ref<Record<string, EntryReadiness>>({});
    /** Runtime ids whose vector tiles reported a MapLibre `error` event (decision F1: no fallback). */
    const tileErrorIds = ref<Record<string, true>>({});

    const sceneStore = useGeostorySceneStore();
    // --- run state (UST-06/08). The scene engine owns scenes; this store owns only the run's bookkeeping.
    const runState = ref<RunState>("idle");
    const runningStoryKey = ref<UrbanStoryKey>();
    const runIssue = ref<RunIssue>();
    const runDetail = shallowRef<GeoStoryDetail>();
    const runMode = ref<RunMode>("chapters");
    /** Active chapter of a `chapters` run. A `geostory` run follows the scene engine instead. */
    const chapterIndex = ref(0);
    /** `workspace:layer` of scene layers whose catalog details failed to load (one entry per layer). */
    const runLayerWarnings = ref<string[]>([]);
    /** Focus mode (D2): hide tracked Explore layers while a story plays. Off by default. */
    const focusEnabled = ref(false);
    const runSnapshot = shallowRef<RunSnapshot>();
    /** Bumped whenever a run starts or ends, so late results of an older run are dropped. */
    const runGeneration = ref(0);
    /** Runtime ids a chapter run added or un-hid; only these may be hidden again by a later chapter. */
    const revealedByRun = new Set<string>();
    /** True while the scene store holds a story this store opened (never touch the reader's). */
    let sceneOwned = false;

    const activeStory = computed<UrbanStoryConfig | undefined>(() => (
        activeStoryKey.value === undefined ? undefined : getStoryConfig(activeStoryKey.value)
    ));

    function selectStory(key: UrbanStoryKey | undefined): void {
        if (key === activeStoryKey.value) return;
        activeStoryKey.value = key;
        generation.value += 1;
        // Switching stories keeps layer records and the camera, but hides unrelated story overlays.
        if (runState.value !== "idle") void endRun({ camera: "none" });
        const config = key === undefined ? undefined : getStoryConfig(key);
        if (config !== undefined) hideUnrelatedStoryLayers(config);
    }

    // --- tracked layers -------------------------------------------------------------------

    function recordOf(runtimeId: string | undefined): LayerObjectWithAttributes | undefined {
        return runtimeId === undefined
            ? undefined
            : mapStore.layersOnMap.find((layer) => layer.id === runtimeId);
    }

    /** Tracked layers that still exist on the map, one per runtime id. */
    const trackedLayers = computed<TrackedLayer[]>(() => {
        const seen = new Set<string>();
        const tracked: TrackedLayer[] = [];
        for (const story of URBAN_STORIES) {
            for (const [entryKey, runtimeId] of Object.entries(addedByStory.value[story.key] ?? {})) {
                const record = recordOf(runtimeId);
                const entry = findEntry(story.key, entryKey);
                if (record === undefined || entry === undefined || seen.has(runtimeId)) continue;
                seen.add(runtimeId);
                tracked.push({ runtimeId, storyKey: story.key, entry, record });
            }
        }
        return tracked;
    });

    /**
     * The runtime id showing this entry's catalog layer, from any story.
     * One catalog layer is never added twice (same `provider:workspace:layerName`).
     */
    function runtimeIdFor(storyKey: UrbanStoryKey, entry: ExploreEntry): string | undefined {
        const own = addedByStory.value[storyKey]?.[entry.key];
        if (recordOf(own) !== undefined) return own;
        const key = catalogLayerKey(entry.layer);
        // A layer with frontend-owned styling and one with a catalog style are different layers on the map,
        // so neither is ever handed out for the other (the other stories keep their GeoServer styles).
        const frontend = isFrontendStyled(entry);
        return trackedLayers.value.find((tracked) => (
            catalogLayerKey(tracked.entry.layer) === key && isFrontendStyled(tracked.entry) === frontend
            && (!frontend || tracked.entry.key === entry.key)
        ))?.runtimeId;
    }

    function pruneStale(): void {
        const live = new Set(mapStore.layersOnMap.map((layer) => layer.id));
        let changed = false;
        const next: typeof addedByStory.value = {};
        for (const [storyKey, entries] of Object.entries(addedByStory.value) as Array<[UrbanStoryKey, Record<string, string>]>) {
            const kept = Object.fromEntries(Object.entries(entries).filter(([, runtimeId]) => live.has(runtimeId)));
            if (Object.keys(kept).length !== Object.keys(entries).length) changed = true;
            if (Object.keys(kept).length > 0) next[storyKey] = kept;
        }
        if (changed) addedByStory.value = next;
        const staleErrors = Object.keys(tileErrorIds.value).filter((runtimeId) => !live.has(runtimeId));
        if (staleErrors.length > 0) {
            const remaining = { ...tileErrorIds.value };
            staleErrors.forEach((runtimeId) => delete remaining[runtimeId]);
            tileErrorIds.value = remaining;
        }
    }

    // A layer deleted from the Layers sidebar (or by a map reset) reverts its entries to "Add as layer".
    watch(() => mapStore.layersOnMap.map((layer) => layer.id).join("|"), pruneStale);

    // --- tile errors ----------------------------------------------------------------------

    function onMapError(event: { sourceId?: string }): void {
        const runtimeId = event.sourceId;
        if (runtimeId === undefined || tileErrorIds.value[runtimeId] === true) return;
        const tracked = trackedLayers.value.find((candidate) => (
            candidate.runtimeId === runtimeId || candidate.record.source === runtimeId
        ));
        if (tracked === undefined) return;
        tileErrorIds.value = { ...tileErrorIds.value, [tracked.runtimeId]: true };
        logOnce(`tiles:${tracked.runtimeId}`, `Vector tiles failed for ${tracked.entry.layer.workspace}:${tracked.entry.layer.layerName}`);
    }

    watch(() => mapStore.map, (map, previous) => {
        (previous as { off?: (type: string, listener: unknown) => void } | undefined)?.off?.("error", onMapError);
        (map as { on?: (type: string, listener: unknown) => void } | undefined)?.on?.("error", onMapError);
    }, { immediate: true });

    // --- readiness ------------------------------------------------------------------------

    const readinessKey = (storyKey: UrbanStoryKey, entryKey: string): string => `${storyKey}/${entryKey}`;

    function tilesFailedFor(storyKey: UrbanStoryKey, entry: ExploreEntry): boolean {
        const runtimeId = runtimeIdFor(storyKey, entry);
        return runtimeId !== undefined && tileErrorIds.value[runtimeId] === true;
    }

    /** Stored probe result, with a tile error on the added layer taking precedence. */
    function readinessOf(storyKey: UrbanStoryKey, entry: ExploreEntry): EntryReadiness | undefined {
        const stored = readiness.value[readinessKey(storyKey, entry.key)];
        if (!tilesFailedFor(storyKey, entry)) return stored;
        return { readiness: "tiles-unavailable", missingAttributes: [], metrics: stored?.metrics ?? {} };
    }

    async function loadReadiness(storyKey: UrbanStoryKey, entry: ExploreEntry, force = false): Promise<EntryReadiness> {
        const result = await probeEntry(entry, { force, tilesFailed: tilesFailedFor(storyKey, entry) });
        readiness.value = { ...readiness.value, [readinessKey(storyKey, entry.key)]: result };
        return result;
    }

    /** "Refresh status": forget cached probes and probe every entry of a story again. */
    async function refreshStatus(storyKey: UrbanStoryKey): Promise<void> {
        resetUrbanStoryProbes();
        layerStatus.value = {};
        const story = getStoryConfig(storyKey);
        if (story === undefined) return;
        await Promise.all(story.explore.map(async (entry) => await loadReadiness(storyKey, entry, false)));
    }

    // --- add / remove / metric ------------------------------------------------------------

    async function probeBeforeAdd(storyKey: UrbanStoryKey, entry: ExploreEntry): Promise<EntryReadiness> {
        // A cached "not published yet" must not block an add once the layer exists: ask again.
        const cached = cachedEntryProbe(entry);
        const staleNotOk = cached !== undefined && !(await cached).resolved.ok;
        return await loadReadiness(storyKey, entry, staleNotOk);
    }

    async function addEntry(storyKey: UrbanStoryKey, entryKey: string, metricKey?: string): Promise<AddEntryResult> {
        const entry = findEntry(storyKey, entryKey);
        if (entry === undefined) return { status: "unknown-entry" };
        const existing = runtimeIdFor(storyKey, entry);
        if (existing !== undefined) return { status: "exists", runtimeId: existing };
        const selectionGeneration = generation.value;
        const startRunGeneration = runGeneration.value;
        const layerKey = catalogLayerKey(entry.layer);
        if (layerStatus.value[layerKey] === "adding") return { status: "busy" };
        if (mapStore.map === undefined || mapStore.map === null) return { status: "map-not-ready" };
        layerStatus.value = { ...layerStatus.value, [layerKey]: "adding" };
        try {
            if (entry.mvt !== "verified") {
                await loadReadiness(storyKey, entry);
                return { status: "tiles-unavailable" };
            }
            const probed = await probeBeforeAdd(storyKey, entry);
            if (probed.readiness === "temporarily-unavailable") return { status: "temporarily-unavailable" };
            if (probed.readiness === "tiles-unavailable") return { status: "tiles-unavailable" };
            const layerProbe = await cachedEntryProbe(entry);
            if (layerProbe === undefined || !layerProbe.resolved.ok || !("featureType" in layerProbe.resolved.detail)
                || layerProbe.resolved.info.type !== "VECTOR") {
                layerStatus.value = { ...layerStatus.value, [layerKey]: "error" };
                return { status: "error" };
            }
            const metric = metricKey === undefined ? undefined : entry.metrics.find((option) => option.key === metricKey);
            const metricReady = metric !== undefined && probed.metrics[metric.key]?.readiness === "available";
            // Frontend-styled entries use the locally built styling as is (it carries its own zoom floors);
            // catalog styling is a client copy with the entry's zoom floor applied.
            const styling = frontendStylingFor(entry) ?? (layerProbe.styling === undefined
                ? undefined
                : withZoomFloor(structuredClone(layerProbe.styling) as LayerStylingBundle, entry.minZoom));
            const { runtimeId, minZoomWarning } = await addCatalogVectorLayer({
                detail: layerProbe.resolved.detail,
                workspace: entry.layer.workspace,
                styling,
                minZoom: entry.minZoom,
                preferredStyleName: metricReady ? metric.styleName ?? undefined : undefined,
            });
            if (minZoomWarning) {
                logOnce(`minzoom:${layerKey}`, `Style of ${entry.layer.layerName} has no minzoom >= ${entry.minZoom}; tiles may load below the zoom floor`);
            }
            addedByStory.value = {
                ...addedByStory.value,
                [storyKey]: { ...(addedByStory.value[storyKey] ?? {}), [entry.key]: runtimeId },
            };
            // Keep the walking network above footprints using the existing logical-layer ordering.
            if (storyKey === "walkability-safety") {
                const street = findEntry(storyKey, "street-segments");
                const streetId = street === undefined ? undefined : runtimeIdFor(storyKey, street);
                if (streetId !== undefined) mapStore.reorderVisibleMapLayer(streetId, 0);
            }
            const superseded = (selectionGeneration !== generation.value || startRunGeneration !== runGeneration.value)
                && (runningStoryKey.value ?? activeStoryKey.value) !== storyKey;
            const record = recordOf(runtimeId);
            if (superseded && record !== undefined) {
                mapStore.setLogicalLayerVisibility(record, false);
            } else {
                hideCompetingStyles(entry, runtimeId);
                mapStore.requestLayerPanelExpansion(runtimeId);
            }
            const { [layerKey]: _done, ...rest } = layerStatus.value;
            layerStatus.value = rest;
            return { status: "added", runtimeId };
        } catch (error) {
            logOnce(`add:${layerKey}`, `Adding ${entry.layer.workspace}:${entry.layer.layerName}`, error);
            layerStatus.value = { ...layerStatus.value, [layerKey]: "error" };
            return { status: "error" };
        } finally {
            if (layerStatus.value[layerKey] === "adding") {
                const { [layerKey]: _done, ...rest } = layerStatus.value;
                layerStatus.value = rest;
            }
        }
    }

    /** Remove the entry's layer from the map (shared by every story that lists it). */
    async function removeEntry(storyKey: UrbanStoryKey, entryKey: string): Promise<void> {
        const entry = findEntry(storyKey, entryKey);
        if (entry === undefined) return;
        const runtimeId = runtimeIdFor(storyKey, entry);
        if (runtimeId === undefined) return;
        const record = recordOf(runtimeId);
        try {
            await mapStore.deleteMapLayer(runtimeId, true);
            if (record !== undefined) {
                try {
                    mapStore.deleteMapDataSource(record.source);
                } catch (error) {
                    console.warn(`Could not remove source ${record.source}`, error);
                }
            }
        } catch (error) {
            logOnce(`remove:${runtimeId}`, `Removing ${runtimeId}`, error);
        }
        // Even when the map call failed the record may be gone; pruning reconciles both cases.
        pruneStale();
    }

    /** Story overlays are reused across runs, but unrelated datasets must not leak into the next story. */
    function hideUnrelatedStoryLayers(config: UrbanStoryConfig): void {
        const datasets = new Set(config.explore.map((entry) => catalogLayerKey(entry.layer)));
        for (const tracked of trackedLayers.value) {
            if (!datasets.has(catalogLayerKey(tracked.entry.layer)) && isLayerVisible(tracked.runtimeId)) {
                mapStore.setLogicalLayerVisibility(tracked.record, false);
            }
        }
    }

    /** The same geometry must not carry two story colour schemes at once. Keep records for reuse. */
    function hideCompetingStyles(entry: ExploreEntry, runtimeId: string): void {
        if (!isLayerVisible(runtimeId)) return;
        const key = catalogLayerKey(entry.layer);
        for (const tracked of trackedLayers.value) {
            if (tracked.runtimeId !== runtimeId && catalogLayerKey(tracked.entry.layer) === key && isLayerVisible(tracked.runtimeId)) {
                mapStore.setLogicalLayerVisibility(tracked.record, false);
            }
        }
    }

    /** Switch an added layer's metric through its catalog MBStyle, or add it with that metric. */
    async function applyMetric(storyKey: UrbanStoryKey, entryKey: string, metricKey: string, reveal = false): Promise<ApplyMetricResult> {
        const entry = findEntry(storyKey, entryKey);
        if (entry === undefined) return { status: "unknown-entry" };
        const metric = entry.metrics.find((option) => option.key === metricKey);
        if (metric === undefined) return { status: "metric-unavailable" };
        const runtimeId = runtimeIdFor(storyKey, entry);
        if (runtimeId === undefined) {
            const added = await addEntry(storyKey, entryKey, metricKey);
            return added.status === "added"
                ? { status: "applied", runtimeId: added.runtimeId }
                : added.status === "exists" ? { status: "unchanged", runtimeId: added.runtimeId } : added;
        }
        const record = recordOf(runtimeId);
        const optionId = record === undefined ? undefined : metricStyleOptionId(record, metric);
        if (record === undefined || optionId === undefined) return { status: "metric-unavailable" };
        if (record.activeStyleId === optionId) {
            if (reveal) mapStore.setLogicalLayerVisibility(record, true);
            hideCompetingStyles(entry, runtimeId);
            return { status: "unchanged", runtimeId };
        }
        try {
            await mapStore.setStandaloneLayerStyle(runtimeId, optionId);
            if (reveal) mapStore.setLogicalLayerVisibility(record, true);
            hideCompetingStyles(entry, runtimeId);
            if (styleLacksZoomFloor(record, entry.minZoom)) {
                logOnce(`minzoom:${runtimeId}:${optionId}`, `Style ${metric.styleName} of ${entry.layer.layerName} has no minzoom >= ${entry.minZoom}`);
            }
            return { status: "applied", runtimeId };
        } catch (error) {
            logOnce(`metric:${runtimeId}:${optionId}`, `Switching ${entry.layer.layerName} to ${metric.key}`, error);
            return { status: "error" };
        }
    }

    function activeMetricOf(storyKey: UrbanStoryKey, entry: ExploreEntry): string | undefined {
        const record = recordOf(runtimeIdFor(storyKey, entry));
        return record === undefined ? undefined : activeMetricKey(record, entry.metrics);
    }

    // --- run: camera and focus snapshot (UST-08) -----------------------------------------

    function captureCamera(): OverviewCamera | undefined {
        const map = mapStore.map;
        if (map === undefined || map === null) return undefined;
        try {
            const center = map.getCenter();
            return { center: [center.lng, center.lat], zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
        } catch (error) {
            reportDeveloperError("Reading the map camera before a story run", error);
            return undefined;
        }
    }

    /** Move the map with the GeoStory scene engine's own camera logic (transition types, reduced motion). */
    function moveCamera(camera: OverviewCamera | undefined): void {
        const map = mapStore.map;
        if (camera === undefined || map === undefined || map === null) return;
        const move = sceneCameraMove({
            camera: { center: camera.center, zoom: camera.zoom, bearing: camera.bearing ?? 0, pitch: camera.pitch ?? 0, bounds: null },
            transition: { type: "fly", duration_ms: CHAPTER_FLY_MS },
            layers: [],
        }, { reducedMotion: prefersReducedMotion() });
        if (move === undefined || move.method === "fitBounds") return;
        try {
            map[move.method](move.options);
        } catch (error) {
            reportDeveloperError("Moving the map camera for a story run", error);
        }
    }

    function isLayerVisible(runtimeId: string): boolean {
        return mapStore.getLayerUiState(runtimeId)?.visible !== false;
    }

    /** Hide every tracked layer and remember what was visible; the snapshot is the truth for "before the run". */
    function hideTrackedLayers(): Record<string, boolean> {
        const visibility: Record<string, boolean> = {};
        for (const tracked of trackedLayers.value) {
            visibility[tracked.runtimeId] = isLayerVisible(tracked.runtimeId);
            if (visibility[tracked.runtimeId]) mapStore.setLogicalLayerVisibility(tracked.record, false);
        }
        return visibility;
    }

    /** Put each remembered layer that still exists back to its recorded value. Missing ids are skipped. */
    function restoreVisibility(visibility: Record<string, boolean> | undefined): void {
        if (visibility === undefined) return;
        for (const [runtimeId, visible] of Object.entries(visibility)) {
            const record = recordOf(runtimeId);
            if (record !== undefined) mapStore.setLogicalLayerVisibility(record, visible);
        }
    }

    function setFocusEnabled(enabled: boolean): void {
        if (enabled === focusEnabled.value) return;
        focusEnabled.value = enabled;
        const snapshot = runSnapshot.value;
        if (snapshot === undefined) return; // nothing running: the next start applies it
        if (enabled) {
            runSnapshot.value = { ...snapshot, visibility: hideTrackedLayers() };
        } else {
            restoreVisibility(snapshot.visibility);
            runSnapshot.value = { ...snapshot, visibility: undefined };
        }
    }

    // --- run: lifecycle (UST-06/08) ------------------------------------------------------

    /**
     * End the current run, whatever state it is in. Idempotent.
     *
     * @remarks
     * Removes only the scene group (`closeStory({ removeLayers: true })`), restores the focus
     * snapshot and optionally the camera. Explore and Datastores layers are never deleted.
     */
    async function endRun(options: { camera?: RunExitCamera } = {}): Promise<void> {
        const exitCamera = options.camera ?? "none";
        if (runState.value === "idle" && runSnapshot.value === undefined && !sceneOwned) return;
        runGeneration.value += 1;
        const snapshot = runSnapshot.value;
        const story = runningStoryKey.value === undefined ? undefined : getStoryConfig(runningStoryKey.value);
        const owned = sceneOwned;
        runState.value = "idle";
        runningStoryKey.value = undefined;
        runIssue.value = undefined;
        runDetail.value = undefined;
        runLayerWarnings.value = [];
        runSnapshot.value = undefined;
        runMode.value = "chapters";
        chapterIndex.value = 0;
        sceneOwned = false;
        revealedByRun.clear();
        if (owned) {
            try {
                await sceneStore.closeStory({ removeLayers: true });
            } catch (error) {
                reportDeveloperError("Closing the Urban Stories GeoStory", error);
            }
        }
        restoreVisibility(snapshot?.visibility);
        if (exitCamera === "previous") moveCamera(snapshot?.camera);
        else if (exitCamera === "overview") moveCamera(story?.overviewCamera);
    }

    /** Failure path of a start: undo whatever it changed, then show the reason. */
    async function failRun(storyKey: UrbanStoryKey, generation: number, issue: RunIssue): Promise<StartStoryResult> {
        if (generation !== runGeneration.value) return { status: "superseded" };
        await endRun({ camera: "none" });
        runningStoryKey.value = storyKey;
        runState.value = "error";
        runIssue.value = issue;
        return { status: "failed", issue };
    }

    /**
     * Start a story run.
     *
     * @remarks
     * Without `geostory.id` (every story today) the run plays the config's chapters: camera,
     * narrative and layers all go through the existing map store and catalog loader, and nothing is
     * requested from `/api/v1/stories/`. A story that sets `geostory.id` plays that published backend
     * GeoStory through the existing scene engine instead.
     */
    async function startStory(storyKey: UrbanStoryKey): Promise<StartStoryResult> {
        const config = getStoryConfig(storyKey);
        if (config === undefined) return { status: "failed", issue: "not-configured" };
        await endRun({ camera: "none" });
        runGeneration.value += 1;
        const generation = runGeneration.value;
        runningStoryKey.value = storyKey;
        runIssue.value = undefined;
        runState.value = "loading";

        if (mapStore.map === undefined || mapStore.map === null) return await failRun(storyKey, generation, "map-not-ready");
        if (config.geostory.id === null) return await startChapterRun(config, generation);
        return await startGeoStoryRun(config, config.geostory.id, generation);
    }

    async function startChapterRun(config: UrbanStoryConfig, generation: number): Promise<StartStoryResult> {
        if (config.chapters.length === 0) return await failRun(config.key, generation, "empty");
        runMode.value = "chapters";
        chapterIndex.value = 0;
        revealedByRun.clear();
        hideUnrelatedStoryLayers(config);
        // Chapter staging manages the current story's layers; unrelated story overlays remain hidden.
        runSnapshot.value = { camera: captureCamera(), visibility: undefined };
        runState.value = "running";
        await applyChapter(config, 0, generation);
        return generation === runGeneration.value ? { status: "started" } : { status: "superseded" };
    }

    /**
     * Camera, then layers. A layer that cannot be added is logged by `addEntry`/`applyMetric` and skipped.
     *
     * @remarks
     * A chapter with a `show` list stages its map: layers that an earlier chapter of this run added or
     * un-hid, and that this chapter does not show, are hidden again (never removed). Layers the user had
     * visible before the chapter touched them, and layers the run never revealed, are left alone.
     */
    async function applyChapter(config: UrbanStoryConfig, index: number, generation: number): Promise<void> {
        const chapter = config.chapters[index];
        if (chapter === undefined) return;
        moveCamera(chapter.camera);
        if (chapter.show === undefined) return;
        const keep = new Set<string>();
        for (const shown of chapter.show) {
            const entry = findEntry(config.key, shown.entryKey);
            const existing = entry === undefined ? undefined : runtimeIdFor(config.key, entry);
            if (existing !== undefined) keep.add(existing);
        }
        for (const runtimeId of [...revealedByRun]) {
            const record = recordOf(runtimeId);
            if (record === undefined) revealedByRun.delete(runtimeId);
            else if (!keep.has(runtimeId) && isLayerVisible(runtimeId)) mapStore.setLogicalLayerVisibility(record, false);
        }
        for (const shown of chapter.show) {
            if (generation !== runGeneration.value || chapterIndex.value !== index) return;
            const entry = findEntry(config.key, shown.entryKey);
            const before = entry === undefined ? undefined : runtimeIdFor(config.key, entry);
            const wasVisible = before !== undefined && isLayerVisible(before);
            const result = shown.metricKey === undefined
                ? await addEntry(config.key, shown.entryKey)
                : await applyMetric(config.key, shown.entryKey, shown.metricKey);
            const record = recordOf("runtimeId" in result ? result.runtimeId : undefined);
            if (record === undefined) continue;
            // The user moved on while this layer loaded: the newer chapter owns the map now.
            if (generation !== runGeneration.value || chapterIndex.value !== index) {
                if (generation === runGeneration.value && !wasVisible) {
                    revealedByRun.add(record.id);
                    // The newer chapter already staged its map before this layer finished loading, so its hide
                    // pass never saw it: put it away now unless the newer chapter shows it.
                    const current = config.chapters[chapterIndex.value];
                    const wanted = current?.show?.some((candidate) => {
                        const candidateEntry = findEntry(config.key, candidate.entryKey);
                        return candidateEntry !== undefined && runtimeIdFor(config.key, candidateEntry) === record.id;
                    });
                    if (current?.show !== undefined && wanted !== true && isLayerVisible(record.id)) {
                        mapStore.setLogicalLayerVisibility(record, false);
                    }
                }
                return;
            }
            // A metric switch may give the layer a new runtime id; the run's claim on it moves with it.
            const claimed = before !== undefined && revealedByRun.delete(before);
            if (!wasVisible || claimed) revealedByRun.add(record.id);
            if (!isLayerVisible(record.id)) mapStore.setLogicalLayerVisibility(record, true);
            if (entry !== undefined) hideCompetingStyles(entry, record.id);
        }
    }

    /** Opt-in path: play a published backend GeoStory with the existing scene engine. */
    async function startGeoStoryRun(config: UrbanStoryConfig, storyId: string, generation: number): Promise<StartStoryResult> {
        const storyKey = config.key;
        runMode.value = "geostory";
        let detail: GeoStoryDetail;
        try {
            detail = await fetchBackendJson<GeoStoryDetail>(buildStoryDetailUrl(storyId), "GeoStory");
        } catch (error) {
            if (generation !== runGeneration.value) return { status: "superseded" };
            logOnce(`story:${storyId}`, `Loading GeoStory ${storyId} for ${storyKey}`, error);
            const hidden = error instanceof Error && HIDDEN_STORY_ERROR.test(error.message);
            return await failRun(storyKey, generation, hidden ? "unpublished" : "fetch-failed");
        }
        if (generation !== runGeneration.value) return { status: "superseded" };
        if (detail.status !== "published") return await failRun(storyKey, generation, "unpublished");
        if ((detail.scenes ?? []).length === 0) return await failRun(storyKey, generation, "empty");

        const { warnings } = matchChapters(detail, config.chapters);
        warnings.forEach((warning) => logOnce(`chapters:${storyKey}:${warning}`, `${storyKey}: ${warning}`));

        runDetail.value = detail;
        runSnapshot.value = { camera: captureCamera(), visibility: focusEnabled.value ? hideTrackedLayers() : undefined };
        sceneOwned = true;
        try {
            await sceneStore.openStory(detail, {
                onLayerError: (error, sceneLayer) => {
                    const name = `${sceneLayer.layer.workspace.name}:${sceneLayer.layer.name}`;
                    logOnce(`scene-layer:${name}`, `Loading GeoStory map layer details ${name}`, error);
                    if (generation === runGeneration.value && !runLayerWarnings.value.includes(name)) {
                        runLayerWarnings.value = [...runLayerWarnings.value, name];
                    }
                },
            });
        } catch (error) {
            logOnce(`story-open:${storyId}`, `Opening GeoStory ${storyId}`, error);
            return await failRun(storyKey, generation, "fetch-failed");
        }
        if (generation !== runGeneration.value) {
            // A newer run or an end superseded this open. Drop the group unless a newer story already replaced it.
            if (sceneStore.story === detail) await sceneStore.closeStory({ removeLayers: true });
            return { status: "superseded" };
        }
        runState.value = "running";
        return { status: "started" };
    }

    /** Ask the scene engine for a scene. A rejection never disables navigation. */
    function goToScene(sceneId: string): void {
        if (runMode.value !== "geostory" || (runState.value !== "running" && runState.value !== "loading")) return;
        sceneStore.showScene(sceneId).catch((error: unknown) => {
            reportDeveloperError(`Switching GeoStory scene ${sceneId}`, error);
        });
    }

    const currentSceneId = computed(() => sceneStore.targetSceneId ?? sceneStore.activeSceneId);
    const currentSceneIndex = computed(() => sceneStore.scenes.findIndex((scene) => scene.id === currentSceneId.value));

    /** Position in the story, whichever source drives it. `-1` when nothing is playing. */
    const currentChapterIndex = computed(() => (
        runMode.value === "chapters" ? (runState.value === "running" ? chapterIndex.value : -1) : currentSceneIndex.value
    ));
    const chapterCount = computed(() => {
        if (runMode.value === "geostory") return sceneStore.scenes.length;
        return runningStoryKey.value === undefined ? 0 : getStoryConfig(runningStoryKey.value)?.chapters.length ?? 0;
    });

    /** Jump to a chapter of a `chapters` run (a `geostory` run navigates by scene id). */
    async function goToChapter(index: number): Promise<void> {
        const config = runningStoryKey.value === undefined ? undefined : getStoryConfig(runningStoryKey.value);
        if (runMode.value !== "chapters" || runState.value !== "running" || config === undefined) return;
        if (index < 0 || index >= config.chapters.length || index === chapterIndex.value) return;
        chapterIndex.value = index;
        await applyChapter(config, index, runGeneration.value);
    }

    function stepScene(delta: 1 | -1): void {
        if (runMode.value === "chapters") {
            void goToChapter(chapterIndex.value + delta);
            return;
        }
        const next = sceneStore.scenes[currentSceneIndex.value + delta];
        if (next !== undefined) goToScene(next.id);
    }

    // --- run: chapters and Explore ordering (UST-06/07) ----------------------------------

    const chapterSplit = computed(() => (runDetail.value === undefined ? undefined : splitStoryIntoChapters(runDetail.value)));
    const chapterMatching = computed(() => {
        const story = runningStoryKey.value === undefined ? undefined : getStoryConfig(runningStoryKey.value);
        return runDetail.value === undefined || story === undefined ? undefined : matchChapters(runDetail.value, story.chapters);
    });
    const activeChapter = computed<StoryChapter | undefined>(() => {
        if (runMode.value === "chapters") {
            const story = runningStoryKey.value === undefined ? undefined : getStoryConfig(runningStoryKey.value);
            return runState.value === "running" ? story?.chapters[chapterIndex.value] : undefined;
        }
        return chapterMatching.value?.matches.find((match) => match.sceneId === currentSceneId.value)?.chapter;
    });
    const activeChapterBlocks = computed(() => (
        chapterSplit.value?.chapters.find((slice) => slice.sceneId === currentSceneId.value)?.blocks ?? []
    ));
    const introBlocks = computed(() => chapterSplit.value?.intro ?? []);

    /**
     * Explore entries of a story, with the active chapter's related entries first.
     * Never hides an entry: `related` and `others` always cover the whole story.
     */
    function prioritisedEntries(story: UrbanStoryConfig): PrioritisedEntries {
        const chapter = runState.value === "running" && runningStoryKey.value === story.key ? activeChapter.value : undefined;
        if (chapter === undefined) return { related: [], others: [...story.explore] };
        const related: ExploreEntry[] = [];
        for (const key of chapter.relatedExploreEntries) {
            const entry = story.explore.find((candidate) => candidate.key === key);
            if (entry === undefined) logOnce(`related:${story.key}:${key}`, `Chapter ${chapter.chapterKey} references unknown Explore entry "${key}"`);
            else if (!related.includes(entry)) related.push(entry);
        }
        return { chapter, related, others: story.explore.filter((entry) => !related.includes(entry)) };
    }

    // A map reset by another feature empties the layer list under a running scene story: end the run.
    // A chapter run's layers are Explore layers the user may remove one by one, so it never ends this way.
    watch(() => mapStore.layersOnMap.length, (length, previous) => {
        if (length !== 0 || previous === 0 || runState.value !== "running" || runMode.value !== "geostory" || sceneStore.switching) return;
        const scene = sceneStore.activeScene;
        if (scene !== undefined && drawnSceneLayers(scene).length === 0) return; // an empty scene is not a reset
        void endRun({ camera: "none" });
    });

    return {
        activeStoryKey,
        activeStory,
        addedByStory,
        generation,
        layerStatus,
        readiness,
        tileErrorIds,
        trackedLayers,
        selectStory,
        runtimeIdFor,
        recordOf,
        readinessOf,
        loadReadiness,
        refreshStatus,
        addEntry,
        removeEntry,
        applyMetric,
        activeMetricOf,
        pruneStale,
        runState,
        runningStoryKey,
        runIssue,
        runDetail,
        runMode,
        chapterIndex,
        currentChapterIndex,
        chapterCount,
        goToChapter,
        runLayerWarnings,
        runGeneration,
        focusEnabled,
        runSnapshot,
        currentSceneId,
        currentSceneIndex,
        activeChapter,
        activeChapterBlocks,
        introBlocks,
        chapterMatching,
        startStory,
        endRun,
        goToScene,
        stepScene,
        setFocusEnabled,
        prioritisedEntries,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useUrbanStoriesStore, import.meta.hot));
}

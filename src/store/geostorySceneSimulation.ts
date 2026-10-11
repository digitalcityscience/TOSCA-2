import { acceptHMRUpdate, defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";
import {
    addSimulationOutputLayer,
    buildSimulationSource,
    msUntilRefresh,
    simulationSourceId,
    waitForMapStyle,
} from "@helpers/geosimulationLayers";
import {
    advanceReplayTime,
    clampToWindow,
    replayWindow,
    sceneSimulationMapOutputs,
    type ReplayWindow,
} from "@helpers/geostorySceneSimulation";
import { colorTripsBy, type ReplayData } from "@helpers/simulationReplay";
import { loadSimulationReplay, ReplayLoadError } from "@helpers/simulationReplayLoader";
import { reportDeveloperError } from "@helpers/userFacingError";
import { fetchBackendJson } from "./backend";
import { buildStoryDetailUrl, type GeoStoryDetail, type GeoStorySceneSimulation } from "./geostory";
import { useMapStore } from "./map";

export const GEOSTORY_REPLAY_LAYER_ID = "geostory-replay";
const TRAIL_SECONDS = 120;

/**
 * The GeoSimulation part of the active GeoStory scene: the run's map layers and
 * a looping replay window, drawn above the scene's catalog layers.
 *
 * @remarks
 * Driven by the scene store (`show` after each scene switch, `clear` when the
 * story closes). Layers shared by consecutive scenes stay on the map; the
 * replay data of the last run is kept, so scenes on the same run only change
 * the window. Loading a replay never blocks a scene switch.
 */
export const useGeostorySceneSimulationStore = defineStore("geostorySceneSimulation", () => {
    const mapStore = useMapStore();

    const simulation = shallowRef<GeoStorySceneSimulation | null>(null);
    const playWindow = shallowRef<ReplayWindow>();
    const time = ref(0);
    const playing = ref(false);
    const loading = ref(false);
    const loadedBytes = ref(0);
    const loadFailed = ref(false);
    const hasReplay = computed(() => simulation.value?.replay != null);

    let storyId: string | undefined;
    /** Listed records of the map outputs, by source id. */
    let outputRecords = new Map<string, string>();
    let replayRunId: string | undefined;
    let replayData: ReplayData | undefined;
    let loadToken = 0;
    let loadAbort: AbortController | undefined;
    let frame: number | undefined;
    let lastFrameAt: number | undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    /** Bumped by every `show` and `clear`, so a superseded `show` stops after its await. */
    let showToken = 0;

    /**
     * Show a scene's simulation (or none). Resolves once its map layers are
     * added, which waits for the map style: callers switching scenes should not
     * await it, so a map that is not rendering cannot hold up the story.
     */
    async function show(
        next: GeoStorySceneSimulation | null | undefined,
        { story, reducedMotion = false }: { story?: string; reducedMotion?: boolean } = {}
    ): Promise<void> {
        const token = ++showToken;
        storyId = story ?? storyId;
        simulation.value = next ?? null;
        scheduleUrlRefresh();
        showReplay(simulation.value, reducedMotion);
        await showMapOutputs(simulation.value, token);
        if (token === showToken) raiseToTop();
    }

    async function showMapOutputs(next: GeoStorySceneSimulation | null, token: number): Promise<void> {
        const outputs = next === null ? [] : sceneSimulationMapOutputs(next);
        const wanted = new Set(outputs.map((output) => simulationSourceId(next!.run.id, output.id)));
        for (const [sourceId, recordId] of outputRecords) {
            if (!wanted.has(sourceId)) await removeOutputLayer(sourceId, recordId);
        }
        if (next === null || outputs.length === 0 || mapStore.map === undefined) return;
        await waitForMapStyle(mapStore.map);
        if (token !== showToken) return;
        for (const output of outputs) {
            try {
                const record = addSimulationOutputLayer(mapStore, { id: next.run.id, labels: next.labels }, output);
                if (record !== undefined) outputRecords.set(simulationSourceId(next.run.id, output.id), record.id);
            } catch (error) {
                reportDeveloperError(`Showing simulation output ${output.id} in a GeoStory scene`, error);
            }
        }
    }

    async function removeOutputLayer(sourceId: string, recordId: string): Promise<void> {
        outputRecords.delete(sourceId);
        try {
            if (mapStore.layersOnMap.some((layer) => layer.id === recordId)) {
                await mapStore.deleteMapLayer(recordId, false);
            }
            if (mapStore.map?.getSource(sourceId) !== undefined) mapStore.map.removeSource(sourceId);
        } catch (error) {
            reportDeveloperError(`Removing simulation layer ${recordId}`, error);
        }
    }

    function showReplay(next: GeoStorySceneSimulation | null, reducedMotion: boolean): void {
        const replay = next?.replay ?? null;
        if (next === null || replay === null) {
            stopReplay();
            return;
        }
        if (replayRunId === next.run.id && replayData !== undefined) {
            startWindow(replayData, reducedMotion);
            return;
        }
        stopReplay();
        void loadReplay(next, reducedMotion);
    }

    async function loadReplay(next: GeoStorySceneSimulation, reducedMotion: boolean): Promise<void> {
        const token = ++loadToken;
        const abort = new AbortController();
        loadAbort = abort;
        loading.value = true;
        loadFailed.value = false;
        loadedBytes.value = 0;
        try {
            const data = await fetchReplay(next, abort.signal);
            if (token !== loadToken) return;
            replayRunId = next.run.id;
            replayData = data;
            startWindow(data, reducedMotion);
            raiseToTop();
        } catch (error) {
            if (token !== loadToken || abort.signal.aborted) return;
            loadFailed.value = true;
            reportDeveloperError("Loading a GeoStory scene replay", error);
        } finally {
            if (token === loadToken) {
                loading.value = false;
                loadAbort = undefined;
            }
        }
    }

    async function fetchReplay(next: GeoStorySceneSimulation, signal: AbortSignal): Promise<ReplayData> {
        const onProgress = (bytes: number): void => { loadedBytes.value = bytes; };
        try {
            return await loadSimulationReplay(next.replay!.output.url, { signal, onProgress });
        } catch (error) {
            // Presigned URLs expire after about an hour: fetch the story again once.
            if (!(error instanceof ReplayLoadError) || error.status !== 403) throw error;
            const fresh = await freshSimulation(next.run.id);
            if (fresh?.replay == null) throw error;
            return await loadSimulationReplay(fresh.replay.output.url, { signal, onProgress });
        }
    }

    /** The same run's simulation from a fresh story response (new presigned URLs). */
    async function freshSimulation(runId: string): Promise<GeoStorySceneSimulation | undefined> {
        if (storyId === undefined) return undefined;
        const detail = await fetchBackendJson<GeoStoryDetail>(buildStoryDetailUrl(storyId), "GeoStory");
        return detail.scenes
            .map((scene) => scene.simulation)
            .find((item): item is GeoStorySceneSimulation => item?.run.id === runId);
    }

    function startWindow(data: ReplayData, reducedMotion: boolean): void {
        const replay = simulation.value?.replay;
        if (replay == null) return;
        const nextWindow = replayWindow(replay, data.timeEnd);
        playWindow.value = nextWindow;
        // Consecutive scenes on the same run keep the moment when it is inside
        // the new window; a replay that comes back starts at its window.
        const continuing = replayLayerOnMap();
        time.value = continuing ? clampToWindow(time.value, nextWindow) : nextWindow.start;
        if (!continuing) {
            mapStore.addDeckReplayLayer({
                identifier: GEOSTORY_REPLAY_LAYER_ID,
                displayName: replay.output.title,
                props: {
                    replay: data,
                    currentTime: time.value,
                    trailLength: TRAIL_SECONDS,
                    tripColors: colorTripsBy(data, null).colors,
                    colorVersion: 0,
                    showStops: true,
                },
                simulationOutput: {
                    runId: simulation.value!.run.id,
                    outputId: replay.output.id,
                    role: replay.output.role,
                    legend: null,
                    labels: simulation.value!.labels,
                    bounds: simulation.value!.bounds,
                },
            });
        } else {
            mapStore.setDeckLayerProps(GEOSTORY_REPLAY_LAYER_ID, { currentTime: time.value });
        }
        // Reduced motion: show the window's first moment and let the reader start it.
        if (reducedMotion) pause();
        else play();
    }

    function tick(now: number): void {
        frame = undefined;
        const current = playWindow.value;
        if (!playing.value || current === undefined) return;
        if (!replayLayerOnMap()) {
            // The reader removed the replay from the layer listing.
            pause();
            return;
        }
        const elapsed = lastFrameAt === undefined ? 0 : (now - lastFrameAt) / 1000;
        lastFrameAt = now;
        const step = advanceReplayTime(time.value, elapsed, current);
        time.value = step.time;
        mapStore.setDeckLayerProps(GEOSTORY_REPLAY_LAYER_ID, { currentTime: step.time });
        if (step.finished) {
            pause();
            return;
        }
        frame = requestAnimationFrame(tick);
    }

    function play(): void {
        const current = playWindow.value;
        if (current === undefined || !replayLayerOnMap()) return;
        if (!current.loop && time.value >= current.end) time.value = current.start;
        playing.value = true;
        lastFrameAt = undefined;
        if (frame === undefined) frame = requestAnimationFrame(tick);
    }

    function pause(): void {
        playing.value = false;
        if (frame !== undefined) cancelAnimationFrame(frame);
        frame = undefined;
    }

    function togglePlay(): void {
        if (playing.value) pause();
        else play();
    }

    function replayLayerOnMap(): boolean {
        return mapStore.layersOnMap.some((layer) => layer.id === GEOSTORY_REPLAY_LAYER_ID);
    }

    /** Stop playback and take the replay off the map; the loaded data stays cached. */
    function stopReplay(): void {
        loadToken += 1;
        loadAbort?.abort();
        loadAbort = undefined;
        loading.value = false;
        loadFailed.value = false;
        pause();
        playWindow.value = undefined;
        if (replayLayerOnMap()) {
            mapStore.deleteMapLayer(GEOSTORY_REPLAY_LAYER_ID, false).catch((error: unknown) => {
                reportDeveloperError("Removing the GeoStory scene replay", error);
            });
        }
    }

    /** Simulation layers sit above the scene's catalog layers, the replay on top. */
    function raiseToTop(): void {
        const ids = [...outputRecords.values(), GEOSTORY_REPLAY_LAYER_ID];
        for (const id of ids) {
            if (!mapStore.layersOnMap.some((layer) => layer.id === id && layer.showOnLayerList !== false)) continue;
            try {
                mapStore.reorderVisibleMapLayer(id, 0);
            } catch (error) {
                reportDeveloperError(`Raising simulation layer ${id}`, error);
            }
        }
    }

    /** Re-point the PMTiles sources at fresh URLs a minute before they expire. */
    function scheduleUrlRefresh(): void {
        if (refreshTimer !== undefined) clearTimeout(refreshTimer);
        refreshTimer = undefined;
        const current = simulation.value;
        const delay = msUntilRefresh(current?.map_outputs[0]?.url_expires_at);
        if (current === null || delay === undefined) return;
        refreshTimer = setTimeout(() => {
            refreshTimer = undefined;
            void refreshUrls(current.run.id);
        }, delay);
    }

    async function refreshUrls(runId: string): Promise<void> {
        try {
            const fresh = await freshSimulation(runId);
            const current = simulation.value;
            if (fresh === undefined || current === null || current.run.id !== runId) return;
            for (const output of fresh.map_outputs) {
                const source = mapStore.map?.getSource(simulationSourceId(runId, output.id));
                source?.setUrl?.(buildSimulationSource(output).url);
            }
            simulation.value = { ...current, map_outputs: fresh.map_outputs };
            scheduleUrlRefresh();
        } catch (error) {
            reportDeveloperError("Refreshing GeoStory simulation URLs", error);
        }
    }

    /**
     * Stop playback and forget the story.
     *
     * @param options.removeLayers - Also remove the layers. Without it they are
     * left to `resetMapData` (or removed by the next `show`).
     */
    async function clear({ removeLayers = false }: { removeLayers?: boolean } = {}): Promise<void> {
        showToken += 1;
        stopReplay();
        if (refreshTimer !== undefined) clearTimeout(refreshTimer);
        refreshTimer = undefined;
        simulation.value = null;
        storyId = undefined;
        replayRunId = undefined;
        replayData = undefined;
        time.value = 0;
        if (removeLayers) {
            for (const [sourceId, recordId] of [...outputRecords]) await removeOutputLayer(sourceId, recordId);
        }
        outputRecords = new Map([...outputRecords].filter(([, recordId]) => {
            return mapStore.layersOnMap.some((layer) => layer.id === recordId);
        }));
    }

    return {
        simulation,
        playWindow,
        time,
        playing,
        loading,
        loadedBytes,
        loadFailed,
        hasReplay,
        show,
        play,
        pause,
        togglePlay,
        clear,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useGeostorySceneSimulationStore, import.meta.hot));
}

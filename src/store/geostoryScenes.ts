import { acceptHMRUpdate, defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";
import {
    createGeoStorySceneLoader,
    sceneCameraMove,
    type GeoStorySceneLoader,
    type GeoStorySceneLoaderOptions,
} from "@helpers/geostoryScenes";
import { reportDeveloperError } from "@helpers/userFacingError";
import { useGeoserverStore } from "./geoserver";
import { type GeoStoryDetail, type GeoStoryScene, sortedScenes } from "./geostory";
import { useMapStore } from "./map";

/**
 * Which scene of the open GeoStory is on the map.
 *
 * @remarks
 * Each scene is drawn as one layer group (see `sceneToGroupManifest`), so it gets
 * a layer-listing entry with member legends, popups and opacity. Switching adds
 * the new scene's group, removes the previous one, then moves the camera.
 * Requests are serialised: while a switch runs, only the latest requested scene
 * is kept and applied next, so rapid scrolling never stacks map changes.
 */
export const useGeostorySceneStore = defineStore("geostoryScenes", () => {
    const mapStore = useMapStore();
    const geoserverStore = useGeoserverStore();

    const story = shallowRef<GeoStoryDetail>();
    const activeSceneId = ref<string>();
    /** Latest requested scene; equals `activeSceneId` once the switch finished. */
    const targetSceneId = ref<string>();
    const switching = ref(false);
    const scenes = computed(() => (story.value === undefined ? [] : sortedScenes(story.value)));
    const activeScene = computed(() => scenes.value.find((scene) => scene.id === activeSceneId.value));

    let loader: GeoStorySceneLoader | undefined;
    let groupRecordId: string | undefined;
    // Scene left on the map by `closeStory()` without `removeLayers`; the next
    // story replaces it.
    let lingeringGroupId: string | undefined;
    let requestedSceneId: string | undefined;
    let running: Promise<void> | undefined;
    // Bumped whenever the open story changes, so late results of a previous
    // story are dropped instead of drawn.
    let generation = 0;

    /** Open a story and show its first scene. Replaces any previously open story. */
    async function openStory(
        detail: GeoStoryDetail,
        options: GeoStorySceneLoaderOptions = {}
    ): Promise<void> {
        await closeStory({ removeLayers: true });
        story.value = detail;
        loader = createGeoStorySceneLoader(detail, geoserverStore, options);
        const first = scenes.value[0];
        if (first !== undefined) await showScene(first.id);
    }

    /**
     * Request a scene. Resolves once the map shows the latest requested scene
     * (which may be a later request than this one).
     */
    function showScene(sceneId: string): Promise<void> {
        requestedSceneId = sceneId;
        targetSceneId.value = sceneId;
        running ??= drain().finally(() => {
            running = undefined;
        });
        return running;
    }

    async function drain(): Promise<void> {
        switching.value = true;
        try {
            while (requestedSceneId !== undefined) {
                const sceneId = requestedSceneId;
                requestedSceneId = undefined;
                if (sceneId === activeSceneId.value && isGroupOnMap()) continue;
                await applyScene(sceneId);
            }
        } finally {
            switching.value = false;
        }
    }

    async function applyScene(sceneId: string): Promise<void> {
        const scene = scenes.value.find((item) => item.id === sceneId);
        if (scene === undefined || loader === undefined) return;
        const storyGeneration = generation;

        const manifest = await loader.manifestFor(scene);
        if (storyGeneration !== generation) return;

        const previousRecordId = groupRecordId;
        groupRecordId = undefined;
        if (manifest !== undefined) {
            try {
                // Add before removing so the map never flashes empty between scenes.
                // Scrolling switches scenes often; no "layer added" toast for each.
                const record = await mapStore.addMapGroup(manifest, { notify: false });
                if (storyGeneration !== generation) {
                    await removeGroup(record.id);
                    return;
                }
                groupRecordId = record.id;
                // Show the scene's member legends in the layer listing.
                mapStore.requestLayerPanelExpansion(record.id);
            } catch (error) {
                reportDeveloperError(`Showing GeoStory scene ${scene.id}`, error);
            }
        }
        await removeGroup(previousRecordId);
        activeSceneId.value = scene.id;
        moveCamera(scene);
    }

    function moveCamera(scene: GeoStoryScene): void {
        const map = mapStore.map;
        const move = sceneCameraMove(scene, { reducedMotion: prefersReducedMotion() });
        if (map === undefined || move === undefined) return;
        if (move.method === "fitBounds") {
            map.fitBounds(move.bounds, move.options);
        } else {
            map[move.method](move.options);
        }
    }

    function isGroupOnMap(): boolean {
        return groupRecordId !== undefined &&
            mapStore.layersOnMap.some((layer) => layer.id === groupRecordId);
    }

    async function removeGroup(recordId: string | undefined): Promise<void> {
        // The reader may already have removed the scene from the layer listing.
        if (recordId === undefined || !mapStore.layersOnMap.some((layer) => layer.id === recordId)) return;
        try {
            await mapStore.deleteMapLayer(recordId, false);
        } catch (error) {
            reportDeveloperError(`Removing GeoStory scene layer ${recordId}`, error);
        }
    }

    /**
     * Forget the open story and drop pending switches.
     *
     * @param options.removeLayers - Also remove the current scene from the map.
     * Leaving the story list via `resetMapData` clears the map anyway.
     */
    async function closeStory({ removeLayers = false }: { removeLayers?: boolean } = {}): Promise<void> {
        generation += 1;
        requestedSceneId = undefined;
        const recordIds = [groupRecordId, lingeringGroupId];
        groupRecordId = undefined;
        story.value = undefined;
        activeSceneId.value = undefined;
        targetSceneId.value = undefined;
        loader = undefined;
        if (removeLayers) {
            lingeringGroupId = undefined;
            for (const recordId of recordIds) await removeGroup(recordId);
        } else {
            lingeringGroupId = recordIds.find((recordId) => recordId !== undefined);
        }
    }

    return {
        story,
        scenes,
        activeSceneId,
        targetSceneId,
        activeScene,
        switching,
        openStory,
        showScene,
        closeStory,
    };
});

function prefersReducedMotion(): boolean {
    return typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useGeostorySceneStore, import.meta.hot));
}

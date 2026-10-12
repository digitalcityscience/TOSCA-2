import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { resetUrbanStoryProbes } from "@helpers/urbanStoryLayers";
import {
    addExploreLayer, deferred, fakeCameraMap, fakeSceneEngine, publishStoryConfig, storyDetail,
} from "../components/UrbanStories/__fixtures__/runHarness";
import { getStoryConfig } from "../config/urbanStories";
import { useGeostorySceneStore } from "./geostoryScenes";
import { useMapStore } from "./map";
import { useUrbanStoriesStore } from "./urbanStories";

const backend = vi.hoisted(() => ({ fetchBackendJson: vi.fn() }));
vi.mock("./backend", async (importOriginal) => ({
    ...(await importOriginal<typeof import("./backend")>()),
    fetchBackendJson: backend.fetchBackendJson,
}));
vi.mock("@helpers/catalogLayerLoader", () => ({
    resolveCatalogLayer: vi.fn(), loadCatalogLayerStyling: vi.fn(), addCatalogVectorLayer: vi.fn(),
}));
vi.mock("@store/geoserver", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@store/geoserver")>()),
    useGeoserverStore: () => ({ getStyleList: async () => [] }),
}));
vi.mock("@helpers/toast", () => ({ useToast: () => ({ add: vi.fn() }) }));

let restoreConfig: Array<() => void> = [];
let map: ReturnType<typeof fakeCameraMap>;

function setup() {
    setActivePinia(createPinia());
    resetUrbanStoryProbes();
    map = fakeCameraMap();
    const mapStore = useMapStore();
    mapStore.map = map as never;
    const urban = useUrbanStoriesStore();
    const scene = useGeostorySceneStore();
    const engine = fakeSceneEngine(scene);
    const deleteLayer = vi.spyOn(mapStore, "deleteMapLayer").mockResolvedValue(undefined as never);
    return { mapStore, urban, scene, engine, deleteLayer };
}

/** Track two Explore layers of the Green Spaces story: A visible, B hidden. */
function trackGreenLayers(urban: ReturnType<typeof useUrbanStoriesStore>, visibleA = true, visibleB = false) {
    const a = addExploreLayer(map, "layer:a", visibleA);
    const b = addExploreLayer(map, "layer:b", visibleB);
    urban.addedByStory = { "green-spaces": { "green-areas": a.id, "park-pois": b.id } };
    return { a, b };
}

const visibility = (id: string): string | undefined => map.layers.get(id)?.visibility;

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    restoreConfig = [publishStoryConfig("green-spaces", "story-1"), publishStoryConfig("transit-equity", "story-2")];
    backend.fetchBackendJson.mockImplementation(async () => storyDetail(4));
});

afterEach(() => {
    restoreConfig.forEach((restore) => restore());
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("urbanStories lifecycle: story switching keeps Explore layers (D1)", () => {
    test("switching stories ends the run but keeps tracked records and deletes nothing", async () => {
        const { urban, deleteLayer, engine } = setup();
        urban.selectStory("green-spaces");
        const { a } = trackGreenLayers(urban);
        await urban.startStory("green-spaces");

        urban.selectStory("transit-equity");
        await vi.waitFor(() => expect(urban.runState).toBe("idle"));

        expect(urban.activeStoryKey).toBe("transit-equity");
        expect(urban.trackedLayers.map((tracked) => tracked.runtimeId).sort()).toEqual(["layer:a", "layer:b"]);
        expect(urban.trackedLayers.find((tracked) => tracked.runtimeId === a.id)?.storyKey).toBe("green-spaces");
        expect(engine.closeStory).toHaveBeenCalledWith({ removeLayers: true });
        expect(deleteLayer).not.toHaveBeenCalled();
    });

    test("layers from two stories stay listed together after switching and replaying", async () => {
        const { urban } = setup();
        urban.selectStory("green-spaces");
        trackGreenLayers(urban);
        const pt = addExploreLayer(map, "layer:pt");
        urban.addedByStory = { ...urban.addedByStory, "transit-equity": { "pt-stops": pt.id } };

        await urban.startStory("green-spaces");
        urban.selectStory("transit-equity");
        await vi.waitFor(() => expect(urban.runState).toBe("idle"));
        await urban.startStory("transit-equity");

        expect(urban.trackedLayers.map((tracked) => tracked.runtimeId).sort()).toEqual(["layer:a", "layer:b", "layer:pt"]);
    });
});

describe("urbanStories lifecycle: focus mode (D2)", () => {
    test("is off by default and a run then leaves every layer untouched", async () => {
        const { urban } = setup();
        trackGreenLayers(urban);

        await urban.startStory("green-spaces");

        expect(urban.focusEnabled).toBe(false);
        expect(visibility("layer:a")).toBe("visible");
        expect(map.setLayoutProperty).not.toHaveBeenCalled();
    });

    test("hides tracked layers on start and restores A visible, B hidden on exit", async () => {
        const { urban } = setup();
        urban.setFocusEnabled(true);
        trackGreenLayers(urban);

        await urban.startStory("green-spaces");
        expect(visibility("layer:a")).toBe("none");
        expect(visibility("layer:b")).toBe("none");
        expect(urban.runSnapshot?.visibility).toEqual({ "layer:a": true, "layer:b": false });

        await urban.endRun({ camera: "previous" });
        expect(visibility("layer:a")).toBe("visible");
        expect(visibility("layer:b")).toBe("none");
        expect(urban.runSnapshot).toBeUndefined();
    });

    test("the snapshot wins over a layer the user re-showed during the run", async () => {
        const { urban, mapStore } = setup();
        urban.setFocusEnabled(true);
        const { b } = trackGreenLayers(urban);
        await urban.startStory("green-spaces");

        mapStore.setLogicalLayerVisibility(b, true); // user shows the layer that was hidden before the run
        await urban.endRun({ camera: "none" });

        expect(visibility("layer:b")).toBe("none");
    });

    test("restore skips ids deleted during the run and never recreates them", async () => {
        const { urban, mapStore } = setup();
        urban.setFocusEnabled(true);
        trackGreenLayers(urban);
        await urban.startStory("green-spaces");

        const index = mapStore.layersOnMap.findIndex((layer) => layer.id === "layer:a");
        mapStore.layersOnMap.splice(index, 1);
        map.layers.delete("layer:a");
        const calls = map.setLayoutProperty.mock.calls.length;
        await urban.endRun({ camera: "none" });

        expect(map.layers.has("layer:a")).toBe(false);
        expect(mapStore.layersOnMap.map((layer) => layer.id)).not.toContain("layer:a");
        expect(map.setLayoutProperty.mock.calls.length).toBe(calls + 1); // only layer B is set back
        expect(visibility("layer:b")).toBe("none");
    });

    test("toggling focus during a run snapshots then, and toggling off restores at once", async () => {
        const { urban } = setup();
        trackGreenLayers(urban);
        await urban.startStory("green-spaces");
        expect(visibility("layer:a")).toBe("visible");

        urban.setFocusEnabled(true);
        expect(visibility("layer:a")).toBe("none");
        expect(urban.runSnapshot?.visibility).toEqual({ "layer:a": true, "layer:b": false });

        urban.setFocusEnabled(false);
        expect(visibility("layer:a")).toBe("visible");
        expect(visibility("layer:b")).toBe("none");
        expect(urban.runSnapshot?.visibility).toBeUndefined();
    });

    test("focus never touches layers the panel did not add", async () => {
        const { urban, deleteLayer } = setup();
        urban.setFocusEnabled(true);
        trackGreenLayers(urban);
        addExploreLayer(map, "datastores:other");

        await urban.startStory("green-spaces");
        expect(visibility("datastores:other")).toBe("visible");
        await urban.endRun({ camera: "none" });

        expect(visibility("datastores:other")).toBe("visible");
        expect(deleteLayer).not.toHaveBeenCalled();
    });
});

describe("urbanStories lifecycle: camera", () => {
    test("back to Explore returns to the camera captured at the start", async () => {
        const { urban } = setup();
        await urban.startStory("green-spaces");

        await urban.endRun({ camera: "previous" });

        expect(map.flyTo).toHaveBeenCalledWith(expect.objectContaining({ center: [9.99, 53.55], zoom: 11, bearing: 0, pitch: 0 }));
    });

    test("return to overview flies to the story's overview camera, and reduced motion jumps", async () => {
        const { urban } = setup();
        const overview = getStoryConfig("green-spaces")!.overviewCamera;
        await urban.startStory("green-spaces");
        await urban.endRun({ camera: "overview" });
        expect(map.flyTo).toHaveBeenCalledWith(expect.objectContaining({ center: overview.center, zoom: overview.zoom }));

        vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
        await urban.startStory("green-spaces");
        await urban.endRun({ camera: "overview" });
        expect(map.jumpTo).toHaveBeenCalledWith(expect.objectContaining({ center: overview.center }));
        expect(map.flyTo).toHaveBeenCalledTimes(1);
    });

    test("interruptions never move the camera", async () => {
        const { urban } = setup();
        urban.selectStory("green-spaces");
        await urban.startStory("green-spaces");

        urban.selectStory("transit-equity");
        await vi.waitFor(() => expect(urban.runState).toBe("idle"));

        expect(map.flyTo).not.toHaveBeenCalled();
        expect(map.jumpTo).not.toHaveBeenCalled();
    });
});

describe("urbanStories lifecycle: interruptions", () => {
    test("a map reset by another feature ends the run and clears the snapshot", async () => {
        const { urban, mapStore, engine } = setup();
        urban.setFocusEnabled(true);
        trackGreenLayers(urban);
        await urban.startStory("green-spaces");
        // Pretend the scene group is on the map too, like the real engine adds it.
        addExploreLayer(map, "scene:group");

        mapStore.layersOnMap.splice(0);
        await nextTick();
        await vi.waitFor(() => expect(urban.runState).toBe("idle"));

        expect(urban.runSnapshot).toBeUndefined();
        expect(engine.closeStory).toHaveBeenLastCalledWith({ removeLayers: true });
        expect(map.flyTo).not.toHaveBeenCalled();
    });

    test("emptying the list while the engine is switching scenes is not a reset", async () => {
        const { urban, mapStore, scene } = setup();
        addExploreLayer(map, "scene:group");
        await urban.startStory("green-spaces");
        (scene as unknown as { switching: boolean }).switching = true;

        mapStore.layersOnMap.splice(0);
        await nextTick();

        expect(urban.runState).toBe("running");
    });

    test("ending a run is idempotent and safe with nothing running", async () => {
        const { urban, engine } = setup();

        await urban.endRun({ camera: "previous" });
        await urban.endRun({ camera: "overview" });

        expect(engine.closeStory).not.toHaveBeenCalled();
        expect(map.flyTo).not.toHaveBeenCalled();
    });

    test("never closes a story the reader opened", async () => {
        const { urban, scene, engine } = setup();
        scene.story = storyDetail(2);

        urban.selectStory("green-spaces");
        urban.selectStory("transit-equity");
        await urban.endRun({ camera: "none" });

        expect(engine.closeStory).not.toHaveBeenCalled();
        expect(scene.story).toBeDefined();
    });

    test("a late openStory result after a superseding run is dropped and the newer story stays", async () => {
        const { urban, scene, engine } = setup();
        const slow = deferred();
        engine.gate.afterAssign = slow;
        const first = urban.startStory("green-spaces");
        await vi.waitFor(() => expect(engine.openStory).toHaveBeenCalledTimes(1));
        engine.gate.afterAssign = undefined;

        await urban.startStory("green-spaces");
        const newer = scene.story;
        expect(newer).toBeDefined();
        slow.resolve();

        expect(await first).toEqual({ status: "superseded" });
        expect(scene.story).toBe(newer);
        expect(urban.runState).toBe("running");
    });
});

describe("urbanStories lifecycle: repeated cycles", () => {
    test("ten enter/exit cycles leave no extra listeners, layers or state", async () => {
        const { urban, mapStore, deleteLayer } = setup();
        urban.setFocusEnabled(true);
        trackGreenLayers(urban);
        const listeners = map.on.mock.calls.length;
        const layerCount = mapStore.layersOnMap.length;

        for (let i = 0; i < 10; i += 1) {
            await urban.startStory("green-spaces");
            urban.stepScene(1);
            await urban.endRun({ camera: "previous" });
        }

        expect(map.on.mock.calls.length).toBe(listeners);
        expect(mapStore.layersOnMap).toHaveLength(layerCount);
        expect(urban.trackedLayers).toHaveLength(2);
        expect(urban.runState).toBe("idle");
        expect(urban.runSnapshot).toBeUndefined();
        expect(urban.runLayerWarnings).toEqual([]);
        expect(visibility("layer:a")).toBe("visible");
        expect(visibility("layer:b")).toBe("none");
        expect(deleteLayer).not.toHaveBeenCalled();
    });

    test("starting again without ending restores the old snapshot before taking a new one", async () => {
        const { urban } = setup();
        urban.setFocusEnabled(true);
        trackGreenLayers(urban);

        await urban.startStory("green-spaces");
        await urban.startStory("green-spaces");
        await urban.endRun({ camera: "none" });

        expect(visibility("layer:a")).toBe("visible");
        expect(visibility("layer:b")).toBe("none");
    });

    test("repeated playback after switching stories reaches the same end state", async () => {
        const { urban } = setup();
        urban.selectStory("green-spaces");
        trackGreenLayers(urban);

        for (const key of ["green-spaces", "transit-equity", "green-spaces", "transit-equity"] as const) {
            urban.selectStory(key);
            await vi.waitFor(() => expect(urban.runState).toBe("idle"));
            await urban.startStory(key);
            expect(urban.runningStoryKey).toBe(key);
        }
        await urban.endRun({ camera: "none" });

        expect(urban.trackedLayers).toHaveLength(2);
        expect(urban.runState).toBe("idle");
    });
});

describe("urbanStories lifecycle: scenes never restyle Explore layers", () => {
    test("a full run with scene switching makes no style, filter or paint calls", async () => {
        const { urban, mapStore } = setup();
        trackGreenLayers(urban);
        const setStyle = vi.spyOn(mapStore, "setStandaloneLayerStyle");
        const setOpacity = vi.spyOn(mapStore, "setLogicalLayerOpacity");

        await urban.startStory("green-spaces");
        urban.stepScene(1);
        urban.stepScene(1);
        urban.goToScene("scene-1");
        await urban.endRun({ camera: "previous" });

        expect(setStyle).not.toHaveBeenCalled();
        expect(setOpacity).not.toHaveBeenCalled();
        expect(map.setPaintProperty).not.toHaveBeenCalled();
        expect(map.setFilter).not.toHaveBeenCalled();
        expect(map.setLayoutProperty).not.toHaveBeenCalled();
    });

    test("the panel store keeps no visibility state beyond the temporary focus snapshot", () => {
        const { urban } = setup();

        expect(Object.keys(urban.$state)).not.toEqual(expect.arrayContaining(["visibility", "opacity", "visible"]));
        expect(urban.runSnapshot).toBeUndefined();
    });
});

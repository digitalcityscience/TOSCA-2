import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getStoryConfig } from "../config/urbanStories";
import { resetUrbanStoryProbes } from "@helpers/urbanStoryLayers";
import {
    deferred, fakeCameraMap, fakeSceneEngine, publishStoryConfig, storyDetail,
} from "../components/UrbanStories/__fixtures__/runHarness";
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
    useMapStore().map = map as never;
    const urban = useUrbanStoriesStore();
    const scene = useGeostorySceneStore();
    return { urban, scene, engine: fakeSceneEngine(scene) };
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    restoreConfig = [publishStoryConfig("green-spaces", "story-1"), publishStoryConfig("transit-equity", "story-2")];
});

afterEach(() => {
    restoreConfig.forEach((restore) => restore());
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("urbanStories run: start and states", () => {
    test("loads the backend story and opens it with the existing scene engine, once", async () => {
        const { urban, engine } = setup();
        const detail = storyDetail(4);
        backend.fetchBackendJson.mockResolvedValue(detail);

        const result = await urban.startStory("green-spaces");

        expect(result).toEqual({ status: "started" });
        expect(String(backend.fetchBackendJson.mock.calls[0][0])).toContain("/api/v1/stories/story-1/");
        expect(engine.openStory).toHaveBeenCalledTimes(1);
        expect(engine.openStory.mock.calls[0][0]).toBe(detail);
        expect(urban.runState).toBe("running");
        expect(urban.runningStoryKey).toBe("green-spaces");
    });

    test("a story without a backend id runs its own chapters, with no request and no scene engine", async () => {
        const { urban, engine } = setup();

        const result = await urban.startStory("fifteen-minute");

        expect(result).toEqual({ status: "started" });
        expect(urban.runState).toBe("running");
        expect(urban.runMode).toBe("chapters");
        expect(backend.fetchBackendJson).not.toHaveBeenCalled();
        expect(engine.openStory).not.toHaveBeenCalled();
    });

    test.each([
        ["a 404 from the stories API", new Error("GeoStory request failed (404 Not Found): ")] as const,
        ["a 403 from the stories API", new Error("GeoStory request failed (403 Forbidden): ")] as const,
    ])("%s reads as unpublished", async (_label, error) => {
        const { urban, engine } = setup();
        backend.fetchBackendJson.mockRejectedValue(error);

        expect(await urban.startStory("green-spaces")).toEqual({ status: "failed", issue: "unpublished" });
        expect(engine.openStory).not.toHaveBeenCalled();
    });

    test("a network or server failure is fetch-failed and can be retried", async () => {
        const { urban } = setup();
        backend.fetchBackendJson.mockRejectedValueOnce(new Error("GeoStory request failed (503 Service Unavailable): "));

        expect(await urban.startStory("green-spaces")).toEqual({ status: "failed", issue: "fetch-failed" });
        expect(urban.runState).toBe("error");

        backend.fetchBackendJson.mockResolvedValueOnce(storyDetail(2));
        expect(await urban.startStory("green-spaces")).toEqual({ status: "started" });
        expect(urban.runIssue).toBeUndefined();
    });

    test("a draft story is unpublished and a story without scenes is empty; neither touches the map", async () => {
        const { urban, engine } = setup();
        backend.fetchBackendJson.mockResolvedValueOnce(storyDetail(2, { status: "draft" }));
        expect(await urban.startStory("green-spaces")).toEqual({ status: "failed", issue: "unpublished" });

        backend.fetchBackendJson.mockResolvedValueOnce(storyDetail(0));
        expect(await urban.startStory("green-spaces")).toEqual({ status: "failed", issue: "empty" });

        expect(engine.openStory).not.toHaveBeenCalled();
        expect(map.flyTo).not.toHaveBeenCalled();
    });

    test("without a map the run reports map-not-ready", async () => {
        const { urban } = setup();
        useMapStore().map = undefined as never;

        expect(await urban.startStory("green-spaces")).toEqual({ status: "failed", issue: "map-not-ready" });
    });

    test("an openStory failure ends in an error state and removes the scene group", async () => {
        const { urban, engine } = setup();
        backend.fetchBackendJson.mockResolvedValue(storyDetail(2));
        engine.openStory.mockRejectedValueOnce(new Error("boom"));

        expect(await urban.startStory("green-spaces")).toEqual({ status: "failed", issue: "fetch-failed" });
        expect(engine.closeStory).toHaveBeenCalledWith({ removeLayers: true });
        expect(urban.runDetail).toBeUndefined();
    });

    test("a layer error is collected once per layer and does not stop the run", async () => {
        const { urban, engine } = setup();
        backend.fetchBackendJson.mockResolvedValue(storyDetail(2));
        engine.openStory.mockImplementationOnce(async (detail, options) => {
            const sceneLayer = { layer: { workspace: { name: "WS" }, name: "lyr" } } as never;
            options?.onLayerError?.(new Error("x"), sceneLayer);
            options?.onLayerError?.(new Error("x"), sceneLayer);
            useGeostorySceneStore().story = detail;
        });

        await urban.startStory("green-spaces");

        expect(urban.runLayerWarnings).toEqual(["WS:lyr"]);
        expect(urban.runState).toBe("running");
    });
});

describe("urbanStories run: navigation through the scene engine", () => {
    test("next, previous and jump call showScene with the right ids and respect the ends", async () => {
        const { urban, engine } = setup();
        backend.fetchBackendJson.mockResolvedValue(storyDetail(3));
        await urban.startStory("green-spaces");
        const scene = useGeostorySceneStore();
        // The fake engine does not derive `scenes`; the real computed does, from `story`.
        expect(scene.scenes.map((item) => item.id)).toEqual(["scene-1", "scene-2", "scene-3"]);

        urban.stepScene(-1);
        expect(engine.showScene).not.toHaveBeenCalled();
        urban.stepScene(1);
        urban.stepScene(1);
        urban.stepScene(1);
        urban.goToScene("scene-1");
        urban.stepScene(-1);

        expect(engine.showScene.mock.calls.map((call) => call[0])).toEqual(["scene-2", "scene-3", "scene-1"]);
    });

    test("a showScene rejection is reported and navigation keeps working", async () => {
        const { urban, engine } = setup();
        backend.fetchBackendJson.mockResolvedValue(storyDetail(3));
        await urban.startStory("green-spaces");
        engine.showScene.mockRejectedValueOnce(new Error("scene failed"));

        urban.goToScene("scene-2");
        await Promise.resolve();
        urban.goToScene("scene-3");

        expect(engine.showScene).toHaveBeenCalledTimes(2);
        expect(console.error).toHaveBeenCalledWith("[TOSCA] Switching GeoStory scene scene-2", expect.any(Error));
    });

    test("navigation is ignored when no run is active", async () => {
        const { urban, engine } = setup();

        urban.goToScene("scene-2");

        expect(engine.showScene).not.toHaveBeenCalled();
    });
});

describe("urbanStories run: stale results", () => {
    test("switching stories while the fetch is pending never opens the first story", async () => {
        const { urban, engine } = setup();
        const first = deferred<ReturnType<typeof storyDetail>>();
        backend.fetchBackendJson.mockReturnValueOnce(first.promise).mockResolvedValueOnce(storyDetail(2, { id: "story-2" }));

        const firstRun = urban.startStory("green-spaces");
        urban.selectStory("transit-equity");
        const secondRun = urban.startStory("transit-equity");
        first.resolve(storyDetail(2));

        expect(await firstRun).toEqual({ status: "superseded" });
        expect(await secondRun).toEqual({ status: "started" });
        expect(engine.openStory).toHaveBeenCalledTimes(1);
        expect(engine.openStory.mock.calls[0][0].id).toBe("story-2");
        expect(urban.runningStoryKey).toBe("transit-equity");
    });

    test("an openStory that finishes after the run ended leaves no scene group behind", async () => {
        const { urban, engine, scene } = setup();
        backend.fetchBackendJson.mockResolvedValue(storyDetail(2));
        engine.gate.open = deferred();

        const run = urban.startStory("green-spaces");
        await vi.waitFor(() => expect(engine.openStory).toHaveBeenCalled());
        await urban.endRun({ camera: "none" });
        engine.gate.open.resolve();

        expect(await run).toEqual({ status: "superseded" });
        expect(scene.story).toBeUndefined();
        expect(urban.runState).toBe("idle");
    });
});

describe("urbanStories run: chapters follow the scene engine (UST-07)", () => {
    function greenStory() {
        return getStoryConfig("green-spaces")!;
    }

    test("related entries of the active chapter come first and nothing is hidden", async () => {
        const { urban, scene } = setup();
        backend.fetchBackendJson.mockResolvedValue(storyDetail(5));
        await urban.startStory("green-spaces");
        const story = greenStory();

        // Chapter 1 (position 1): green-areas.
        let result = urban.prioritisedEntries(story);
        expect(result.chapter?.chapterKey).toBe("green-inventory");
        expect(result.related.map((entry) => entry.key)).toEqual(["green-areas"]);
        expect(result.related.length + result.others.length).toBe(story.explore.length);

        // Request chapter 3 through the engine: ordering follows the target scene at once.
        scene.targetSceneId = "scene-3";
        result = urban.prioritisedEntries(story);
        expect(result.related.map((entry) => entry.key)).toEqual(["stadtteile-green-access", "buildings-park-access", "park-pois"]);
        expect(result.others.map((entry) => entry.key)).not.toContain("park-pois");
        expect(result.related.length + result.others.length).toBe(story.explore.length);
    });

    test("an entry stays in exactly one group even when two chapters name it", async () => {
        const { urban, scene } = setup();
        backend.fetchBackendJson.mockResolvedValue(storyDetail(5));
        await urban.startStory("green-spaces");
        scene.targetSceneId = "scene-4";

        const { related, others } = urban.prioritisedEntries(greenStory());

        expect(related.map((entry) => entry.key)).toEqual(["stadtteile-green-access", "units-green-access", "bezirke-green-access", "park-pois"]);
        expect(new Set([...related, ...others]).size).toBe(greenStory().explore.length);
    });

    test("without a run, ordering is the normal one; ending the run restores it", async () => {
        const { urban } = setup();
        const story = greenStory();
        expect(urban.prioritisedEntries(story)).toEqual({ related: [], others: story.explore });

        backend.fetchBackendJson.mockResolvedValue(storyDetail(5));
        await urban.startStory("green-spaces");
        expect(urban.prioritisedEntries(story).related.length).toBeGreaterThan(0);

        await urban.endRun({ camera: "none" });
        expect(urban.prioritisedEntries(story)).toEqual({ related: [], others: story.explore });
    });

    test("a scene with no configured chapter, or a chapter with no entries, gives the normal order", async () => {
        const { urban, scene } = setup();
        backend.fetchBackendJson.mockResolvedValue(storyDetail(6));
        await urban.startStory("green-spaces");
        const story = greenStory();

        scene.targetSceneId = "scene-6"; // beyond the four configured chapters
        expect(urban.prioritisedEntries(story)).toEqual({ related: [], others: story.explore });

        const chapter = story.chapters[1];
        const original = chapter.relatedExploreEntries;
        chapter.relatedExploreEntries = [];
        try {
            scene.targetSceneId = "scene-2";
            const result = urban.prioritisedEntries(story);
            expect(result.related).toEqual([]);
            expect(result.others).toHaveLength(story.explore.length);
        } finally {
            chapter.relatedExploreEntries = original;
        }
    });

    test("an unknown related entry key is ignored with one developer warning", async () => {
        const { urban, scene } = setup();
        backend.fetchBackendJson.mockResolvedValue(storyDetail(5));
        await urban.startStory("green-spaces");
        const story = greenStory();
        const chapter = story.chapters[0];
        const original = chapter.relatedExploreEntries;
        chapter.relatedExploreEntries = ["ghost", "green-areas"];
        try {
            scene.targetSceneId = "scene-1";
            urban.prioritisedEntries(story);
            const result = urban.prioritisedEntries(story);
            expect(result.related.map((entry) => entry.key)).toEqual(["green-areas"]);
            expect(console.error).toHaveBeenCalledTimes(1);
        } finally {
            chapter.relatedExploreEntries = original;
        }
    });

    test("reads only the engine's scene ids: ordering never writes back to the scene store", async () => {
        const { urban, engine } = setup();
        backend.fetchBackendJson.mockResolvedValue(storyDetail(5));
        await urban.startStory("green-spaces");
        engine.showScene.mockClear();

        for (let i = 0; i < 5; i += 1) urban.prioritisedEntries(greenStory());

        expect(engine.showScene).not.toHaveBeenCalled();
    });

    test("exposes the active chapter's narrative slice and the introduction", async () => {
        const { urban, scene } = setup();
        backend.fetchBackendJson.mockResolvedValue(storyDetail(5));
        await urban.startStory("green-spaces");

        expect(urban.introBlocks.map((block) => block.data?.text)).toEqual(["Intro text"]);
        scene.targetSceneId = "scene-2";
        expect(urban.activeChapterBlocks.map((block) => block.data?.text)).toEqual(["Narrative 2"]);
    });
});

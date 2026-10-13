import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { resetUrbanStoryProbes } from "@helpers/urbanStoryLayers";
import { addExploreLayer, fakeCameraMap, fakeSceneEngine } from "../components/UrbanStories/__fixtures__/runHarness";
import { getStoryConfig, type StoryChapter } from "../config/urbanStories";
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

const CHAPTERS: StoryChapter[] = [
    {
        chapterKey: "one",
        title: { en: "One", de: "Eins" },
        camera: { center: [10, 53.5], zoom: 12 },
        show: [{ entryKey: "green-areas" }],
        scene: { id: null, order: 1 },
        relatedExploreEntries: ["green-areas"],
    },
    {
        chapterKey: "two",
        title: { en: "Two", de: "Zwei" },
        narrative: { en: "Second chapter", de: "Zweites Kapitel" },
        scene: { id: null, order: 2 },
        relatedExploreEntries: [],
    },
];

let map: ReturnType<typeof fakeCameraMap>;
let restoreChapters: () => void;

function setup() {
    setActivePinia(createPinia());
    resetUrbanStoryProbes();
    map = fakeCameraMap();
    useMapStore().map = map as never;
    const urban = useUrbanStoriesStore();
    const engine = fakeSceneEngine(useGeostorySceneStore());
    // A hidden Explore layer already on the map: the chapter must reuse it, not add a second one.
    const layer = addExploreLayer(map, "layer:green", false);
    urban.addedByStory = { "green-spaces": { "green-areas": layer.id } };
    return { urban, engine };
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    const config = getStoryConfig("green-spaces")!;
    const previous = config.chapters;
    config.chapters = CHAPTERS;
    restoreChapters = () => { config.chapters = previous; };
});

afterEach(() => {
    restoreChapters();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("urbanStories chapter run (no backend GeoStory)", () => {
    test("starts on the first chapter: camera moves, its layer becomes visible, nothing is requested", async () => {
        const { urban, engine } = setup();

        expect(await urban.startStory("green-spaces")).toEqual({ status: "started" });

        expect(urban.runMode).toBe("chapters");
        expect(urban.activeChapter?.chapterKey).toBe("one");
        expect(map.flyTo).toHaveBeenCalledWith(expect.objectContaining({ center: [10, 53.5], zoom: 12 }));
        expect(map.layers.get("layer:green")?.visibility).toBe("visible");
        expect(backend.fetchBackendJson).not.toHaveBeenCalled();
        expect(engine.openStory).not.toHaveBeenCalled();
    });

    test("steps and jumps between chapters; a chapter without a camera leaves the camera alone", async () => {
        const { urban } = setup();
        await urban.startStory("green-spaces");
        map.flyTo.mockClear();

        urban.stepScene(1);
        await vi.waitFor(() => expect(urban.activeChapter?.chapterKey).toBe("two"));
        expect(urban.currentChapterIndex).toBe(1);
        expect(urban.chapterCount).toBe(2);
        expect(map.flyTo).not.toHaveBeenCalled();

        urban.stepScene(1); // past the end: ignored
        expect(urban.currentChapterIndex).toBe(1);
        await urban.goToChapter(0);
        expect(urban.activeChapter?.chapterKey).toBe("one");
    });

    test("ending the run restores the starting camera, keeps the layer and never touches the scene engine", async () => {
        const { urban, engine } = setup();
        await urban.startStory("green-spaces");

        await urban.endRun({ camera: "previous" });

        expect(map.flyTo).toHaveBeenLastCalledWith(expect.objectContaining({ center: [9.99, 53.55], zoom: 11 }));
        expect(map.layers.get("layer:green")?.visibility).toBe("visible");
        expect(urban.runState).toBe("idle");
        expect(engine.closeStory).not.toHaveBeenCalled();
    });

    test("removing the last layer does not end a chapter run", async () => {
        const { urban } = setup();
        await urban.startStory("green-spaces");

        useMapStore().layersOnMap = [];
        await Promise.resolve();

        expect(urban.runState).toBe("running");
    });

    test("a story with no chapters fails as empty instead of pretending to play", async () => {
        const { urban } = setup();
        getStoryConfig("green-spaces")!.chapters = [];

        expect(await urban.startStory("green-spaces")).toEqual({ status: "failed", issue: "empty" });
    });
});

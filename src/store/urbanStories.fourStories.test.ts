import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { resetUrbanStoryProbes } from "@helpers/urbanStoryLayers";
import { createFakeCatalog, fakeRegistryMap, wireMapStore, type FakeCatalog } from "../components/UrbanStories/__fixtures__/catalogHarness";
import { fakeSceneEngine } from "../components/UrbanStories/__fixtures__/runHarness";
import { isHeavyLayer } from "../config/urbanStories/layers";
import { getStoryConfig, URBAN_STORIES, type UrbanStoryConfig } from "../config/urbanStories";
import { useGeostorySceneStore } from "./geostoryScenes";
import { useUrbanStoriesStore } from "./urbanStories";

/**
 * M4 acceptance: the four REAL frontend chapter configs (no published test story, no backend ids)
 * played end to end against a mocked catalog and a fake map.
 */

const backend = vi.hoisted(() => ({ fetchBackendJson: vi.fn() }));
vi.mock("./backend", async (importOriginal) => ({
    ...(await importOriginal<typeof import("./backend")>()),
    fetchBackendJson: backend.fetchBackendJson,
}));
const catalogHolder = vi.hoisted(() => ({ current: undefined as undefined | { geoserver: unknown } }));
vi.mock("@store/geoserver", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@store/geoserver")>()),
    useGeoserverStore: () => catalogHolder.current!.geoserver,
}));
vi.mock("@helpers/toast", () => ({ useToast: () => ({ add: vi.fn() }) }));

let catalog: FakeCatalog;
let map: ReturnType<typeof fakeRegistryMap>;

function setup() {
    setActivePinia(createPinia());
    resetUrbanStoryProbes();
    catalog = createFakeCatalog({});
    catalogHolder.current = catalog;
    map = fakeRegistryMap();
    const mapStore = wireMapStore(map);
    const urban = useUrbanStoriesStore();
    fakeSceneEngine(useGeostorySceneStore());
    return { mapStore, urban };
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

// HamburgRiders is an interactive experience without catalog entries or chapters; its own tests live in hamburgRiders.*.test.ts.
const STORIES = URBAN_STORIES.filter((story) => story.chapters.length > 0).map((story) => [story.key, story] as [string, UrbanStoryConfig]);

describe.each(STORIES)("%s: authored chapters", (_key, story) => {
    test("authored chapters have en/de title and narrative, a camera and valid show references", () => {
        expect(story.geostory.id).toBeNull();
        expect(story.chapters).toHaveLength(5);
        for (const chapter of story.chapters) {
            for (const text of [chapter.title, chapter.narrative!]) {
                expect(text.en.length, chapter.chapterKey).toBeGreaterThan(10);
                expect(text.de.length, chapter.chapterKey).toBeGreaterThan(10);
            }
            expect(chapter.camera, chapter.chapterKey).toBeDefined();
            expect(chapter.show?.length, chapter.chapterKey).toBeGreaterThan(0);
        }
    });

    test("every shown entry exists, every shown metric has a verified style, no entry is shown twice in a chapter", () => {
        for (const chapter of story.chapters) {
            const keys = chapter.show!.map((shown) => shown.entryKey);
            expect(new Set(keys).size, chapter.chapterKey).toBe(keys.length);
            for (const shown of chapter.show!) {
                const entry = story.explore.find((candidate) => candidate.key === shown.entryKey);
                expect(entry, `${chapter.chapterKey}/${shown.entryKey}`).toBeDefined();
                if (shown.metricKey !== undefined) {
                    const metric = entry!.metrics.find((option) => option.key === shown.metricKey);
                    if (entry!.styleSource === "frontend") {
                        // Frontend-owned styling: a local style name and no catalog verification.
                        expect(metric?.styleName, `${chapter.chapterKey}/${shown.metricKey}`).toMatch(["walkability-safety", "building-walking"].includes(story.key) ? /^frontend:walkability:/ : /^frontend:15min:/);
                        expect(metric?.styleVerifiedOn).toBeUndefined();
                    } else {
                        expect(metric?.styleName, `${chapter.chapterKey}/${shown.metricKey}`).toMatch(/^urbanstories-/);
                        expect(metric?.styleVerifiedOn).toBeDefined();
                    }
                }
            }
        }
    });

    test("a chapter that shows a heavy layer zooms to at least its floor", () => {
        for (const chapter of story.chapters) {
            for (const shown of chapter.show!) {
                const entry = story.explore.find((candidate) => candidate.key === shown.entryKey)!;
                if (isHeavyLayer(entry.layer)) {
                    expect(chapter.camera!.zoom, `${chapter.chapterKey}/${entry.key}`).toBeGreaterThanOrEqual(entry.minZoom!);
                }
            }
        }
    });

    test("the safety-deficit and green-inventory styles are not used by any chapter", () => {
        const styles = story.explore.flatMap((entry) => entry.metrics.map((metric) => metric.styleName));
        expect(styles).not.toContain("urbanstories-safety-deficit");
        expect(styles).not.toContain("urbanstories-green-inventory");
    });
});

describe.each(STORIES)("%s: frontend chapter run", (_key, story) => {
    test("starts without a backend id, follows every chapter's camera, layers and related entries, never calls the stories API", async () => {
        const { urban, mapStore } = setup();
        urban.selectStory(story.key);

        expect(await urban.startStory(story.key)).toEqual({ status: "started" });
        expect(urban.runMode).toBe("chapters");
        expect(urban.chapterCount).toBe(story.chapters.length);

        for (const [index, chapter] of story.chapters.entries()) {
            if (index > 0) urban.stepScene(1);
            await vi.waitFor(() => expect(urban.activeChapter?.chapterKey).toBe(chapter.chapterKey));
            await vi.waitFor(() => expect(map.flyTo).toHaveBeenLastCalledWith(
                expect.objectContaining({ center: chapter.camera!.center, zoom: chapter.camera!.zoom })
            ));
            // Layers are added asynchronously after the camera: wait until all shown entries are tracked and visible.
            await vi.waitFor(() => {
                for (const shown of chapter.show!) {
                    const id = urban.addedByStory[story.key]?.[shown.entryKey];
                    expect(id, `${chapter.chapterKey}/${shown.entryKey}`).toBeDefined();
                    expect(mapStore.getLayerUiState(id!)?.visible, `${chapter.chapterKey}/${shown.entryKey}`).not.toBe(false);
                }
            });
            const { related } = urban.prioritisedEntries(story);
            expect(related.map((entry) => entry.key)).toEqual([...new Set(chapter.relatedExploreEntries)]);
        }

        const ids = Object.values(urban.addedByStory[story.key] ?? {});
        expect(new Set(ids).size, "no catalog layer is added twice").toBe(ids.length);
        expect(backend.fetchBackendJson).not.toHaveBeenCalled();
    });

    test("chapter layers are staged: a layer the current chapter does not show is hidden, not removed", async () => {
        const { urban, mapStore } = setup();
        await urban.startStory(story.key);
        for (let index = 0; index < story.chapters.length; index += 1) {
            if (index > 0) urban.stepScene(1);
            await vi.waitFor(() => expect(urban.activeChapter?.chapterKey).toBe(story.chapters[index].chapterKey));
            await vi.waitFor(() => {
                for (const shown of story.chapters[index].show!) {
                    expect(urban.addedByStory[story.key]?.[shown.entryKey]).toBeDefined();
                }
            });
            const shownKeys = new Set(story.chapters[index].show!.map((shown) => shown.entryKey));
            for (const [entryKey, runtimeId] of Object.entries(urban.addedByStory[story.key] ?? {})) {
                const visible = mapStore.getLayerUiState(runtimeId)?.visible !== false;
                expect(visible, `${story.chapters[index].chapterKey}/${entryKey}`).toBe(shownKeys.has(entryKey));
            }
        }
        expect(mapStore.layersOnMap.length).toBeGreaterThan(0);
    });

    test("exit restores the previous camera and keeps layers; a restart works; switching story ends the run", async () => {
        const { urban, mapStore } = setup();
        await urban.startStory(story.key);
        await vi.waitFor(() => expect(urban.addedByStory[story.key]).toBeDefined());
        const layerCount = mapStore.layersOnMap.length;

        await urban.endRun({ camera: "previous" });
        expect(urban.runState).toBe("idle");
        expect(mapStore.layersOnMap.length).toBe(layerCount);

        expect(await urban.startStory(story.key)).toEqual({ status: "started" });
        expect(urban.currentChapterIndex).toBe(0);
        // Restart does not duplicate layers.
        await vi.waitFor(() => expect(urban.addedByStory[story.key]).toBeDefined());
        expect(mapStore.layersOnMap.length).toBe(layerCount);

        const other = URBAN_STORIES.find((candidate) => candidate.key !== story.key && candidate.chapters.length > 0)!;
        urban.selectStory(other.key);
        await vi.waitFor(() => expect(urban.runState).toBe("idle"));
        expect(backend.fetchBackendJson).not.toHaveBeenCalled();
    });
});

describe("chapter staging leaves other layers alone", () => {
    test("a visible layer the user added is never hidden by a chapter run", async () => {
        const { urban, mapStore } = setup();
        const story = getStoryConfig("green-spaces")!;
        // The user adds the green areas layer first and leaves it visible; chapter 1 shows it, chapter 3 does not.
        await urban.addEntry(story.key, "green-areas");
        const userLayer = urban.addedByStory[story.key]!["green-areas"];
        await urban.startStory(story.key);
        await urban.goToChapter(2);
        await vi.waitFor(() => expect(urban.addedByStory[story.key]?.["stadtteile-green-access"]).toBeDefined());

        expect(mapStore.getLayerUiState(userLayer)?.visible).not.toBe(false);
    });

    test("a metric layer of an unrelated Datastores-style record stays", async () => {
        const { urban, mapStore } = setup();
        mapStore.add2MapLayerList({ id: "datastore:x", source: "datastore:x", sourceType: "geoserver", type: "fill", showOnLayerList: true } as never, undefined, { notify: false });
        await urban.startStory("fifteen-minute");
        await urban.goToChapter(2);
        await urban.endRun({ camera: "none" });
        expect(mapStore.layersOnMap.some((layer) => layer.id === "datastore:x")).toBe(true);
    });
});

import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { resetUrbanStoryProbes } from "@helpers/urbanStoryLayers";
import {
    createFakeCatalog, fakeRegistryMap, styledEntries, wireMapStore,
    type FakeCatalog, type FakeCatalogOptions,
} from "../components/UrbanStories/__fixtures__/catalogHarness";
import { addExploreLayer, fakeSceneEngine, publishStoryConfig, storyDetail } from "../components/UrbanStories/__fixtures__/runHarness";
import { URBAN_STORIES, type ExploreEntry, type UrbanStoryConfig } from "../config/urbanStories";
import { useGeostorySceneStore } from "./geostoryScenes";
import { type LayerObjectWithAttributes } from "./map";
import { useUrbanStoriesStore } from "./urbanStories";
import { useCatalogFixtureStory } from "../config/urbanStories/__fixtures__/useCatalogFixtureStory";

useCatalogFixtureStory();

/**
 * UST-10: the four stories end to end against a mocked catalog, a mocked stories API and a fake map.
 * The real loader, probe, Urban Stories store and map-store style swap run; only the network, the
 * MapLibre map and the scene engine are faked. Story and scene ids are test-only (the configs stay null).
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

let restoreConfig: Array<() => void> = [];
let catalog: FakeCatalog;
let map: ReturnType<typeof fakeRegistryMap>;

function setup(options: FakeCatalogOptions = {}) {
    setActivePinia(createPinia());
    resetUrbanStoryProbes();
    catalog = createFakeCatalog(options);
    catalogHolder.current = catalog;
    map = fakeRegistryMap();
    const mapStore = wireMapStore(map);
    const urban = useUrbanStoriesStore();
    const scene = useGeostorySceneStore();
    const engine = fakeSceneEngine(scene);
    return { mapStore, urban, scene, engine };
}

const record = (mapStore: ReturnType<typeof setup>["mapStore"], runtimeId: string): LayerObjectWithAttributes => (
    mapStore.layersOnMap.find((layer) => layer.id === runtimeId)!
);
/** The layer spec MapLibre currently holds for a runtime id. */
const specOf = (runtimeId: string): Record<string, any> | undefined => map.specs.find((spec) => spec.id === runtimeId);
const styleNames = (layer: LayerObjectWithAttributes): string[] => (layer.availableStyles ?? []).map((style) => style.name);
const activeStyleName = (layer: LayerObjectWithAttributes): string | undefined => (
    layer.availableStyles?.find((style) => style.id === layer.activeStyleId)?.name
);

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    restoreConfig = URBAN_STORIES.map((story) => publishStoryConfig(story.key, `test-${story.key}`));
    backend.fetchBackendJson.mockImplementation(async (url: URL | string) => {
        const key = URBAN_STORIES.find((story) => String(url).includes(`test-${story.key}`))?.key;
        const config = URBAN_STORIES.find((story) => story.key === key);
        return storyDetail(config?.chapters.length ?? 4);
    });
});

afterEach(() => {
    restoreConfig.forEach((restore) => restore());
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

// 15-Minute City is frontend-styled (no catalog style path); it is covered by urbanStories.fifteenMinute.*.test.ts.
const CATALOG_STORIES = URBAN_STORIES.filter((story) => story.explore.length > 0 && !story.explore.some((entry) => entry.styleSource === "frontend"));

describe.each(CATALOG_STORIES.map((story) => [story.key, story] as [string, UrbanStoryConfig]))("%s: Explore against the mocked catalog", (_key, story) => {
    test("every entry probes as available with its default style; only verified metrics are selectable", async () => {
        const { urban } = setup();
        await Promise.all(story.explore.map(async (entry) => await urban.loadReadiness(story.key, entry)));

        for (const entry of story.explore) {
            const result = urban.readinessOf(story.key, entry)!;
            expect(result.readiness, entry.key).toBe("available");
            for (const metric of entry.metrics) {
                if (metric.styleName === null) {
                    expect(result.metrics[metric.key], `${entry.key}/${metric.key}`).toMatchObject({ readiness: "metric-style-pending", reason: "no-style-name" });
                } else {
                    expect(result.metrics[metric.key], `${entry.key}/${metric.key}`).toEqual({ key: metric.key, readiness: "available" });
                }
            }
        }
    });

    test("probing makes bounded requests: one style list and one detail per layer", async () => {
        const { urban } = setup();
        await Promise.all(story.explore.map(async (entry) => await urban.loadReadiness(story.key, entry)));
        await Promise.all(story.explore.map(async (entry) => await urban.loadReadiness(story.key, entry)));

        const layerCount = new Set(story.explore.map((entry) => entry.layer.layerName)).size;
        expect(catalog.geoserver.getLayerInformation).toHaveBeenCalledTimes(layerCount);
        expect(catalog.geoserver.getStyleList).toHaveBeenCalledTimes(1);
    });

    test("every entry can be added once, is recognised afterwards, and heavy layers get their zoom floor", async () => {
        const { urban, mapStore } = setup();
        urban.selectStory(story.key);
        for (const entry of story.explore) {
            const result = await urban.addEntry(story.key, entry.key);
            expect(result.status, entry.key).toBe("added");
            const runtimeId = (result as { runtimeId: string }).runtimeId;
            expect(await urban.addEntry(story.key, entry.key)).toEqual({ status: "exists", runtimeId });

            const layer = record(mapStore, runtimeId);
            expect(layer["source-layer"]).toBe(entry.layer.layerName);
            expect(activeStyleName(layer), entry.key).toBe(`default-${entry.layer.layerName}`);
            if (entry.minZoom !== undefined) {
                expect(layer.minzoom, `${entry.key} floor on the layer`).toBe(entry.minZoom);
                expect(layer.availableStyles?.every((style) => style.layers.every((l) => (l.minzoom ?? 0) >= entry.minZoom!)), `${entry.key} floor on every style`).toBe(true);
            }
        }
        expect(urban.trackedLayers).toHaveLength(story.explore.length);
    });

    test("the verified metrics apply without any alternate assignment, on the right layer, and never touch other entries", async () => {
        const { urban, mapStore } = setup();
        urban.selectStory(story.key);
        const entries = styledEntries(story.key);
        expect(entries.length).toBeGreaterThan(0);
        for (const entry of entries) {
            const metric = entry.metrics.find((option) => option.styleName !== null)!;
            const added = await urban.addEntry(story.key, entry.key);
            const runtimeId = (added as { runtimeId: string }).runtimeId;
            const layer = record(mapStore, runtimeId);
            // The layer's own catalog data lists no alternate; the style comes from the provider list.
            expect(styleNames(layer)).toContain(metric.styleName);
            expect(layer.availableStyles?.find((style) => style.name === metric.styleName)?.layers[0]["source-layer"]).toBe(entry.layer.layerName);

            expect(await urban.applyMetric(story.key, entry.key, metric.key)).toEqual({ status: "applied", runtimeId });
            expect(activeStyleName(layer)).toBe(metric.styleName);
            expect(urban.activeMetricOf(story.key, entry)).toBe(metric.key);
            expect(specOf(runtimeId)?.["source-layer"]).toBe(entry.layer.layerName);
            if (entry.minZoom !== undefined) expect(specOf(runtimeId)?.minzoom).toBe(entry.minZoom);
            expect(await urban.applyMetric(story.key, entry.key, metric.key)).toEqual({ status: "unchanged", runtimeId });
        }
        // Metrics without a verified style stay unavailable and change nothing.
        const unstyled = story.explore.find((entry) => entry.metrics.some((metric) => metric.styleName === null));
        if (unstyled !== undefined) {
            const pending = unstyled.metrics.find((metric) => metric.styleName === null)!;
            const added = await urban.addEntry(story.key, unstyled.key);
            const runtimeId = (added as { runtimeId: string; status: string }).runtimeId ?? urban.runtimeIdFor(story.key, unstyled)!;
            const before = record(mapStore, runtimeId).activeStyleId;
            expect(await urban.applyMetric(story.key, unstyled.key, pending.key)).toEqual({ status: "metric-unavailable" });
            expect(record(mapStore, runtimeId).activeStyleId).toBe(before);
        }
    });

    test("a story without a backend GeoStory runs its chapters and requests nothing from the stories API", async () => {
        const { urban } = setup();
        restoreConfig.forEach((restore) => restore());
        restoreConfig = [];
        const result = await urban.startStory(story.key);

        expect(result).toEqual({ status: "started" });
        expect(urban.runState).toBe("running");
        expect(urban.runMode).toBe("chapters");
        expect(backend.fetchBackendJson).not.toHaveBeenCalled();
    });

    test("plays every chapter in order, lists the chapter's entries first, and returns to the overview", async () => {
        const { urban, scene } = setup();
        urban.selectStory(story.key);
        for (const entry of story.explore) await urban.addEntry(story.key, entry.key);
        const layersBefore = urban.trackedLayers.map((tracked) => tracked.runtimeId).sort();

        expect(await urban.startStory(story.key)).toEqual({ status: "started" });
        expect(urban.runState).toBe("running");
        expect(scene.scenes).toHaveLength(story.chapters.length);

        for (const [index, chapter] of story.chapters.entries()) {
            if (index > 0) urban.stepScene(1);
            await vi.waitFor(() => expect(urban.activeChapter?.chapterKey).toBe(chapter.chapterKey));
            const { related, others } = urban.prioritisedEntries(story);
            expect(related.map((entry) => entry.key), chapter.chapterKey).toEqual([...new Set(chapter.relatedExploreEntries)]);
            expect([...related, ...others].map((entry) => entry.key).sort()).toEqual(story.explore.map((entry) => entry.key).sort());
        }

        // Jump back to the first chapter, then to the last.
        urban.goToScene("scene-1");
        await vi.waitFor(() => expect(urban.activeChapter?.chapterKey).toBe(story.chapters[0].chapterKey));
        urban.goToScene(`scene-${story.chapters.length}`);
        await vi.waitFor(() => expect(urban.activeChapter?.chapterKey).toBe(story.chapters.at(-1)!.chapterKey));
        urban.stepScene(1); // past the end is a no-op
        expect(urban.activeChapter?.chapterKey).toBe(story.chapters.at(-1)!.chapterKey);

        await urban.endRun({ camera: "overview" });
        expect(urban.runState).toBe("idle");
        expect(map.flyTo).toHaveBeenCalledWith(expect.objectContaining({ center: story.overviewCamera.center, zoom: story.overviewCamera.zoom }));
        expect(urban.trackedLayers.map((tracked) => tracked.runtimeId).sort()).toEqual(layersBefore);
        expect(urban.prioritisedEntries(story).related).toEqual([]);
    });
});

describe("four stories together", () => {
    test("a catalog-styled layer is added once and recognised again; frontend-styled stories never share it", async () => {
        const { urban } = setup();
        const first = await urban.addEntry("green-spaces", "buildings-park-access");
        expect(first.status).toBe("added");
        const runtimeId = (first as { runtimeId: string }).runtimeId;

        expect(await urban.addEntry("green-spaces", "buildings-park-access")).toEqual({ status: "exists", runtimeId });
        expect(urban.trackedLayers).toHaveLength(1);

        // Public Transport Equity owns the styling of the same building layer, so it gets a layer of its own.
        const equity = await urban.addEntry("transit-equity", "buildings-pt");
        expect(equity.status).toBe("added");
        expect((equity as { runtimeId: string }).runtimeId).not.toBe(runtimeId);
        expect(urban.trackedLayers).toHaveLength(2);
    });

    test("the 15-Minute City building layer is its own, frontend-styled layer and never shares or replaces a catalog-styled one", async () => {
        const { urban, mapStore } = setup();
        const catalogStyled = await urban.addEntry("green-spaces", "buildings-park-access");
        const frontendStyled = await urban.addEntry("fifteen-minute", "buildings-15min");
        expect(catalogStyled.status).toBe("added");
        expect(frontendStyled.status).toBe("added");
        const ids = [catalogStyled, frontendStyled].map((result) => (result as { runtimeId: string }).runtimeId);
        expect(new Set(ids).size).toBe(2);
        expect(styleNames(record(mapStore, ids[0]))).not.toContain("frontend:15min:building:overall");
        expect(styleNames(record(mapStore, ids[1])).every((name) => name.startsWith("frontend:15min:"))).toBe(true);
        // Each story finds only its own kind again.
        expect(await urban.addEntry("green-spaces", "buildings-park-access")).toEqual({ status: "exists", runtimeId: ids[0] });
        expect(await urban.addEntry("fifteen-minute", "buildings-15min")).toEqual({ status: "exists", runtimeId: ids[1] });
    });

    test("the catalog styles are used only on their own layer; the shared admin metrics stay pending elsewhere", async () => {
        const { urban } = setup();
        const names = new Map<string, string>();
        for (const story of URBAN_STORIES) {
            for (const entry of story.explore.filter((item) => item.styleSource !== "frontend")) {
                const result = await urban.loadReadiness(story.key, entry);
                for (const metric of entry.metrics) {
                    if (result.metrics[metric.key]?.readiness === "available") {
                        names.set(`${entry.layer.layerName}/${metric.attribute}`, metric.styleName!);
                    }
                }
            }
        }
        expect([...names.entries()].sort()).toEqual([
            ["hamburg_stadtteile/grn_mean", "urbanstories-green-access"],
        ]);
        // The two styles that do not show a configured metric are never offered.
        const offered = new Set((urban.trackedLayers).flatMap((tracked) => styleNames(tracked.record)));
        expect(offered.has("urbanstories-safety-deficit")).toBe(false);
        expect(offered.has("urbanstories-green-inventory")).toBe(false);
    });

    test("assigning the styles as alternates later changes nothing for the panel", async () => {
        const { urban, mapStore } = setup({ assignAlternates: true });
        const added = await urban.addEntry("green-spaces", "stadtteile-green-access");
        const layer = record(mapStore, (added as { runtimeId: string }).runtimeId);
        expect(styleNames(layer).filter((name) => name === "urbanstories-green-access")).toHaveLength(1);
        expect(await urban.applyMetric("green-spaces", "stadtteile-green-access", "grn_mean")).toMatchObject({ status: "applied" });
        expect(activeStyleName(layer)).toBe("urbanstories-green-access");
    });
});

describe("style integration: refusals keep the metric pending with an exact reason", () => {
    const entry = (storyKey: string, key: string): ExploreEntry => (
        URBAN_STORIES.find((story) => story.key === storyKey)!.explore.find((item) => item.key === key)!
    );

    test("a style document that targets another layer is refused", async () => {
        const wrong = {
            metadata: { "tosca:metric": "grn_mean" },
            layers: [{ id: "x", type: "fill", source: "hamburg_bezirke", "source-layer": "hamburg_bezirke", paint: {} }],
        };
        const { urban } = setup({ documents: { "urbanstories-green-access": wrong } });
        const result = await urban.loadReadiness("green-spaces", entry("green-spaces", "stadtteile-green-access"));
        expect(result.metrics.grn_mean).toMatchObject({ readiness: "metric-style-pending", reason: "style-not-applicable" });
        expect(result.readiness).toBe("available");
    });

    test("a style that declares another metric is refused", async () => {
        const wrong = {
            metadata: { "tosca:metric": "safety_index" },
            layers: [{ id: "x", type: "fill", source: "hamburg_stadtteile", "source-layer": "hamburg_stadtteile", paint: {} }],
        };
        const { urban } = setup({ documents: { "urbanstories-green-access": wrong } });
        const result = await urban.loadReadiness("green-spaces", entry("green-spaces", "stadtteile-green-access"));
        expect(result.metrics.grn_mean).toMatchObject({ readiness: "metric-style-pending", reason: "style-not-applicable" });
    });

    test("a style request that fails leaves the layer addable with its default style", async () => {
        const { urban, mapStore } = setup({ failingStyles: { "urbanstories-green-access": new Error("Catalog style request failed (500)") } });
        const result = await urban.loadReadiness("green-spaces", entry("green-spaces", "stadtteile-green-access"));
        expect(result.readiness).toBe("available");
        expect(result.metrics.grn_mean.readiness).toBe("metric-style-pending");

        const added = await urban.addEntry("green-spaces", "stadtteile-green-access", "grn_mean");
        expect(added.status).toBe("added");
        expect(activeStyleName(record(mapStore, (added as { runtimeId: string }).runtimeId))).toBe("default-hamburg_stadtteile");
    });

    test("an unpublished layer is reported as temporarily unavailable and is never added", async () => {
        const { urban, mapStore } = setup({ missingLayers: ["hamburg_buildings"] });
        const result = await urban.loadReadiness("fifteen-minute", entry("fifteen-minute", "buildings-15min"));
        expect(result.readiness).toBe("temporarily-unavailable");
        expect(await urban.addEntry("fifteen-minute", "buildings-15min")).toEqual({ status: "temporarily-unavailable" });
        expect(mapStore.layersOnMap).toHaveLength(0);
    });

    test("a metric picked before the layer exists is applied by the add", async () => {
        const { urban, mapStore } = setup();
        const added = await urban.applyMetric("green-spaces", "stadtteile-green-access", "grn_mean");
        expect(added.status).toBe("applied");
        expect(activeStyleName(record(mapStore, (added as { runtimeId: string }).runtimeId))).toBe("urbanstories-green-access");
    });
});

describe("focus mode restores the exact map state", () => {
    test("layers, a metric switch made while hidden, and a layer added during the run all end up as before", async () => {
        const { urban, mapStore } = setup();
        urban.selectStory("green-spaces");
        const shown = (await urban.addEntry("green-spaces", "stadtteile-green-access")) as { runtimeId: string };
        const hidden = (await urban.addEntry("green-spaces", "green-areas")) as { runtimeId: string };
        mapStore.setLogicalLayerVisibility(record(mapStore, hidden.runtimeId), false);
        const camera = { center: [9.99, 53.55], zoom: 11 };

        urban.setFocusEnabled(true);
        await urban.startStory("green-spaces");
        expect(map.layers.get(shown.runtimeId)?.visibility).toBe("none");
        expect(map.layers.get(hidden.runtimeId)?.visibility).toBe("none");

        // Switching the metric of a focus-hidden layer must not make it visible.
        expect(await urban.applyMetric("green-spaces", "stadtteile-green-access", "grn_mean")).toMatchObject({ status: "applied" });
        expect(map.layers.get(shown.runtimeId)?.visibility).toBe("none");
        expect(specOf(shown.runtimeId)?.layout?.visibility).toBe("none");

        // A layer added during the run is the user's choice and stays visible.
        const during = (await urban.addEntry("green-spaces", "park-pois")) as { runtimeId: string };
        expect(map.layers.get(during.runtimeId)?.visibility).toBe("visible");

        await urban.endRun({ camera: "previous" });
        expect(map.layers.get(shown.runtimeId)?.visibility).toBe("visible");
        expect(map.layers.get(hidden.runtimeId)?.visibility).toBe("none");
        expect(map.layers.get(during.runtimeId)?.visibility).toBe("visible");
        expect(activeStyleName(record(mapStore, shown.runtimeId))).toBe("urbanstories-green-access");
        expect(urban.runSnapshot).toBeUndefined();
        expect(map.flyTo).toHaveBeenCalledWith(expect.objectContaining(camera));
    });

    test("an Explore layer, a Datastores layer and the reader's story are untouched by a full cycle", async () => {
        const { urban, mapStore, scene, engine } = setup();
        const datastores = addExploreLayer(map, "datastores:layer");
        const readerStory = storyDetail(2, { id: "reader-story" });
        urban.selectStory("transit-equity");
        const explore = (await urban.addEntry("transit-equity", "units-pt")) as { runtimeId: string };
        urban.setFocusEnabled(true);

        await urban.startStory("transit-equity");
        await urban.endRun({ camera: "none" });

        expect(map.layers.get(datastores.id)?.visibility).toBe("visible");
        expect(mapStore.layersOnMap.map((layer) => layer.id)).toEqual(expect.arrayContaining([datastores.id, explore.runtimeId]));
        expect(urban.trackedLayers.map((tracked) => tracked.runtimeId)).toEqual([explore.runtimeId]);

        // With the reader's story open, the panel never closes it.
        engine.closeStory.mockClear();
        scene.story = readerStory;
        await urban.endRun({ camera: "none" });
        urban.selectStory("green-spaces");
        expect(engine.closeStory).not.toHaveBeenCalled();
        expect(scene.story).toBe(readerStory);
    });
});

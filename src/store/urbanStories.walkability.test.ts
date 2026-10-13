import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { resetUrbanStoryProbes, probeEntryLayer } from "@helpers/urbanStoryLayers";
import { createFakeCatalog, fakeRegistryMap, wireMapStore } from "../components/UrbanStories/__fixtures__/catalogHarness";
import { fakeSceneEngine } from "../components/UrbanStories/__fixtures__/runHarness";
import { getStoryConfig } from "../config/urbanStories";
import { styleErrors, colorAt } from "../config/urbanStories/styles/fifteenMinute/__fixtures__/evaluate";
import { useGeostorySceneStore } from "./geostoryScenes";
import { useUrbanStoriesStore } from "./urbanStories";

const holder = vi.hoisted(() => ({ current: undefined as ReturnType<typeof createFakeCatalog> | undefined }));
vi.mock("@store/geoserver", async (original) => ({ ...(await original<typeof import("@store/geoserver")>()), useGeoserverStore: () => holder.current!.geoserver }));
vi.mock("@helpers/toast", () => ({ useToast: () => ({ add: vi.fn() }) }));
const story = getStoryConfig("walkability-safety")!;
const buildingStory = getStoryConfig("building-walking")!;
function setup() {
    setActivePinia(createPinia()); resetUrbanStoryProbes(); holder.current = createFakeCatalog();
    const map = fakeRegistryMap(); const mapStore = wireMapStore(map); const urban = useUrbanStoriesStore();
    fakeSceneEngine(useGeostorySceneStore()); urban.selectStory(story.key);
    return { map, mapStore, urban, catalog: holder.current };
}
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false }))); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Walkability local map lifecycle", () => {
    test.each(["building-walking", "walkability-safety"] as const)("%s does not inherit layers from the preceding story", async (destination) => {
        const targetStory = getStoryConfig(destination)!;
        const { urban, mapStore } = setup();
        urban.selectStory("fifteen-minute");
        await urban.startStory("fifteen-minute");
        await urban.goToChapter(3);
        const previous = Object.values(urban.addedByStory["fifteen-minute"]!);
        const stadtteile = urban.addedByStory["fifteen-minute"]!["stadtteile-15min"];
        expect(mapStore.getLayerUiState(stadtteile)?.visible).toBe(true);
        urban.selectStory(targetStory.key);
        expect(mapStore.getLayerUiState(stadtteile)?.visible).toBe(false);
        await urban.startStory(targetStory.key);
        for (const id of previous) {
            expect(mapStore.getLayerUiState(id)?.visible, id).toBe(false);
            expect(urban.recordOf(id), "records remain reusable").toBeDefined();
        }
        const id = urban.addedByStory[targetStory.key]![targetStory.explore[0].key];
        for (let chapter = 0; chapter < targetStory.chapters.length; chapter++) {
            await urban.goToChapter(chapter);
            expect(mapStore.getLayerUiState(id)?.visible).toBe(true);
            expect(mapStore.getLayerUiState(stadtteile)?.visible).toBe(false);
        }
    });

    test("a late Stadtteile load stays hidden after switching to the street story", async () => {
        const { urban, mapStore } = setup();
        urban.selectStory("fifteen-minute");
        let finish!: () => void;
        const gate = new Promise<void>((resolve) => { finish = resolve; });
        const original = vi.mocked(mapStore.addMapLayer).getMockImplementation()!;
        vi.mocked(mapStore.addMapLayer).mockImplementation(async (params) => {
            if (params.sourceType === "geoserver" && params.sourceLayer === "hamburg_stadtteile") await gate;
            return await original(params);
        });
        const pending = urban.addEntry("fifteen-minute", "stadtteile-15min");
        await vi.waitFor(() => expect(mapStore.addMapLayer).toHaveBeenCalled());
        urban.selectStory(story.key);
        await urban.startStory(story.key);
        finish();
        await pending;
        const oldId = urban.addedByStory["fifteen-minute"]!["stadtteile-15min"];
        expect(mapStore.getLayerUiState(oldId)?.visible).toBe(false);
    });

    test("switching from 15-Minute City to building walking hides the competing building colours", async () => {
        const { urban, map, mapStore } = setup();
        await urban.startStory("fifteen-minute");
        const oldId = urban.addedByStory["fifteen-minute"]!["buildings-15min"];
        await urban.startStory(buildingStory.key);
        const id = urban.addedByStory[buildingStory.key]!["buildings-comfort-safety"];
        expect(mapStore.getLayerUiState(oldId)?.visible).toBe(false);
        expect(mapStore.getLayerUiState(id)?.visible).toBe(true);
        for (const [metric, expected] of [["comfort_mean_400m", "#00695c"], ["safety_index_400m", "#244c83"]]) {
            await urban.applyMetric(buildingStory.key, "buildings-comfort-safety", metric);
            expect(colorAt(map.specs.find((spec) => spec.id === id)!.paint["fill-extrusion-color"], { [metric]: 100 })).toBe(expected);
            expect(urban.activeMetricOf(buildingStory.key, buildingStory.explore[0])).toBe(metric);
            expect(mapStore.getLayerUiState(oldId)?.visible).toBe(false);
        }
        await urban.startStory("fifteen-minute");
        expect(mapStore.getLayerUiState(id)?.visible).toBe(false);
        expect(mapStore.getLayerUiState(oldId)?.visible).toBe(true);
        // Explicit metric selection in Explore reactivates even an unchanged hidden style.
        await urban.endRun();
        const metric = urban.activeMetricOf(buildingStory.key, buildingStory.explore[0])!;
        await urban.applyMetric(buildingStory.key, "buildings-comfort-safety", metric, true);
        expect(mapStore.getLayerUiState(id)?.visible).toBe(true);
        expect(mapStore.getLayerUiState(oldId)?.visible).toBe(false);
    });

    test("the real layer-add path installs visible 3D buildings for both metrics", async () => {
        const { urban, map, mapStore } = setup();
        vi.mocked(mapStore.addMapLayer).mockRestore();
        await urban.startStory(buildingStory.key);
        
        const id = urban.addedByStory[buildingStory.key]?.["buildings-comfort-safety"];
        expect(id).toBeDefined();
        for (const metric of buildingStory.explore[0].metrics) {
            await urban.applyMetric(buildingStory.key, "buildings-comfort-safety", metric.key);
            const building = map.specs.find((spec) => spec.id === id);
            expect(building).toBeDefined();
            expect(building?.type).toBe("fill-extrusion");
            expect(building?.paint["fill-extrusion-opacity"]).toBeGreaterThan(0);
            expect(mapStore.getLayerUiState(id!)?.visible).toBe(true);
            const { sourceType: _sourceType, showOnLayerList: _show, keepOnTop: _keep, displayName: _name, ...spec } = building!;
            expect(styleErrors([spec], [])).toEqual([]);
        }
    });

    test("all metrics visibly change styles without styles API requests, camera moves or duplicate layers", async () => {
        const { urban, map, mapStore, catalog } = setup();
        await urban.addEntry(story.key, "street-segments");
        const id = urban.addedByStory[story.key]!["street-segments"];
        const record = urban.recordOf(id)!;
        mapStore.setLogicalLayerOpacity(record, 0.55);
        const cameraCalls = map.flyTo.mock.calls.length;
        for (const metric of story.explore[0].metrics) {
            expect((await urban.applyMetric(story.key, "street-segments", metric.key)).status).toMatch(/applied|unchanged/);
            expect(record.activeStyleId).toBe(metric.styleName);
            expect(record.companionLayerIds).toEqual([`${id}:style:1`]);
            expect(mapStore.getLayerUiState(id)?.opacity).toBe(0.55);
        }
        expect(map.specs).toHaveLength(2);
        expect(map.flyTo.mock.calls.length).toBe(cameraCalls);
        expect(catalog.requests.some((request) => request === "styles" || request.startsWith("style:"))).toBe(false);
        await urban.applyMetric(story.key, "street-segments", "safety_index");
        const line = map.specs.find((spec) => spec.id === `${id}:style:1`)!;
        expect(colorAt(line.paint["line-color"], { safety_index: 100 })).toBe("#244c83");
        mapStore.setLogicalLayerVisibility(record, false);
        await urban.applyMetric(story.key, "street-segments", "comfort_shade");
        expect(mapStore.getLayerUiState(id)?.visible).toBe(false);
    });

    test("building probes and runtime ids do not borrow 15-Minute City styling in either order", async () => {
        const { urban } = setup();
        const fifteen = getStoryConfig("fifteen-minute")!.explore.find((entry) => entry.key === "buildings-15min")!;
        const walk = buildingStory.explore[0];
        for (const entry of [fifteen, walk]) {
            const probe = await probeEntryLayer(entry);
            expect(probe.styling?.styles[0].name).toBe(entry.metrics[0].styleName);
        }
        await urban.addEntry("fifteen-minute", fifteen.key);
        await urban.addEntry(buildingStory.key, walk.key);
        expect(urban.runtimeIdFor("fifteen-minute", fifteen)).not.toBe(urban.runtimeIdFor(buildingStory.key, walk));
        const walkId = urban.runtimeIdFor(buildingStory.key, walk)!;
        await urban.removeEntry(buildingStory.key, walk.key);
        await urban.addEntry(buildingStory.key, walk.key);
        expect(urban.runtimeIdFor(buildingStory.key, walk)).not.toBe(walkId);
        expect(urban.activeMetricOf(buildingStory.key, walk)).toBe("safety_index_400m");
    });

    test("street chapters contain no buildings and fast transitions leave the latest metric visible", async () => {
        const { urban, mapStore } = setup();
        await urban.startStory(story.key);
        const ids = urban.addedByStory[story.key]!;
        expect(ids["buildings-comfort-safety"]).toBeUndefined();
        const first = urban.goToChapter(1); const last = urban.goToChapter(2);
        await first; await last;
        expect(urban.activeMetricOf(story.key, story.explore[0])).toBe("n_accidents_vru_5y");
        expect(mapStore.getLayerUiState(ids["street-segments"])?.visible).toBe(true);
        expect(mapStore.layersOnMap).toHaveLength(1);
    });
});

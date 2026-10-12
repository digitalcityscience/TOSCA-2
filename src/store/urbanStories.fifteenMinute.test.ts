import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { resetUrbanStoryProbes } from "@helpers/urbanStoryLayers";
import {
    createFakeCatalog, fakeRegistryMap, wireMapStore, type FakeCatalog, type FakeCatalogOptions,
} from "../components/UrbanStories/__fixtures__/catalogHarness";
import { fakeSceneEngine } from "../components/UrbanStories/__fixtures__/runHarness";
import { colorAt } from "../config/urbanStories/styles/fifteenMinute/__fixtures__/evaluate";
import { getStoryConfig, type ExploreEntry } from "../config/urbanStories";
import {
    ACCESS_COLORS,
    ADMIN_FILL_MAX_ZOOM,
    BUILDING_MIN_ZOOM,
    CATEGORY_FIELDS,
    FIFTEEN_MINUTE_CATEGORY_IDS,
    SCORE_15MIN_CLASSES,
    STYLE_NAMES,
    type FifteenMinuteCategoryId,
} from "../config/urbanStories/styles/fifteenMinute";
import { useGeostorySceneStore } from "./geostoryScenes";
import type { LayerObjectWithAttributes } from "./map";
import { useUrbanStoriesStore } from "./urbanStories";
import {
    BUILDINGS_ENTRY_KEY,
    DEFAULT_GAP_MAX_SCORE,
    SELECTION_FILL_LAYER_ID,
    SELECTION_SOURCE_ID,
    useFifteenMinuteStore,
} from "./urbanStories.fifteenMinute";

/**
 * The 15-Minute City interactions against the real Urban Stories, map and loader code, a mocked
 * catalog and a fake map. The map specs assert what MapLibre would actually draw.
 */

const catalogHolder = vi.hoisted(() => ({ current: undefined as undefined | { geoserver: unknown } }));
vi.mock("@store/geoserver", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@store/geoserver")>()),
    useGeoserverStore: () => catalogHolder.current!.geoserver,
}));
vi.mock("@helpers/toast", () => ({ useToast: () => ({ add: vi.fn() }) }));

const STORY = "fifteen-minute" as const;
const story = getStoryConfig(STORY)!;
const entryOf = (key: string): ExploreEntry => story.explore.find((entry) => entry.key === key)!;

let catalog: FakeCatalog;
let map: ReturnType<typeof setupMap>;

function setupMap() {
    const base = fakeRegistryMap();
    const sources = new Map<string, { data: unknown; setData: (data: unknown) => void }>();
    return Object.assign(base, {
        sources,
        addSource: vi.fn((id: string, spec: { data: unknown }) => {
            const source = { data: spec.data, setData: (data: unknown) => { source.data = data; } };
            sources.set(id, source);
        }),
        getSource: (id: string) => sources.get(id),
        removeSource: vi.fn((id: string) => { sources.delete(id); }),
        queryRenderedFeatures: vi.fn(() => [] as unknown[]),
        setFilter: vi.fn((id: string, filter: unknown) => {
            const spec = base.specs.find((candidate) => candidate.id === id);
            if (spec !== undefined) spec.filter = filter;
        }),
    });
}

function setup(options: FakeCatalogOptions = {}) {
    setActivePinia(createPinia());
    resetUrbanStoryProbes();
    catalog = createFakeCatalog(options);
    catalogHolder.current = catalog;
    map = setupMap();
    const mapStore = wireMapStore(map);
    const urban = useUrbanStoriesStore();
    fakeSceneEngine(useGeostorySceneStore());
    const fifteen = useFifteenMinuteStore();
    urban.selectStory(STORY);
    return { mapStore, urban, fifteen };
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

type Harness = ReturnType<typeof setup>;

const specOf = (runtimeId: string | undefined): Record<string, any> => map.specs.find((spec) => spec.id === runtimeId)!;
const recordOf = (h: Harness, runtimeId: string | undefined): LayerObjectWithAttributes => (
    h.mapStore.layersOnMap.find((layer) => layer.id === runtimeId)!
);
const buildingId = (h: Harness): string => h.fifteen.buildingRuntimeId as string;
const poiId = (h: Harness, id: FifteenMinuteCategoryId): string | undefined => h.urban.runtimeIdFor(STORY, entryOf(CATEGORY_FIELDS[id].poiEntryKey));
const isVisible = (h: Harness, runtimeId: string | undefined): boolean => h.mapStore.getLayerUiState(runtimeId ?? "")?.visible !== false;
/** Building layers on the map: the source layer is the catalog layer, so duplicates are countable. */
const buildingLayers = (h: Harness): LayerObjectWithAttributes[] => h.mapStore.layersOnMap.filter((layer) => (
    (layer as { "source-layer"?: string })["source-layer"] === "hamburg_buildings"
));

async function startAt(h: Harness, chapter: number): Promise<void> {
    expect(await h.urban.startStory(STORY)).toEqual({ status: "started" });
    if (chapter > 0) await h.urban.goToChapter(chapter);
    await h.fifteen.sync();
    await nextTick();
}

function fakeBuilding(properties: Record<string, unknown>, id?: string | number) {
    return {
        id,
        properties,
        geometry: { type: "Polygon", coordinates: [[[10, 53], [10.001, 53], [10.001, 53.001], [10, 53]]] },
    };
}

describe("chapter 1: building-level accessibility", () => {
    test("adds the building layer with the local score expression, zoom floor and no GeoServer style", async () => {
        const h = setup();
        await startAt(h, 0);

        expect(h.urban.activeChapter?.chapterKey).toBe("building-accessibility");
        expect(h.fifteen.mode).toBe("overall");
        expect(buildingLayers(h)).toHaveLength(1);
        const spec = specOf(buildingId(h));
        expect(spec.minzoom).toBe(BUILDING_MIN_ZOOM);
        expect(spec["source-layer"]).toBe("hamburg_buildings");
        // What the map draws: each score class and grey for NULL.
        for (const item of SCORE_15MIN_CLASSES) {
            expect(colorAt(spec.paint["fill-extrusion-color"], { score_15min: item.value })).toBe(item.color);
        }
        expect(colorAt(spec.paint["fill-extrusion-color"], {})).toBe("#9e9e9e");
        expect(recordOf(h, buildingId(h)).availableStyles?.every((style) => style.name.startsWith("frontend:15min:"))).toBe(true);
    });

    test("never fetches a GeoServer style, style list or style assignment for the story", async () => {
        const h = setup();
        await startAt(h, 0);
        for (let chapter = 1; chapter < story.chapters.length; chapter += 1) {
            await h.urban.goToChapter(chapter);
            await h.fifteen.sync();
        }
        await h.fifteen.selectCategory("food");
        await h.fifteen.setAdminLevel("bezirke");

        expect(catalog.geoserver.getLayerStyling).not.toHaveBeenCalled();
        expect(catalog.geoserver.getStyleList).not.toHaveBeenCalled();
        expect(catalog.requests.filter((request) => request.startsWith("style") || request === "styles")).toEqual([]);
        // Transport only: layer information and the resource detail.
        expect(catalog.requests.every((request) => request.startsWith("layer:"))).toBe(true);
    });

    test("opacity and visibility set on the layer survive the story's own restyling", async () => {
        const h = setup();
        await startAt(h, 1);
        const record = recordOf(h, buildingId(h));
        h.mapStore.setLogicalLayerOpacity(record, 0.4);
        h.mapStore.setLogicalLayerVisibility(record, false);

        await h.fifteen.selectCategory("health");
        expect(specOf(buildingId(h)).paint["fill-extrusion-opacity"]).toBe(0.4);
        expect(isVisible(h, buildingId(h))).toBe(false);
        expect(h.mapStore.getLayerUiState(buildingId(h))?.opacity).toBe(0.4);
    });
});

describe("chapter 2: the nine everyday needs", () => {
    test("selecting a category changes the building style on the map, keeps the camera and adds no layer", async () => {
        const h = setup();
        await startAt(h, 1);
        expect(h.fifteen.mode).toBe("category");
        const runtimeId = buildingId(h);
        const layerCount = h.mapStore.layersOnMap.length;
        const cameraMoves = map.flyTo.mock.calls.length + map.jumpTo.mock.calls.length + map.easeTo.mock.calls.length;

        for (const id of FIFTEEN_MINUTE_CATEGORY_IDS) {
            await h.fifteen.selectCategory(id);
            const spec = specOf(runtimeId);
            const field = CATEGORY_FIELDS[id].accessField;
            expect(colorAt(spec.paint["fill-extrusion-color"], { [field]: 3 }), id).toBe(ACCESS_COLORS.accessible);
            expect(colorAt(spec.paint["fill-extrusion-color"], { [field]: 0 }), id).toBe(ACCESS_COLORS.inaccessible);
            expect(colorAt(spec.paint["fill-extrusion-color"], {}), id).toBe(ACCESS_COLORS.unknown);
            expect(recordOf(h, runtimeId).availableStyles?.find((style) => style.id === recordOf(h, runtimeId).activeStyleId)?.name).toBe(STYLE_NAMES.category(id));
            expect(buildingLayers(h), id).toHaveLength(1);
        }
        expect(buildingId(h)).toBe(runtimeId);
        expect(map.flyTo.mock.calls.length + map.jumpTo.mock.calls.length + map.easeTo.mock.calls.length).toBe(cameraMoves);
        // Only the building layer's single runtime id and the one POI layer added: no second building layer.
        expect(h.mapStore.layersOnMap.length).toBeGreaterThanOrEqual(layerCount);
        expect(h.urban.trackedLayers.filter((tracked) => tracked.entry.key === BUILDINGS_ENTRY_KEY)).toHaveLength(1);
    });

    test("choosing no category returns to the overall 0–9 style", async () => {
        const h = setup();
        await startAt(h, 1);
        await h.fifteen.selectCategory("park");
        await h.fifteen.selectCategory(null);
        const spec = specOf(buildingId(h));
        expect(colorAt(spec.paint["fill-extrusion-color"], { score_15min: 9 })).toBe(SCORE_15MIN_CLASSES[9].color);
        expect(h.fifteen.effectiveCategory).toBeNull();
    });

    test("shows only the POI layer of the selected category", async () => {
        const h = setup();
        await startAt(h, 1);
        await h.fifteen.selectCategory("health");
        expect(isVisible(h, poiId(h, "health"))).toBe(true);
        expect(specOf(poiId(h, "health"))["source-layer"]).toBe("health");

        await h.fifteen.selectCategory("stop_any");
        expect(isVisible(h, poiId(h, "health"))).toBe(false);
        expect(isVisible(h, poiId(h, "stop_any"))).toBe(true);
        expect(specOf(poiId(h, "stop_any"))["source-layer"]).toBe("pt_stops");

        await h.fifteen.selectCategory("park");
        expect(specOf(poiId(h, "park")).type).toBe("fill");
        expect(isVisible(h, poiId(h, "stop_any"))).toBe(false);

        await h.fifteen.selectCategory(null);
        expect(FIFTEEN_MINUTE_CATEGORY_IDS.every((id) => poiId(h, id) === undefined || !isVisible(h, poiId(h, id)))).toBe(true);
    });

    test("every category has a POI layer that can be shown, one at a time", async () => {
        const h = setup();
        await startAt(h, 1);
        for (const id of FIFTEEN_MINUTE_CATEGORY_IDS) {
            await h.fifteen.selectCategory(id);
            const visible = FIFTEEN_MINUTE_CATEGORY_IDS.filter((other) => poiId(h, other) !== undefined && isVisible(h, poiId(h, other)));
            expect(visible, id).toEqual([id]);
        }
    });

    test("fast category switching ends on the last category, with one building layer and one visible POI layer", async () => {
        const h = setup();
        await startAt(h, 1);
        const picks: FifteenMinuteCategoryId[] = ["food", "health", "education", "culture", "sport", "park", "food", "stop_any", "bank_post"];
        const pending = picks.map((id) => h.fifteen.selectCategory(id));
        await Promise.all(pending);
        await h.fifteen.sync();

        expect(h.fifteen.effectiveCategory).toBe("bank_post");
        const field = CATEGORY_FIELDS.bank_post.accessField;
        expect(colorAt(specOf(buildingId(h)).paint["fill-extrusion-color"], { [field]: 1 })).toBe(ACCESS_COLORS.accessible);
        expect(colorAt(specOf(buildingId(h)).paint["fill-extrusion-color"], { n_food_15min: 1 })).toBe(ACCESS_COLORS.unknown);
        expect(buildingLayers(h)).toHaveLength(1);
        const visible = FIFTEEN_MINUTE_CATEGORY_IDS.filter((id) => poiId(h, id) !== undefined && isVisible(h, poiId(h, id)));
        expect(visible).toEqual(["bank_post"]);
    });

    test("a category whose attribute is not published is not selectable and the overall view stays", async () => {
        const h = setup();
        await startAt(h, 1);
        const published = entryOf(BUILDINGS_ENTRY_KEY).requiredAttributes.filter((attribute) => attribute !== "n_culture_15min");
        const original = catalog.geoserver.getLayerDetail.getMockImplementation()!;
        catalog.geoserver.getLayerDetail.mockImplementation(async (href: string) => {
            const detail = await original(href);
            if (!href.endsWith("hamburg_buildings")) return detail;
            return { ...detail, featureType: { ...detail.featureType, attributes: { attribute: [...published, "geom"].map((name) => ({ name, binding: "x" })) } } };
        });
        resetUrbanStoryProbes();
        await h.urban.loadReadiness(STORY, entryOf(BUILDINGS_ENTRY_KEY), true);
        await nextTick();

        expect(h.fifteen.categoryOptions.find((option) => option.id === "culture")?.available).toBe(false);
        expect(h.fifteen.categoryOptions.filter((option) => option.available)).toHaveLength(8);
        await h.fifteen.selectCategory("culture");
        expect(h.fifteen.effectiveCategory).toBeNull();
        expect(colorAt(specOf(buildingId(h)).paint["fill-extrusion-color"], { score_15min: 5 })).toBe(SCORE_15MIN_CLASSES[5].color);
    });
});

describe("chapter 3: inspect a building", () => {
    test("a click on a building selects it, highlights it with the local style and keeps it on restyling", async () => {
        const h = setup();
        await startAt(h, 2);
        expect(h.fifteen.mode).toBe("building");
        expect(map.on.mock.calls.some(([type]) => type === "click")).toBe(true);

        const properties = { building_height_m: 18.5, score_15min: 6, score_15min_decay: 72.5, n_food_15min: 3, walk_min_food: 4.2, n_health_15min: 0 };
        map.queryRenderedFeatures.mockReturnValue([fakeBuilding(properties, 77)]);
        h.fifteen.onMapClick({ point: { x: 10, y: 10 } });

        expect(h.fifteen.selection?.featureId).toBe(77);
        expect(h.fifteen.profile?.score).toBe(6);
        expect(h.fifteen.profile?.categories.find((item) => item.id === "food")).toMatchObject({ state: "accessible", places: 3 });
        expect(h.fifteen.profile?.categories.find((item) => item.id === "health")?.state).toBe("inaccessible");
        expect(h.fifteen.profile?.categories.find((item) => item.id === "park")?.state).toBe("unknown");
        expect((map.getSource(SELECTION_SOURCE_ID)?.data as { features: unknown[] }).features).toHaveLength(1);
        // The highlight is the local selection style: its own source and fill/outline passes, above the buildings.
        expect(specOf(SELECTION_FILL_LAYER_ID).source).toBe(SELECTION_SOURCE_ID);
        expect(specOf(SELECTION_FILL_LAYER_ID).type).toBe("fill-extrusion");
        // The highlight is as tall as the building (building_height_m), so it is visible on a 3D building.
        expect((map.getSource(SELECTION_SOURCE_ID)?.data as { features: Array<{ properties: { height: number } }> }).features[0].properties.height).toBe(18.5);
        expect(map.specs.findIndex((spec) => spec.id === SELECTION_FILL_LAYER_ID)).toBeGreaterThan(map.specs.findIndex((spec) => spec.id === buildingId(h)));

        // Restyling and a sync keep the selection and its highlight.
        await h.fifteen.sync();
        expect(h.fifteen.selection?.featureId).toBe(77);
        expect((map.getSource(SELECTION_SOURCE_ID)?.data as { features: unknown[] }).features).toHaveLength(1);
    });

    test("the generic attribute popup is suppressed for buildings while the panel inspects them, and only then", async () => {
        const h = setup();
        await startAt(h, 0);
        expect(recordOf(h, buildingId(h)).attributePopupSuppressed).toBe(false);
        await h.urban.goToChapter(2);
        await h.fifteen.sync();
        expect(recordOf(h, buildingId(h)).attributePopupSuppressed).toBe(true);
        await h.urban.goToChapter(4);
        await h.fifteen.sync();
        expect(recordOf(h, buildingId(h)).attributePopupSuppressed).toBe(true);
        await h.urban.goToChapter(1);
        await h.fifteen.sync();
        expect(recordOf(h, buildingId(h)).attributePopupSuppressed).toBe(false);
        await h.urban.goToChapter(2);
        await h.fifteen.sync();
        await h.urban.endRun({ camera: "none" });
        await h.fifteen.sync();
        expect(recordOf(h, buildingId(h)).attributePopupSuppressed).toBe(false);
    });

    test("only the building layer is queried, and a click on nothing keeps the current selection", async () => {
        const h = setup();
        await startAt(h, 2);
        map.queryRenderedFeatures.mockReturnValue([fakeBuilding({ score_15min: 2 })]);
        h.fifteen.onMapClick({ point: { x: 1, y: 1 } });
        const [, options] = map.queryRenderedFeatures.mock.calls[0] as unknown as [unknown, { layers: string[] }];
        expect(options.layers).toContain(buildingId(h));
        expect(options.layers.every((id) => id === buildingId(h) || id.startsWith(`${buildingId(h)}:style:`))).toBe(true);

        map.queryRenderedFeatures.mockReturnValue([]);
        h.fifteen.onMapClick({ point: { x: 2, y: 2 } });
        expect(h.fifteen.selection).toBeDefined();
    });

    test("a building with no published identifier says so instead of inventing one", async () => {
        const h = setup();
        await startAt(h, 2);
        map.queryRenderedFeatures.mockReturnValue([fakeBuilding({ score_15min: 1 })]);
        h.fifteen.onMapClick({ point: { x: 1, y: 1 } });
        expect(h.fifteen.selection?.featureId).toBeNull();
    });

    test("clearing removes the highlight and the selection", async () => {
        const h = setup();
        await startAt(h, 2);
        map.queryRenderedFeatures.mockReturnValue([fakeBuilding({ score_15min: 4 }, "x")]);
        h.fifteen.onMapClick({ point: { x: 1, y: 1 } });
        h.fifteen.clearSelection();
        expect(h.fifteen.selection).toBeUndefined();
        expect((map.getSource(SELECTION_SOURCE_ID)?.data as { features: unknown[] }).features).toEqual([]);
    });

    test("a building without a score shows no score and unknown categories, not zeros", async () => {
        const h = setup();
        await startAt(h, 2);
        map.queryRenderedFeatures.mockReturnValue([fakeBuilding({ comfort_mean_400m: 3 })]);
        h.fifteen.onMapClick({ point: { x: 1, y: 1 } });
        expect(h.fifteen.profile?.score).toBeNull();
        expect(h.fifteen.profile?.categories.every((item) => item.state === "unknown")).toBe(true);
    });

    test("leaving the chapter clears the selection and detaches the click handler", async () => {
        const h = setup();
        await startAt(h, 2);
        map.queryRenderedFeatures.mockReturnValue([fakeBuilding({ score_15min: 4 })]);
        h.fifteen.onMapClick({ point: { x: 1, y: 1 } });
        await h.urban.goToChapter(0);
        await h.fifteen.sync();
        await nextTick();
        expect(h.fifteen.selection).toBeUndefined();
        expect(map.off.mock.calls.some(([type]) => type === "click")).toBe(true);
        map.queryRenderedFeatures.mockClear();
        h.fifteen.onMapClick({ point: { x: 1, y: 1 } });
        expect(map.queryRenderedFeatures).not.toHaveBeenCalled();
    });
});

describe("chapter 4: from buildings to neighbourhoods", () => {
    test("shows neighbourhoods with the local count scale, keeps buildings on, and switches level and measure", async () => {
        const h = setup();
        await startAt(h, 0);
        await h.urban.goToChapter(3);
        await h.fifteen.sync();

        expect(h.fifteen.mode).toBe("neighbourhoods");
        const stadtteile = h.urban.runtimeIdFor(STORY, entryOf("stadtteile-15min"));
        expect(isVisible(h, stadtteile)).toBe(true);
        expect(isVisible(h, buildingId(h))).toBe(true);
        expect(specOf(stadtteile)["source-layer"]).toBe("hamburg_stadtteile");
        expect(specOf(stadtteile).maxzoom).toBe(ADMIN_FILL_MAX_ZOOM);
        expect(JSON.stringify(specOf(stadtteile).paint["fill-color"])).toContain("m15_categories_mean");

        await h.fifteen.setAdminMetric("m15_decay_mean");
        expect(JSON.stringify(specOf(stadtteile).paint["fill-color"])).toContain("m15_decay_mean");
        expect(JSON.stringify(specOf(stadtteile).paint["fill-color"])).not.toContain("m15_categories_mean");

        await h.fifteen.setAdminLevel("bezirke");
        const bezirke = h.urban.runtimeIdFor(STORY, entryOf("bezirke-15min"));
        expect(isVisible(h, stadtteile)).toBe(false);
        expect(isVisible(h, bezirke)).toBe(true);
        expect(specOf(bezirke)["source-layer"]).toBe("hamburg_bezirke");
        expect(JSON.stringify(specOf(bezirke).paint["fill-color"])).toContain("m15_decay_mean");
        expect(isVisible(h, buildingId(h))).toBe(true);
    });

    test("the area layers go away again when the chapter is left", async () => {
        const h = setup();
        await startAt(h, 3);
        await h.fifteen.setAdminLevel("bezirke");
        await h.urban.goToChapter(4);
        await h.fifteen.sync();
        const shown = ["stadtteile-15min", "bezirke-15min"].map((key) => h.urban.runtimeIdFor(STORY, entryOf(key)));
        expect(shown.every((id) => id === undefined || !isVisible(h, id))).toBe(true);
    });

    test("no administrative layer is shown in the building chapters", async () => {
        const h = setup();
        await startAt(h, 0);
        expect(h.urban.runtimeIdFor(STORY, entryOf("stadtteile-15min"))).toBeUndefined();
        expect(h.urban.runtimeIdFor(STORY, entryOf("bezirke-15min"))).toBeUndefined();
    });
});

describe("chapter 5: where are everyday needs missing?", () => {
    test("starts with an explicit, adjustable score threshold applied inside the building style", async () => {
        const h = setup();
        await startAt(h, 4);
        expect(h.fifteen.mode).toBe("gaps");
        expect(h.fifteen.gapEnabled).toBe(true);
        expect(h.fifteen.gapMaxScore).toBe(DEFAULT_GAP_MAX_SCORE);
        expect(JSON.stringify(specOf(buildingId(h)).filter)).toContain(`"<=",["get","score_15min"],${DEFAULT_GAP_MAX_SCORE}`);

        await h.fifteen.setGapMaxScore(1);
        expect(JSON.stringify(specOf(buildingId(h)).filter)).toContain("\"<=\",[\"get\",\"score_15min\"],1");
        expect(buildingLayers(h)).toHaveLength(1);

        await h.fifteen.setGapEnabled(false);
        expect(specOf(buildingId(h)).filter).toBeUndefined();
    });

    test("a category plus 'missing only' keeps buildings without access, with the POI overlay", async () => {
        const h = setup();
        await startAt(h, 4);
        await h.fifteen.selectCategory("sport");
        await h.fifteen.setGapMissingCategoryOnly(true);

        const spec = specOf(buildingId(h));
        expect(JSON.stringify(spec.filter)).toContain("n_sport_15min");
        expect(JSON.stringify(spec.filter)).toContain("\"<=\",[\"get\",\"score_15min\"],3");
        expect(colorAt(spec.paint["fill-extrusion-color"], { n_sport_15min: 0 })).toBe(ACCESS_COLORS.inaccessible);
        expect(isVisible(h, poiId(h, "sport"))).toBe(true);
        // Every render pass carries the filter, so the outline matches the fill.
        const companions = recordOf(h, buildingId(h)).companionLayerIds ?? [];
        for (const id of companions) expect(specOf(id).filter).toEqual(spec.filter);

        await h.fifteen.selectCategory(null);
        expect(h.fifteen.gapMissingCategoryOnly).toBe(false);
        expect(JSON.stringify(specOf(buildingId(h)).filter)).not.toContain("n_sport_15min");
    });

    test("the threshold is clamped to 0–8 and applying it changes nothing else on the layer", async () => {
        const h = setup();
        await startAt(h, 4);
        await h.fifteen.setGapMaxScore(99);
        expect(h.fifteen.gapMaxScore).toBe(8);
        await h.fifteen.setGapMaxScore(-4);
        expect(h.fifteen.gapMaxScore).toBe(0);
        expect(buildingId(h)).toBe(h.urban.runtimeIdFor(STORY, entryOf(BUILDINGS_ENTRY_KEY)));
    });

    test("buildings stay inspectable while the filter is on", async () => {
        const h = setup();
        await startAt(h, 4);
        map.queryRenderedFeatures.mockReturnValue([fakeBuilding({ score_15min: 2, n_food_15min: 0 })]);
        h.fifteen.onMapClick({ point: { x: 1, y: 1 } });
        expect(h.fifteen.profile?.score).toBe(2);
    });
});

describe("chapter navigation", () => {
    test("each chapter has its own interaction and state is reset on entry", async () => {
        const h = setup();
        await startAt(h, 0);
        expect(story.chapters.map((chapter) => chapter.interaction)).toEqual(["overall", "category", "building", "neighbourhoods", "gaps"]);
        const seen: Array<string | undefined> = [];
        for (let index = 0; index < story.chapters.length; index += 1) {
            await h.urban.goToChapter(index);
            await h.fifteen.sync();
            seen.push(h.fifteen.mode);
            if (index === 1) await h.fifteen.selectCategory("food");
        }
        expect(seen).toEqual(["overall", "category", "building", "neighbourhoods", "gaps"]);
        // The category chosen in chapter 2 did not leak into chapter 3 or 5.
        expect(h.fifteen.category).toBeNull();
        await h.urban.goToChapter(1);
        await h.fifteen.sync();
        expect(h.fifteen.category).toBeNull();
        expect(colorAt(specOf(buildingId(h)).paint["fill-extrusion-color"], { score_15min: 1 })).toBe(SCORE_15MIN_CLASSES[1].color);
    });

    test("fast chapter switching ends consistently on the last chapter", async () => {
        const h = setup();
        await startAt(h, 0);
        void h.urban.goToChapter(1);
        void h.urban.goToChapter(3);
        void h.urban.goToChapter(2);
        void h.urban.goToChapter(4);
        await h.urban.goToChapter(1);
        await h.fifteen.selectCategory("education");
        await h.fifteen.sync();

        expect(h.urban.activeChapter?.chapterKey).toBe("everyday-needs");
        expect(h.fifteen.mode).toBe("category");
        expect(buildingLayers(h)).toHaveLength(1);
        expect(specOf(buildingId(h)).filter).toBeUndefined();
        expect(colorAt(specOf(buildingId(h)).paint["fill-extrusion-color"], { n_education_15min: 2 })).toBe(ACCESS_COLORS.accessible);
        const admin = ["stadtteile-15min", "bezirke-15min"].map((key) => h.urban.runtimeIdFor(STORY, entryOf(key)));
        expect(admin.every((id) => id === undefined || !isVisible(h, id))).toBe(true);
    });

    test("ending the run clears the selection and puts away what the controller showed", async () => {
        const h = setup();
        await startAt(h, 1);
        await h.fifteen.selectCategory("food");
        await h.urban.endRun({ camera: "none" });
        await h.fifteen.sync();
        expect(h.fifteen.mode).toBeUndefined();
        expect(h.fifteen.selection).toBeUndefined();
        expect(isVisible(h, poiId(h, "food"))).toBe(false);
        // The building layer itself stays: Explore layers are never deleted by a run.
        expect(buildingLayers(h)).toHaveLength(1);
    });
});

describe("building tile errors", () => {
    test("a tile error marks the buildings unavailable and no other layer takes its place", async () => {
        const h = setup();
        await startAt(h, 0);
        expect(h.fifteen.buildingsState).toBe("ready");
        const runtimeId = buildingId(h);
        const handler = (map.on.mock.calls.find(([type]) => type === "error") as unknown as [string, (event: unknown) => void])[1];
        handler({ sourceId: runtimeId });
        await nextTick();

        expect(h.fifteen.buildingsState).toBe("tiles-unavailable");
        expect(h.urban.readinessOf(STORY, entryOf(BUILDINGS_ENTRY_KEY))?.readiness).toBe("tiles-unavailable");
        const tracked = h.urban.trackedLayers.map((layer) => layer.entry.key);
        expect(tracked).toEqual([BUILDINGS_ENTRY_KEY]);
        expect(h.urban.runtimeIdFor(STORY, entryOf("stadtteile-15min"))).toBeUndefined();
        // The local styling is intact and applies as soon as tiles load.
        expect(colorAt(specOf(runtimeId).paint["fill-extrusion-color"], { score_15min: 3 })).toBe(SCORE_15MIN_CLASSES[3].color);
    });

    test("an unpublished building layer is reported, nothing is added and no area layer is substituted", async () => {
        const h = setup({ missingLayers: ["hamburg_buildings"] });
        expect(await h.urban.startStory(STORY)).toEqual({ status: "started" });
        await h.fifteen.sync();
        expect(h.fifteen.buildingsState).toBe("not-on-map");
        expect(h.mapStore.layersOnMap).toHaveLength(0);
    });
});

describe("other stories and shared layers", () => {
    test("the other stories keep their catalog styles and are untouched by a 15-Minute City run", async () => {
        const h = setup();
        await startAt(h, 1);
        await h.fifteen.selectCategory("food");
        const before = specOf(buildingId(h)).paint["fill-extrusion-color"];

        const other = await h.urban.addEntry("transit-equity", "buildings-pt");
        expect(other.status).toBe("added");
        const otherRecord = recordOf(h, (other as { runtimeId: string }).runtimeId);
        expect(otherRecord.availableStyles?.some((style) => style.name.startsWith("frontend:15min:"))).toBe(false);
        expect(otherRecord.availableStyles?.map((style) => style.name)).toContain("default-hamburg_buildings");
        expect(specOf(buildingId(h)).paint["fill-extrusion-color"]).toEqual(before);
        expect(otherRecord.id).not.toBe(buildingId(h));
    });

    test("the controller never touches layers of other stories when the run ends", async () => {
        const h = setup();
        const other = await h.urban.addEntry("transit-equity", "stadtteile-pt");
        await startAt(h, 3);
        // The chapter uses the same administrative geometry with another metric.
        // Its competing colour scheme is hidden at activation, and remains untouched on exit.
        expect(isVisible(h, (other as { runtimeId: string }).runtimeId)).toBe(false);
        await h.urban.endRun({ camera: "none" });
        await h.fifteen.sync();
        expect(isVisible(h, (other as { runtimeId: string }).runtimeId)).toBe(false);
    });
});

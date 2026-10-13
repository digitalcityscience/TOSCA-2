import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, h } from "vue";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { resetUrbanStoryProbes } from "@helpers/urbanStoryLayers";
import { useGeostorySceneStore } from "@store/geostoryScenes";
import { useUrbanStoriesStore } from "@store/urbanStories";
import { SCENE_KEYS, useFifteenMinuteStore, weakestCategory } from "@store/urbanStories.fifteenMinute";
import type { StadtteilRow } from "@helpers/fifteenMinuteData";
import { getStoryConfig } from "../../config/urbanStories";
import {
    BLANKENESE_EXAMPLE,
    FARMSEN_EXAMPLE,
    HOHELUFT_EXAMPLE,
    LANGENBEK,
    LANGENBEK_EXAMPLE,
    OTTENSEN_EXAMPLE,
    WILHELMSBURG,
} from "../../config/urbanStories/fifteenMinuteLocations";
import { CATEGORY_IDS, type CategoryId } from "../../config/urbanStories/styles/fifteenMinute";
import { createFakeCatalog, fakeRegistryMap, wireMapStore } from "./__fixtures__/catalogHarness";
import { fakeSceneEngine } from "./__fixtures__/runHarness";
import FifteenMinutePanel from "./FifteenMinutePanel.vue";

const catalogHolder = vi.hoisted(() => ({ current: undefined as undefined | { geoserver: unknown } }));
vi.mock("@store/geoserver", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@store/geoserver")>()),
    useGeoserverStore: () => catalogHolder.current!.geoserver,
}));
vi.mock("@helpers/toast", () => ({ useToast: () => ({ add: vi.fn() }) }));

// --- data and collaborators -----------------------------------------------------------------------

function row(id: string, name: string, patch: Partial<StadtteilRow> = {}): StadtteilRow {
    const shares = Object.fromEntries(CATEGORY_IDS.map((category) => [category, 1])) as Record<CategoryId, number | null>;
    return {
        id, name, bezirk: "Bezirk", bounds: [9.9, 53.4, 10.0, 53.5], scored: 1000, categoriesMean: 8, decayMean: 70, shares,
        lowConfidenceShare: 0.01, comfortN: 1000, comfortMean: 80, safetyN: 1000, safetyMean: 31, greenN: 1000, greenMean: 90,
        greenShare: 0.95, dgpN: 1000, dgpMedian: 6, ...patch,
    };
}

const ROWS: StadtteilRow[] = [
    row(WILHELMSBURG.id, "Wilhelmsburg", { decayMean: 64.33, categoriesMean: 7.4, scored: 4260, shares: { ...row("x", "x").shares, health: 0.73, culture: 0.65, food: 0.79 } }),
    row(LANGENBEK.id, "Langenbek", { decayMean: 64.71, categoriesMean: 7.34, scored: 1170, shares: { ...row("x", "x").shares, culture: 0, bank_post: 0.55, sport: 0.79 } }),
    row("211", "Blankenese", { decayMean: 69.56, categoriesMean: 8.13, comfortMean: 73.62 }),
    row("506", "Farmsen-Berne", { decayMean: 68.44, categoriesMean: 8.06, comfortMean: 80.27 }),
    row("204", "Ottensen", { decayMean: 92.78, categoriesMean: 8.95, safetyMean: 27.8 }),
    row("304", "Hoheluft-West", { decayMean: 90.84, categoriesMean: 8.91, safetyMean: 33.29 }),
    row("999", "Tiny", { decayMean: null, categoriesMean: null, scored: 3, shares: Object.fromEntries(CATEGORY_IDS.map((id) => [id, null])) as Record<CategoryId, number | null> }),
];

const building = (id: string, patch: Record<string, unknown>) => ({
    properties: {
        gml_id: id, is_residential: true, score_confidence: "high", origin_quality: "good", score_15min: 9, score_15min_decay: 72.8,
        comfort_mean_400m: 59.1, comfort_confidence_400m: 0.85, comfort_scored_share_400m: 1, safety_index_400m: 30.4,
        score_green: 100, walk_min_dgp_park: 1, building_height_m: 9.8, ...patch,
    },
    geometry: { type: "Polygon", coordinates: [[[10, 53], [10.001, 53], [10.001, 53.001], [10, 53]]] },
});
const BUILDINGS: Record<string, ReturnType<typeof building>> = {
    [LANGENBEK_EXAMPLE.id]: building(LANGENBEK_EXAMPLE.id, { score_15min: 8, score_15min_decay: 77.3, n_culture_15min: 0 }),
    [BLANKENESE_EXAMPLE.id]: building(BLANKENESE_EXAMPLE.id, {}),
    [FARMSEN_EXAMPLE.id]: building(FARMSEN_EXAMPLE.id, { score_15min_decay: 72.1, comfort_mean_400m: 85.1 }),
    [OTTENSEN_EXAMPLE.id]: building(OTTENSEN_EXAMPLE.id, { score_15min_decay: 96.8, safety_index_400m: 25, comfort_mean_400m: 84.5 }),
    [HOHELUFT_EXAMPLE.id]: building(HOHELUFT_EXAMPLE.id, { score_15min_decay: 96.2, safety_index_400m: 37.3, comfort_mean_400m: 85 }),
};

const data = vi.hoisted(() => ({ fetchStadtteilRows: vi.fn(), fetchStadtteilGeometry: vi.fn(), fetchBuilding: vi.fn() }));
vi.mock("@helpers/fifteenMinuteData", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@helpers/fifteenMinuteData")>()),
    ...data,
}));

const overlays = vi.hoisted(() => ({ instances: [] as Array<Record<string, ReturnType<typeof vi.fn>>> }));
vi.mock("@helpers/fifteenMinuteOverlays", () => ({
    FifteenMinuteOverlays: class {
        setAreaOutlines = vi.fn();
        setSelectedBuilding = vi.fn();
        raise = vi.fn();
        dispose = vi.fn();
        constructor() { overlays.instances.push(this as never); }
    },
}));

// --- UI stubs -----------------------------------------------------------------------------------------

const ButtonStub = defineComponent({
    emits: ["click"],
    setup(_props, { emit, slots, attrs }) { return () => h("button", { ...attrs, onClick: () => emit("click") }, slots.default?.()); },
});
const AlertStub = defineComponent({ props: { title: { type: String, default: "" } }, template: "<div role='alert'>{{ title }}</div>" });
const stubs = {
    UAlert: AlertStub, Alert: AlertStub, UButton: ButtonStub, Button: ButtonStub, UIcon: true, Icon: true,
    EditorJsReadonly: true, GeoStorySceneProgress: true, USwitch: true, USelect: true,
};

// --- map ---------------------------------------------------------------------------------------------

type Spy = ReturnType<typeof vi.fn>;
let map: ReturnType<typeof fakeRegistryMap> & { setPadding: Spy, on: Spy, off: Spy, easeTo: Spy, flyTo: Spy, queryRenderedFeatures: Spy };

function setup() {
    setActivePinia(createPinia());
    resetUrbanStoryProbes();
    catalogHolder.current = createFakeCatalog({});
    const base = fakeRegistryMap();
    const canvas = { getBoundingClientRect: () => ({ left: 0 }), style: {}, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    map = Object.assign(base, {
        getCanvas: () => canvas,
        setPadding: vi.fn(),
        fitBounds: vi.fn(),
        cameraForBounds: vi.fn(() => ({ zoom: 12 })),
        flyTo: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        easeTo: vi.fn(),
        getZoom: () => 14,
        queryRenderedFeatures: vi.fn(() => [] as unknown[]),
    });
    wireMapStore(map);
    const urban = useUrbanStoriesStore();
    fakeSceneEngine(useGeostorySceneStore());
    urban.selectStory("fifteen-minute");
    return { urban };
}

async function openScene(index: number) {
    const ctx = setup();
    await ctx.urban.startStory("fifteen-minute");
    const store = useFifteenMinuteStore();
    for (let step = 0; step < index; step += 1) await ctx.urban.goToChapter(step + 1);
    await flushPromises();
    const wrapper = mount(FifteenMinutePanel, { global: { stubs } });
    await flushPromises();
    await vi.waitFor(() => expect(store.dataStatus).toBe("ready"));
    await flushPromises();
    return { ...ctx, store, wrapper };
}

beforeEach(() => {
    vi.clearAllMocks();
    overlays.instances.length = 0;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    data.fetchStadtteilRows.mockResolvedValue(ROWS);
    data.fetchStadtteilGeometry.mockResolvedValue({ type: "Polygon", coordinates: [[[10, 53], [10.1, 53], [10.1, 53.1], [10, 53]]] });
    data.fetchBuilding.mockImplementation(async (id: string) => BUILDINGS[id]);
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("the six scenes", () => {
    test("the story has exactly the six scenes, in order, and the run follows them in both directions", async () => {
        const { urban, store } = await openScene(0);
        const config = getStoryConfig("fifteen-minute")!;
        expect(config.chapters.map((chapter) => chapter.chapterKey)).toEqual([...SCENE_KEYS]);
        expect(config.explore.map((entry) => entry.key)).toEqual(["buildings-15min", "stadtteile-15min"]);
        const seen: string[] = [];
        for (let index = 0; index < SCENE_KEYS.length; index += 1) {
            if (index > 0) await urban.goToChapter(index);
            await flushPromises();
            seen.push(store.sceneKey!);
        }
        for (let index = SCENE_KEYS.length - 2; index >= 0; index -= 1) {
            await urban.goToChapter(index);
            await flushPromises();
            seen.push(store.sceneKey!);
        }
        expect(seen).toEqual([...SCENE_KEYS, ...[...SCENE_KEYS].slice(0, -1).reverse()]);
    });

    test("each scene opens with its own measure", async () => {
        const { urban, store } = await openScene(0);
        const measures: (string | undefined)[] = [];
        for (let index = 0; index < SCENE_KEYS.length; index += 1) {
            if (index > 0) await urban.goToChapter(index);
            await flushPromises();
            measures.push(store.measure);
        }
        expect(measures).toEqual(["access", "access", "category-culture", "access", "access", "access"]);
    });

    test("the camera is padded by the sidebar and the padding is removed at the end", async () => {
        const { urban } = await openScene(0);
        expect(map.setPadding).toHaveBeenCalled();
        await urban.endRun({ camera: "none" });
        await flushPromises();
        expect(map.setPadding).toHaveBeenLastCalledWith({ left: 0, right: 0, top: 0, bottom: 0 });
    });
});

describe("scene 1: what does the score say", () => {
    test("summarises the published Stadtteil values: the typical Stadtteil, the distribution and the category coverage", async () => {
        const { wrapper, store } = await openScene(0);
        expect(store.summary?.stadtteile).toBe(6); // the Stadtteil with fewer than 5 buildings has no value
        expect(wrapper.get("[data-testid='fm-glance']").text()).toContain("6 Stadtteile");
        expect(wrapper.get("[data-testid='fm-glance']").text()).toContain("not weighted by buildings or residents");
        const counts = wrapper.findAll("[data-testid='fm-distribution'] [data-testid='fm-bar-text']").map((item) => Number(item.text()));
        expect(counts).toEqual([0, 0, 0, 4, 2]);
        expect(wrapper.findAll("[data-testid='fm-coverage'] [data-testid^='fm-bar-']").length).toBeGreaterThan(CATEGORY_IDS.length);
        expect(wrapper.get("[data-testid='fm-score-explainer']").text()).toContain("100 up to 5 minutes");
    });

    test("clicking a Stadtteil selects it and shows its published values", async () => {
        const { wrapper, store } = await openScene(0);
        const layerId = [...map.layers.keys()].find((key) => key.includes("hamburg_stadtteile"))!;
        map.queryRenderedFeatures.mockImplementation((_point: unknown, options: { layers: string[] }) => (
            options.layers.includes(layerId) ? [{ properties: { stadtteil_id: "211", stadtteil_name: "Blankenese" }, geometry: {} }] : []
        ));
        store.onMapClick({ point: { x: 1, y: 1 }, lngLat: { lng: 10, lat: 53 } } as never);
        await flushPromises();
        const card = wrapper.get("[data-testid='fm-area-card']");
        expect(card.text()).toContain("Blankenese");
        expect(card.text()).toContain("69.6");
        expect(card.text()).toContain("Building values, not residents");
        expect(store.selectedArea?.id).toBe("211");
    });
});

describe("scene 2: same score, different neighbourhood", () => {
    test("compares the two Stadtteile with the published values and names the largest gap from the data", async () => {
        const { wrapper } = await openScene(1);
        expect(wrapper.get("[data-testid='fm-compare-score-0']").text()).toBe("64.3");
        expect(wrapper.get("[data-testid='fm-compare-score-1']").text()).toBe("64.7");
        expect(wrapper.get("[data-testid='fm-compare-count-0']").text()).toBe("7.40");
        expect(wrapper.get("[data-testid='fm-compare-n-0']").text()).toBe("4,260");
        const gap = wrapper.get("[data-testid='fm-largest-gap']").text();
        expect(gap).toContain("Culture differs by 65 percentage points");
        expect(gap).toContain("65 % in Wilhelmsburg, 0 % in Langenbek");
        expect(wrapper.findAll("[data-testid='fm-profile'] [data-testid='fm-bar-fill']")).toHaveLength(CATEGORY_IDS.length * 2);
    });

    test("both Stadtteile are outlined, one in each colour", async () => {
        await openScene(1);
        const [instance] = overlays.instances;
        const outlines = instance.setAreaOutlines.mock.calls.at(-1)![0] as Array<{ tone: string, name: string }>;
        expect(outlines.map((outline) => [outline.tone, outline.name])).toEqual([["a", "Wilhelmsburg"], ["b", "Langenbek"]]);
    });
});

describe("scene 3: the weakest link", () => {
    test("opens on the weakest category of Langenbek, found in the published shares, with a real example building", async () => {
        const { wrapper, store } = await openScene(2);
        expect(weakestCategory(ROWS[1])).toBe("culture");
        expect(store.category).toBe("culture");
        expect(store.measure).toBe("category-culture");
        expect(wrapper.get("[data-testid='fm-overall-vs-category']").text()).toContain("Culture: 0 % of residential buildings reach it");
        expect(wrapper.get("[data-testid='fm-bar-culture']").text()).toContain("weakest");
        expect(store.selection?.profile.id).toBe(LANGENBEK_EXAMPLE.id);
        expect(wrapper.get("[data-testid='fm-card-category']").text()).toBe("none within 15 min");
    });

    test("switching the category keeps the selected building and the place; the nine categories can all be chosen", async () => {
        const { wrapper, store } = await openScene(2);
        map.flyTo.mockClear();
        for (const id of CATEGORY_IDS) {
            await wrapper.get(`[data-testid='fm-category-${id}']`).trigger("click");
            expect(store.measure).toBe(`category-${id}`);
        }
        expect(store.selection?.profile.id).toBe(LANGENBEK_EXAMPLE.id);
        expect(map.flyTo).not.toHaveBeenCalled();
    });

    test("health is described as a broad set of healthcare places, not emergency care", async () => {
        const { wrapper } = await openScene(2);
        await wrapper.get("[data-testid='fm-category-health']").trigger("click");
        const info = wrapper.get("[data-testid='fm-category-info']").text();
        expect(info).toContain("broad set of healthcare places");
        expect(info).toContain("not emergency care");
    });

    test("choosing Wilhelmsburg selects its own weakest category", async () => {
        const { wrapper, store } = await openScene(2);
        await wrapper.get(`[data-testid='fm-focus-${WILHELMSBURG.id}']`).trigger("click");
        expect(store.focusAreaId).toBe(WILHELMSBURG.id);
        expect(store.category).toBe("culture");
        expect(wrapper.get("[data-testid='fm-weakest']").text()).toContain("Wilhelmsburg");
    });
});

describe("scene 4: accessible, but comfortable?", () => {
    test("shows the Blankenese building and the comparison building with both indicators", async () => {
        const { wrapper, store } = await openScene(3);
        expect(store.selection?.profile.id).toBe(BLANKENESE_EXAMPLE.id);
        const cards = wrapper.findAll("[data-testid='fm-examples'] [data-testid='fm-building-card']");
        expect(cards.map((card) => card.attributes("data-building-id"))).toEqual([BLANKENESE_EXAMPLE.id, FARMSEN_EXAMPLE.id]);
        expect(cards[0].get("[data-testid='fm-card-access']").text()).toBe("72.8");
        expect(cards[0].get("[data-testid='fm-card-comfort']").text()).toBe("59.1");
        expect(cards[1].get("[data-testid='fm-card-comfort']").text()).toBe("85.1");
        expect(wrapper.get("[data-testid='fm-area-second-0']").text()).toBe("73.6");
        expect(wrapper.get("[data-testid='fm-dimension-explainer']").text()).toContain("not the route to any particular destination");
    });

    test("switching between accessibility and comfort keeps the camera and the selected building", async () => {
        const { wrapper, store } = await openScene(3);
        map.flyTo.mockClear();
        map.easeTo.mockClear();
        expect(store.measure).toBe("access");
        await wrapper.get("[data-testid='fm-view-second']").trigger("click");
        expect(store.measure).toBe("comfort");
        expect(store.selection?.profile.id).toBe(BLANKENESE_EXAMPLE.id);
        await wrapper.get("[data-testid='fm-view-access']").trigger("click");
        expect(store.measure).toBe("access");
        expect(store.selection?.profile.id).toBe(BLANKENESE_EXAMPLE.id);
        expect(map.flyTo).not.toHaveBeenCalled();
        expect(map.easeTo).not.toHaveBeenCalled();
    });

    test("warns about thin comfort data and about a missing comfort value", async () => {
        data.fetchBuilding.mockImplementation(async (id: string) => (id === BLANKENESE_EXAMPLE.id
            ? building(id, { comfort_scored_share_400m: 0.5, comfort_confidence_400m: 0.5 })
            : id === FARMSEN_EXAMPLE.id
                ? building(id, { comfort_mean_400m: null, comfort_null_reason_400m: "connector_exceeds_radius" })
                : BUILDINGS[id]));
        const { wrapper } = await openScene(3);
        await wrapper.get("[data-testid='fm-view-second']").trigger("click");
        const warnings = wrapper.findAll("[data-testid='fm-card-warning']").map((item) => item.text());
        expect(warnings.some((text) => text.includes("Only 50 % of the street length"))).toBe(true);
        expect(warnings.some((text) => text.includes("confidence is low"))).toBe(true);
        expect(warnings.some((text) => text.includes("more than 400 m away"))).toBe(true);
        expect(wrapper.findAll("[data-testid='fm-card-comfort']").map((item) => item.text())).toContain("–");
    });
});

describe("scene 5: accessible, but safe?", () => {
    test("compares Ottensen and Hoheluft-West with the direction of the index stated", async () => {
        const { wrapper, store } = await openScene(4);
        expect(store.selection?.profile.id).toBe(OTTENSEN_EXAMPLE.id);
        const text = wrapper.get("[data-testid='fm-dimension-explainer']").text();
        expect(text).toContain("Higher = LOWER recorded-crash concentration");
        expect(text).toContain("not personal risk");
        expect(wrapper.get("[data-testid='fm-area-second-0']").text()).toBe("27.8");
        expect(wrapper.get("[data-testid='fm-area-second-1']").text()).toBe("33.3");
    });

    test("the safety view keeps the selected building; showing another example flies there", async () => {
        const { wrapper, store } = await openScene(4);
        await wrapper.get("[data-testid='fm-view-second']").trigger("click");
        expect(store.measure).toBe("safety");
        expect(store.selection?.profile.id).toBe(OTTENSEN_EXAMPLE.id);
        await wrapper.get("[data-testid='fm-example-1']").trigger("click");
        await flushPromises();
        expect(store.selection?.profile.id).toBe(HOHELUFT_EXAMPLE.id);
        expect(store.measure).toBe("safety");
        expect(map.flyTo).toHaveBeenCalledWith(expect.objectContaining({ center: HOHELUFT_EXAMPLE.center }));
    });
});

describe("scene 6: explore beyond the score", () => {
    test("the five themes map to their measures and switching keeps the selection and the camera", async () => {
        const { wrapper, store } = await openScene(5);
        const layerId = [...map.layers.keys()].find((key) => key.includes("hamburg_buildings"))!;
        map.queryRenderedFeatures.mockImplementation((_point: unknown, options: { layers: string[] }) => (
            options.layers.includes(layerId) ? [{ properties: { gml_id: "B1", score_15min: 5, score_15min_decay: 50, is_residential: true }, geometry: { type: "Polygon", coordinates: [[[10, 53], [10.001, 53], [10.001, 53.001], [10, 53]]] } }] : []
        ));
        store.onMapClick({ point: { x: 1, y: 1 }, lngLat: { lng: 10, lat: 53 } } as never);
        await flushPromises();
        expect(store.selection?.profile.id).toBe("B1");
        map.flyTo.mockClear();
        map.easeTo.mockClear();
        const seen: string[] = [];
        for (const theme of ["access", "category", "comfort", "safety", "green"]) {
            await wrapper.get(`[data-testid='fm-theme-${theme}']`).trigger("click");
            seen.push(store.measure!);
            expect(store.selection?.profile.id).toBe("B1");
        }
        expect(seen).toEqual(["access", "category-culture", "comfort", "safety", "green"]);
        await wrapper.get("[data-testid='fm-green-green-park']").trigger("click");
        expect(store.measure).toBe("green-park");
        expect(map.flyTo).not.toHaveBeenCalled();
        expect(map.easeTo).not.toHaveBeenCalled();
    });

    test("a missing value is shown as missing, not as zero", async () => {
        const { wrapper, store } = await openScene(5);
        const layerId = [...map.layers.keys()].find((key) => key.includes("hamburg_buildings"))!;
        map.queryRenderedFeatures.mockImplementation((_point: unknown, options: { layers: string[] }) => (
            options.layers.includes(layerId) ? [{ properties: { gml_id: "B2", is_residential: true, score_confidence: "low" }, geometry: { type: "Polygon", coordinates: [[[10, 53], [10.001, 53], [10.001, 53.001], [10, 53]]] } }] : []
        ));
        store.onMapClick({ point: { x: 1, y: 1 }, lngLat: { lng: 10, lat: 53 } } as never);
        await flushPromises();
        expect(wrapper.get("[data-testid='fm-card-access']").text()).toBe("–");
        expect(wrapper.get("[data-testid='fm-card-comfort']").text()).toBe("–");
        expect(wrapper.get("[data-testid='fm-building-card']").text()).toContain("Low data confidence");
    });

    test("describes the active theme: name, meaning, unit and reading direction", async () => {
        const { wrapper } = await openScene(5);
        await wrapper.get("[data-testid='fm-theme-safety']").trigger("click");
        const text = wrapper.get("[data-testid='fm-metric']").text();
        expect(text).toContain("Pedestrian safety");
        expect(text).toContain("index points, 0–100");
        expect(text).toContain("Higher = LOWER recorded-crash concentration");
    });
});

describe("German", () => {
    test("the panel, the legend and the building card follow the language", async () => {
        const { wrapper, store } = await openScene(3);
        const i18n = (wrapper.vm as unknown as { $i18n: { locale: string } }).$i18n;
        i18n.locale = "de";
        await flushPromises();
        await wrapper.get("[data-testid='fm-view-second']").trigger("click");
        expect(store.measure).toBe("comfort");
        const text = wrapper.text();
        expect(text).toContain("Gehkomfort");
        expect(text).toContain("Höher = komfortabler");
        expect(text).toContain("Beispielgebäude");
        expect(text).toContain("Erreichte Kategorien (0–9)");
        expect(text).toContain("Kein Wert");
        expect(text).not.toContain("Higher = more comfortable");
        i18n.locale = "en";
    });
});

describe("cleanup", () => {
    test("ending the run removes every overlay and listener; repeated activation adds no duplicate listener", async () => {
        const { urban } = await openScene(0);
        const added = (type: string): number => map.on.mock.calls.filter((call) => call[0] === type).length;
        const removed = (type: string): number => map.off.mock.calls.filter((call) => call[0] === type).length;
        expect(added("click")).toBe(1);
        await urban.goToChapter(3);
        await urban.goToChapter(1);
        await flushPromises();
        expect(added("click")).toBe(1);
        await urban.endRun({ camera: "none" });
        await flushPromises();
        for (const type of ["click", "mousemove", "zoom"]) expect(removed(type)).toBe(added(type));
        expect(overlays.instances.every((instance) => instance.dispose.mock.calls.length > 0)).toBe(true);
    });
});

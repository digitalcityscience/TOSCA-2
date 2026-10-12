import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, h } from "vue";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { resetUrbanStoryProbes } from "@helpers/urbanStoryLayers";
import { useGeostorySceneStore } from "@store/geostoryScenes";
import { useUrbanStoriesStore } from "@store/urbanStories";
import { useFifteenMinuteStore } from "@store/urbanStories.fifteenMinute";
import { getStoryConfig } from "../../config/urbanStories";
import { CATEGORY_FIELDS, FIFTEEN_MINUTE_CATEGORY_IDS, SCORE_15MIN_CLASSES } from "../../config/urbanStories/styles/fifteenMinute";
import { createFakeCatalog, fakeRegistryMap, wireMapStore } from "./__fixtures__/catalogHarness";
import { fakeSceneEngine } from "./__fixtures__/runHarness";
import FifteenMinuteControls from "./FifteenMinuteControls.vue";
import StoryRunSection from "./StoryRunSection.vue";

const catalogHolder = vi.hoisted(() => ({ current: undefined as undefined | { geoserver: unknown } }));
vi.mock("@store/geoserver", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@store/geoserver")>()),
    useGeoserverStore: () => catalogHolder.current!.geoserver,
}));
vi.mock("@helpers/toast", () => ({ useToast: () => ({ add: vi.fn() }) }));

const AlertStub = defineComponent({
    props: { title: { type: String, default: "" }, description: { type: String, default: "" } },
    template: "<div role='alert'><strong>{{ title }}</strong><p>{{ description }}</p></div>",
});
const SelectStub = defineComponent({
    props: { modelValue: { type: String, default: "" }, items: { type: Array, default: () => [] }, disabled: Boolean },
    emits: ["update:modelValue"],
    setup(props, { emit, attrs }) {
        return () => h("select", {
            ...attrs,
            value: props.modelValue,
            disabled: props.disabled,
            onChange: (event: Event) => emit("update:modelValue", (event.target as HTMLSelectElement).value),
        }, (props.items as Array<{ value: string; label: string; disabled?: boolean }>).map((item) => (
            h("option", { value: item.value, disabled: item.disabled }, item.label)
        )));
    },
});
const SwitchStub = defineComponent({
    props: { modelValue: Boolean, disabled: Boolean },
    emits: ["update:modelValue"],
    setup(props, { emit, attrs }) {
        return () => h("input", {
            ...attrs, type: "checkbox", checked: props.modelValue, disabled: props.disabled,
            onChange: (event: Event) => emit("update:modelValue", (event.target as HTMLInputElement).checked),
        });
    },
});
const ButtonStub = defineComponent({
    emits: ["click"],
    setup(_props, { emit, slots, attrs }) {
        return () => h("button", { ...attrs, onClick: () => emit("click") }, slots.default?.());
    },
});
// Nuxt UI components resolve by short and prefixed name depending on how they are auto-imported.
const stubs = {
    UAlert: AlertStub, Alert: AlertStub, USelect: SelectStub, Select: SelectStub, USwitch: SwitchStub, Switch: SwitchStub,
    UButton: ButtonStub, Button: ButtonStub, UIcon: true, Icon: true, EditorJsReadonly: true,
};

let map: ReturnType<typeof fakeRegistryMap> & { queryRenderedFeatures: ReturnType<typeof vi.fn> };

function setup() {
    setActivePinia(createPinia());
    resetUrbanStoryProbes();
    catalogHolder.current = createFakeCatalog({});
    const base = fakeRegistryMap();
    const sources = new Map<string, { data: unknown; setData: (data: unknown) => void }>();
    map = Object.assign(base, {
        addSource: vi.fn((id: string) => { const source = { data: undefined as unknown, setData: (data: unknown) => { source.data = data; } }; sources.set(id, source); }),
        getSource: (id: string) => sources.get(id),
        removeSource: vi.fn(),
        queryRenderedFeatures: vi.fn(() => [] as unknown[]),
        setFilter: vi.fn(),
    });
    wireMapStore(map);
    const urban = useUrbanStoriesStore();
    fakeSceneEngine(useGeostorySceneStore());
    const fifteen = useFifteenMinuteStore();
    urban.selectStory("fifteen-minute");
    return { urban, fifteen };
}

async function openChapter(chapter: number) {
    const ctx = setup();
    await ctx.urban.startStory("fifteen-minute");
    if (chapter > 0) await ctx.urban.goToChapter(chapter);
    await ctx.fifteen.sync();
    const wrapper = mount(FifteenMinuteControls, { global: { stubs } });
    await flushPromises();
    return { ...ctx, wrapper };
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

const legendColors = (wrapper: VueWrapper): string[] => wrapper.findAll("[data-testid='legend-items'] [data-color]").map((node) => node.attributes("data-color")!);

describe("FifteenMinuteControls", () => {
    test("chapter 1: the legend lists the ten 0–9 classes with the expression's colours, plus no-data", async () => {
        const { wrapper } = await openChapter(0);
        expect(wrapper.find("[data-testid='category-select']").exists()).toBe(false);
        expect(legendColors(wrapper)).toEqual(SCORE_15MIN_CLASSES.map((item) => item.color));
        expect(wrapper.get("[data-testid='legend-no-data']").text()).toContain("No score");
        // The nine categories are named and explained, so "x of 9" is understandable.
        const categories = wrapper.findAll("[data-testid='legend-category']").map((row) => row.text());
        expect(categories).toHaveLength(9);
        expect(categories[0]).toContain("Food – Supermarkets");
        expect(categories[8]).toContain("Public transport stops – Any HVV");
    });

    test("chapter 2: the category selector offers the overall view and nine categories; choosing one restyles the map and the legend", async () => {
        const { wrapper, fifteen } = await openChapter(1);
        const select = wrapper.get("[data-testid='category-select']");
        expect(select.findAll("option")).toHaveLength(10);

        await select.setValue("culture");
        await flushPromises();
        expect(fifteen.category).toBe("culture");
        expect(fifteen.effectiveCategory).toBe("culture");
        const spec = map.specs.find((candidate) => candidate.id === fifteen.buildingRuntimeId)!;
        expect(JSON.stringify(spec.paint["fill-extrusion-color"])).toContain(CATEGORY_FIELDS.culture.accessField);
        expect(wrapper.get("[data-testid='fifteen-minute-legends']").text()).toContain("Culture");
        expect(legendColors(wrapper)).toHaveLength(2);
        expect(wrapper.find("[data-testid='legend-poi']").exists()).toBe(true);

        await select.setValue("__overall");
        await flushPromises();
        expect(fifteen.category).toBeNull();
        expect(legendColors(wrapper)).toHaveLength(10);
    });

    test("chapter 3: the panel asks for a click, then shows the actual profile and can clear it", async () => {
        const { wrapper, fifteen } = await openChapter(2);
        expect(wrapper.find("[data-testid='selection-hint']").exists()).toBe(true);

        map.queryRenderedFeatures.mockReturnValue([{
            id: 5,
            properties: { score_15min: 4, score_15min_decay: 55.5, n_food_15min: 2, walk_min_food: 6.1, n_health_15min: 0 },
            geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
        }]);
        fifteen.onMapClick({ point: { x: 1, y: 1 } });
        await flushPromises();

        expect(wrapper.get("[data-testid='selection-id']").text()).toContain("5");
        expect(wrapper.get("[data-testid='selection-score']").text()).toContain("4 / 9");
        expect(wrapper.get("[data-testid='selection-decay']").text()).toContain("55.5");
        const rows = wrapper.findAll("[data-testid='selection-categories'] li");
        expect(rows).toHaveLength(9);
        const states = Object.fromEntries(rows.map((row) => [row.attributes("data-category"), row.attributes("data-state")]));
        expect(states.food).toBe("accessible");
        expect(states.health).toBe("inaccessible");
        expect(states.park).toBe("unknown");
        expect(wrapper.get("[data-category='food']").text()).toContain("6.1");

        await wrapper.get("[data-testid='selection-clear']").trigger("click");
        await flushPromises();
        expect(fifteen.selection).toBeUndefined();
        expect(wrapper.find("[data-testid='selection-hint']").exists()).toBe(true);
    });

    test("chapter 3: a missing building identifier is stated, not invented", async () => {
        const { wrapper, fifteen } = await openChapter(2);
        map.queryRenderedFeatures.mockReturnValue([{ properties: { score_15min: 1 }, geometry: { type: "Point", coordinates: [0, 0] } }]);
        fifteen.onMapClick({ point: { x: 1, y: 1 } });
        await flushPromises();
        expect(wrapper.get("[data-testid='selection-id']").text()).toContain("No building identifier is published");
    });

    test("chapter 4: level and measure controls drive the map, and the explanation separates count from decay", async () => {
        const { wrapper, fifteen } = await openChapter(3);
        expect(wrapper.get("[data-testid='admin-controls']").text()).toContain("not the mean of the 0–9 count");
        await wrapper.get("[data-testid='admin-level']").setValue("bezirke");
        await wrapper.get("[data-testid='admin-metric']").setValue("m15_decay_mean");
        await flushPromises();
        expect(fifteen.adminLevel).toBe("bezirke");
        expect(fifteen.adminMetric).toBe("m15_decay_mean");
        expect(wrapper.get("[data-testid='fifteen-minute-legends']").text()).toContain("Mean decay-weighted score");
        expect(wrapper.get("[data-testid='fifteen-minute-legends']").text()).toContain("Categories reached");
    });

    test("chapter 5: the threshold is explicit and adjustable, and 'missing only' needs a category", async () => {
        const { wrapper, fifteen } = await openChapter(4);
        expect(wrapper.get("[data-testid='gap-threshold']").findAll("option")).toHaveLength(9);
        expect((wrapper.get("[data-testid='gap-missing-only']").element as HTMLInputElement).disabled).toBe(true);

        await wrapper.get("[data-testid='gap-threshold']").setValue("5");
        await flushPromises();
        expect(fifteen.gapMaxScore).toBe(5);
        const spec = map.specs.find((candidate) => candidate.id === fifteen.buildingRuntimeId)!;
        expect(JSON.stringify(spec.filter)).toContain("\"<=\",[\"get\",\"score_15min\"],5");

        await wrapper.get("[data-testid='category-select']").setValue("food");
        await flushPromises();
        expect((wrapper.get("[data-testid='gap-missing-only']").element as HTMLInputElement).disabled).toBe(false);
        await wrapper.get("[data-testid='gap-missing-only']").setValue(true);
        await flushPromises();
        expect(JSON.stringify(map.specs.find((candidate) => candidate.id === fifteen.buildingRuntimeId)!.filter)).toContain("n_food_15min");

        await wrapper.get("[data-testid='gap-enabled']").setValue(false);
        await flushPromises();
        expect(fifteen.gapEnabled).toBe(false);
    });

    test("a building tile error shows the accurate unavailable state", async () => {
        const { wrapper, fifteen } = await openChapter(0);
        expect(wrapper.find("[data-testid='fifteen-minute-tiles-unavailable']").exists()).toBe(false);
        const handler = (map.on.mock.calls.find(([type]) => type === "error") as unknown as [string, (event: unknown) => void])[1];
        handler({ sourceId: fifteen.buildingRuntimeId });
        await flushPromises();
        const alert = wrapper.get("[data-testid='fifteen-minute-tiles-unavailable']");
        expect(alert.text()).toContain("Building tiles are unavailable");
        expect(alert.text()).toContain("HTTP 400");
        expect(alert.text()).toContain("no other layer is shown in its place");
    });
});

describe("StoryRunSection integration", () => {
    test("the 15-Minute City run shows the map controls, other stories do not", async () => {
        const { urban } = setup();
        const wrapper = mount(StoryRunSection, { props: { story: getStoryConfig("fifteen-minute")! }, global: { stubs } });
        await wrapper.get("[data-testid='run-start']").trigger("click");
        await flushPromises();
        expect(wrapper.find("[data-testid='fifteen-minute-controls']").exists()).toBe(true);
        expect(wrapper.get("[data-testid='fifteen-minute-controls']").attributes("data-mode")).toBe("overall");
        await wrapper.get("[data-testid='run-next']").trigger("click");
        await flushPromises();
        expect(wrapper.get("[data-testid='fifteen-minute-controls']").attributes("data-mode")).toBe("category");
        await urban.endRun();

        for (const key of ["walkability-safety", "transit-equity", "green-spaces"] as const) {
            const other = mount(StoryRunSection, { props: { story: getStoryConfig(key)! }, global: { stubs } });
            await other.get("[data-testid='run-start']").trigger("click");
            await flushPromises();
            expect(other.find("[data-testid='fifteen-minute-controls']").exists(), key).toBe(false);
            await urban.endRun();
        }
    });

    test("every 15-Minute City category appears once in the selector", async () => {
        const { wrapper } = await openChapter(1);
        const values = wrapper.get("[data-testid='category-select']").findAll("option").map((option) => option.attributes("value"));
        expect(values.slice(1)).toEqual([...FIFTEEN_MINUTE_CATEGORY_IDS]);
    });
});

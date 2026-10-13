import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, h } from "vue";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { resetUrbanStoryProbes } from "@helpers/urbanStoryLayers";
import { useGeostorySceneStore } from "@store/geostoryScenes";
import { useUrbanStoriesStore } from "@store/urbanStories";
import { SCENE_KEYS, useTransitEquityStore } from "@store/urbanStories.transitEquity";
import type { AgreementCounts, ResidentialValue, StadtteilRow } from "@helpers/transitEquityData";
import { LANGENHORN, OFFICIAL_ONLY_EXAMPLE, SERVICE_HIGH, SERVICE_LOW, GAP_EXAMPLE, WALKING_ONLY_EXAMPLE } from "../../config/urbanStories/transitEquityLocations";
import { AGREEMENT_COLORS, DEPARTURE_CLASSES, DEPARTURE_ZERO_COLOR, OUTSIDE_SHARE_STOPS } from "../../config/urbanStories/styles/transitEquity";
import { createFakeCatalog, fakeRegistryMap, wireMapStore } from "./__fixtures__/catalogHarness";
import { fakeSceneEngine } from "./__fixtures__/runHarness";
import StoryRunSection from "./StoryRunSection.vue";
import TransitEquityPanel from "./TransitEquityPanel.vue";
import { getStoryConfig } from "../../config/urbanStories";

const catalogHolder = vi.hoisted(() => ({ current: undefined as undefined | { geoserver: unknown } }));
vi.mock("@store/geoserver", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@store/geoserver")>()),
    useGeoserverStore: () => catalogHolder.current!.geoserver,
}));
vi.mock("@helpers/toast", () => ({ useToast: () => ({ add: vi.fn() }) }));

// --- data and collaborators -----------------------------------------------------------------------

const row = (id: string, name: string, residentialCount: number, outsideCount: number, bounds: [number, number, number, number] = [9.9, 53.5, 10.0, 53.6]): StadtteilRow => ({
    id, name, bezirk: "Nord", bounds, residentialCount, outsideCount,
    outsideShare: residentialCount === 0 ? null : outsideCount / residentialCount, departuresMedian: 200,
});
const ROWS = [row("413", "Langenhorn", 7918, 2930), row("101", "Altstadt", 100, 0), row("102", "Mitte", 1000, 100), row("199", "Insel", 0, 0)];
const building = (id: string, patch: Record<string, unknown>) => ({
    properties: { gml_id: id, building_function_code: 1000, pt_district_match: "contains", origin_quality: "good", pt_departures_complete: true, ...patch },
    geometry: { type: "Polygon", coordinates: [[[10, 53], [10.001, 53], [10.001, 53.001], [10, 53]]] },
});
const BUILDINGS: Record<string, ReturnType<typeof building>> = {
    [GAP_EXAMPLE.id]: building(GAP_EXAMPLE.id, { pt_in_catchment_any: false, walk_min_stop_any: 8.95, pt_departures_daily_sum: 0, pt_line_n_unique: 0 }),
    [SERVICE_HIGH.id]: building(SERVICE_HIGH.id, { pt_in_catchment_any: true, walk_min_stop_any: 4.5, pt_departures_daily_sum: 1669, pt_line_n_unique: 6 }),
    [SERVICE_LOW.id]: building(SERVICE_LOW.id, { pt_in_catchment_any: true, walk_min_stop_any: 4.8, pt_departures_daily_sum: 36, pt_line_n_unique: 1 }),
    [OFFICIAL_ONLY_EXAMPLE.id]: building(OFFICIAL_ONLY_EXAMPLE.id, { pt_in_catchment_any: true, walk_min_stop_any: 8.4, pt_departures_daily_sum: 356, pt_line_n_unique: 1 }),
    [WALKING_ONLY_EXAMPLE.id]: building(WALKING_ONLY_EXAMPLE.id, { pt_in_catchment_any: false, walk_min_stop_any: 5.8, pt_departures_daily_sum: 0, pt_line_n_unique: 0 }),
};
const AGREEMENT: AgreementCounts = { both: 70, officialOnly: 10, walkingOnly: 5, neither: 15, total: 100 };
const value = (patch: Partial<ResidentialValue>): ResidentialValue => ({ inCatchment: true, walkMin: 4, originNone: false, departures: 100, departuresComplete: true, lines: 2, ...patch });

const data = vi.hoisted(() => ({
    fetchStadtteile: vi.fn(),
    fetchStadtteilGeometry: vi.fn(),
    fetchBuilding: vi.fn(),
    fetchResidentialValues: vi.fn(),
    fetchAgreementCounts: vi.fn(),
    fetchCriteriaCounts: vi.fn(),
}));
vi.mock("@helpers/transitEquityData", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@helpers/transitEquityData")>()),
    ...data,
}));

const riders = vi.hoisted(() => ({
    activateHamburgRiders: vi.fn(),
    deactivateHamburgRiders: vi.fn(),
    getRidersState: vi.fn(() => ({ active: true, loading: "ready", serviceDate: "31 May 2026", consumers: [] })),
}));
vi.mock("@helpers/hamburgRiders/ridersApi", () => riders);

const overlays = vi.hoisted(() => ({
    instances: [] as Array<Record<string, ReturnType<typeof vi.fn>>>,
}));
vi.mock("@helpers/transitEquityOverlays", () => ({
    OVERLAY_LAYER_IDS: { stopPoint: "eq-stops-point", stopCluster: "eq-stops-cluster" },
    TransitEquityOverlays: class {
        setStops = vi.fn(async () => undefined);
        setCatchments = vi.fn(async () => undefined);
        setAreaOutlines = vi.fn();
        setSelectedBuilding = vi.fn();
        raise = vi.fn();
        dispose = vi.fn();
        constructor() { overlays.instances.push(this as never); }
    },
}));

// --- UI stubs -----------------------------------------------------------------------------------------

const SelectStub = defineComponent({
    props: { modelValue: { type: String, default: "" }, items: { type: Array, default: () => [] } },
    emits: ["update:modelValue"],
    setup(props, { emit, attrs }) {
        return () => h("select", { ...attrs, value: props.modelValue, onChange: (event: Event) => emit("update:modelValue", (event.target as HTMLSelectElement).value) },
            (props.items as Array<{ value: string, label: string }>).map((item) => h("option", { value: item.value }, item.label)));
    },
});
const SwitchStub = defineComponent({
    props: { modelValue: Boolean },
    emits: ["update:modelValue"],
    setup(props, { emit, attrs }) {
        return () => h("input", { ...attrs, type: "checkbox", checked: props.modelValue, onChange: (event: Event) => emit("update:modelValue", (event.target as HTMLInputElement).checked) });
    },
});
const ButtonStub = defineComponent({
    emits: ["click"],
    setup(_props, { emit, slots, attrs }) { return () => h("button", { ...attrs, onClick: () => emit("click") }, slots.default?.()); },
});
const AlertStub = defineComponent({ props: { title: { type: String, default: "" } }, template: "<div role='alert'>{{ title }}</div>" });
const stubs = {
    UAlert: AlertStub, Alert: AlertStub, USelect: SelectStub, Select: SelectStub, USwitch: SwitchStub, Switch: SwitchStub,
    UButton: ButtonStub, Button: ButtonStub, UIcon: true, Icon: true, EditorJsReadonly: true, GeoStorySceneProgress: true,
};

// --- map ---------------------------------------------------------------------------------------------

type Spy = ReturnType<typeof vi.fn>;
let map: ReturnType<typeof fakeRegistryMap> & { setPadding: Spy, fitBounds: Spy, on: Spy, off: Spy, easeTo: Spy, queryRenderedFeatures: Spy };

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
        on: vi.fn(),
        off: vi.fn(),
        easeTo: vi.fn(),
        queryRenderedFeatures: vi.fn(() => [] as unknown[]),
    });
    wireMapStore(map);
    const urban = useUrbanStoriesStore();
    fakeSceneEngine(useGeostorySceneStore());
    urban.selectStory("transit-equity");
    return { urban };
}

async function openScene(index: number) {
    const ctx = setup();
    await ctx.urban.startStory("transit-equity");
    const equity = useTransitEquityStore();
    for (let step = 0; step < index; step += 1) await ctx.urban.goToChapter(step + 1);
    await flushPromises();
    const wrapper = mount(TransitEquityPanel, { global: { stubs } });
    await flushPromises();
    await vi.waitFor(() => expect(equity.dataStatus).toBe("ready"));
    await flushPromises();
    return { ...ctx, equity, wrapper };
}

beforeEach(() => {
    vi.clearAllMocks();
    overlays.instances.length = 0;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    data.fetchStadtteile.mockResolvedValue(ROWS);
    data.fetchStadtteilGeometry.mockResolvedValue({ type: "Polygon", coordinates: [[[10, 53], [10.1, 53], [10.1, 53.1], [10, 53]]] });
    data.fetchBuilding.mockImplementation(async (id: string) => BUILDINGS[id]);
    data.fetchResidentialValues.mockImplementation(async (id: string) => (id === "413"
        ? [value({ departures: 0, inCatchment: false, walkMin: 8 }), value({ departures: 0, inCatchment: false, walkMin: 10 }), value({ departures: 300 }), value({ departures: 500 })]
        : [value({ departures: 200 }), value({ departures: 300 }), value({ departures: 400 }), value({ departures: 0, inCatchment: false })]));
    data.fetchAgreementCounts.mockResolvedValue(AGREEMENT);
    data.fetchCriteriaCounts.mockImplementation(async (criteria: { area: string | null }) => (criteria.area === null ? { matching: 36, total: 200 } : { matching: 5, total: 50 }));
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("the six scenes", () => {
    test("the story has exactly the six scenes, in order, and the run follows them in both directions", async () => {
        const { urban, equity } = await openScene(0);
        const config = getStoryConfig("transit-equity")!;
        expect(config.chapters.map((chapter) => chapter.chapterKey)).toEqual([...SCENE_KEYS]);
        const seen: string[] = [];
        for (let index = 0; index < SCENE_KEYS.length; index += 1) {
            if (index > 0) await urban.goToChapter(index);
            await flushPromises();
            seen.push(equity.sceneKey!);
        }
        for (let index = SCENE_KEYS.length - 2; index >= 0; index -= 1) {
            await urban.goToChapter(index);
            await flushPromises();
            seen.push(equity.sceneKey!);
        }
        expect(seen).toEqual([...SCENE_KEYS, ...[...SCENE_KEYS].slice(0, -1).reverse()]);
    });

    test("each scene shows its own view of the buildings", async () => {
        const { urban, equity } = await openScene(0);
        const views: string[] = [];
        for (let index = 0; index < SCENE_KEYS.length; index += 1) {
            if (index > 0) await urban.goToChapter(index);
            await flushPromises();
            views.push(equity.activeView!);
        }
        expect(views).toEqual(["coverage", "coverage", "departures", "agreement", "departures", "criteria"]);
    });

    test("the camera is padded by the sidebar so every scene centres on the visible map, and the padding is removed at the end", async () => {
        const { urban } = await openScene(0);
        expect(map.setPadding).toHaveBeenCalled();
        await urban.endRun({ camera: "none" });
        await flushPromises();
        expect(map.setPadding).toHaveBeenLastCalledWith({ left: 0, right: 0, top: 0, bottom: 0 });
    });
});

describe("scene 1: who is covered", () => {
    test("shows the Hamburg-wide share of housing outside coverage from the same buildings as the Stadtteil values, and the distribution", async () => {
        const { wrapper } = await openScene(0);
        const total = 7918 + 100 + 1000;
        const outside = 2930 + 0 + 100;
        expect(wrapper.get("[data-testid='citywide-inside']").text()).toBe(new Intl.NumberFormat("en", { style: "percent", maximumFractionDigits: 1 }).format(1 - outside / total));
        expect(wrapper.get("[data-testid='equity-citywide']").text()).toContain(new Intl.NumberFormat("en").format(total));
        const counts = wrapper.findAll("[data-testid='equity-bar-row']").map((item) => Number(item.findAll("span").at(-1)!.text()));
        expect(counts.reduce((sum, count) => sum + count, 0)).toBe(3); // the Stadtteil without housing buildings has no value
        expect(wrapper.get("[data-testid='equity-distribution']").text()).toContain("1 without housing buildings");
        expect(wrapper.findAll("[data-testid='equity-bar-row'] [data-color]").map((bar) => bar.attributes("data-color")))
            .toEqual([OUTSIDE_SHARE_STOPS[0].color, OUTSIDE_SHARE_STOPS[1].color, OUTSIDE_SHARE_STOPS[2].color, OUTSIDE_SHARE_STOPS[4].color, OUTSIDE_SHARE_STOPS[5].color]);
    });

    test("clicking a Stadtteil shows its rate and compares it with Hamburg", async () => {
        const { wrapper, equity } = await openScene(0);
        const layerId = [...map.layers.keys()][0];
        map.queryRenderedFeatures.mockImplementation((_point: unknown, options: { layers: string[] }) => (
            options.layers.includes(layerId) ? [{ properties: { stadtteil_id: "413", stadtteil_name: "Langenhorn", ptr_resid_uncovered_share: 0.37 }, geometry: {} }] : []
        ));
        equity.onMapClick({ point: { x: 1, y: 1 }, lngLat: { lng: 10, lat: 53 } } as never);
        await flushPromises();
        const card = wrapper.get("[data-testid='equity-area-card']");
        expect(card.text()).toContain("Langenhorn");
        expect(card.text()).toContain("37%");
        expect(card.text()).toContain("above Hamburg");
        expect(equity.selectedArea?.id).toBe("413");
    });
});

describe("scene 2: where are the gaps", () => {
    test("opens in Langenhorn with its rate, the comparison, the number outside and a real example building", async () => {
        const { wrapper, equity } = await openScene(1);
        const area = wrapper.get("[data-testid='equity-gap-area']").text();
        expect(area).toContain("Langenhorn");
        expect(area).toContain("37%");
        expect(area).toContain("2,930");
        expect(wrapper.get("[data-testid='gap-vs-hamburg']").text()).toContain("points above");
        expect(equity.selection?.profile.id).toBe(GAP_EXAMPLE.id);
        expect(wrapper.get("[data-testid='card-official']").text()).toBe("outside every catchment");
        expect(wrapper.get("[data-testid='card-walk']").text()).toBe("9.0 min");
        expect(wrapper.find("[data-testid='gap-example']").exists()).toBe(true);
        const [instance] = overlays.instances;
        expect(instance.setStops).toHaveBeenLastCalledWith(true);
        expect(instance.setCatchments).toHaveBeenLastCalledWith(true);
        expect(instance.setSelectedBuilding).toHaveBeenLastCalledWith(expect.objectContaining({ geometry: expect.anything() }));
    });

    test("the pattern text comes from the data: the median walk and the share within 9 minutes", async () => {
        const { wrapper } = await openScene(1);
        const pattern = wrapper.get("[data-testid='equity-gap-pattern']").text();
        expect(pattern).toContain("9.0 minutes");
        expect(pattern).toContain("50%");
    });
});

describe("scene 3: a stop is not the same as good service", () => {
    test("compares a high-service and a lower-service building with departures, lines and the time basis", async () => {
        const { wrapper } = await openScene(2);
        const cards = wrapper.findAll("[data-testid='equity-service-examples'] [data-testid='equity-building-card']");
        expect(cards.map((card) => card.attributes("data-building-id"))).toEqual([SERVICE_HIGH.id, SERVICE_LOW.id]);
        expect(cards[0].get("[data-testid='card-departures']").text()).toBe("1,669");
        expect(cards[0].get("[data-testid='card-lines']").text()).toBe("6");
        expect(cards[1].get("[data-testid='card-departures']").text()).toBe("36");
        expect(wrapper.get("[data-testid='service-basis']").text()).toContain("not real time");
        expect(wrapper.get("[data-testid='service-basis']").text()).toContain("without a stated reference period");
        expect(wrapper.text()).toContain("Daily departures within reach");
        const legendColors = wrapper.findAll("[data-testid='equity-legend-departures'] [data-color]").map((node) => node.attributes("data-color"));
        expect(legendColors.slice(0, 1 + DEPARTURE_CLASSES.length)).toEqual([DEPARTURE_ZERO_COLOR, ...DEPARTURE_CLASSES.map((item) => item.color)]);
    });

    test("clicking a stop area shows its official departures and lines", async () => {
        const { wrapper, equity } = await openScene(2);
        map.queryRenderedFeatures.mockImplementation((_point: unknown, options: { layers: string[] }) => (
            options.layers.includes("eq-stops-point") ? [{ properties: { name: "Langenhorn Markt", art: "U-Bahn", abfahrten: 800, linienzahl: 1, linien: "U1" }, geometry: {} }] : []
        ));
        map.getLayer = ((id: string) => (id === "eq-stops-point" ? { id } : undefined)) as never;
        equity.onMapClick({ point: { x: 1, y: 1 }, lngLat: { lng: 10, lat: 53 } } as never);
        await flushPromises();
        expect(wrapper.get("[data-testid='stop-departures']").text()).toBe("800");
        expect(wrapper.get("[data-testid='stop-lines']").text()).toBe("1");
    });

    test("HamburgRiders is optional context: off by default, activated for this story only on request, and released again on leaving the scene", async () => {
        const { wrapper, equity, urban } = await openScene(2);
        expect(riders.activateHamburgRiders).not.toHaveBeenCalled();
        await wrapper.get("[data-testid='riders-toggle']").setValue(true);
        expect(riders.activateHamburgRiders).toHaveBeenLastCalledWith({ consumer: "transit-equity", network: ["u-bahn", "s-bahn"], stops: ["u-bahn", "s-bahn"] });
        // No vehicles and no timeline are requested: a historical timetable day is not current service frequency.
        const request = riders.activateHamburgRiders.mock.calls.at(-1)![0] as Record<string, unknown>;
        expect(request.vehicles).toBeUndefined();
        expect(request.timeline).toBeUndefined();
        expect(wrapper.get("[data-testid='riders-date']").text()).toContain("31 May 2026");
        await wrapper.get("[data-testid='riders-mode-bus']").trigger("click");
        expect(riders.activateHamburgRiders).toHaveBeenLastCalledWith({ consumer: "transit-equity", network: ["u-bahn", "s-bahn", "bus"], stops: ["u-bahn", "s-bahn", "bus"] });
        expect(equity.ridersOn).toBe(true);

        riders.deactivateHamburgRiders.mockClear();
        await urban.goToChapter(3);
        await flushPromises();
        expect(riders.deactivateHamburgRiders).toHaveBeenCalledWith("transit-equity");
        expect(equity.ridersOn).toBe(false);
    });
});

describe("scene 4: official coverage vs walking access", () => {
    test("shows the four classes with the agreement colours, the citywide distribution and the threshold", async () => {
        const { wrapper, equity } = await openScene(3);
        const bars = wrapper.get("[data-testid='equity-agreement-city']");
        expect(bars.findAll("[data-color]").map((bar) => bar.attributes("data-color"))).toEqual(Object.values(AGREEMENT_COLORS));
        expect(bars.text()).toContain("70 · 70%");
        expect(wrapper.get("[data-testid='agreement-threshold']").text()).toContain("at most 6 minutes");
        expect(wrapper.text()).toContain("Neither definition is the absolute truth");
        expect(equity.selection?.profile.id).toBe(OFFICIAL_ONLY_EXAMPLE.id);
        expect(equity.selection?.profile.agreement).toBe("officialOnly");
    });

    test("both disagreement examples can be selected and carry their own class", async () => {
        const { equity } = await openScene(3);
        await equity.selectExample(WALKING_ONLY_EXAMPLE);
        expect(equity.selection?.profile.agreement).toBe("walkingOnly");
        expect(equity.selection?.profile.walkMin).toBe(5.8);
    });
});

describe("scene 5: averages hide differences", () => {
    test("compares two Stadtteile on the same population with a distribution, not just two averages", async () => {
        const { wrapper } = await openScene(4);
        const first = wrapper.get(`[data-testid='equity-compare-${LANGENHORN.id}']`);
        expect(first.text()).toContain("Langenhorn");
        expect(first.findAll("[data-testid='equity-bar-row']")).toHaveLength(6);
        expect(first.get("[data-testid='compare-zero']").text()).toBe("50%");
        expect(wrapper.get("[data-testid='compare-reading']").text()).toContain("have no departure in reach");
        expect(wrapper.text()).toContain("not about who lives there");
        expect(data.fetchResidentialValues).toHaveBeenCalledWith("413");
        expect(data.fetchResidentialValues).toHaveBeenCalledWith("411");
    });

    test("the scene shows the buildings and the two outlines, and no area colours that would hide the footprints", async () => {
        const { equity, urban } = await openScene(4);
        expect(equity.activeView).toBe("departures");
        const config = getStoryConfig("transit-equity")!;
        expect(config.chapters[4].show!.map((shown) => shown.entryKey)).toEqual(["buildings-pt"]);
        expect(data.fetchStadtteilGeometry).toHaveBeenCalledWith("413");
        expect(data.fetchStadtteilGeometry).toHaveBeenCalledWith("411");
        void urban;
    });
});

describe("scene 6: explore the gaps", () => {
    test("starts from 'outside every catchment', counts the matches and updates the style when a criterion changes", async () => {
        const { wrapper, equity } = await openScene(5);
        expect(equity.criteria).toMatchObject({ coverage: "outside", walkMoreThan: null, departuresAtMost: null, linesAtMost: null, area: null });
        expect(wrapper.get("[data-testid='criteria-matching']").text()).toBe("36");
        await wrapper.get("[data-testid='criteria-departures']").setValue("100");
        await flushPromises();
        expect(equity.criteria.departuresAtMost).toBe(100);
        expect(data.fetchCriteriaCounts).toHaveBeenLastCalledWith(expect.objectContaining({ departuresAtMost: 100, coverage: "outside" }));
        await wrapper.get("[data-testid='criteria-area']").setValue("413");
        await flushPromises();
        expect(equity.criteria.area).toBe("413");
        expect(wrapper.get("[data-testid='criteria-matching']").text()).toBe("5");
        expect(wrapper.get("[data-testid='equity-criteria-counts']").text()).toContain("Langenhorn");
        await wrapper.get("[data-testid='criteria-reset']").trigger("click");
        await flushPromises();
        expect(equity.criteria).toMatchObject({ coverage: "outside", departuresAtMost: null, area: null });
    });

    test("selected features are cleared with one control", async () => {
        const { wrapper, equity } = await openScene(5);
        await equity.selectExample(SERVICE_LOW);
        await flushPromises();
        expect(wrapper.find("[data-testid='equity-building-card']").exists()).toBe(true);
        await wrapper.get("[data-testid='selection-clear']").trigger("click");
        await flushPromises();
        expect(equity.selection).toBeUndefined();
    });
});

describe("scene changes and the end of the story", () => {
    test("a scene never inherits the selection, criteria or overlays of the previous one", async () => {
        const { urban, equity } = await openScene(1);
        expect(equity.selection).toBeDefined();
        await urban.goToChapter(2);
        await flushPromises();
        expect(equity.selection).toBeUndefined();
        expect(equity.criteria.area).toBeNull();
        await urban.goToChapter(0);
        await flushPromises();
        const instance = overlays.instances.at(-1)!;
        expect(instance.setStops).toHaveBeenLastCalledWith(false);
        expect(instance.setCatchments).toHaveBeenLastCalledWith(false);
    });

    test("ending the run removes every overlay and listener and releases HamburgRiders", async () => {
        const { urban, equity } = await openScene(2);
        equity.setRidersOn(true);
        const listeners = map.on.mock.calls.map((call) => call[0] as string);
        expect(listeners).toEqual(expect.arrayContaining(["click", "mousemove"]));
        await urban.endRun({ camera: "none" });
        await flushPromises();
        expect(overlays.instances.at(-1)!.dispose).toHaveBeenCalled();
        for (const type of ["click", "mousemove"]) expect(map.off).toHaveBeenCalledWith(type, expect.any(Function));
        expect(riders.deactivateHamburgRiders).toHaveBeenLastCalledWith("transit-equity");
        expect(equity.sceneKey).toBeUndefined();
    });

    test("the run section renders the scene panel for this story only", async () => {
        const { urban } = setup();
        await urban.startStory("transit-equity");
        const wrapper = mount(StoryRunSection, { props: { story: getStoryConfig("transit-equity")! }, global: { stubs } });
        await flushPromises();
        expect(wrapper.find("[data-testid='transit-equity-panel']").exists()).toBe(true);
        expect(wrapper.findAll("[data-testid^='chapter-jump-']")).toHaveLength(6);
        const other = mount(StoryRunSection, { props: { story: getStoryConfig("green-spaces")! }, global: { stubs } });
        expect(other.find("[data-testid='transit-equity-panel']").exists()).toBe(false);
    });
});

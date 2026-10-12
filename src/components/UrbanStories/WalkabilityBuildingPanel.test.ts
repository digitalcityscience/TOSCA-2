import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, expect, test, vi } from "vitest";
import { useUrbanStoriesStore } from "@store/urbanStories";
import { useGeostorySceneStore } from "@store/geostoryScenes";
import { resetUrbanStoryProbes } from "@helpers/urbanStoryLayers";
import { createFakeCatalog, fakeRegistryMap, wireMapStore } from "./__fixtures__/catalogHarness";
import { fakeSceneEngine } from "./__fixtures__/runHarness";
import WalkabilityBuildingPanel from "./WalkabilityBuildingPanel.vue";
const holder = vi.hoisted(() => ({ current: undefined as ReturnType<typeof createFakeCatalog> | undefined }));
vi.mock("@store/geoserver", async (original) => ({ ...(await original<typeof import("@store/geoserver")>()), useGeoserverStore: () => holder.current!.geoserver }));
vi.mock("@helpers/toast", () => ({ useToast: () => ({ add: vi.fn() }) }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test.each(["story", "explore"])("clicking a building in %s shows identity and walking scores in the left panel", async (mode) => {
    setActivePinia(createPinia()); resetUrbanStoryProbes(); holder.current = createFakeCatalog();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    const map = Object.assign(fakeRegistryMap(), {
        queryRenderedFeatures: vi.fn(() => [] as unknown[]), setFeatureState: vi.fn(), removeFeatureState: vi.fn(),
        getCanvas: () => ({ style: { cursor: "" } }),
    });
    wireMapStore(map); const urban = useUrbanStoriesStore(); fakeSceneEngine(useGeostorySceneStore());
    urban.selectStory("building-walking");
    if (mode === "story") await urban.startStory("building-walking");
    else await urban.addEntry("building-walking", "buildings-comfort-safety");
    const wrapper = mount(WalkabilityBuildingPanel, { global: { stubs: { ExploreLayerEntry: true, EditorJsReadonly: true, GeoStorySceneProgress: true, UIcon: true } } });
    await flushPromises();
    const id = urban.addedByStory["building-walking"]!["buildings-comfort-safety"];
    const record = urban.recordOf(id)!;
    map.queryRenderedFeatures.mockReturnValue([{ source: record.source, sourceLayer: "hamburg_buildings", id: 13629, properties: { gml_id: "building-test-42", building_function_code: 1000, is_residential: true, building_height_m: 18.5, footprint_area_m2: 120, safety_index_400m: 63, comfort_mean_400m: 72, safety_covered_len_400m_m: 845 } }]);
    const clickHandlers = map.on.mock.calls.filter((call) => call[0] === "click");
    for (const call of clickHandlers) (call[1] as (event: unknown) => void)({ point: { x: 100, y: 100 } });
    await flushPromises();
    expect(wrapper.find("[data-testid='walk-building-profile']").exists()).toBe(true);
    expect(wrapper.get("[data-testid='walk-building-profile']").text()).toContain("63");
    expect(wrapper.get("[data-testid='walk-building-profile']").text()).toContain("72");
    expect(wrapper.get("[data-testid='building-identity']").text()).toContain("building-test-42");
    expect(wrapper.get("[data-testid='building-identity']").text()).toContain("1000");
    expect(wrapper.get("[data-testid='building-identity']").text()).toContain("18.5 m");
    expect(wrapper.get("[data-testid='building-identity']").text()).toContain("120 m²");
    expect(record.attributePopupSuppressed).toBe(true);
    expect(map.setFeatureState).toHaveBeenCalledWith(
        { source: record.source, sourceLayer: "hamburg_buildings", id: 13629 },
        { "walkability-selected": true }
    );
    map.queryRenderedFeatures.mockReturnValue([{ id: 13630, properties: { gml_id: "second-building", is_residential: false } }]);
    for (const call of map.on.mock.calls.filter((call) => call[0] === "click")) (call[1] as (event: unknown) => void)({ point: { x: 120, y: 100 } });
    await flushPromises();
    const identity = wrapper.get("[data-testid='building-identity']").text();
    expect(identity).toContain("second-building");
    expect(identity).toContain("Not available");
    expect(identity).toContain("Non-residential");
    expect(identity).not.toContain("building-test-42");
    expect(wrapper.get("[data-testid='walk-building-profile']").text()).not.toContain("63 / 100");
    urban.selectStory("walkability-safety");
    await flushPromises();
    expect(record.attributePopupSuppressed).not.toBe(true);
    wrapper.unmount();
});

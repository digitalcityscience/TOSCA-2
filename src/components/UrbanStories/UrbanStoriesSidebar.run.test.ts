import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent } from "vue";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { resetUrbanStoryProbes } from "@helpers/urbanStoryLayers";
import { useGeostorySceneStore } from "@store/geostoryScenes";
import { useMapStore } from "@store/map";
import { useUrbanStoriesStore } from "@store/urbanStories";
import { redirectUnknownUrbanStory, URBAN_STORIES_ROUTE_NAME } from "../../router/urbanStoriesRoute";
import { addExploreLayer, fakeCameraMap, fakeSceneEngine, publishStoryConfig, storyDetail } from "./__fixtures__/runHarness";
import UrbanStoriesSidebar from "./UrbanStoriesSidebar.vue";
import { useCatalogFixtureStory } from "../../config/urbanStories/__fixtures__/useCatalogFixtureStory";

useCatalogFixtureStory();

const backend = vi.hoisted(() => ({ fetchBackendJson: vi.fn() }));
vi.mock("@store/backend", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@store/backend")>()),
    fetchBackendJson: backend.fetchBackendJson,
}));
vi.mock("@store/geoserver", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@store/geoserver")>()),
    useGeoserverStore: () => ({ getStyleList: async () => [] }),
}));
vi.mock("@helpers/catalogLayerLoader", () => ({
    resolveCatalogLayer: vi.fn(async () => ({ ok: false, reason: "not-found" })),
    loadCatalogLayerStyling: vi.fn(async () => undefined),
    addCatalogVectorLayer: vi.fn(),
}));
vi.mock("@helpers/toast", () => ({ useToast: () => ({ add: vi.fn() }) }));
vi.mock("@components/Map/Layer/MapLayerListingItem.vue", () => ({ default: { render: () => null } }));

const SidebarStub = defineComponent({
    props: { id: { type: String, default: "" }, collapsed: { type: Boolean, default: true } },
    template: "<section :id='id'><slot /></section>",
});
const AccordionStub = defineComponent({
    props: { items: { type: Array, default: () => [] }, modelValue: { type: Array, default: () => [] } },
    template: `<div :data-open='modelValue.join(",")'><div v-for="item in items" :key="item.value" :data-section="item.value">
        <slot :name="item.slot + '-body'" :item="item" /></div></div>`,
});
const AlertStub = defineComponent({ template: "<div role='alert'><slot name='description' /></div>" });
const EditorStub = defineComponent({ template: "<div data-testid='editor' />" });
const stubs = {
    BaseSlideoverSidebarComponent: SidebarStub,
    UAccordion: AccordionStub, Accordion: AccordionStub,
    UAlert: AlertStub, Alert: AlertStub,
    UIcon: true, Icon: true, USwitch: true, EditorJsReadonly: EditorStub,
};

let restoreConfig: Array<() => void> = [];
let map: ReturnType<typeof fakeCameraMap>;

function createTestRouter(): Router {
    const empty = defineComponent({ template: "<div />" });
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: "/", name: "home", component: empty },
            { path: "/geostories", name: "geostories", component: empty },
            { path: "/urban-stories/:storyKey?", name: URBAN_STORIES_ROUTE_NAME, component: empty, meta: { sidebar: "urbanStories" } },
        ],
    });
    router.beforeEach((to) => redirectUnknownUrbanStory(to));
    return router;
}

async function mountAt(path: string): Promise<{ wrapper: VueWrapper; router: Router; engine: ReturnType<typeof fakeSceneEngine> }> {
    setActivePinia(createPinia());
    resetUrbanStoryProbes();
    map = fakeCameraMap();
    useMapStore().map = map as never;
    const engine = fakeSceneEngine(useGeostorySceneStore());
    const router = createTestRouter();
    await router.push(path);
    await router.isReady();
    const wrapper = mount(UrbanStoriesSidebar, { global: { plugins: [router], stubs } });
    await flushPromises();
    return { wrapper, router, engine };
}

/** Entry keys in display order, optionally only those in one section ("related" or "group:<g>"). */
const entryKeys = (wrapper: VueWrapper, section?: string): string[] => (
    wrapper.findAll(`[data-testid='explore-list'] li[data-entry-key]${section === undefined ? "" : `[data-explore-section='${section}']`}`)
        .map((item) => item.attributes("data-entry-key") ?? "")
);

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    restoreConfig = [publishStoryConfig("green-spaces", "story-1"), publishStoryConfig("transit-equity", "story-2")];
    backend.fetchBackendJson.mockImplementation(async () => storyDetail(4));
});

afterEach(() => {
    restoreConfig.forEach((restore) => restore());
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("UrbanStoriesSidebar: running a story", () => {
    test("lists the active chapter's entries first, keeps the rest, and restores normal order after the run", async () => {
        const { wrapper } = await mountAt("/urban-stories/green-spaces");
        const normal = entryKeys(wrapper);
        expect(normal).toHaveLength(9);
        expect(wrapper.find("[data-testid='related-entries']").exists()).toBe(false);

        await wrapper.get("[data-testid='run-start']").trigger("click");
        await flushPromises();
        const scene = useGeostorySceneStore();
        scene.targetSceneId = "scene-3";
        await flushPromises();

        expect(entryKeys(wrapper, "related")).toEqual(["stadtteile-green-access", "buildings-park-access", "park-pois"]);
        expect(wrapper.findAll("[data-testid='in-chapter']")).toHaveLength(3);
        expect(entryKeys(wrapper).sort()).toEqual([...normal].sort());
        expect(wrapper.get("[data-testid='related-entries']").text()).toContain("Related to this chapter: Is green space within reach?");

        scene.targetSceneId = "scene-2";
        await flushPromises();
        expect(entryKeys(wrapper, "related")).toEqual(["green-features-polygon", "green-features-line", "green-features-point", "green-areas"]);

        await wrapper.get("[data-testid='run-back']").trigger("click");
        await flushPromises();
        expect(wrapper.find("[data-testid='related-entries']").exists()).toBe(false);
        expect(entryKeys(wrapper)).toEqual(normal);
    });

    test("an entry moving between its group and the chapter's list keeps its component and its open settings panel", async () => {
        const { wrapper } = await mountAt("/urban-stories/green-spaces");
        const urban = useUrbanStoriesStore();
        const layer = addExploreLayer(map, "layer:parks");
        urban.addedByStory = { "green-spaces": { "park-pois": layer.id, "buildings-park-access": addExploreLayer(map, "layer:b").id } };
        await flushPromises();

        const entry = () => wrapper.get("li[data-entry-key='park-pois']");
        await entry().get("[data-testid='toggle-settings']").trigger("click");
        expect(entry().find("[data-testid='inline-settings']").exists()).toBe(true);
        const element = entry().element;
        (element as unknown as { marker: string }).marker = "same-instance";
        expect(entry().attributes("data-explore-section")).toBe("group:poi");
        const readinessLoads = vi.spyOn(urban, "loadReadiness");

        await wrapper.get("[data-testid='run-start']").trigger("click");
        await flushPromises();
        const scene = useGeostorySceneStore();
        scene.targetSceneId = "scene-3"; // "Parks within 15 minutes" lists park-pois as related
        await flushPromises();

        expect(entry().attributes("data-explore-section")).toBe("related");
        expect(entry().element).toBe(element);
        expect((entry().element as unknown as { marker: string }).marker).toBe("same-instance");
        expect(entry().find("[data-testid='inline-settings']").exists()).toBe(true);
        expect(readinessLoads.mock.calls.filter(([, loaded]) => loaded.key === "park-pois")).toEqual([]);

        scene.targetSceneId = "scene-1"; // a chapter without it: back into its group
        await flushPromises();
        expect(entry().attributes("data-explore-section")).toBe("group:poi");
        expect(entry().element).toBe(element);
        expect(entry().find("[data-testid='inline-settings']").exists()).toBe(true);
    });

    test("Back to Explore opens the Explore section", async () => {
        const { wrapper } = await mountAt("/urban-stories/green-spaces");
        await wrapper.get("[data-testid='run-start']").trigger("click");
        await flushPromises();

        await wrapper.get("[data-testid='run-back']").trigger("click");
        await flushPromises();

        expect(wrapper.get("[data-open]").attributes("data-open")).toContain("explore");
    });

    test("changing the story in the route ends the run and keeps added layers", async () => {
        const { wrapper, router, engine } = await mountAt("/urban-stories/green-spaces");
        const urban = useUrbanStoriesStore();
        const layer = addExploreLayer(map, "layer:a");
        urban.addedByStory = { "green-spaces": { "green-areas": layer.id } };
        await wrapper.get("[data-testid='run-start']").trigger("click");
        await flushPromises();
        expect(urban.runState).toBe("running");

        await router.push("/urban-stories/transit-equity");
        await flushPromises();

        expect(urban.runState).toBe("idle");
        expect(engine.closeStory).toHaveBeenCalledWith({ removeLayers: true });
        expect(urban.trackedLayers.map((tracked) => tracked.runtimeId)).toEqual(["layer:a"]);
        expect(wrapper.find("[data-testid='run-start']").exists()).toBe(true);
    });

    test("route-based selection: a deep link plus Start plays that story", async () => {
        const { engine } = await mountAt("/urban-stories/transit-equity");
        const urban = useUrbanStoriesStore();

        await urban.startStory("transit-equity");

        expect(String(backend.fetchBackendJson.mock.calls[0][0])).toContain("/story-2/");
        expect(engine.openStory).toHaveBeenCalledTimes(1);
    });

    test("leaving for another map feature closes the scene before the map is reset", async () => {
        const { wrapper, router, engine } = await mountAt("/urban-stories/green-spaces");
        const urban = useUrbanStoriesStore();
        urban.setFocusEnabled(true);
        const layer = addExploreLayer(map, "layer:a");
        urban.addedByStory = { "green-spaces": { "green-areas": layer.id } };
        await wrapper.get("[data-testid='run-start']").trigger("click");
        await flushPromises();
        expect(map.layers.get("layer:a")?.visibility).toBe("none");

        await router.push("/geostories");
        await flushPromises();

        expect(urban.runState).toBe("idle");
        expect(engine.closeStory).toHaveBeenCalledWith({ removeLayers: true });
        expect(map.layers.get("layer:a")?.visibility).toBe("visible");
    });

    test("unmounting the panel ends the run and repeated mount cycles add no state", async () => {
        const { wrapper, engine } = await mountAt("/urban-stories/green-spaces");
        const urban = useUrbanStoriesStore();
        await wrapper.get("[data-testid='run-start']").trigger("click");
        await flushPromises();

        wrapper.unmount();
        await flushPromises();

        expect(urban.runState).toBe("idle");
        expect(urban.runDetail).toBeUndefined();
        expect(engine.closeStory).toHaveBeenCalledWith({ removeLayers: true });

        const closes = engine.closeStory.mock.calls.length;
        await urban.endRun({ camera: "none" });
        expect(engine.closeStory.mock.calls.length).toBe(closes);
    });
});

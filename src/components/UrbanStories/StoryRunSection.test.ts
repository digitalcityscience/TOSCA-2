import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent } from "vue";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useGeostorySceneStore } from "@store/geostoryScenes";
import { useMapStore } from "@store/map";
import { useUrbanStoriesStore } from "@store/urbanStories";
import { getStoryConfig } from "../../config/urbanStories";
import { deferred, fakeCameraMap, fakeSceneEngine, publishStoryConfig, storyDetail } from "./__fixtures__/runHarness";
import StoryRunSection from "./StoryRunSection.vue";

const backend = vi.hoisted(() => ({ fetchBackendJson: vi.fn() }));
vi.mock("@store/backend", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@store/backend")>()),
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

const AlertStub = defineComponent({
    props: { title: { type: String, default: "" }, description: { type: String, default: "" } },
    template: "<div role='alert'><strong>{{ title }}</strong><p>{{ description }}</p></div>",
});
const EditorStub = defineComponent({
    props: { data: { type: Object, default: () => ({}) } },
    template: "<div data-testid='editor'>{{ (data.blocks || []).map((b) => b.data.text).join('|') }}</div>",
});
const stubs = { UAlert: AlertStub, Alert: AlertStub, UIcon: true, Icon: true, EditorJsReadonly: EditorStub, USwitch: true };

let restoreConfig: Array<() => void> = [];
let map: ReturnType<typeof fakeCameraMap>;

function mountSection(key: "green-spaces" | "fifteen-minute" = "green-spaces"): VueWrapper {
    return mount(StoryRunSection, { props: { story: getStoryConfig(key)! }, global: { stubs } });
}

function setup() {
    setActivePinia(createPinia());
    map = fakeCameraMap();
    useMapStore().map = map as never;
    const urban = useUrbanStoriesStore();
    const scene = useGeostorySceneStore();
    return { urban, scene, engine: fakeSceneEngine(scene) };
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    restoreConfig = [publishStoryConfig("green-spaces", "story-1")];
    backend.fetchBackendJson.mockImplementation(async () => storyDetail(4));
});

afterEach(() => {
    restoreConfig.forEach((restore) => restore());
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("StoryRunSection", () => {
    test("a story without a backend GeoStory offers Start and no not-published state", () => {
        setup();
        const wrapper = mountSection("fifteen-minute");

        expect(wrapper.find("[data-testid='run-not-configured']").exists()).toBe(false);
        expect(wrapper.find("[data-testid='run-start']").exists()).toBe(true);
    });

    test("Start on a story without a backend GeoStory plays its own chapters without the scene engine", async () => {
        const { engine } = setup();
        const wrapper = mountSection("fifteen-minute");

        await wrapper.get("[data-testid='run-start']").trigger("click");
        await flushPromises();

        const chapters = getStoryConfig("fifteen-minute")!.chapters;
        expect(engine.openStory).not.toHaveBeenCalled();
        expect(backend.fetchBackendJson).not.toHaveBeenCalled();
        expect(wrapper.get("[data-testid='chapter-title']").text()).toBe(chapters[0].title.en);
        expect(wrapper.get("[data-testid='run-position']").text()).toBe(`Chapter 1 of ${chapters.length}`);
        expect(wrapper.find("[data-testid='run-focus']").exists()).toBe(false);

        await wrapper.get("[data-testid='run-next']").trigger("click");
        await flushPromises();
        expect(wrapper.get("[data-testid='chapter-title']").text()).toBe(chapters[1].title.en);
    });

    test("Start calls openStory once and shows the first chapter's narrative and position", async () => {
        const { engine } = setup();
        const wrapper = mountSection();

        await wrapper.get("[data-testid='run-start']").trigger("click");
        await flushPromises();

        expect(engine.openStory).toHaveBeenCalledTimes(1);
        expect(wrapper.get("[data-testid='chapter-title']").text()).toBe("Hamburg's green-space inventory");
        expect(wrapper.get("[data-testid='editor']").text()).toBe("Narrative 1");
        expect(wrapper.get("[data-testid='run-position']").text()).toBe("Chapter 1 of 4");
        expect((wrapper.get("[data-testid='run-previous']").element as HTMLButtonElement).disabled).toBe(true);
    });

    test("shows a loading state while the story loads", async () => {
        setup();
        const pending = deferred<ReturnType<typeof storyDetail>>();
        backend.fetchBackendJson.mockReturnValueOnce(pending.promise);
        const wrapper = mountSection();

        await wrapper.get("[data-testid='run-start']").trigger("click");
        await flushPromises();
        expect(wrapper.find("[data-testid='run-loading']").exists()).toBe(true);

        pending.resolve(storyDetail(2));
        await flushPromises();
        expect(wrapper.find("[data-testid='run-loading']").exists()).toBe(false);
    });

    test("Next and Previous call showScene with the right ids", async () => {
        const { engine } = setup();
        const wrapper = mountSection();
        await wrapper.get("[data-testid='run-start']").trigger("click");
        await flushPromises();

        await wrapper.get("[data-testid='run-next']").trigger("click");
        await wrapper.get("[data-testid='run-next']").trigger("click");
        await wrapper.get("[data-testid='run-previous']").trigger("click");

        expect(engine.showScene.mock.calls.map((call) => call[0])).toEqual(["scene-2", "scene-3", "scene-2"]);
        expect(wrapper.get("[data-testid='chapter-title']").text()).toBe("Where green areas are");
    });

    test("the progress list jumps to a chapter", async () => {
        const { engine } = setup();
        const wrapper = mountSection();
        await wrapper.get("[data-testid='run-start']").trigger("click");
        await flushPromises();

        await wrapper.findAll("nav ol button")[2].trigger("click");

        expect(engine.showScene).toHaveBeenCalledWith("scene-3");
    });

    test("Next is disabled on the last chapter", async () => {
        const { scene } = setup();
        const wrapper = mountSection();
        await wrapper.get("[data-testid='run-start']").trigger("click");
        await flushPromises();

        scene.targetSceneId = "scene-4";
        await flushPromises();

        expect((wrapper.get("[data-testid='run-next']").element as HTMLButtonElement).disabled).toBe(true);
    });

    test("Return to overview closes the story with layer removal and flies to the overview camera", async () => {
        const { engine } = setup();
        const wrapper = mountSection();
        await wrapper.get("[data-testid='run-start']").trigger("click");
        await flushPromises();

        await wrapper.get("[data-testid='run-overview']").trigger("click");
        await flushPromises();

        expect(engine.closeStory).toHaveBeenCalledWith({ removeLayers: true });
        expect(map.flyTo).toHaveBeenCalledWith(expect.objectContaining({ center: getStoryConfig("green-spaces")!.overviewCamera.center }));
        expect(wrapper.find("[data-testid='run-start']").exists()).toBe(true);
    });

    test("Back to Explore ends the run, restores the previous camera and asks to show Explore", async () => {
        setup();
        const wrapper = mountSection();
        await wrapper.get("[data-testid='run-start']").trigger("click");
        await flushPromises();

        await wrapper.get("[data-testid='run-back']").trigger("click");
        await flushPromises();

        expect(map.flyTo).toHaveBeenCalledWith(expect.objectContaining({ center: [9.99, 53.55], zoom: 11 }));
        expect(wrapper.emitted("show-explore")).toHaveLength(1);
        expect(useUrbanStoriesStore().runState).toBe("idle");
    });

    test.each([
        ["a 404", new Error("GeoStory request failed (404 Not Found): "), "Story not published"],
        ["a server error", new Error("GeoStory request failed (500 Server Error): "), "Story not available right now"],
    ])("%s shows an accurate unavailable state with retry, and no story content", async (_label, error, title) => {
        const { engine } = setup();
        backend.fetchBackendJson.mockRejectedValueOnce(error);
        const wrapper = mountSection();

        await wrapper.get("[data-testid='run-start']").trigger("click");
        await flushPromises();

        expect(wrapper.get("[data-testid='run-issue']").text()).toContain(title);
        expect(wrapper.find("[data-testid='story-chapter']").exists()).toBe(false);
        expect(engine.openStory).not.toHaveBeenCalled();

        await wrapper.get("[data-testid='run-retry']").trigger("click");
        await flushPromises();
        expect(wrapper.find("[data-testid='story-chapter']").exists()).toBe(true);
    });

    test("an empty story and an unpublished draft have their own states", async () => {
        setup();
        const wrapper = mountSection();
        backend.fetchBackendJson.mockResolvedValueOnce(storyDetail(0));
        await wrapper.get("[data-testid='run-start']").trigger("click");
        await flushPromises();
        expect(wrapper.get("[data-testid='run-issue']").attributes("data-issue")).toBe("empty");

        backend.fetchBackendJson.mockResolvedValueOnce(storyDetail(2, { status: "draft" }));
        await wrapper.get("[data-testid='run-retry']").trigger("click");
        await flushPromises();
        expect(wrapper.get("[data-testid='run-issue']").attributes("data-issue")).toBe("unpublished");
    });

    test("a chapter without text falls back to the scene caption", async () => {
        const { scene } = setup();
        const detail = storyDetail(4);
        detail.content.blocks = detail.content.blocks.filter((block) => block.type === "mapScene");
        backend.fetchBackendJson.mockResolvedValueOnce(detail);
        const wrapper = mountSection();

        await wrapper.get("[data-testid='run-start']").trigger("click");
        await flushPromises();
        scene.targetSceneId = "scene-1";

        expect(wrapper.get("[data-testid='chapter-no-narrative']").text()).toBe("Caption 1");
    });

    test("shows a related-layers hint for the active chapter that opens Explore", async () => {
        const { scene } = setup();
        const wrapper = mountSection();
        await wrapper.get("[data-testid='run-start']").trigger("click");
        await flushPromises();
        scene.targetSceneId = "scene-3";
        await flushPromises();

        expect(wrapper.get("[data-testid='run-related-hint']").text()).toContain("3 related datasets in Explore Data");
        await wrapper.get("[data-testid='run-show-related']").trigger("click");
        expect(wrapper.emitted("show-explore")).toHaveLength(1);
    });

    test("a layer warning is shown without blocking navigation", async () => {
        const { urban, engine } = setup();
        const wrapper = mountSection();
        await wrapper.get("[data-testid='run-start']").trigger("click");
        await flushPromises();

        urban.runLayerWarnings = ["WS:lyr"];
        await flushPromises();

        expect(wrapper.get("[data-testid='run-layer-warning']").text()).toContain("WS:lyr");
        await wrapper.get("[data-testid='run-next']").trigger("click");
        expect(engine.showScene).toHaveBeenCalled();
    });
});

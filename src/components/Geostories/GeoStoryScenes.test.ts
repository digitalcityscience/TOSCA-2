import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent } from "vue";
import { beforeEach, describe, expect, test } from "vitest";
import GeoStorySceneCaption from "./GeoStorySceneCaption.vue";
import GeoStorySceneProgress from "./GeoStorySceneProgress.vue";
import type { GeoStoryDetail } from "@store/geostory";
import { useGeostorySceneStore } from "@store/geostoryScenes";
import scenesDetailFixture from "@store/__fixtures__/geostory-scenes-detail.json";

const ButtonStub = defineComponent({
    props: { label: { type: String, default: "" } },
    emits: ["click"],
    template: "<button type='button' @click=\"$emit('click')\">{{ label }}</button>",
});
const global = { stubs: { UButton: ButtonStub } };

function story(): GeoStoryDetail {
    const detail = structuredClone(scenesDetailFixture) as unknown as GeoStoryDetail;
    // Add a third scene so the progress list has something in the middle.
    detail.scenes.push({ ...detail.scenes[1], id: "scene-3", order: 2, title: "Riverside", caption: "" });
    return detail;
}

function openOn(sceneIndex: number, { target }: { target?: number } = {}): GeoStoryDetail {
    const detail = story();
    const scenes = useGeostorySceneStore();
    scenes.story = detail;
    scenes.activeSceneId = detail.scenes[sceneIndex].id;
    scenes.targetSceneId = detail.scenes[target ?? sceneIndex].id;
    return detail;
}

beforeEach(() => {
    setActivePinia(createPinia());
});

describe("GeoStorySceneProgress", () => {
    test("lists the scenes and marks the current one", () => {
        openOn(1);

        const wrapper = mount(GeoStorySceneProgress, { global });

        expect(wrapper.get("nav").attributes("aria-label")).toBe("Map scenes");
        expect(wrapper.text()).toContain("Scene 2 of 3");
        expect(wrapper.text()).toContain("· Harbour detail");
        const buttons = wrapper.findAll("button");
        expect(buttons.map((button) => button.text())).toEqual([
            "1. Overview", "2. Harbour detail", "3. Riverside",
        ]);
        expect(buttons.map((button) => button.attributes("aria-current"))).toEqual([
            undefined, "step", undefined,
        ]);
    });

    test("follows the requested scene before the map finishes switching", () => {
        openOn(0, { target: 2 });

        const wrapper = mount(GeoStorySceneProgress, { global });

        expect(wrapper.text()).toContain("Scene 3 of 3");
        expect(wrapper.findAll("button")[2].attributes("aria-current")).toBe("step");
    });

    test("emits the picked scene", async () => {
        const detail = openOn(0);
        const wrapper = mount(GeoStorySceneProgress, { global });

        await wrapper.findAll("button")[2].trigger("click");

        expect(wrapper.emitted("select")).toEqual([[detail.scenes[2].id]]);
    });

    test("is hidden for single-scene stories", () => {
        const scenes = useGeostorySceneStore();
        const detail = story();
        detail.scenes = detail.scenes.slice(0, 1);
        scenes.story = detail;

        const wrapper = mount(GeoStorySceneProgress, { global });

        expect(wrapper.find("nav").exists()).toBe(false);
    });
});

describe("GeoStorySceneCaption", () => {
    function withCaption(detail: GeoStoryDetail): void {
        detail.scenes[1].caption = "  Containers stack along the Elbe.\nNew berths open in 2027.  ";
    }

    test("shows the active scene's caption in a live region", () => {
        const detail = openOn(1);
        withCaption(detail);
        useGeostorySceneStore().story = { ...detail };

        const wrapper = mount(GeoStorySceneCaption, { global });

        expect(wrapper.get(".geostory-scene-caption-region").attributes("aria-live")).toBe("polite");
        expect(wrapper.text()).toContain("Harbour detail");
        expect(wrapper.text()).toContain("Containers stack along the Elbe.\nNew berths open in 2027.");
    });

    test("renders nothing for scenes without a caption", () => {
        openOn(0);

        const wrapper = mount(GeoStorySceneCaption, { global });

        expect(wrapper.find(".geostory-scene-caption").exists()).toBe(false);
        expect(wrapper.find(".geostory-scene-caption-region").exists()).toBe(true);
    });

    test("hides a caption for its scene only", async () => {
        const detail = openOn(1);
        withCaption(detail);
        detail.scenes[2].caption = "Riverside promenade";
        const scenes = useGeostorySceneStore();
        scenes.story = { ...detail };
        const wrapper = mount(GeoStorySceneCaption, { global });

        await wrapper.get("button").trigger("click");
        expect(wrapper.find(".geostory-scene-caption").exists()).toBe(false);

        scenes.activeSceneId = detail.scenes[2].id;
        await wrapper.vm.$nextTick();
        expect(wrapper.text()).toContain("Riverside promenade");
    });
});

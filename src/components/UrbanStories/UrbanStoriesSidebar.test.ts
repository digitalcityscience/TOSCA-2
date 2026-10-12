import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent } from "vue";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { resetUrbanStoryProbes } from "@helpers/urbanStoryLayers";
import { useUrbanStoriesStore } from "@store/urbanStories";
import { redirectUnknownUrbanStory, URBAN_STORIES_ROUTE_NAME } from "../../router/urbanStoriesRoute";
import UrbanStoriesSidebar from "./UrbanStoriesSidebar.vue";

// The Explore section probes the catalog; these tests must not touch the network.
// Provider style list lookups must not hit the network in tests.
vi.mock("@store/geoserver", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@store/geoserver")>()),
    useGeoserverStore: () => ({ getStyleList: async () => [] }),
}));
vi.mock("@helpers/catalogLayerLoader", () => ({
    resolveCatalogLayer: vi.fn(async () => ({ ok: false, reason: "not-found" })),
    loadCatalogLayerStyling: vi.fn(async () => undefined),
    addCatalogVectorLayer: vi.fn(),
}));
vi.mock("@components/Map/Layer/MapLayerListingItem.vue", () => ({ default: { render: () => null } }));

const SidebarStub = defineComponent({
    props: { id: { type: String, default: "" }, collapsed: { type: Boolean, default: true } },
    template: "<section :id='id' :data-collapsed='collapsed'><header><slot name='header' /></header><slot /></section>",
});
const AccordionStub = defineComponent({
    props: { items: { type: Array, default: () => [] } },
    template: `<div><div v-for="item in items" :key="item.value" :data-section="item.value">
        <h3>{{ item.label }}</h3><slot :name="item.slot + '-body'" :item="item" /></div></div>`,
});
const AlertStub = defineComponent({
    props: { title: { type: String, default: "" }, description: { type: String, default: "" } },
    template: "<div role='alert'><strong>{{ title }}</strong><p>{{ description }}</p><slot name='description' /></div>",
});
const BadgeStub = defineComponent({
    props: { label: { type: String, default: "" } },
    template: "<span class='badge'>{{ label }}</span>",
});
// Nuxt UI components are auto-imported under their own names (Accordion, Alert, ...).
const stubs = {
    BaseSlideoverSidebarComponent: SidebarStub,
    Accordion: AccordionStub,
    UAccordion: AccordionStub,
    Alert: AlertStub,
    UAlert: AlertStub,
    Badge: BadgeStub,
    UBadge: BadgeStub,
    Icon: true,
    UIcon: true,
};

function createTestRouter(): Router {
    const empty = defineComponent({ template: "<div />" });
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: "/", name: "home", component: empty },
            {
                path: "/urban-stories/:storyKey?",
                name: URBAN_STORIES_ROUTE_NAME,
                component: empty,
                meta: { sidebar: "urbanStories" },
            },
        ],
    });
    router.beforeEach((to) => redirectUnknownUrbanStory(to));
    return router;
}

async function mountAt(path: string): Promise<{ wrapper: VueWrapper; router: Router }> {
    const router = createTestRouter();
    await router.push(path);
    await router.isReady();
    const wrapper = mount(UrbanStoriesSidebar, { global: { plugins: [router], stubs } });
    await flushPromises();
    return { wrapper, router };
}

function storyCards(wrapper: VueWrapper) {
    return wrapper.findAll("button[data-story-key]");
}

beforeEach(() => {
    setActivePinia(createPinia());
    resetUrbanStoryProbes();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("UrbanStoriesSidebar", () => {
    test("renders the stories from config with nothing selected", async () => {
        const { wrapper } = await mountAt("/urban-stories");

        expect(storyCards(wrapper).map((card) => card.attributes("data-story-key"))).toEqual([
            "fifteen-minute", "walkability-safety", "building-walking", "transit-equity", "green-spaces", "hamburg-riders",
        ]);
        expect(storyCards(wrapper).map((card) => card.text())).toEqual([
            "15-Minute City", "Street comfort & safety", "Walking around your building", "Public Transport Equity", "Green Spaces", "HamburgRiders",
        ]);
        expect(wrapper.find("[data-testid='urban-stories-empty']").exists()).toBe(true);
        expect(wrapper.find("[data-testid='urban-story-intro']").exists()).toBe(false);
        expect(wrapper.get("section#urbanStories").attributes("data-collapsed")).toBe("false");
    });

    test("preselects the story from a deep link and shows its intro, caveats and sections", async () => {
        const { wrapper } = await mountAt("/urban-stories/green-spaces");

        expect(useUrbanStoriesStore().activeStoryKey).toBe("green-spaces");
        expect(wrapper.get("button[data-story-key='green-spaces']").attributes("aria-pressed")).toBe("true");
        const intro = wrapper.get("[data-testid='urban-story-intro']");
        expect(intro.text()).toContain("Green on the Map. Accessible in Real Life?");
        expect(intro.text()).toContain("Read before you explore");
        expect(intro.text()).toContain("Union of official polygons; never summed.");

        const run = wrapper.get("[data-testid='urban-story-run']");
        expect(run.text()).not.toContain("not published");
        expect(run.find("[data-testid='run-start']").exists()).toBe(true);

        const explore = wrapper.get("[data-testid='urban-story-explore']");
        expect(explore.text()).toContain("7 datasets");
        expect(explore.findAll("li[data-entry-key]")).toHaveLength(7);
        const features = explore.get("li[data-entry-key='green-features-polygon']");
        expect(features.text()).toContain("Visible from zoom 14");
        // The mocked catalog reports every layer as not published, so no entry can be added.
        expect(features.text()).toContain("Temporarily unavailable");
        expect(wrapper.findAll("[data-section]").map((section) => section.attributes("data-section"))).toEqual(["run", "explore"]);
    });

    test("selecting a story updates the URL", async () => {
        const { wrapper, router } = await mountAt("/urban-stories");

        await wrapper.get("button[data-story-key='transit-equity']").trigger("click");
        await flushPromises();

        expect(router.currentRoute.value.fullPath).toBe("/urban-stories/transit-equity");
        expect(useUrbanStoriesStore().activeStoryKey).toBe("transit-equity");
        expect(wrapper.get("[data-testid='urban-story-intro']").text()).toContain("Public Transport Equity");
    });

    test("follows browser history between stories", async () => {
        const { wrapper, router } = await mountAt("/urban-stories/fifteen-minute");
        await router.push("/urban-stories/walkability-safety");
        await flushPromises();
        expect(useUrbanStoriesStore().activeStoryKey).toBe("walkability-safety");

        router.back();
        await flushPromises();
        await new Promise((resolve) => setTimeout(resolve, 0));
        await flushPromises();

        expect(router.currentRoute.value.fullPath).toBe("/urban-stories/fifteen-minute");
        expect(useUrbanStoriesStore().activeStoryKey).toBe("fifteen-minute");
        expect(wrapper.get("[data-testid='urban-story-intro']").text()).toContain("15-Minute City");
    });

    test("redirects an unknown story key to the panel with no selection", async () => {
        const { wrapper, router } = await mountAt("/urban-stories/not-a-story");

        expect(router.currentRoute.value.fullPath).toBe("/urban-stories");
        expect(useUrbanStoriesStore().activeStoryKey).toBeUndefined();
        expect(wrapper.find("[data-testid='urban-stories-empty']").exists()).toBe(true);
    });

    test("shows German story texts and falls back to English for Turkish", async () => {
        const { wrapper } = await mountAt("/urban-stories/green-spaces");
        const i18n = (wrapper.vm as unknown as { $i18n: { locale: string } }).$i18n;

        i18n.locale = "de";
        await flushPromises();
        expect(wrapper.get("[data-testid='urban-story-intro']").text()).toContain("Grün auf der Karte. Auch im echten Leben erreichbar?");
        expect(wrapper.get("button[data-story-key='green-spaces']").text()).toBe("Grünräume");

        i18n.locale = "tr";
        await flushPromises();
        expect(wrapper.get("[data-testid='urban-story-intro']").text()).toContain("Green on the Map. Accessible in Real Life?");

        i18n.locale = "en";
    });
});

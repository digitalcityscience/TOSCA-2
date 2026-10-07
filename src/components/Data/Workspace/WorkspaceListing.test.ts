import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent } from "vue";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useExternalDataSourcesStore } from "@store/externalDataSources";
import WorkspaceListing from "./WorkspaceListing.vue";

vi.mock("vue-router", () => ({ useRoute: () => ({ meta: {} }) }));

const AccordionStub = defineComponent({
    props: { items: { type: Array, required: true } },
    template: "<div><span v-for='item in items' :key='item.value' class='accordion-label'>{{ item.label }}</span></div>",
});
const SidebarStub = defineComponent({ template: "<main><slot name='header' /><slot /></main>" });

describe("WorkspaceListing external services", () => {
    let pinia: ReturnType<typeof createPinia>;

    beforeEach(() => {
        pinia = createPinia();
        setActivePinia(pinia);
    });

    test("shows only services that permit uncurated browsing", () => {
        const externalSources = useExternalDataSourcesStore();
        externalSources.sources = [
            {
                id: "public-ogc",
                type: "ogc-api",
                title: "Public OGC",
                url: "https://ogc.example.test",
                attribution: "Example",
                capabilities: {
                    show_uncurated: true,
                    full_load: true,
                    live_updates: false,
                    server_filters: true,
                    max_features: null,
                },
            },
            {
                id: "curated-sta",
                type: "sensorthings",
                title: "Curated SensorThings",
                url: "https://sta.example.test",
                attribution: "Example",
                capabilities: {
                    show_uncurated: false,
                    full_load: false,
                    live_updates: false,
                    server_filters: false,
                    max_features: null,
                },
            },
        ];
        vi.spyOn(externalSources, "loadExternalServices").mockResolvedValue(externalSources.sources);
        vi.spyOn(externalSources, "loadExternalCategories").mockResolvedValue([]);

        const wrapper = mount(WorkspaceListing, {
            props: { workspaces: [] },
            global: {
                plugins: [pinia],
                stubs: {
                    BaseSlideoverSidebarComponent: SidebarStub,
                    UAccordion: AccordionStub,
                    UAlert: true,
                    Workspace3DDataListingItem: true,
                    WorkspaceListingItem: true,
                    ExternalCategoryListing: true,
                    OgcApiSourceListing: true,
                    SensorThingsSourceListing: true,
                },
            },
        });

        expect(wrapper.text()).toContain("All datasets · Public OGC");
        expect(wrapper.text()).not.toContain("Curated SensorThings");
    });
});

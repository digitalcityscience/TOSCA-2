import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent } from "vue";
import { beforeEach, describe, expect, test } from "vitest";
import ExternalCategoryItem from "./ExternalCategoryItem.vue";

const CardStub = defineComponent({
    inheritAttrs: false,
    template: "<section v-bind='$attrs'><slot name='header' /><slot /><slot name='footer' /></section>",
});
const BadgeStub = defineComponent({
    props: { label: String },
    template: "<span>{{ label }}</span>",
});
const ButtonStub = defineComponent({
    props: { label: String, disabled: Boolean, size: String, variant: String, icon: String },
    template: "<button :disabled='disabled'>{{ label }}</button>",
});

const source = {
    id: "hamburg-ogc",
    type: "ogc-api" as const,
    title: "Hamburg OGC API",
    url: "https://api.example.test",
    attribution: "Urban Data Platform Hamburg",
    capabilities: {
        show_uncurated: false,
        full_load: true,
        live_updates: false,
        server_filters: true,
        max_features: null,
    },
};

const item = {
    id: "item-1",
    title: "StadtRAD stations",
    description: "Bike stations across Hamburg",
    service: "hamburg-ogc",
    service_type: "ogc_api_features" as const,
    ogc: {
        dataset_id: "stadtrad",
        dataset_title: "Urban mobility",
        collection_id: "stadtrad_stationen",
    },
    style: { color: "#0288d1" },
    loading: { min_zoom: null },
    defaults: { properties: [], filter: [] },
    availability: { state: "OK" as const, feature_count: 358, checked_at: null },
};

describe("ExternalCategoryItem", () => {
    let pinia: ReturnType<typeof createPinia>;

    beforeEach(() => {
        pinia = createPinia();
        setActivePinia(pinia);
    });

    function globalOptions() {
        return {
            plugins: [pinia],
            stubs: {
                UCard: CardStub,
                Card: CardStub,
                UBadge: BadgeStub,
                Badge: BadgeStub,
                UButton: ButtonStub,
                Button: ButtonStub,
            },
        };
    }

    test("renders service metadata and feature count", () => {
        const wrapper = mount(ExternalCategoryItem, { props: { item, source }, global: globalOptions() });

        expect(wrapper.text()).toContain("StadtRAD stations");
        expect(wrapper.text()).toContain("Urban mobility");
        expect(wrapper.text()).toContain("OGC API");
        expect(wrapper.text()).toContain("358 features");
        expect(wrapper.text()).toContain("Urban Data Platform Hamburg");
        const addButton = wrapper.findComponent(ButtonStub);
        expect(addButton.attributes("disabled")).toBeUndefined();
        expect(addButton.props()).toMatchObject({ size: "sm", variant: undefined, icon: undefined });
    });

    test("greys out missing items and explains their state", () => {
        const wrapper = mount(ExternalCategoryItem, {
            props: {
                item: {
                    ...item,
                    availability: { ...item.availability, state: "MISSING" as const },
                },
                source,
            },
            global: globalOptions(),
        });

        expect(wrapper.classes()).toContain("opacity-60");
        expect(wrapper.text()).toContain("currently unavailable");
        expect(wrapper.get("button").attributes()).toHaveProperty("disabled");
    });

    test("enables curated SensorThings items", () => {
        const wrapper = mount(ExternalCategoryItem, {
            props: {
                item: {
                    ...item,
                    service_type: "sensorthings" as const,
                    ogc: undefined,
                    sensorthings: {
                        service_name: "HH_STA_E-Ladestationen",
                        layer_name: "Status_E-Ladepunkt",
                    },
                },
                source: { ...source, type: "sensorthings" as const },
            },
            global: globalOptions(),
        });

        expect(wrapper.text()).toContain("SensorThings");
        expect(wrapper.get("button").attributes("disabled")).toBeUndefined();
    });

    test("renders multiline descriptions as plain text with an expandable clamp", async () => {
        const description = `<strong>Plain text</strong>\n${"A long OGC description. ".repeat(12)}`;
        const wrapper = mount(ExternalCategoryItem, {
            props: { item: { ...item, description }, source },
            global: globalOptions(),
        });

        expect(wrapper.text()).toContain("<strong>Plain text</strong>");
        expect(wrapper.find("strong").exists()).toBe(false);
        expect(wrapper.get(".external-card-description").classes()).toContain("line-clamp-3");
        expect(wrapper.text()).toContain("More");

        const moreButton = wrapper.findAll("button").find((button) => button.text() === "More");
        expect(moreButton).toBeDefined();
        await moreButton!.trigger("click");
        expect(wrapper.get(".external-card-description").classes()).not.toContain("line-clamp-3");
        expect(wrapper.text()).toContain("Less");
    });
});

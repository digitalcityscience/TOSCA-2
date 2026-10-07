import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { describe, expect, test } from "vitest";
import ExternalCategoryItem from "./ExternalCategoryItem.vue";

const CardStub = defineComponent({
    inheritAttrs: false,
    template: "<section v-bind='$attrs'><slot /></section>",
});
const BadgeStub = defineComponent({
    props: { label: String },
    template: "<span>{{ label }}</span>",
});
const ButtonStub = defineComponent({
    props: { label: String, disabled: Boolean },
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
    ogc: { dataset_id: "stadtrad", collection_ids: ["stadtrad_stationen"] },
    style: { color: "#0288d1" },
    loading: { min_zoom: null },
    defaults: { properties: [], filter: [] },
    availability: { state: "OK" as const, feature_count: 358, checked_at: null },
};

const global = {
    stubs: {
        UCard: CardStub,
        UBadge: BadgeStub,
        UButton: ButtonStub,
    },
};

describe("ExternalCategoryItem", () => {
    test("renders service metadata and feature count", () => {
        const wrapper = mount(ExternalCategoryItem, { props: { item, source }, global });

        expect(wrapper.text()).toContain("StadtRAD stations");
        expect(wrapper.text()).toContain("OGC API");
        expect(wrapper.text()).toContain("358 features");
        expect(wrapper.text()).toContain("Urban Data Platform Hamburg");
        expect(wrapper.get("button").attributes()).toHaveProperty("disabled");
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
            global,
        });

        expect(wrapper.classes()).toContain("opacity-60");
        expect(wrapper.text()).toContain("currently unavailable");
    });
});

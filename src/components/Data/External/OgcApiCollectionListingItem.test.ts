import { mount } from "@vue/test-utils";
import { defineComponent, reactive } from "vue";
import { beforeEach, describe, expect, test, vi } from "vitest";
import OgcApiCollectionListingItem from "./OgcApiCollectionListingItem.vue";

const fakes = vi.hoisted(() => ({
    addCollectionLayer: vi.fn(),
    map: undefined as unknown,
}));
vi.mock("@store/map", () => ({ useMapStore: () => fakes.map }));
vi.mock("@store/ogcLayers", () => ({
    useOgcLayersStore: () => ({ addCollectionLayer: fakes.addCollectionLayer }),
}));

const CardStub = defineComponent({
    template: "<section><slot name='header' /><slot /><slot name='footer' /></section>",
});
const BadgeStub = defineComponent({
    props: { label: String },
    template: "<span>{{ label }}</span>",
});
const ButtonStub = defineComponent({
    props: {
        label: String,
        size: String,
        variant: String,
        icon: String,
        disabled: Boolean,
    },
    template: "<button :disabled='disabled'>{{ label }}</button>",
});

const source = {
    id: "hamburg-ogc",
    type: "ogc-api" as const,
    title: "Hamburg OGC API",
    url: "https://ogc.example.test",
    attribution: "Hamburg",
    capabilities: {
        show_uncurated: true,
        full_load: true,
        live_updates: false,
        server_filters: true,
        max_features: null,
    },
};
const dataset = {
    id: "mobility",
    title: "Urban mobility",
    description: "",
    landingPageUrl: "https://ogc.example.test/mobility",
};
const collection = {
    id: "stations",
    title: "Bike stations",
    description: "Station locations",
    itemType: "feature",
    itemCount: 358,
    itemsUrl: "https://ogc.example.test/mobility/collections/stations/items",
};

describe("OgcApiCollectionListingItem", () => {
    beforeEach(() => {
        fakes.addCollectionLayer.mockReset();
        fakes.map = {
            layersOnMap: reactive([]),
            requestLayerPanelExpansion: vi.fn(),
        };
    });

    test("shows the source type on the layer card and uses the GeoServer action style", () => {
        const wrapper = mount(OgcApiCollectionListingItem, {
            props: { source, dataset, collection },
            global: {
                stubs: {
                    UBadge: BadgeStub,
                    UButton: ButtonStub,
                    UCard: CardStub,
                    Badge: BadgeStub,
                    Button: ButtonStub,
                    Card: CardStub,
                },
            },
        });

        expect(wrapper.text()).toContain("Bike stations");
        expect(wrapper.text()).toContain("OGC API");
        expect(wrapper.text()).toContain("358 features");
        const addButton = wrapper.findComponent(ButtonStub);
        expect(addButton.props()).toMatchObject({
            label: "Add to map",
            size: "sm",
            variant: undefined,
            icon: undefined,
        });
    });
});

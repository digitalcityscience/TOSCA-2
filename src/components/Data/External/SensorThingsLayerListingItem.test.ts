import { mount } from "@vue/test-utils";
import { defineComponent, reactive } from "vue";
import { beforeEach, describe, expect, test, vi } from "vitest";
import SensorThingsLayerListingItem from "./SensorThingsLayerListingItem.vue";

const fakes = vi.hoisted(() => ({
    addServiceLayer: vi.fn(),
    map: undefined as unknown,
}));
vi.mock("@store/map", () => ({ useMapStore: () => fakes.map }));
vi.mock("@store/sensorThingsLayers", () => ({
    useSensorThingsLayersStore: () => ({ addServiceLayer: fakes.addServiceLayer }),
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
    id: "hamburg-sta",
    type: "sensorthings" as const,
    title: "Hamburg SensorThings",
    url: "https://iot.example.test/v1.1",
    attribution: "Hamburg",
    capabilities: {
        show_uncurated: true,
        full_load: false,
        live_updates: false,
        server_filters: false,
        max_features: null,
    },
};

describe("SensorThingsLayerListingItem", () => {
    beforeEach(() => {
        fakes.addServiceLayer.mockReset();
        fakes.map = {
            layersOnMap: reactive([]),
            requestLayerPanelExpansion: vi.fn(),
        };
    });

    test("shows the source type on the layer card and uses the GeoServer action style", () => {
        const wrapper = mount(SensorThingsLayerListingItem, {
            props: {
                source,
                layer: { serviceName: "Traffic", layerName: "Volume", datastreamCount: 42 },
            },
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

        expect(wrapper.text()).toContain("Volume");
        expect(wrapper.text()).toContain("SensorThings");
        expect(wrapper.text()).toContain("42 datastreams");
        const addButton = wrapper.findComponent(ButtonStub);
        expect(addButton.props()).toMatchObject({
            label: "Add to map",
            size: "sm",
            variant: undefined,
            icon: undefined,
        });
    });
});

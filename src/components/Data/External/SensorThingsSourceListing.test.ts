import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { beforeEach, describe, expect, test, vi } from "vitest";
import SensorThingsSourceListing from "./SensorThingsSourceListing.vue";

const fakes = vi.hoisted(() => ({ getLayerCatalog: vi.fn() }));
vi.mock("@store/externalDataSources", () => ({
    useExternalDataSourcesStore: () => ({
        getSensorThingsLayerCatalog: fakes.getLayerCatalog,
    }),
}));

const InputStub = defineComponent({
    props: { modelValue: String, placeholder: String },
    emits: ["update:modelValue"],
    template: "<input :value='modelValue' :placeholder='placeholder' @input='$emit(\"update:modelValue\", $event.target.value)' />",
});
const BadgeStub = defineComponent({
    props: { label: String },
    template: "<span>{{ label }}</span>",
});
const LayerStub = defineComponent({
    props: { layer: { type: Object, required: true } },
    template: "<article class='sta-layer'>{{ layer.layerName }}</article>",
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

describe("SensorThingsSourceListing", () => {
    beforeEach(() => {
        fakes.getLayerCatalog.mockReset();
        fakes.getLayerCatalog.mockResolvedValue([
            { serviceName: "Mobility", layerName: "Bikes", datastreamCount: 12 },
            { serviceName: "Traffic", layerName: "Speed", datastreamCount: 8 },
            { serviceName: "Traffic", layerName: "Volume", datastreamCount: 6 },
        ]);
    });

    test("groups cached layers by service and filters across service and layer names", async () => {
        const wrapper = mount(SensorThingsSourceListing, {
            props: { source },
            global: {
                stubs: {
                    UAlert: true,
                    UBadge: BadgeStub,
                    UIcon: true,
                    UInput: InputStub,
                    USkeleton: true,
                    SensorThingsLayerListingItem: LayerStub,
                },
            },
        });
        await flushPromises();

        expect(fakes.getLayerCatalog).toHaveBeenCalledWith(source);
        expect(wrapper.text()).toContain("Mobility");
        expect(wrapper.text()).toContain("Traffic");
        expect(wrapper.findAll(".sta-layer")).toHaveLength(1);
        expect(wrapper.text()).toContain("Bikes");

        await wrapper.get("input").setValue("volume");
        await flushPromises();

        expect(wrapper.text()).not.toContain("Mobility");
        expect(wrapper.text()).toContain("Traffic");
        expect(wrapper.findAll(".sta-layer")).toHaveLength(1);
        expect(wrapper.text()).toContain("Volume");
    });
});

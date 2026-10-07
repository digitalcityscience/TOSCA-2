import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent } from "vue";
import { beforeEach, describe, expect, test } from "vitest";
import { useOgcLayersStore } from "@store/ogcLayers";
import OgcLayerQueryControls from "./OgcLayerQueryControls.vue";

const LabelStub = defineComponent({
    props: { label: String, description: String },
    template: "<span>{{ label }}{{ description }}</span>",
});

describe("OgcLayerQueryControls capabilities", () => {
    let pinia: ReturnType<typeof createPinia>;

    beforeEach(() => {
        pinia = createPinia();
        setActivePinia(pinia);
    });

    test("keeps status visible while hiding disabled full-load and filter controls", () => {
        const store = useOgcLayersStore();
        store.layers.restricted = {
            layerId: "restricted",
            collection: { id: "c", title: "C", description: "" },
            queryables: [{ name: "name", title: "Name", type: "string", isGeometry: false }],
            conditions: [],
            mode: "viewport",
            totalMatched: 500,
            viewMatched: 50,
            loadedCount: 25,
            loading: false,
            capabilities: {
                show_uncurated: false,
                full_load: false,
                live_updates: false,
                server_filters: false,
                max_features: 100,
            },
        };

        const wrapper = mount(OgcLayerQueryControls, {
            props: { layerId: "restricted" },
            global: {
                plugins: [pinia],
                stubs: {
                    UIcon: true,
                    UProgress: true,
                    UButton: LabelStub,
                    UAlert: LabelStub,
                    UModal: true,
                    USelectMenu: true,
                    USelect: true,
                    UInput: true,
                },
            },
        });

        expect(wrapper.text()).toContain("Loading by map view");
        expect(wrapper.text()).not.toContain("Load all");
        expect(wrapper.text()).not.toContain("Attributes");
        expect(wrapper.text()).not.toContain("Filter (all conditions must match)");
    });
});

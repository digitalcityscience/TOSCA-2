import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, h } from "vue";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useMapStore, type LayerObjectWithAttributes } from "@store/map";
import MapLayerListingItem from "./MapLayerListingItem.vue";

vi.mock("@helpers/toast", () => ({ useToast: () => ({ add: vi.fn() }) }));
// The item lazy-loads its filter, table, legend and time panels. The sync behaviour does not need
// them, and importing them would race the test environment teardown.
vi.mock("vue", async (importOriginal) => ({
    ...(await importOriginal<typeof import("vue")>()),
    defineAsyncComponent: () => ({ render: () => null }),
}));

const SwitchStub = defineComponent({
    props: { modelValue: { type: Boolean, default: false } },
    emits: ["update:modelValue"],
    setup: (props, { emit }) => () => h("input", {
        type: "checkbox",
        class: "visibility",
        checked: props.modelValue,
        onChange: (event: Event) => emit("update:modelValue", (event.target as HTMLInputElement).checked),
    }),
});
const SliderStub = defineComponent({
    props: { modelValue: { type: Number, default: 1 } },
    emits: ["update:modelValue"],
    setup: (props, { emit }) => () => h("input", {
        type: "range",
        class: "opacity",
        value: props.modelValue,
        onInput: (event: Event) => emit("update:modelValue", Number((event.target as HTMLInputElement).value)),
    }),
});

const layer: LayerObjectWithAttributes = {
    id: "layer:roads:1",
    source: "layer:roads:1",
    sourceType: "geoserver",
    type: "fill",
    showOnLayerList: true,
    displayName: "roads",
    activeStyleId: "a",
    availableStyles: [
        { id: "a", name: "a", layers: [{ id: "a1", type: "fill" }] },
        { id: "b", name: "b", layers: [{ id: "b1", type: "fill", paint: { "fill-opacity": 0.3 } }] },
    ],
};

function fakeMap() {
    const layout: Record<string, string> = {};
    const paint: Record<string, number> = { "fill-opacity": 1 };
    return {
        getLayer: () => ({ type: "fill" }),
        getLayoutProperty: (_id: string) => layout.visibility,
        setLayoutProperty: (_id: string, _property: string, value: string) => { layout.visibility = value; },
        getPaintProperty: (_id: string, property: string) => paint[property],
        setPaintProperty: (_id: string, property: string, value: number) => { paint[property] = value; },
        getStyle: () => ({ layers: [] }),
        removeLayer: vi.fn(),
        addLayer: vi.fn(),
    };
}

function mountItem() {
    return mount(MapLayerListingItem, {
        props: { layer, syncWithStore: true },
        global: {
            stubs: {
                USwitch: SwitchStub, Switch: SwitchStub,
                USlider: SliderStub, Slider: SliderStub,
                // Nuxt UI components are auto-imported under their bare names as well.
                ...Object.fromEntries(
                    ["Button", "Icon", "Select", "Modal", "Badge", "Tooltip", "Collapsible", "Input", "Alert", "Skeleton", "Popover", "ColorPicker"]
                        .flatMap((name) => [[name, true], [`U${name}`, true]])
                ),
            },
        },
    });
}

describe("MapLayerListingItem shared state (UST-09)", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        const mapStore = useMapStore();
        mapStore.map = fakeMap();
        mapStore.add2MapLayerList({ ...layer }, undefined, { notify: false });
    });

    test("two instances for one layer stay in sync for visibility and opacity", async () => {
        const mapStore = useMapStore();
        const first = mountItem();
        const second = mountItem();
        await flushPromises();

        await first.find("input.visibility").setValue(false);
        expect((second.find("input.visibility").element as HTMLInputElement).checked).toBe(false);
        expect(mapStore.map.getLayoutProperty("x", "visibility")).toBe("none");

        await second.find("input.opacity").setValue(0.4);
        expect(Number((first.find("input.opacity").element as HTMLInputElement).value)).toBe(0.4);
        expect(mapStore.map.getPaintProperty("x", "fill-opacity")).toBe(0.4);
    });

    test("a change made outside the component (store action) reaches every instance", async () => {
        const mapStore = useMapStore();
        const first = mountItem();
        const second = mountItem();
        await flushPromises();
        const record = mapStore.layersOnMap[0];
        mapStore.setLogicalLayerVisibility(record, false);
        mapStore.setLogicalLayerOpacity(record, 0.6);
        await flushPromises();
        for (const wrapper of [first, second]) {
            expect((wrapper.find("input.visibility").element as HTMLInputElement).checked).toBe(false);
            expect(Number((wrapper.find("input.opacity").element as HTMLInputElement).value)).toBe(0.6);
        }
    });

    test("a style swap updates the opacity shown in all instances", async () => {
        const mapStore = useMapStore();
        const first = mountItem();
        const second = mountItem();
        await flushPromises();
        mapStore.map.addLayer = vi.fn((specification: Record<string, any>) => {
            mapStore.map.setPaintProperty("x", "fill-opacity", specification.paint?.["fill-opacity"] ?? 1);
        });
        await mapStore.setStandaloneLayerStyle(layer.id, "b");
        await flushPromises();
        for (const wrapper of [first, second]) {
            expect(Number((wrapper.find("input.opacity").element as HTMLInputElement).value)).toBe(0.3);
        }
    });
});

import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, h } from "vue";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { resetUrbanStoryProbes } from "@helpers/urbanStoryLayers";
import { useMapStore, type LayerObjectWithAttributes } from "@store/map";
import { useUrbanStoriesStore } from "@store/urbanStories";
import { getStoryConfig } from "../../config/urbanStories";
import ExploreLayerEntry from "./ExploreLayerEntry.vue";

const loader = vi.hoisted(() => ({
    resolveCatalogLayer: vi.fn(),
    loadCatalogLayerStyling: vi.fn(),
    addCatalogVectorLayer: vi.fn(),
}));
vi.mock("@helpers/catalogLayerLoader", () => loader);
// Provider style list lookups must not hit the network in tests.
vi.mock("@store/geoserver", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@store/geoserver")>()),
    useGeoserverStore: () => ({ getStyleList: async () => [] }),
}));
vi.mock("@helpers/toast", () => ({ useToast: () => ({ add: vi.fn() }) }));
vi.mock("@components/Map/Layer/MapLayerListingItem.vue", () => ({
    default: {
        props: ["layer"],
        render(this: { layer: { id: string } }) { return h("div", { "data-testid": "inline-item" }, this.layer.id); },
    },
}));

const ButtonStub = defineComponent({
    props: { disabled: Boolean, loading: Boolean },
    setup: (props, { slots, attrs }) => () => h("button", { ...attrs, disabled: props.disabled || props.loading }, slots.default?.()),
});
const BadgeStub = defineComponent({
    props: { label: { type: String, default: "" }, title: { type: String, default: undefined } },
    setup: (props, { attrs }) => () => h("span", { ...attrs, title: props.title }, props.label),
});
const SelectStub = defineComponent({
    props: { modelValue: { type: String, default: undefined }, items: { type: Array, default: () => [] }, disabled: Boolean },
    emits: ["update:modelValue"],
    setup: (props, { emit, attrs }) => () => h("select", {
        ...attrs,
        disabled: props.disabled,
        value: props.modelValue,
        onChange: (event: Event) => emit("update:modelValue", (event.target as HTMLSelectElement).value),
    }, (props.items as Array<{ label: string; value: string; disabled?: boolean }>).map((item) => h("option", { value: item.value, disabled: item.disabled }, item.label))),
});
const AlertStub = defineComponent({
    props: { description: { type: String, default: "" } },
    setup: (props, { attrs }) => () => h("div", { ...attrs, role: "alert" }, props.description),
});
const stubs = {
    UButton: ButtonStub, Button: ButtonStub,
    UBadge: BadgeStub, Badge: BadgeStub,
    USelect: SelectStub, Select: SelectStub,
    UAlert: AlertStub, Alert: AlertStub,
    UIcon: true, Icon: true,
};

const ADMIN_ATTRIBUTES = ["m15_decay_mean", "m15_decay_median", "m15_categories_mean", "m15_n", "m15_share_low_confidence",
    "m15_share_food", "m15_share_health", "m15_share_education", "m15_share_restaurant", "m15_share_culture",
    "m15_share_bank_post", "m15_share_sport", "m15_share_park", "m15_share_stop_any",
    // These tests use the catalog-styled Green Spaces entries (15-Minute City is frontend-styled).
    ...getStoryConfig("green-spaces")!.explore.flatMap((entry) => entry.requiredAttributes)];

function catalogLayer(attributes: string[]) {
    return {
        ok: true,
        info: { name: "layer", type: "VECTOR", defaultStyle: { name: "generic", href: "/g" }, resource: { href: "/r" } },
        detail: { featureType: { name: "layer", attributes: { attribute: attributes.map((name) => ({ name, binding: "x" })) } } },
    };
}

function mountEntry(storyKey: "green-spaces" | "walkability-safety", entryKey: string) {
    const entry = getStoryConfig(storyKey)!.explore.find((candidate) => candidate.key === entryKey)!;
    return mount(ExploreLayerEntry, { props: { storyKey, entry }, global: { stubs } });
}

beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    resetUrbanStoryProbes();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    useMapStore().map = { on: vi.fn(), off: vi.fn(), getLayer: () => ({ type: "fill" }), getLayoutProperty: () => undefined, getPaintProperty: () => undefined, removeLayer: vi.fn(), removeSource: vi.fn(), getSource: () => undefined } as never;
    loader.resolveCatalogLayer.mockResolvedValue(catalogLayer(ADMIN_ATTRIBUTES));
    loader.loadCatalogLayerStyling.mockResolvedValue(undefined);
    loader.addCatalogVectorLayer.mockImplementation(async () => {
        useMapStore().add2MapLayerList({ id: "layer:x:1", source: "layer:x:1", sourceType: "geoserver", type: "fill", showOnLayerList: true } as LayerObjectWithAttributes, undefined, { notify: false });
        return { runtimeId: "layer:x:1", minZoomWarning: false };
    });
});

describe("ExploreLayerEntry", () => {
    test("idle: shows Add as layer, no settings", async () => {
        const wrapper = mountEntry("green-spaces", "stadtteile-green-access");
        await flushPromises();
        expect(wrapper.attributes("data-state")).toBe("idle");
        expect(wrapper.get("[data-testid='add-layer']").text()).toBe("Add as layer");
        expect(wrapper.find("[data-testid='inline-settings']").exists()).toBe(false);
        expect(wrapper.get("[data-testid='entry-status']").text()).toBe("Default style");
    });

    test("adding: the button is disabled and reads Adding… while the loader runs", async () => {
        let finish: () => void = () => undefined;
        loader.addCatalogVectorLayer.mockImplementationOnce(async () => {
            await new Promise<void>((resolve) => { finish = resolve; });
            useMapStore().add2MapLayerList({ id: "layer:x:1", source: "layer:x:1", sourceType: "geoserver", type: "fill", showOnLayerList: true } as LayerObjectWithAttributes, undefined, { notify: false });
            return { runtimeId: "layer:x:1", minZoomWarning: false };
        });
        const wrapper = mountEntry("green-spaces", "stadtteile-green-access");
        await flushPromises();
        void wrapper.get("[data-testid='add-layer']").trigger("click");
        await vi.waitFor(() => expect(wrapper.attributes("data-state")).toBe("adding"));
        expect(wrapper.get("[data-testid='add-layer']").text()).toBe("Adding…");
        expect(wrapper.get("[data-testid='add-layer']").attributes("disabled")).toBeDefined();
        finish();
        await flushPromises();
        expect(wrapper.attributes("data-state")).toBe("added");
    });

    test("added: shows settings (inline item), hide/show and remove; remove reverts to Add as layer", async () => {
        const wrapper = mountEntry("green-spaces", "stadtteile-green-access");
        await flushPromises();
        await wrapper.get("[data-testid='add-layer']").trigger("click");
        await flushPromises();
        expect(wrapper.attributes("data-state")).toBe("added");
        expect(wrapper.get("[data-testid='inline-item']").text()).toBe("layer:x:1");
        await wrapper.get("[data-testid='toggle-settings']").trigger("click");
        expect(wrapper.find("[data-testid='inline-settings']").exists()).toBe(false);
        expect(wrapper.get("[data-testid='toggle-settings']").text()).toBe("Show settings");
        await wrapper.get("[data-testid='remove-layer']").trigger("click");
        await flushPromises();
        expect(wrapper.attributes("data-state")).toBe("idle");
        expect(wrapper.find("[data-testid='add-layer']").exists()).toBe(true);
    });

    test("an entry whose layer another story already added shows Show settings, not Add", async () => {
        const store = useUrbanStoriesStore();
        await store.addEntry("green-spaces", "stadtteile-green-access");
        const wrapper = mountEntry("green-spaces", "stadtteile-green-access");
        await flushPromises();
        expect(wrapper.find("[data-testid='add-layer']").exists()).toBe(false);
        expect(wrapper.get("[data-testid='toggle-settings']").text()).toBe("Show settings");
    });

    test("unavailable: a catalog 404 disables the button with the reason and shows no error alert", async () => {
        loader.resolveCatalogLayer.mockResolvedValue({ ok: false, reason: "not-found" });
        const wrapper = mountEntry("green-spaces", "buildings-park-access");
        await flushPromises();
        expect(wrapper.attributes("data-state")).toBe("unavailable");
        expect(wrapper.get("[data-testid='add-layer']").text()).toBe("Temporarily unavailable");
        expect(wrapper.get("[data-testid='add-layer']").attributes("disabled")).toBeDefined();
        expect(wrapper.get("[data-testid='entry-status']").text()).toBe("Temporarily unavailable");
        expect(wrapper.find("[data-testid='entry-message']").exists()).toBe(false);
    });

    test("heavy layers show their zoom floor", async () => {
        loader.resolveCatalogLayer.mockResolvedValue(catalogLayer(["geom"]));
        const wrapper = mountEntry("walkability-safety", "street-segments");
        await flushPromises();
        expect(wrapper.get("[data-testid='zoom-hint']").text()).toBe("Visible from zoom 9");
    });

    test("attributes-missing lists the missing columns", async () => {
        loader.resolveCatalogLayer.mockResolvedValue(catalogLayer(["fid", "geom", "name"]));
        const wrapper = mountEntry("green-spaces", "stadtteile-green-access");
        await flushPromises();
        expect(wrapper.get("[data-testid='entry-status']").text()).toBe("Data incomplete");
        expect(wrapper.get("[data-testid='missing-attributes']").text()).toContain("grn_mean");
    });

    test("metrics without a verified style are listed but disabled, with the reason", async () => {
        const wrapper = mountEntry("green-spaces", "units-green-access");
        await flushPromises();
        const options = wrapper.findAll("[data-testid='metric-select'] option");
        expect(options.length).toBeGreaterThan(1);
        expect(options.every((option) => option.attributes("disabled") !== undefined)).toBe(true);
        expect(options[0].text()).toContain("style pending");
        expect(wrapper.get("[data-testid='metric-reason']").text()).toBe("No style has been assigned to this metric yet.");
    });

    test("an add error shows an inline message and allows another try", async () => {
        loader.addCatalogVectorLayer.mockRejectedValueOnce(new Error("boom"));
        const wrapper = mountEntry("green-spaces", "stadtteile-green-access");
        await flushPromises();
        await wrapper.get("[data-testid='add-layer']").trigger("click");
        await flushPromises();
        expect(wrapper.get("[data-testid='entry-message']").text()).toContain("could not be added");
        expect(wrapper.get("[data-testid='add-layer']").attributes("disabled")).toBeUndefined();
    });

    test("caveats are collapsed behind a details element and not repeated", async () => {
        const wrapper = mountEntry("green-spaces", "stadtteile-green-access");
        await flushPromises();
        const items = wrapper.findAll("[data-testid='entry-caveats'] li").map((item) => item.text());
        expect(new Set(items).size).toBe(items.length);
        expect(items.length).toBeGreaterThan(0);
    });
});

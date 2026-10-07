import { createPinia, setActivePinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { beforeEach, describe, expect, test, vi } from "vitest";
import ExternalCategoryListing from "./ExternalCategoryListing.vue";

const AlertStub = defineComponent({
    props: { description: String },
    template: "<div class='alert'>{{ description }}<slot name='actions' /></div>",
});
const ButtonStub = defineComponent({
    props: { label: String },
    emits: ["click"],
    template: "<button @click='$emit(\"click\")'>{{ label }}</button>",
});
const BadgeStub = defineComponent({
    props: { label: String },
    template: "<span>{{ label }}</span>",
});
const InputStub = defineComponent({
    props: { modelValue: String, placeholder: String },
    emits: ["update:modelValue"],
    template: "<input :value='modelValue' :placeholder='placeholder' @input='$emit(\"update:modelValue\", $event.target.value)' />",
});
const ItemStub = defineComponent({
    props: { item: { type: Object, required: true } },
    template: "<article class='category-item'>{{ item.title }}</article>",
});

const category = {
    slug: "shared-mobility",
    title: "Shared mobility",
    description: "Bikes and charging",
    display_order: 3,
    item_count: 2,
};

function response(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status });
}

function mountListing() {
    const pinia = createPinia();
    setActivePinia(pinia);
    return mount(ExternalCategoryListing, {
        props: { category },
        global: {
            plugins: [pinia],
            stubs: {
                UAlert: AlertStub,
                UButton: ButtonStub,
                UBadge: BadgeStub,
                UInput: InputStub,
                USkeleton: true,
                ExternalCategoryItem: ItemStub,
            },
        },
    });
}

describe("ExternalCategoryListing", () => {
    beforeEach(() => {
        vi.stubEnv("VITE_BACKEND_ROOT_URL", "http://localhost:8000");
        vi.stubGlobal("fetch", vi.fn());
    });

    test("renders the empty state returned by a category detail", async () => {
        vi.mocked(fetch).mockResolvedValueOnce(response({
            slug: category.slug,
            title: category.title,
            description: category.description,
            items: [],
        }));

        const wrapper = mountListing();
        await flushPromises();

        expect(wrapper.text()).toContain("Bikes and charging");
        expect(wrapper.text()).toContain("0 datasets");
        expect(wrapper.text()).toContain("This category has no datasets.");
    });

    test("renders a retryable error state", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        vi.mocked(fetch)
            .mockResolvedValueOnce(new Response("", { status: 503 }))
            .mockResolvedValueOnce(response({
                slug: category.slug,
                title: category.title,
                description: "",
                items: [],
            }));

        const wrapper = mountListing();
        await flushPromises();
        expect(wrapper.text()).toContain("external catalog service");

        await wrapper.get("button").trigger("click");
        await flushPromises();
        expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
        expect(wrapper.text()).toContain("This category has no datasets.");
    });

    test("groups large categories and renders cards in batches", async () => {
        const items = Array.from({ length: 30 }, (_, index) => ({
            id: `item-${index}`,
            title: `Layer ${index}`,
            description: index === 29 ? "Only searchable description" : "",
            service: "hamburg-ogc",
            service_type: "ogc_api_features",
            ogc: {
                dataset_id: index < 25 ? "a" : "b",
                dataset_title: index < 25 ? "Dataset A" : "Dataset B",
                collection_id: `collection-${index}`,
            },
            style: { color: "#0288d1" },
            loading: { min_zoom: null },
            defaults: { properties: [], filter: [] },
            availability: { state: "OK", feature_count: 1, checked_at: null },
        }));
        vi.mocked(fetch).mockResolvedValueOnce(response({
            slug: category.slug,
            title: category.title,
            description: category.description,
            items,
        }));

        const wrapper = mountListing();
        await flushPromises();

        expect(wrapper.get("input").attributes("placeholder")).toBe("Filter by name");
        expect(wrapper.text()).toContain("Dataset A (25)");
        expect(wrapper.text()).toContain("Dataset B (5)");
        expect(wrapper.findAll(".category-item")).toHaveLength(20);
        expect(wrapper.text()).toContain("Show more (5 remaining)");

        await wrapper.get("input").setValue("searchable");
        await flushPromises();
        expect(wrapper.text()).toContain("Dataset B (1)");
        expect(wrapper.findAll(".category-item")).toHaveLength(1);
        expect(wrapper.text()).toContain("Layer 29");
    });
});

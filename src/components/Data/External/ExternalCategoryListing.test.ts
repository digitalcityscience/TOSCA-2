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
                USkeleton: true,
                ExternalCategoryItem: true,
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
});

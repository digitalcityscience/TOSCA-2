import { shallowMount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import MapSideFrame from "./MapSideFrame.vue";

vi.mock("vue-i18n", () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock("vue-router", () => ({
    useRoute: () => ({ name: "map" }),
    useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@helpers/slideoverSidebarRegistry", () => ({
    toggleSlideoverSidebar: vi.fn(),
}));

describe("MapSideFrame", () => {
    test("renders tooltips above open slideovers", () => {
        const wrapper = shallowMount(MapSideFrame, {
            props: { side: "left" },
            global: {
                stubs: {
                    UButton: true,
                },
            },
        });

        const tooltips = wrapper.findAllComponents({ name: "Tooltip" });

        expect(tooltips).toHaveLength(4);
        for (const tooltip of tooltips) {
            expect(tooltip.props("ui")).toEqual({ content: "z-[70]" });
        }
    });
});

describe("MapSideFrame Urban Stories item", () => {
    afterEach(() => {
        vi.doUnmock("../../config/features");
        vi.resetModules();
    });

    async function leftItemLabels(enabled: string[]): Promise<string[]> {
        vi.resetModules();
        vi.doMock("../../config/features", () => ({
            isFeatureEnabled: (id: string) => enabled.includes(id),
        }));
        const { default: Frame } = await import("./MapSideFrame.vue");
        const wrapper = shallowMount(Frame, {
            props: { side: "left" },
            global: { stubs: { UButton: true } },
        });
        return wrapper.findAllComponents({ name: "Tooltip" }).map((tooltip) => tooltip.props("text") as string);
    }

    test("is hidden by default, without VITE_ENABLED_FEATURES", () => {
        const wrapper = shallowMount(MapSideFrame, {
            props: { side: "left" },
            global: { stubs: { UButton: true } },
        });
        const labels = wrapper.findAllComponents({ name: "Tooltip" }).map((tooltip) => tooltip.props("text") as string);

        expect(labels).not.toContain("map.sideFrame.urbanStories");
    });

    test("is shown when the urbanStories feature is enabled", async () => {
        expect(await leftItemLabels(["datastores", "events", "geostories", "urbanStories"])).toEqual([
            "map.sideFrame.datastores",
            "map.sideFrame.events",
            "map.sideFrame.geostories",
            "map.sideFrame.urbanStories",
        ]);
    });

    test("is hidden when the urbanStories feature is not enabled", async () => {
        expect(await leftItemLabels(["datastores", "events", "geostories"])).not.toContain("map.sideFrame.urbanStories");
    });
});

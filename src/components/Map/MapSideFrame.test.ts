import { shallowMount } from "@vue/test-utils";
import { describe, expect, test, vi } from "vitest";
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

        expect(tooltips).toHaveLength(3);
        for (const tooltip of tooltips) {
            expect(tooltip.props("ui")).toEqual({ content: "z-[70]" });
        }
    });
});

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import RichDescription from "./RichDescription.vue";

describe("RichDescription", () => {
    it("renders bold and italic markup in a collapsed preview", () => {
        const wrapper = mount(RichDescription, {
            props: {
                content: {
                    blocks: [{
                        type: "paragraph",
                        data: { text: "<strong>Bold</strong> and <em>italic</em>" },
                    }],
                },
                fallback: "Bold and italic",
                clampLines: 2,
            },
        });

        expect(wrapper.get("strong").text()).toBe("Bold");
        expect(wrapper.get("em").text()).toBe("italic");
        expect(wrapper.get("[data-testid='rich-description']").classes())
            .toContain("rich-description-clamped");
    });

    it("uses the plain fallback only when rich blocks are unavailable", () => {
        const wrapper = mount(RichDescription, {
            props: { fallback: "Plain fallback", clampLines: 3 },
        });

        expect(wrapper.text()).toBe("Plain fallback");
        expect(wrapper.find("strong").exists()).toBe(false);
        expect(wrapper.get("p").classes()).toContain("rich-description-clamped");
    });
});

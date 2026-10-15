import { mount, RouterLinkStub } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { PublishedFooterDocumentLink } from "@store/footer";
import FooterDocumentLinks from "./FooterDocumentLinks.vue";

const documents: PublishedFooterDocumentLink[] = ["Privacy", "Imprint", "Terms", "Accessibility"].map(
    (title, index) => ({
        id: `document-${index}`,
        title,
        slug: title.toLowerCase(),
        path: `/${title.toLowerCase()}`,
        display_order: index,
    })
);

const global = {
    stubs: {
        RouterLink: RouterLinkStub,
        UIcon: true,
    },
};

function stubMatchMedia(matches: boolean): void {
    vi.stubGlobal("matchMedia", vi.fn(() => ({
        matches,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    })));
}

// jsdom has no layout: each measured link is 100px, the More button 60px,
// and the row 250px wide, so one link fits beside the More button.
function stubLayout(): void {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
        const width = this.hasAttribute("data-measure-more") ? 60 : 100;
        return { width, height: 16 } as DOMRect;
    });
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(250);
}

function inlineTitles(wrapper: ReturnType<typeof mount>): string[] {
    return wrapper.findAll(".footer-documents-row a").map((link) => link.text());
}

describe("FooterDocumentLinks", () => {
    beforeEach(() => {
        stubMatchMedia(true);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        document.body.innerHTML = "";
    });

    test("shows every link inline when they all fit", () => {
        const wrapper = mount(FooterDocumentLinks, { props: { documents }, global });

        expect(inlineTitles(wrapper)).toEqual(["Privacy", "Imprint", "Terms", "Accessibility"]);
        expect(wrapper.find("button.footer-more-button").exists()).toBe(false);
    });

    test("moves trailing links, in order, into the More disclosure", async () => {
        stubLayout();
        const wrapper = mount(FooterDocumentLinks, {
            props: { documents },
            global,
            attachTo: document.body,
        });
        await wrapper.vm.$nextTick();

        expect(inlineTitles(wrapper)).toEqual(["Privacy"]);
        const button = wrapper.get("button.footer-more-button");
        const panel = wrapper.get(".footer-more-panel");
        expect(button.attributes("aria-expanded")).toBe("false");
        expect(button.attributes("aria-controls")).toBe(panel.attributes("id"));
        expect(panel.isVisible()).toBe(false);

        await button.trigger("click");
        expect(button.attributes("aria-expanded")).toBe("true");
        expect(panel.isVisible()).toBe(true);
        expect(panel.findAll("a").map((link) => link.text())).toEqual(["Imprint", "Terms", "Accessibility"]);
    });

    test("closes the disclosure on Escape and returns focus to the button", async () => {
        stubLayout();
        const wrapper = mount(FooterDocumentLinks, {
            props: { documents },
            global,
            attachTo: document.body,
        });
        await wrapper.vm.$nextTick();
        const button = wrapper.get("button.footer-more-button");
        await button.trigger("click");

        await wrapper.get(".footer-more-panel a").trigger("keydown", { key: "Escape" });

        expect(button.attributes("aria-expanded")).toBe("false");
        expect(document.activeElement).toBe(button.element);
    });

    test("closes the disclosure on an outside pointer press but not an inside one", async () => {
        stubLayout();
        const wrapper = mount(FooterDocumentLinks, {
            props: { documents },
            global,
            attachTo: document.body,
        });
        await wrapper.vm.$nextTick();
        const button = wrapper.get("button.footer-more-button");
        await button.trigger("click");

        wrapper.get(".footer-more-panel").element.dispatchEvent(new Event("pointerdown", { bubbles: true }));
        await wrapper.vm.$nextTick();
        expect(button.attributes("aria-expanded")).toBe("true");

        document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
        await wrapper.vm.$nextTick();
        expect(button.attributes("aria-expanded")).toBe("false");
    });

    test("emits open and closes the disclosure when an overflow link is chosen", async () => {
        stubLayout();
        const wrapper = mount(FooterDocumentLinks, {
            props: { documents },
            global,
            attachTo: document.body,
        });
        await wrapper.vm.$nextTick();
        const button = wrapper.get("button.footer-more-button");
        await button.trigger("click");

        await wrapper.findAll(".footer-more-panel a")[1]!.trigger("click");

        expect(wrapper.emitted("open")).toEqual([[documents[2]]]);
        expect(button.attributes("aria-expanded")).toBe("false");
    });

    test("lists every link without a menu on mobile", async () => {
        stubMatchMedia(false);
        stubLayout();
        const wrapper = mount(FooterDocumentLinks, { props: { documents }, global });
        await wrapper.vm.$nextTick();

        expect(wrapper.findAll(".footer-documents-list a").map((link) => link.text())).toEqual(
            ["Privacy", "Imprint", "Terms", "Accessibility"]
        );
        expect(wrapper.find("button.footer-more-button").exists()).toBe(false);
    });
});

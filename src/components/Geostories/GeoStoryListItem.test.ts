import { mount } from "@vue/test-utils";
import { describe, expect, test, vi } from "vitest";
import GeoStoryListItem from "./GeoStoryListItem.vue";
import { type GeoStoryListItem as StoryListItem } from "@store/geostory";

vi.stubEnv("VITE_BACKEND_ROOT_URL", "http://localhost:8000");

const story: StoryListItem = {
    id: "story-1",
    title: "Waterfront adaptation",
    summary: "A short story summary.",
    hero_image_url: "/media/geostories/story-1/hero.jpg",
    hero_image_alt: "Waterfront",
    campaign: "campaign-1",
    created_at: "2026-05-01T00:00:00Z",
};

const global = {
    stubs: {
        RouterLink: {
            template: "<a><slot /></a>",
        },
        Button: {
            props: ["label"],
            template: "<button>{{ label }}</button>",
        },
        Card: {
            template: `
                <article>
                    <slot name="header" />
                    <slot name="title" />
                    <slot name="subtitle" />
                    <slot name="content" />
                    <slot name="footer" />
                </article>
            `,
        },
        Image: {
            props: ["src", "alt"],
            template: "<img :src=\"src\" :alt=\"alt\" />",
        },
        Tag: {
            props: ["value"],
            template: "<span>{{ value }}</span>",
        },
    },
};

describe("GeoStoryListItem", () => {
    test("renders story card with hero image and summary", () => {
        const wrapper = mount(GeoStoryListItem, {
            global,
            props: { story },
        });

        expect(wrapper.find("img").attributes("src")).toBe(
            "http://localhost:8000/media/geostories/story-1/hero.jpg"
        );
        expect(wrapper.find("img").attributes("alt")).toBe("Waterfront");
        expect(wrapper.text()).toContain("Waterfront adaptation");
        expect(wrapper.text()).toContain("A short story summary.");
        expect(wrapper.text()).toContain("Open Story");
    });

    test("renders placeholder when hero image is missing", () => {
        const wrapper = mount(GeoStoryListItem, {
            global,
            props: {
                story: {
                    ...story,
                    hero_image_url: null,
                },
            },
        });

        expect(wrapper.find("img").exists()).toBe(false);
        expect(wrapper.find(".story-card-placeholder").exists()).toBe(true);
    });
});

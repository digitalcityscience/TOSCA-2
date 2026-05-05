import { mount } from "@vue/test-utils";
import { describe, expect, test, vi } from "vitest";
import EditorJsRenderer from "./EditorJsRenderer.vue";

vi.stubEnv("VITE_BACKEND_ROOT_URL", "http://localhost:8000");

const global = {
    stubs: {
        Divider: {
            template: "<hr data-testid=\"editor-delimiter\" />",
        },
        Image: {
            props: ["src", "alt"],
            template: "<img :src=\"src\" :alt=\"alt\" />",
        },
    },
};

describe("EditorJsRenderer", () => {
    test("renders supported Editor.js blocks", () => {
        const wrapper = mount(EditorJsRenderer, {
            global,
            props: {
                blocks: [
                    { type: "paragraph", data: { text: "Hello <strong>world</strong>" } },
                    { type: "header", data: { text: "Heading", level: 3 } },
                    { type: "list", data: { style: "ordered", items: ["One", "Two"] } },
                    { type: "quote", data: { text: "Quote", caption: "Source" } },
                    { type: "delimiter", data: {} },
                    { type: "code", data: { code: "const value = 1;" } },
                    {
                        type: "image",
                        data: {
                            file: { url: "/media/story/image.webp" },
                            alt: "Inline image",
                            caption: "Image caption",
                        },
                    },
                    { type: "unsupported", data: { text: "Hidden" } },
                ],
            },
        });

        expect(wrapper.find("[data-testid='editor-paragraph']").html()).toContain("<strong>world</strong>");
        expect(wrapper.find("[data-testid='editor-header']").element.tagName).toBe("H3");
        expect(wrapper.findAll("[data-testid='editor-list'] li")).toHaveLength(2);
        expect(wrapper.find("[data-testid='editor-quote']").text()).toContain("Source");
        expect(wrapper.find("[data-testid='editor-delimiter']").exists()).toBe(true);
        expect(wrapper.find("[data-testid='editor-code']").text()).toContain("const value = 1;");
        expect(wrapper.find("[data-testid='editor-image'] img").attributes("src")).toBe(
            "http://localhost:8000/media/story/image.webp"
        );
        expect(wrapper.text()).not.toContain("Hidden");
    });

    test("renders Editor.js list v2 item objects by content", () => {
        const wrapper = mount(EditorJsRenderer, {
            global,
            props: {
                blocks: [
                    {
                        type: "list",
                        data: {
                            style: "ordered",
                            items: [
                                {
                                    content: "The image is verified and valid.",
                                    items: [],
                                },
                                {
                                    content: "The image is processed as JPEG.",
                                    items: [
                                        {
                                            content: "Nested confirmation.",
                                            items: [],
                                        },
                                    ],
                                },
                            ],
                        },
                    },
                ],
            },
        });

        expect(wrapper.text()).toContain("The image is verified and valid.");
        expect(wrapper.text()).toContain("The image is processed as JPEG.");
        expect(wrapper.text()).toContain("Nested confirmation.");
        expect(wrapper.text()).not.toContain("[object Object]");
    });
});

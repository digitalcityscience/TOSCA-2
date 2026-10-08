import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, test, vi } from "vitest";
import EditorJsReadonly from "./EditorJsReadonly.vue";
import EditorJsMapSceneAnchor from "@helpers/editorJsMapSceneAnchor";

const editorMock = vi.hoisted(() => {
    const configurations: Array<Record<string, unknown>> = [];
    const render = vi.fn().mockResolvedValue(undefined);
    const destroy = vi.fn();

    class MockEditorJs {
        readonly isReady = Promise.resolve();
        readonly blocks = { render };

        constructor(configuration: Record<string, unknown>) {
            configurations.push(configuration);
        }

        destroy(): void {
            destroy();
        }
    }

    class MockTool {
        static readonly isReadOnlySupported = true;
    }

    return {
        configurations,
        destroy,
        render,
        MockEditorJs,
        MockTool,
    };
});

vi.mock("@editorjs/editorjs", () => ({ default: editorMock.MockEditorJs }));
vi.mock("@editorjs/header", () => ({ default: editorMock.MockTool }));
vi.mock("@editorjs/list", () => ({ default: editorMock.MockTool }));
vi.mock("@editorjs/quote", () => ({ default: editorMock.MockTool }));
vi.mock("@editorjs/delimiter", () => ({ default: editorMock.MockTool }));
vi.mock("@editorjs/code", () => ({ default: editorMock.MockTool }));
vi.mock("@editorjs/image", () => ({ default: editorMock.MockTool }));

describe("EditorJsReadonly", () => {
    beforeEach(() => {
        vi.stubEnv("VITE_BACKEND_ROOT_URL", "http://localhost:8000");
        editorMock.configurations.length = 0;
        editorMock.render.mockClear();
        editorMock.destroy.mockClear();
    });

    test("initializes the real Editor.js contract in read-only mode", async () => {
        const wrapper = mount(EditorJsReadonly, {
            props: {
                data: {
                    version: "2.31.6",
                    time: 123,
                    blocks: [
                        {
                            id: "image-1",
                            type: "image",
                            data: {
                                file: { url: "/media/story/image.webp" },
                                caption: "Story image",
                            },
                        },
                    ],
                },
            },
            global: {
                stubs: {
                    UAlert: true,
                },
            },
        });

        await vi.waitFor(() => {
            expect(editorMock.configurations).toHaveLength(1);
        });
        const configuration = editorMock.configurations[0];
        expect(configuration.readOnly).toBe(true);
        expect(configuration.hideToolbar).toBe(true);
        expect(configuration.holder).toBe(
            wrapper.get("[data-testid='editorjs-holder']").element
        );
        expect(configuration.data).toEqual({
            version: "2.31.6",
            time: 123,
            blocks: [
                {
                    id: "image-1",
                    type: "image",
                    data: {
                        file: {
                            url: "http://localhost:8000/media/story/image.webp",
                        },
                        caption: "Story image",
                    },
                },
            ],
        });

        await wrapper.setProps({
            data: {
                blocks: [
                    {
                        type: "paragraph",
                        data: { text: "Updated content" },
                    },
                ],
            },
        });
        await flushPromises();

        expect(editorMock.render).toHaveBeenCalledWith({
            version: undefined,
            time: undefined,
            blocks: [
                {
                    id: undefined,
                    type: "paragraph",
                    data: { text: "Updated content" },
                    tunes: undefined,
                },
            ],
        });

        wrapper.unmount();
        await flushPromises();
        expect(editorMock.destroy).toHaveBeenCalledOnce();
    });

    const storyBlocks = [
        { type: "paragraph", data: { text: "Before the anchor" } },
        { type: "mapScene", data: { scene_id: "scene-2" } },
        { type: "paragraph", data: { text: "After the anchor" } },
    ];

    function mountStory(mapSceneAnchors?: boolean) {
        return mount(EditorJsReadonly, {
            props: {
                data: { blocks: storyBlocks },
                ...(mapSceneAnchors === undefined ? {} : { mapSceneAnchors }),
            },
            global: { stubs: { UAlert: true } },
        });
    }

    test("renders mapScene blocks as anchors when the caller opts in", async () => {
        mountStory(true);

        await vi.waitFor(() => expect(editorMock.configurations).toHaveLength(1));
        const configuration = editorMock.configurations[0] as {
            tools: Record<string, unknown>
            data: { blocks: Array<{ type: string }> }
        };
        expect(configuration.tools.mapScene).toBe(EditorJsMapSceneAnchor);
        expect(configuration.data.blocks.map((block) => block.type)).toEqual([
            "paragraph", "mapScene", "paragraph",
        ]);
    });

    test("drops mapScene blocks instead of showing Editor.js's stub by default", async () => {
        const wrapper = mountStory();

        await vi.waitFor(() => expect(editorMock.configurations).toHaveLength(1));
        const configuration = editorMock.configurations[0] as {
            tools: Record<string, unknown>
            data: { blocks: Array<{ type: string }> }
        };
        expect(configuration.tools.mapScene).toBeUndefined();
        expect(configuration.data.blocks.map((block) => block.type)).toEqual([
            "paragraph", "paragraph",
        ]);

        await wrapper.setProps({ data: { blocks: storyBlocks } });
        await flushPromises();
        const rendered = editorMock.render.mock.lastCall?.[0] as { blocks: Array<{ type: string }> };
        expect(rendered.blocks.map((block) => block.type)).toEqual(["paragraph", "paragraph"]);
    });

    test("emits rendered with the holder after the first render and each re-render", async () => {
        const wrapper = mountStory(true);
        const holder = wrapper.get("[data-testid='editorjs-holder']").element;

        await vi.waitFor(() => expect(wrapper.emitted("rendered")).toHaveLength(1));
        expect(wrapper.emitted("rendered")![0]).toEqual([holder]);

        await wrapper.setProps({ data: { blocks: storyBlocks.slice(0, 1) } });
        await flushPromises();
        expect(wrapper.emitted("rendered")).toHaveLength(2);
    });
});

describe("EditorJsMapSceneAnchor", () => {
    test("renders an invisible element carrying the scene id", () => {
        const tool = new EditorJsMapSceneAnchor({ data: { scene_id: "scene-2" } });

        const element = tool.render();

        expect(element.className).toBe("geostory-scene-anchor");
        expect(element.dataset.sceneId).toBe("scene-2");
        expect(element.getAttribute("aria-hidden")).toBe("true");
        expect(element.textContent).toBe("");
        expect(tool.save()).toEqual({ scene_id: "scene-2" });
        expect(EditorJsMapSceneAnchor.isReadOnlySupported).toBe(true);
    });

    test("tolerates a block without a scene id", () => {
        const tool = new EditorJsMapSceneAnchor({ data: {} });

        expect(tool.render().dataset.sceneId).toBe("");
        expect(tool.save()).toEqual({ scene_id: "" });
    });
});

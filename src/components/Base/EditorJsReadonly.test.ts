import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, test, vi } from "vitest";
import EditorJsReadonly from "./EditorJsReadonly.vue";

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
});

import { describe, expect, it } from "vitest";
import EditorJsReadonlyList from "./editorJsReadonlyList";

describe("EditorJsReadonlyList", () => {
    it("renders legacy string items as a semantic unordered list", () => {
        const tool = new EditorJsReadonlyList({
            data: { style: "unordered", items: ["this", "is", "a list"] },
        });

        const list = tool.render();
        expect(list.tagName).toBe("UL");
        expect([...list.querySelectorAll(":scope > li")].map((item) => item.textContent))
            .toEqual(["this", "is", "a list"]);
    });

    it("renders nested and checklist item formats without plugin validation", () => {
        const tool = new EditorJsReadonlyList({
            data: {
                style: "checklist",
                items: [
                    {
                        content: "<strong>Parent</strong>",
                        meta: { checked: true },
                        items: [{ text: "Child", checked: false }],
                    },
                ],
            },
        });

        const list = tool.render();
        expect(list.querySelector("strong")?.textContent).toBe("Parent");
        expect(list.querySelectorAll("li")).toHaveLength(2);
        expect(list.querySelector<HTMLInputElement>("input")?.checked).toBe(true);
    });
});

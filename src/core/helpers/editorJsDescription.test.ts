import { describe, expect, it } from "vitest";
import {
    descriptionDocumentToHtml,
    sanitizeDescriptionInlineHtml,
} from "./editorJsDescription";

describe("descriptionDocumentToHtml", () => {
    it("renders the constrained description blocks as semantic HTML", () => {
        const html = descriptionDocumentToHtml({
            blocks: [
                { type: "header", data: { text: "Overview", level: 2 } },
                { type: "paragraph", data: { text: "<strong>Useful</strong><br>details" } },
                {
                    type: "list",
                    data: {
                        style: "ordered",
                        items: [
                            {
                                content: "First",
                                items: [{ content: "Nested", items: [] }],
                            },
                        ],
                    },
                },
            ],
        });

        expect(html).toBe(
            "<h2>Overview</h2>"
      + "<p><strong>Useful</strong><br>details</p>"
      + "<ol><li><span>First</span><ol><li><span>Nested</span></li></ol></li></ol>"
        );
    });

    it("ignores blocks outside the public description profile", () => {
        expect(descriptionDocumentToHtml({
            blocks: [
                { type: "header", data: { text: "Hidden", level: 1 } },
                { type: "image", data: { text: "Hidden" } },
            ],
        })).toBe("");
    });
});

describe("sanitizeDescriptionInlineHtml", () => {
    it("keeps formatting and safe links while removing unsafe markup", () => {
        const html = sanitizeDescriptionInlineHtml(
            "<strong onclick=\"bad()\">Bold</strong>"
      + "<script>alert(1)</script>"
      + "<a href=\"https://example.test\" target=\"_blank\">safe</a>"
      + "<a href=\"javascript:alert(1)\">unsafe</a>"
        );

        expect(html).toBe(
            "<strong>Bold</strong>alert(1)"
      + "<a href=\"https://example.test\">safe</a>"
      + "<a>unsafe</a>"
        );
    });
});

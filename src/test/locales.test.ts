import { describe, expect, test } from "vitest";
import de from "@locales/de.json";
import en from "@locales/en.json";
import tr from "@locales/tr.json";

// The vue-i18n Vite plugin compiles each message into an AST node such as
// `{ type: 0, body: … }`; message groups are plain objects whose values are
// messages or further groups (a group key named "type" holds an object).
function isMessage(value: unknown): boolean {
    if (value === null || typeof value !== "object") return true;
    return typeof (value as { type?: unknown }).type === "number";
}

function messageKeys(messages: unknown, prefix = ""): string[] {
    return Object.entries(messages as Record<string, unknown>).flatMap(([key, value]) => {
        const path = `${prefix}${key}`;
        return isMessage(value) ? [path] : messageKeys(value, `${path}.`);
    });
}

const reference = new Set(messageKeys(en));

describe("locales", () => {
    test("English has messages", () => {
        expect(reference.size).toBeGreaterThan(100);
        expect(reference.has("geostories.scenes.progress")).toBe(true);
    });

    test.each([
        ["de", de],
        ["tr", tr],
    ])("%s has exactly the English message keys", (_locale, messages) => {
        const keys = new Set(messageKeys(messages));

        expect([...reference].filter((key) => !keys.has(key))).toEqual([]);
        expect([...keys].filter((key) => !reference.has(key))).toEqual([]);
    });
});

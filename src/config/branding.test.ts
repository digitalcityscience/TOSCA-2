import { describe, expect, test } from "vitest";
import { DEFAULT_BRAND_NAME, resolveBrandName } from "./branding";

describe("branding configuration", () => {
    test("falls back to the default name when the variable is unset or blank", () => {
        expect(resolveBrandName({})).toBe(DEFAULT_BRAND_NAME);
        expect(resolveBrandName({ VITE_APP_BRAND_NAME: "  " })).toBe(DEFAULT_BRAND_NAME);
    });

    test("uses the configured name", () => {
        expect(resolveBrandName({ VITE_APP_BRAND_NAME: " City Lab " })).toBe("City Lab");
    });
});

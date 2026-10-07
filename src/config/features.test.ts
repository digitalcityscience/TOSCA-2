import { describe, expect, test } from "vitest";
import { FEATURE_IDS, resolveEnabledFeatures } from "./features";

describe("feature configuration", () => {
    test("enables every feature when the variable is unset or blank", () => {
        expect([...resolveEnabledFeatures({})]).toEqual([...FEATURE_IDS]);
        expect([...resolveEnabledFeatures({ VITE_ENABLED_FEATURES: "  " })]).toEqual([...FEATURE_IDS]);
    });

    test("enables only the listed features", () => {
        const enabled = resolveEnabledFeatures({ VITE_ENABLED_FEATURES: " events, geostories ," });

        expect(enabled.has("events")).toBe(true);
        expect(enabled.has("geostories")).toBe(true);
        expect(enabled.has("datastores")).toBe(false);
    });

    test("rejects unknown feature ids", () => {
        expect(() => resolveEnabledFeatures({ VITE_ENABLED_FEATURES: "events,geostory" }))
            .toThrow(/geostory/);
    });
});

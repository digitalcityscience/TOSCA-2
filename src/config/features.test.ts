import { describe, expect, test } from "vitest";
import { FEATURE_IDS, OPT_IN_FEATURE_IDS, resolveEnabledFeatures } from "./features";

describe("feature configuration", () => {
    test("enables every feature except the opt-in ones when the variable is unset or blank", () => {
        const defaults = ["datastores", "events", "geostories"];

        expect([...resolveEnabledFeatures({})]).toEqual(defaults);
        expect([...resolveEnabledFeatures({ VITE_ENABLED_FEATURES: "  " })]).toEqual(defaults);
        expect(FEATURE_IDS.filter((id) => !OPT_IN_FEATURE_IDS.includes(id))).toEqual(defaults);
    });

    test("keeps Urban Stories off unless it is listed", () => {
        expect(resolveEnabledFeatures({}).has("urbanStories")).toBe(false);
        expect(resolveEnabledFeatures({ VITE_ENABLED_FEATURES: "datastores,events,geostories" }).has("urbanStories")).toBe(false);
    });

    test("accepts urbanStories in VITE_ENABLED_FEATURES", () => {
        const enabled = resolveEnabledFeatures({ VITE_ENABLED_FEATURES: "datastores,events,geostories,urbanStories" });

        expect([...enabled]).toEqual(["datastores", "events", "geostories", "urbanStories"]);
        expect([...resolveEnabledFeatures({ VITE_ENABLED_FEATURES: "urbanStories" })]).toEqual(["urbanStories"]);
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

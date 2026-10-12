import { describe, expect, test } from "vitest";
import { CATALOG_STYLES_RECORDED_ON, RECORDED_URBAN_STORY_STYLES } from "./catalogStyles.fixture";
import { URBAN_STORIES } from "./index";
import { URBAN_STORY_LAYERS } from "./layers";
import { STYLE_VERIFIED_ON, VERIFIED_METRIC_STYLES } from "./verifiedStyles";

const recorded = (name: string) => RECORDED_URBAN_STORY_STYLES.find((style) => style.name === name);

// Frontend-styled entries (15-Minute City) carry local style names, which are not catalog styles.
const catalogEntries = (story: typeof URBAN_STORIES[number]) => story.explore.filter((entry) => entry.styleSource !== "frontend");

const styledMetrics = URBAN_STORIES.flatMap((story) => catalogEntries(story).flatMap((entry) => entry.metrics
    .filter((option) => option.styleName !== null)
    .map((option) => ({ story: story.key, entry, option }))));

describe("configured catalog styles match the recorded catalog", () => {
    test("every non-null styleName exists in the recording, is an MBStyle and carries the recording date", () => {
        expect(styledMetrics.length).toBeGreaterThan(0);
        for (const { entry, option } of styledMetrics) {
            const style = recorded(option.styleName as string);
            expect(style, `${entry.key}/${option.key}`).toBeDefined();
            expect(style?.format).toBe("mbstyle");
            expect(option.styleVerifiedOn).toBe(STYLE_VERIFIED_ON);
            expect(option.styleVerifiedOn).toBe(CATALOG_STYLES_RECORDED_ON);
        }
    });

    test("the style renders the metric's attribute on the entry's own layer", () => {
        for (const { entry, option } of styledMetrics) {
            const style = recorded(option.styleName as string);
            expect(style?.metric, `${entry.key}/${option.key}`).toBe(option.attribute);
            expect(style?.sourceLayer, `${entry.key}/${option.key}`).toBe(entry.layer.layerName);
            expect(style?.transform).toBeUndefined();
            expect(style?.qualifiedName.startsWith(`${entry.layer.workspace}:`)).toBe(true);
        }
    });

    test("every recorded association is used on every entry that lists the metric on that layer", () => {
        for (const verified of VERIFIED_METRIC_STYLES) {
            const { ref } = URBAN_STORY_LAYERS[verified.layer];
            const matching = URBAN_STORIES.flatMap(catalogEntries)
                .filter((entry) => entry.layer.layerName === ref.layerName)
                .flatMap((entry) => entry.metrics.filter((option) => option.attribute === verified.attribute));
            expect(matching.length, verified.styleName).toBeGreaterThan(0);
            expect(matching.every((option) => option.styleName === verified.styleName)).toBe(true);
        }
    });

    test("the recorded 15-minute catalog styles are used by no story: that story's styling is frontend-owned", () => {
        const used = new Set(URBAN_STORIES.flatMap((story) => story.explore).flatMap((entry) => entry.metrics.map((option) => option.styleName)));
        expect(used.has("urbanstories-15-minute-city")).toBe(false);
        expect(used.has("urbanstories-15-minute-city-areas")).toBe(false);
        expect(recorded("urbanstories-15-minute-city")).toBeDefined();
    });

    test("the recorded Public Transport Equity catalog style is used by no story: that story's styling is frontend-owned", () => {
        const used = new Set(URBAN_STORIES.flatMap((story) => story.explore).flatMap((entry) => entry.metrics.map((option) => option.styleName)));
        expect(used.has("urbanstories-public-transport-equity")).toBe(false);
        expect(recorded("urbanstories-public-transport-equity")).toBeDefined();
    });

    test("the same attribute on another layer never borrows a style written for a different layer", () => {
        const other = URBAN_STORIES.flatMap((story) => story.explore)
            .filter((entry) => entry.layer.layerName !== "hamburg_stadtteile")
            .flatMap((entry) => entry.metrics.filter((option) => option.attribute === "grn_mean"));
        expect(other.length).toBeGreaterThan(0);
        expect(other.every((option) => option.styleName === null)).toBe(true);
    });

    test("styles that do not show a configured metric as such stay unconfigured", () => {
        const used = new Set(styledMetrics.map(({ option }) => option.styleName));
        expect(used.has("urbanstories-safety-deficit")).toBe(false);
        expect(used.has("urbanstories-green-inventory")).toBe(false);
        expect(recorded("urbanstories-safety-deficit")?.transform).toBe("100 - safety_index");
    });

    test("the recording states that no style has a minzoom, which is why the loader applies the floor", () => {
        expect(RECORDED_URBAN_STORY_STYLES.every((style) => !style.hasMinzoom)).toBe(true);
    });
});

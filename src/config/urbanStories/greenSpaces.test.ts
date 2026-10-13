import { describe, expect, test } from "vitest";
import { getStoryConfig, localize, URBAN_STORIES } from "./index";
import { SCENE_KEYS } from "./greenSpaces";
import { frontendStylingFor } from "./frontendStyles";
import { findStoryConfigErrors, validateStoryConfigs } from "./validate";
import { HIRSCHPARK, NIENSTEDTEN, OTHMARSCHEN, PARK_EXAMPLES, PLAYGROUND_EXAMPLES } from "./greenSpacesLocations";

const story = getStoryConfig("green-spaces")!;

describe("the Green Spaces story", () => {
    test("is valid and replaces the old story under the same key", () => {
        expect(findStoryConfigErrors(URBAN_STORIES)).toEqual([]);
        expect(() => validateStoryConfigs(URBAN_STORIES)).not.toThrow();
        expect(URBAN_STORIES.filter((candidate) => candidate.key === "green-spaces")).toHaveLength(1);
        expect(story.title.de).toBe("Grünräume");
    });

    test("has exactly the six scenes of the brief, in order, in English and German", () => {
        expect(story.chapters.map((chapter) => chapter.chapterKey)).toEqual([...SCENE_KEYS]);
        expect(story.chapters).toHaveLength(6);
        for (const chapter of story.chapters) {
            expect(localize(chapter.title, "en")).not.toBe("");
            expect(localize(chapter.title, "de")).not.toBe(localize(chapter.title, "en"));
            expect(localize(chapter.narrative!, "de")).not.toBe(localize(chapter.narrative!, "en"));
            expect(chapter.camera).toBeDefined();
        }
    });

    test("every entry is styled by the frontend and every metric names a style the resolver has", () => {
        for (const entry of story.explore) {
            expect(entry.styleSource).toBe("frontend");
            const names = frontendStylingFor(entry)!.styles.map((style) => style.name);
            for (const metric of entry.metrics) expect(names).toContain(metric.styleName);
        }
    });

    test("every scene stages the same seven layers in drawing order, so no layer is added or removed mid-story", () => {
        const first = story.chapters[0].show!.map((shown) => shown.entryKey);
        expect(first).toHaveLength(7);
        expect(new Set(first)).toEqual(new Set(story.explore.map((entry) => entry.key)));
        for (const chapter of story.chapters) expect(chapter.show!.map((shown) => shown.entryKey)).toEqual(first);
    });

    test("park and playground are two separate building metrics on the same unbounded scale; score_green is not used", () => {
        const buildings = story.explore.find((entry) => entry.key === "buildings-green-access")!;
        expect(buildings.metrics.map((metric) => metric.attribute)).toEqual(["walk_min_dgp_park", "walk_min_dgp_playground"]);
        expect(buildings.requiredAttributes).toEqual(expect.arrayContaining(["dgp_park_status", "dgp_playground_status", "building_height_m"]));
        expect(buildings.requiredAttributes).not.toContain("score_green");
        expect(buildings.minZoom).toBe(11);
        const admin = story.explore.find((entry) => entry.key === "stadtteile-green-access")!;
        expect(admin.metrics.map((metric) => metric.attribute)).toEqual([
            "dgp_park_median_min", "dgp_playground_median_min", "cov_dgp_recreational_share", "cov_dgp_green_share", "grn_share_large_green_15min",
        ]);
    });

    test("heavy layers keep their zoom floors; the areas reach the whole-city view", () => {
        const floor = (key: string): number | undefined => story.explore.find((entry) => entry.key === key)?.minZoom;
        expect(floor("green-features-polygon")).toBe(14);
        expect(floor("green-features-line")).toBe(14);
        expect(floor("green-features-point")).toBe(14);
        expect(floor("green-areas")).toBeLessThan(10);
    });

    test("no entrance or gate layer is configured", () => {
        const text = JSON.stringify(story).toLowerCase();
        expect(text).not.toMatch(/entrance_candidate|park_entrances|gate layer/);
        expect(story.explore.every((entry) => !/entrance|gate/i.test(entry.layer.layerName))).toBe(true);
    });

    test("the verified locations tell one spatial story in one place", () => {
        expect(HIRSCHPARK.idnr).toBe(2692);
        expect(HIRSCHPARK.areaId).toBe("dgp:public_green:2692");
        const [west, south, east, north] = NIENSTEDTEN.bounds;
        for (const building of [...PARK_EXAMPLES, ...PLAYGROUND_EXAMPLES]) {
            expect(building.center[0]).toBeGreaterThan(west);
            expect(building.center[0]).toBeLessThan(east);
            expect(building.center[1]).toBeGreaterThan(south);
            expect(building.center[1]).toBeLessThan(north);
        }
        expect(HIRSCHPARK.center[0]).toBeGreaterThan(west);
        expect(OTHMARSCHEN.bounds[0]).toBeLessThanOrEqual(NIENSTEDTEN.bounds[2]);
        expect(new Set([...PARK_EXAMPLES, ...PLAYGROUND_EXAMPLES].map((building) => building.id)).size).toBe(4);
    });

    test("the narrative carries no statistic of its own", () => {
        for (const chapter of story.chapters) {
            const text = `${localize(chapter.narrative!, "en")} ${localize(chapter.narrative!, "de")}`;
            expect(text).not.toMatch(/\d+(\.\d+)? ?(min|%)/);
        }
    });
});

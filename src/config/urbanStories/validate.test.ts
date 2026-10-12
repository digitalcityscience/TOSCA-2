import { describe, expect, test } from "vitest";
import { getStoryConfig, isUrbanStoryKey, localize, URBAN_STORIES } from "./index";
import { URBAN_STORY_LAYERS } from "./layers";
import { CAVEATS, FIFTEEN_MINUTE_CATEGORIES } from "./metrics";
import type { ExploreEntry, UrbanStoryConfig } from "./types";
import { findStoryConfigErrors, validateStoryConfigs } from "./validate";
import { catalogFixtureStory } from "./__fixtures__/catalogFixtureStory";

/**
 * A copy of the shipped configs for the generic contract rules. The shipped Green Spaces story is frontend-styled; the
 * catalog-styled fixture stands in for it where a rule is about catalog styles or catalog-styled Explore entries.
 */
function cloneStories(): UrbanStoryConfig[] {
    return structuredClone([...URBAN_STORIES].map((story) => (story.key === "green-spaces" ? catalogFixtureStory : story))) as UrbanStoryConfig[];
}

function entry(stories: UrbanStoryConfig[], storyKey: string, entryKey: string): ExploreEntry {
    const found = stories.find((story) => story.key === storyKey)?.explore.find((item) => item.key === entryKey);
    if (found === undefined) throw new Error(`missing ${storyKey}/${entryKey}`);
    return found;
}

function allEntries(): { story: string; entry: ExploreEntry }[] {
    return URBAN_STORIES.flatMap((story) => story.explore.map((item) => ({ story: story.key, entry: item })));
}

describe("urban story configs", () => {
    test("rejects chapter `show` entries or metrics that the story does not define", () => {
        const stories = cloneStories();
        const green = stories.find((story) => story.key === "green-spaces")!;
        green.chapters[0].show = [{ entryKey: "nope" }, { entryKey: "green-areas", metricKey: "nope" }];

        expect(findStoryConfigErrors(stories)).toEqual([
            "green-spaces/green-inventory: unknown shown explore entry \"nope\"",
            "green-spaces/green-inventory: shown entry \"green-areas\" has no metric \"nope\"",
        ]);
    });

    test("the shipped configs are valid", () => {
        expect(findStoryConfigErrors(URBAN_STORIES)).toEqual([]);
        expect(() => validateStoryConfigs(URBAN_STORIES)).not.toThrow();
    });

    test("define the agreed story, entry and chapter keys", () => {
        const keys = URBAN_STORIES.map((story) => ({
            story: story.key,
            explore: story.explore.map((item) => item.key),
            chapters: Object.fromEntries(story.chapters.map((chapter) => [chapter.chapterKey, chapter.relatedExploreEntries])),
        }));

        expect(keys).toEqual([
            {
                story: "fifteen-minute",
                explore: ["buildings-15min", "stadtteile-15min"],
                chapters: {
                    "passes-the-test": ["stadtteile-15min", "buildings-15min"],
                    "same-score-different-neighbourhood": ["stadtteile-15min", "buildings-15min"],
                    "the-weakest-link": ["stadtteile-15min", "buildings-15min"],
                    "accessible-but-comfortable": ["stadtteile-15min", "buildings-15min"],
                    "accessible-but-safe": ["stadtteile-15min", "buildings-15min"],
                    "explore-beyond-the-score": ["stadtteile-15min", "buildings-15min"],
                },
            },
            {
                story: "walkability-safety",
                explore: [
                    "street-segments",
                ],
                chapters: {
                    "walking-environment": ["street-segments"],
                    "recorded-crashes": ["street-segments"],
                    "city-centre-records": ["street-segments"],
                    "street-sidewalks": ["street-segments"],
                    "street-grade": ["street-segments"],
                },
            },
            {
                story: "building-walking",
                explore: ["buildings-comfort-safety"],
                chapters: {
                    "building-comfort": ["buildings-comfort-safety"],
                    "building-safety": ["buildings-comfort-safety"],
                    "building-data-coverage": ["buildings-comfort-safety"],
                    "building-network-length": ["buildings-comfort-safety"],
                    "inspect-building": ["buildings-comfort-safety"],
                },
            },
            {
                story: "transit-equity",
                explore: ["buildings-pt", "stadtteile-pt", "units-pt"],
                chapters: {
                    "who-is-covered": ["stadtteile-pt", "buildings-pt", "units-pt"],
                    "where-are-the-gaps": ["stadtteile-pt", "buildings-pt", "units-pt"],
                    "stop-is-not-service": ["stadtteile-pt", "buildings-pt", "units-pt"],
                    "coverage-vs-walking": ["stadtteile-pt", "buildings-pt", "units-pt"],
                    "averages-hide-differences": ["stadtteile-pt", "buildings-pt", "units-pt"],
                    "explore-the-gaps": ["stadtteile-pt", "buildings-pt", "units-pt"],
                },
            },
            {
                story: "green-spaces",
                explore: [
                    "stadtteile-green-access", "green-areas", "green-features-polygon", "green-features-line", "green-features-point",
                    "park-pois", "buildings-green-access",
                ],
                chapters: {
                    "what-counts-as-a-park": ["green-areas", "stadtteile-green-access"],
                    "inside-the-park": ["green-areas", "green-features-polygon", "green-features-line", "green-features-point"],
                    "park-nearby-how-far": ["stadtteile-green-access", "buildings-green-access", "green-areas"],
                    "where-can-children-play": ["stadtteile-green-access", "buildings-green-access", "green-areas"],
                    "park-vs-playground": ["stadtteile-green-access", "buildings-green-access", "green-areas"],
                    "explore-green-hamburg": [
                        "green-areas", "stadtteile-green-access", "buildings-green-access", "green-features-polygon",
                        "green-features-line", "green-features-point", "park-pois",
                    ],
                },
            },
            { story: "hamburg-riders", explore: [], chapters: {} },
        ]);
    });

    test("keeps every story id and scene id unset until the backend publishes them", () => {
        for (const story of URBAN_STORIES) {
            expect(story.geostory.id).toBeNull();
            expect(story.chapters.every((chapter) => chapter.scene.id === null)).toBe(true);
        }
    });

    test("sets a style name only on the verified (layer, metric) pairs, each with a verification date", () => {
        const styled = allEntries().filter(({ entry: item }) => item.styleSource !== "frontend").flatMap(({ story, entry: item }) => item.metrics
            .filter((option) => option.styleName !== null)
            .map((option) => `${story}/${item.key}/${option.attribute}=${option.styleName}@${option.styleVerifiedOn}`));
        // Every shipped story owns its styling in the frontend: no catalog style is verified on any entry.
        expect(styled).toEqual([]);
    });

    test("looks stories up by key", () => {
        expect(getStoryConfig("green-spaces")?.title.en).toBe("Green Spaces");
        expect(getStoryConfig("nope")).toBeUndefined();
        expect(isUrbanStoryKey("transit-equity")).toBe(true);
        expect(isUrbanStoryKey("transit")).toBe(false);
    });

    test("localizes story texts with an English fallback", () => {
        const title = getStoryConfig("green-spaces")!.title;
        expect(localize(title, "de")).toBe("Grünräume");
        expect(localize(title, "en")).toBe("Green Spaces");
        expect(localize(title, "tr")).toBe("Green Spaces");
    });
});

describe("story config validation", () => {
    test("rejects duplicate entry and chapter keys within a story", () => {
        const stories = cloneStories();
        stories[0].explore.push(structuredClone(stories[0].explore[0]));
        stories[1].chapters.push(structuredClone(stories[1].chapters[0]));

        expect(findStoryConfigErrors(stories)).toEqual(expect.arrayContaining([
            "fifteen-minute: duplicate explore entry key \"buildings-15min\"",
            "walkability-safety: duplicate chapter key \"walking-environment\"",
        ]));
    });

    test("rejects related entries that do not exist in the story", () => {
        const stories = cloneStories();
        stories.find((story) => story.key === "green-spaces")!.chapters[0].relatedExploreEntries.push("buildings-15min");

        expect(findStoryConfigErrors(stories)).toEqual([
            "green-spaces/green-inventory: unknown related explore entry \"buildings-15min\"",
        ]);
    });

    test("rejects a default metric that is not offered", () => {
        const stories = cloneStories();
        entry(stories, "fifteen-minute", "buildings-15min").defaultMetric = "score_green";

        expect(findStoryConfigErrors(stories)).toEqual([
            "fifteen-minute/buildings-15min: defaultMetric \"score_green\" is not among the metrics",
        ]);
    });

    test.each([
        ["walkability-safety", "street-segments"],
        ["green-spaces", "green-features-polygon"],
        ["transit-equity", "buildings-pt"],
    ])("rejects the heavy layer %s/%s without a zoom floor", (storyKey, entryKey) => {
        const stories = cloneStories();
        delete entry(stories, storyKey, entryKey).minZoom;

        expect(findStoryConfigErrors(stories)).toEqual([
            expect.stringMatching(new RegExp(`^${storyKey}/${entryKey}: heavy layer .* needs a minZoom$`)),
        ]);
    });

    test("rejects a style name that was not verified", () => {
        const stories = cloneStories();
        const option = entry(stories, "green-spaces", "units-green-access").metrics[0];
        option.styleName = "urbanstories-green-access";

        expect(findStoryConfigErrors(stories)).toEqual([
            "green-spaces/units-green-access: metric \"grn_mean\" has style \"urbanstories-green-access\" that is not marked verified",
        ]);

        option.styleVerifiedOn = "2026-10-11";
        expect(findStoryConfigErrors(stories)).toEqual([]);
    });

    test("rejects review flag metrics on Bezirke", () => {
        const stories = cloneStories();
        const bezirke = entry(stories, "green-spaces", "bezirke-green-access");
        const flag = { ...structuredClone(bezirke.metrics[0]), key: "ptr_coverage_gap_flag", attribute: "ptr_coverage_gap_flag" };
        bezirke.metrics.push(flag);
        bezirke.requiredAttributes.push(flag.attribute);

        expect(findStoryConfigErrors(stories)).toEqual([
            "green-spaces/bezirke-green-access: Bezirke have no review column \"ptr_coverage_gap_flag\"",
        ]);
    });

    test("rejects any rendering other than vector tiles and a missing mvt status", () => {
        const stories = cloneStories();
        const target = entry(stories, "fifteen-minute", "stadtteile-15min") as unknown as Record<string, unknown>;
        target.rendering = "wms";
        delete target.mvt;

        expect(findStoryConfigErrors(stories)).toEqual([
            "fifteen-minute/stadtteile-15min: rendering must be \"vector-tiles\", got \"wms\"",
            "fifteen-minute/stadtteile-15min: missing or invalid mvt status",
        ]);
    });

    test("rejects a metric whose attribute is not probed", () => {
        const stories = cloneStories();
        entry(stories, "walkability-safety", "street-segments").requiredAttributes = ["in_hamburg"];

        expect(findStoryConfigErrors(stories).length).toBe(entry(stories, "walkability-safety", "street-segments").metrics.length);
    });

    test("lists every violation when throwing", () => {
        const stories = cloneStories();
        stories.push(structuredClone(stories[0]));

        expect(() => validateStoryConfigs(stories)).toThrow(/duplicate story key "fifteen-minute"/);
    });
});

describe("layer references", () => {
    test("define exactly the 18 published layers, all verified as MVT", () => {
        const refs = Object.values(URBAN_STORY_LAYERS).map((layer) => `${layer.ref.workspace}:${layer.ref.layerName}`);

        expect(refs.sort()).toEqual([
            "HAMBURG-ADMINISTRATIVE:hamburg_bezirke",
            "HAMBURG-ADMINISTRATIVE:hamburg_stadtteile",
            "HAMBURG-ADMINISTRATIVE:hamburg_statistical_units",
            "HAMBURG-BUILDINGS:hamburg_buildings",
            "HAMBURG-GREEN-SPACES:green_areas",
            "HAMBURG-GREEN-SPACES:green_features_line",
            "HAMBURG-GREEN-SPACES:green_features_point",
            "HAMBURG-GREEN-SPACES:green_features_polygon",
            "HAMBURG-MOBILITY:hamburg_mobility",
            "HAMBURG-POIs:bank_post",
            "HAMBURG-POIs:culture",
            "HAMBURG-POIs:education",
            "HAMBURG-POIs:food",
            "HAMBURG-POIs:health",
            "HAMBURG-POIs:park",
            "HAMBURG-POIs:pt_stops",
            "HAMBURG-POIs:restaurant",
            "HAMBURG-POIs:sport",
        ]);
        expect(Object.values(URBAN_STORY_LAYERS).every((layer) => layer.mvt === "verified" && layer.rendering === "vector-tiles")).toBe(true);
    });

    test("apply the measured zoom floors", () => {
        expect(URBAN_STORY_LAYERS.mobility.minZoom).toBe(15);
        expect(URBAN_STORY_LAYERS.buildings.minZoom).toBe(14);
        expect(URBAN_STORY_LAYERS.greenFeaturesPoint.minZoom).toBe(14);
        expect(URBAN_STORY_LAYERS.greenFeaturesLine.minZoom).toBe(14);
        expect(URBAN_STORY_LAYERS.greenFeaturesPolygon.minZoom).toBe(14);
        expect(URBAN_STORY_LAYERS.greenAreas.minZoom).toBe(11);
        expect(URBAN_STORY_LAYERS.poiFood.minZoom).toBeUndefined();
        expect(URBAN_STORY_LAYERS.stadtteile.minZoom).toBeUndefined();
    });

    test("name workspaces and layers only in layers.ts", () => {
        const sources = import.meta.glob<string>("./*.ts", { query: "?raw", import: "default", eager: true });
        // POI layer names such as "food" double as 15-minute category ids, which other modules may use.
        const categoryIds = new Set<string>(FIFTEEN_MINUTE_CATEGORIES.map((category) => category.id));
        const names = Object.values(URBAN_STORY_LAYERS)
            .flatMap((layer) => [layer.ref.workspace, layer.ref.layerName])
            .filter((name) => !categoryIds.has(name));
        const offenders = Object.entries(sources)
            // The catalog recording is evidence about the server, not configuration.
            .filter(([path]) => path !== "./layers.ts" && path !== "./catalogStyles.fixture.ts" && !path.endsWith(".test.ts"))
            .flatMap(([path, source]) => names
                .filter((name) => source.includes(`"${name}"`) || source.includes(`'${name}'`) || source.includes(`\`${name}\``))
                .map((name) => `${path}: ${name}`));

        expect(Object.keys(sources)).toContain("./fifteenMinute.ts");
        expect(offenders).toEqual([]);
    });
});

describe("caveat rules", () => {
    const has = (caveats: { en: string }[] | undefined, caveat: { en: string }) => (
        (caveats ?? []).some((item) => item.en === caveat.en)
    );

    test("label the building count and the two area aggregates as distinct measures", () => {
        const buildings = entry([...URBAN_STORIES], "fifteen-minute", "buildings-15min");
        // The overall score is the time-weighted 0–100 score (`score_15min_decay`), never the 0–9 category count.
        expect(buildings.metrics.find((option) => option.key === "access")?.attribute).toBe("score_15min_decay");
        const areas = entry([...URBAN_STORIES], "fifteen-minute", "stadtteile-15min");
        expect(areas.metrics.find((option) => option.key === "access")?.attribute).toBe("m15_decay_mean");
        expect(areas.metrics.find((option) => option.key === "comfort")?.attribute).toBe("cmf_mean");
        expect(areas.metrics.find((option) => option.key === "safety")?.attribute).toBe("saf_mean");
        expect(areas.metrics.find((option) => option.key === "green")?.attribute).toBe("grn_mean");
    });

    test("15-Minute City flies to Hamburg places in every chapter and in its overview", () => {
        const story = getStoryConfig("fifteen-minute")!;
        for (const camera of [story.overviewCamera, ...story.chapters.map((chapter) => chapter.camera!)]) {
            expect(camera.center[0]).toBeGreaterThan(9.7);
            expect(camera.center[0]).toBeLessThan(10.3);
            expect(camera.center[1]).toBeGreaterThan(53.4);
            expect(camera.center[1]).toBeLessThan(53.75);
        }
    });

    test("15-Minute City is frontend-styled: local style names only, no catalog verification", () => {
        const story = getStoryConfig("fifteen-minute")!;
        expect(story.explore.every((item) => item.styleSource === "frontend")).toBe(true);
        const metrics = story.explore.flatMap((item) => item.metrics);
        expect(metrics.length).toBeGreaterThan(0);
        expect(metrics.every((option) => option.styleName?.startsWith("frontend:15min:") === true && option.styleVerifiedOn === undefined)).toBe(true);
    });

    test("rejects a frontend-styled metric that names a catalog style", () => {
        const stories = cloneStories();
        const buildings = entry(stories, "fifteen-minute", "buildings-15min");
        buildings.metrics[0].styleName = "urbanstories-15-minute-city";
        expect(findStoryConfigErrors(stories).some((message) => message.includes("needs a local"))).toBe(true);
    });

    test("every admin metric carries the building-weighted caveat", () => {
        const adminMetrics = allEntries().filter(({ entry: item }) => item.group === "admin").flatMap(({ entry: item }) => item.metrics);
        expect(adminMetrics.length).toBeGreaterThan(0);
        expect(adminMetrics.filter((option) => !has(option.caveats, CAVEATS.adminAggregate))).toEqual([]);
    });

    test("the legacy-assignment PT shares on Stadtteile and units carry the legacy caveat", () => {
        for (const key of ["stadtteile-pt", "units-pt"]) {
            const ptMetrics = entry([...URBAN_STORIES], "transit-equity", key).metrics;
            expect(ptMetrics.length).toBeGreaterThan(0);
            expect(ptMetrics.filter((option) => !has(option.caveats, CAVEATS.legacyPtAssignment))).toEqual([]);
        }
    });

    test("departure sums are marked as a lower bound", () => {
        const sum = entry([...URBAN_STORIES], "transit-equity", "buildings-pt").metrics
            .find((option) => option.attribute === "pt_departures_daily_sum");
        expect(has(sum?.caveats, CAVEATS.departuresLowerBound)).toBe(true);
    });

    test("comfort and safety metrics are marked as modelled", () => {
        const modelledAttributes = /^(comfort_|safety_index|cmf_|saf_|accident_rate)/;
        const offenders = allEntries()
            .flatMap(({ entry: item }) => item.metrics)
            .filter((option) => modelledAttributes.test(option.attribute) && !has(option.caveats, CAVEATS.modelled));
        expect(offenders).toEqual([]);
    });

    test("green coverage uses cov_* only, as a union", () => {
        const coverage = getStoryConfig("green-spaces")!.explore
            .flatMap((item) => item.metrics)
            .filter((option) => /cov|coverage/i.test(`${option.attribute} ${option.label.en}`));
        expect(coverage.length).toBeGreaterThan(0);
        expect(coverage.every((option) => option.attribute.startsWith("cov_") && has(option.caveats, CAVEATS.coverageUnion))).toBe(true);
    });
});

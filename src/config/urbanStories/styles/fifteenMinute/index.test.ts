import { describe, expect, test } from "vitest";
import { frontendStylingFor } from "../../frontendStyles";
import { fifteenMinuteStory } from "../../fifteenMinute";
import {
    BUILDING_MIN_ZOOM,
    buildBuildingProfile,
    BUILDING_3D_FULL_ZOOM,
    BUILDING_3D_START_ZOOM,
    buildingExtrusionHeightExpression,
    buildingHeightExpression,
    buildingGapFilter,
    buildingStyleOptionId,
    buildingStyleOptions,
    CATEGORY_FIELDS,
    FIFTEEN_MINUTE_CATEGORY_IDS,
    FRONTEND_STYLE_PREFIX,
    gapSignature,
    NO_GAP_FILTER,
    resolveFifteenMinuteStyling,
    STYLE_NAMES,
} from "./index";
import { numberAt, passesFilter, styleErrors } from "./__fixtures__/evaluate";

describe("local style resolver", () => {
    test("every Explore entry of the story resolves to a local styling, with local names only", () => {
        for (const entry of fifteenMinuteStory.explore) {
            const bundle = resolveFifteenMinuteStyling(entry.key);
            expect(bundle, entry.key).toBeDefined();
            expect(bundle!.styles.every((style) => style.name.startsWith(FRONTEND_STYLE_PREFIX)), entry.key).toBe(true);
            expect(bundle!.styles.some((style) => style.id === bundle!.defaultStyleId), entry.key).toBe(true);
            expect(frontendStylingFor(entry)?.defaultStyleId).toBe(bundle!.defaultStyleId);
        }
    });

    test("an unknown entry key has no styling", () => {
        expect(resolveFifteenMinuteStyling("buildings-comfort-safety")).toBeUndefined();
    });

    test("no style references a catalog style, a GeoServer style name or a style endpoint", () => {
        const everything = JSON.stringify(fifteenMinuteStory.explore.map((entry) => resolveFifteenMinuteStyling(entry.key)));
        expect(everything).not.toMatch(/urbanstories-/);
        expect(everything).not.toMatch(/default-hamburg/);
        expect(everything).not.toMatch(/\/styles\//);
        expect(everything).not.toMatch(/tosca:metric|tosca:frontend-style-driven/);
    });

    test("every metric of the story names a style that its entry's styling provides", () => {
        for (const entry of fifteenMinuteStory.explore) {
            const names = new Set(resolveFifteenMinuteStyling(entry.key)!.styles.map((style) => style.name));
            for (const metric of entry.metrics) expect(names.has(metric.styleName!), `${entry.key}/${metric.key}`).toBe(true);
        }
    });

    test("every generated style layer is valid against the MapLibre style spec", () => {
        for (const entry of fifteenMinuteStory.explore) {
            for (const style of resolveFifteenMinuteStyling(entry.key)!.styles) {
                expect(styleErrors(style.layers, [entry.layer.layerName]), `${entry.key}/${style.name}`).toEqual([]);
            }
        }
    });

    test("the building styles keep the zoom floor on every pass and a numeric opacity for the layer controls", () => {
        for (const style of buildingStyleOptions()) {
            for (const layer of style.layers) expect(layer.minzoom, `${style.name}/${layer.id}`).toBe(BUILDING_MIN_ZOOM);
            const fill = style.layers[0];
            expect(fill.type).toBe("fill-extrusion");
            expect(typeof fill.paint?.["fill-extrusion-opacity"]).toBe("number");
            expect(fill.paint?.["fill-extrusion-height"]).toEqual(buildingExtrusionHeightExpression());
            expect(fill["source-layer"]).toBe("hamburg_buildings");
        }
    });

    test("one overall and nine category styles per building bundle", () => {
        const names = buildingStyleOptions().map((style) => style.name);
        expect(names).toEqual([STYLE_NAMES.overall, ...FIFTEEN_MINUTE_CATEGORY_IDS.map((id) => STYLE_NAMES.category(id))]);
        expect(new Set(names).size).toBe(10);
    });

    test("the category styles read their own access field", () => {
        for (const style of buildingStyleOptions().slice(1)) {
            const id = FIFTEEN_MINUTE_CATEGORY_IDS.find((candidate) => style.name === STYLE_NAMES.category(candidate))!;
            expect(JSON.stringify(style.layers[0].paint?.["fill-extrusion-color"])).toContain(CATEGORY_FIELDS[id].accessField);
        }
    });
});

describe("3D extrusion height", () => {
    const height = buildingHeightExpression();

    test("extrudes by building_height_m in metres", () => {
        expect(numberAt(height, { building_height_m: 12.34 })).toBe(12.34);
        expect(numberAt(height, { building_height_m: 158.47 })).toBe(158.47);
    });

    test("NULL, missing, zero, negative and non-numeric heights stay flat: no height is estimated", () => {
        for (const properties of [{}, { building_height_m: null }, { building_height_m: 0 }, { building_height_m: -3 }, { building_height_m: "12" }]) {
            expect(numberAt(height, properties), JSON.stringify(properties)).toBe(0);
        }
    });

    test("buildings are flat at low zoom and reach their full height from the 3D zoom on", () => {
        const zoomed = buildingExtrusionHeightExpression();
        const properties = { building_height_m: 20 };
        expect(numberAt(zoomed, properties, BUILDING_3D_START_ZOOM - 1)).toBe(0);
        expect(numberAt(zoomed, properties, BUILDING_3D_START_ZOOM)).toBe(0);
        expect(numberAt(zoomed, properties, (BUILDING_3D_START_ZOOM + BUILDING_3D_FULL_ZOOM) / 2)).toBe(10);
        expect(numberAt(zoomed, properties, BUILDING_3D_FULL_ZOOM)).toBe(20);
        expect(numberAt(zoomed, properties, 18)).toBe(20);
        expect(numberAt(zoomed, {}, 18)).toBe(0);
    });

    test("the thematic colour does not depend on the height", () => {
        expect(JSON.stringify(buildingStyleOptions()[0].layers[0].paint?.["fill-extrusion-color"])).not.toContain("building_height_m");
    });
});

describe("gap filter inside the building styles", () => {
    test("no gap means no filter on any pass", () => {
        for (const style of buildingStyleOptions(NO_GAP_FILTER)) {
            expect(style.layers.every((layer) => layer.filter === undefined)).toBe(true);
        }
        expect(buildingGapFilter(NO_GAP_FILTER)).toBeUndefined();
        expect(gapSignature(NO_GAP_FILTER)).toBe("");
    });

    test("a gap puts the same filter on every pass of every style, and changes the option ids but not the names", () => {
        const gap = { maxScore: 3, missingCategory: "health" as const };
        const plain = buildingStyleOptions();
        const filtered = buildingStyleOptions(gap);
        expect(filtered.map((style) => style.name)).toEqual(plain.map((style) => style.name));
        expect(filtered.every((style, index) => style.id !== plain[index].id)).toBe(true);
        expect(filtered[0].id).toBe(buildingStyleOptionId(STYLE_NAMES.overall, gap));
        for (const style of filtered) {
            for (const layer of style.layers) expect(layer.filter).toEqual(buildingGapFilter(gap));
        }
    });

    test("score and missing-category operands combine with AND and ignore unknown buildings", () => {
        const filter = buildingGapFilter({ maxScore: 2, missingCategory: "food" })!;
        expect(passesFilter(filter, { score_15min: 2, n_food_15min: 0 })).toBe(true);
        expect(passesFilter(filter, { score_15min: 3, n_food_15min: 0 })).toBe(false);
        expect(passesFilter(filter, { score_15min: 1, n_food_15min: 2 })).toBe(false);
        expect(passesFilter(filter, { score_15min: 1 })).toBe(false);
        expect(passesFilter(filter, { n_food_15min: 0 })).toBe(false);
        const scoreOnly = buildingGapFilter({ maxScore: 0, missingCategory: null })!;
        expect(passesFilter(scoreOnly, { score_15min: 0 })).toBe(true);
        expect(passesFilter(scoreOnly, {})).toBe(false);
    });

    test("the filtered layers are still valid against the style spec", () => {
        for (const style of buildingStyleOptions({ maxScore: 4, missingCategory: "park" })) {
            expect(styleErrors(style.layers, ["hamburg_buildings"]), style.name).toEqual([]);
        }
    });
});

describe("POI styles", () => {
    test("each category has a POI entry with its own local circle or area style", () => {
        for (const id of FIFTEEN_MINUTE_CATEGORY_IDS) {
            const entry = fifteenMinuteStory.explore.find((item) => item.key === CATEGORY_FIELDS[id].poiEntryKey);
            expect(entry, id).toBeDefined();
            const bundle = resolveFifteenMinuteStyling(entry!.key)!;
            expect(bundle.styles).toHaveLength(1);
            expect(bundle.styles[0].name).toBe(STYLE_NAMES.poi(id));
            expect(bundle.styles[0].layers[0].type).toBe(id === "park" ? "fill" : "circle");
            expect(bundle.styles[0].layers[0]["source-layer"]).toBe(entry!.layer.layerName);
        }
    });

    test("the nine POI colours are distinct", () => {
        const colors = FIFTEEN_MINUTE_CATEGORY_IDS.map((id) => {
            const layer = resolveFifteenMinuteStyling(CATEGORY_FIELDS[id].poiEntryKey)!.styles[0].layers[0];
            return String(layer.paint?.["circle-color"] ?? layer.paint?.["fill-color"]);
        });
        expect(new Set(colors).size).toBe(9);
    });
});

describe("building profile", () => {
    const full: Record<string, unknown> = { score_15min: 7, score_15min_decay: 81.25, score_confidence: "high" };
    FIFTEEN_MINUTE_CATEGORY_IDS.forEach((id, index) => {
        full[CATEGORY_FIELDS[id].accessField] = index < 7 ? index + 1 : 0;
        if (index < 7) full[CATEGORY_FIELDS[id].walkMinField] = 4.5;
    });

    test("distinguishes accessible, inaccessible and unknown for each of the nine categories", () => {
        const { [CATEGORY_FIELDS.sport.accessField]: _removed, ...withoutSport } = full;
        const profile = buildBuildingProfile(withoutSport);
        expect(profile.categories).toHaveLength(9);
        expect(profile.categories.find((item) => item.id === "food")).toMatchObject({ state: "accessible", places: 1, walkMinutes: 4.5 });
        expect(profile.categories.find((item) => item.id === "park")).toMatchObject({ state: "inaccessible", places: 0, walkMinutes: null });
        expect(profile.categories.find((item) => item.id === "sport")).toMatchObject({ state: "unknown", places: null });
        expect(profile.score).toBe(7);
        expect(profile.decayScore).toBe(81.25);
        expect(profile.confidence).toBe("high");
    });

    test("missing properties give no score and unknown categories, never zeros", () => {
        const profile = buildBuildingProfile({});
        expect(profile.score).toBeNull();
        expect(profile.decayScore).toBeNull();
        expect(profile.categories.every((item) => item.state === "unknown" && item.places === null)).toBe(true);
        expect(buildBuildingProfile(undefined).score).toBeNull();
        expect(buildBuildingProfile({ score_15min: 12 }).score).toBeNull();
    });
});

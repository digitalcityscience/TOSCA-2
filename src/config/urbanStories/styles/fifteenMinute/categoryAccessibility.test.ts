import { describe, expect, test } from "vitest";
import { NO_DATA_COLOR } from "./buildingAccessibility";
import {
    ACCESS_COLORS,
    accessStateOf,
    CATEGORY_FIELDS,
    categoryAccessColorExpression,
    categoryLegendItems,
    missingCategoryFilter,
} from "./categoryAccessibility";
import { FIFTEEN_MINUTE_CATEGORY_IDS } from "./types";
import { colorAt, passesFilter } from "./__fixtures__/evaluate";

describe("category field mappings", () => {
    test("all nine categories map to the verified published attribute names", () => {
        expect(FIFTEEN_MINUTE_CATEGORY_IDS).toHaveLength(9);
        expect(Object.fromEntries(FIFTEEN_MINUTE_CATEGORY_IDS.map((id) => [id, CATEGORY_FIELDS[id].accessField]))).toEqual({
            food: "n_food_15min",
            health: "n_health_15min",
            education: "n_education_15min",
            restaurant: "n_restaurant_15min",
            culture: "n_culture_15min",
            bank_post: "n_bank_post_15min",
            sport: "n_sport_15min",
            park: "n_park_15min",
            stop_any: "n_stop_any_15min",
        });
        expect(CATEGORY_FIELDS.stop_any.walkMinField).toBe("walk_min_stop_any");
        expect(CATEGORY_FIELDS.bank_post.scoreField).toBe("cat_score_bank_post");
    });

    test("every category points at a distinct POI entry key", () => {
        const keys = FIFTEEN_MINUTE_CATEGORY_IDS.map((id) => CATEGORY_FIELDS[id].poiEntryKey);
        expect(new Set(keys).size).toBe(9);
        expect(CATEGORY_FIELDS.stop_any.poiEntryKey).toBe("poi-pt-stops");
        expect(CATEGORY_FIELDS.bank_post.poiEntryKey).toBe("poi-bank-post");
    });

    test("access is never read from the decay score", () => {
        for (const id of FIFTEEN_MINUTE_CATEGORY_IDS) {
            expect(JSON.stringify(categoryAccessColorExpression(id))).not.toContain("cat_score");
        }
    });
});

describe("category access expression", () => {
    test.each(FIFTEEN_MINUTE_CATEGORY_IDS)("%s: places > 0 accessible, 0 inaccessible, missing unknown", (id) => {
        const expression = categoryAccessColorExpression(id);
        const field = CATEGORY_FIELDS[id].accessField;
        expect(colorAt(expression, { [field]: 12 })).toBe(ACCESS_COLORS.accessible);
        expect(colorAt(expression, { [field]: 1 })).toBe(ACCESS_COLORS.accessible);
        expect(colorAt(expression, { [field]: 0 })).toBe(ACCESS_COLORS.inaccessible);
        expect(colorAt(expression, {})).toBe(NO_DATA_COLOR);
    });

    test("only that category's field is read", () => {
        const expression = categoryAccessColorExpression("food");
        expect(colorAt(expression, { n_health_15min: 5 })).toBe(NO_DATA_COLOR);
        expect(colorAt(expression, { n_food_15min: 0, n_health_15min: 5 })).toBe(ACCESS_COLORS.inaccessible);
    });

    test("a building at exactly 15 minutes (places > 0, decay score 0) is accessible", () => {
        expect(colorAt(categoryAccessColorExpression("health"), { n_health_15min: 1, cat_score_health: 0 })).toBe(ACCESS_COLORS.accessible);
    });

    test("invalid values are unknown, not inaccessible", () => {
        const expression = categoryAccessColorExpression("park");
        for (const value of [-1, 1.5, "2", "", true, null, Number.NaN]) {
            expect(colorAt(expression, { n_park_15min: value }), String(value)).toBe(NO_DATA_COLOR);
        }
    });

    test("the three states have three different colours", () => {
        expect(new Set(Object.values(ACCESS_COLORS)).size).toBe(3);
    });

    test("the JS twin and the legend agree with the expression", () => {
        const expression = categoryAccessColorExpression("sport");
        for (const [value, state] of [[3, "accessible"], [0, "inaccessible"], [null, "unknown"], [-2, "unknown"], [0.5, "unknown"]] as const) {
            expect(accessStateOf(value)).toBe(state);
            expect(colorAt(expression, value === null ? {} : { n_sport_15min: value })).toBe(ACCESS_COLORS[state]);
        }
        const [accessible, inaccessible] = categoryLegendItems("sport");
        expect(accessible.color).toBe(colorAt(expression, { n_sport_15min: 2 }));
        expect(inaccessible.color).toBe(colorAt(expression, { n_sport_15min: 0 }));
    });
});

describe("missing-category filter", () => {
    const filter = missingCategoryFilter("culture");

    test("keeps only buildings with n = 0; unknown buildings are not 'missing'", () => {
        expect(passesFilter(filter, { n_culture_15min: 0 })).toBe(true);
        expect(passesFilter(filter, { n_culture_15min: 4 })).toBe(false);
        expect(passesFilter(filter, {})).toBe(false);
        expect(passesFilter(filter, { n_culture_15min: null })).toBe(false);
    });
});

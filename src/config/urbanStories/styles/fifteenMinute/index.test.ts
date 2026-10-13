import { describe, expect, test } from "vitest";
import {
    ACCESS_SCALE,
    ALL_MEASURES,
    BUILDING_3D_FULL_ZOOM,
    BUILDING_3D_START_ZOOM,
    BUILDING_MIN_ZOOM,
    COMFORT_SCALE,
    ENTRY_BUILDINGS,
    ENTRY_STADTTEILE,
    GREEN_SCALE,
    NONE_COLOR,
    NO_DATA_COLOR,
    RAMPS,
    SAFETY_SCALE,
    SHARE_SCALE,
    adminColor,
    adminField,
    adminStyleOptions,
    buildBuildingProfile,
    buildingColor,
    buildingExtrusionHeightExpression,
    buildingStyleOptions,
    categoryMeasure,
    legendFor,
    measureInfo,
    outlineColor,
    resolveFifteenMinuteStyling,
    selectionExtrusionHeightExpression,
    styleNameOf,
    type MeasureId,
} from "./index";
import { colorAt, numberAt, styleErrors } from "./__fixtures__/evaluate";

const BUILDING_FIELD: Record<string, string> = {
    access: "score_15min_decay",
    comfort: "comfort_mean_400m",
    safety: "safety_index_400m",
    green: "score_green",
};

describe("styles", () => {
    test("every measure has a valid building and Stadtteil style with a local name", () => {
        for (const [level, options] of [["building", buildingStyleOptions()], ["admin", adminStyleOptions()]] as const) {
            expect(options.map((option) => option.name)).toEqual(ALL_MEASURES.map((measure) => styleNameOf(level, measure)));
            for (const option of options) {
                expect(option.name.startsWith("frontend:15min:")).toBe(true);
                expect(styleErrors(option.layers, [])).toEqual([]);
            }
        }
    });

    test("the resolver serves the two entries of the story and nothing else", () => {
        expect(resolveFifteenMinuteStyling(ENTRY_BUILDINGS)?.styles).toHaveLength(ALL_MEASURES.length);
        expect(resolveFifteenMinuteStyling(ENTRY_STADTTEILE)?.styles).toHaveLength(ALL_MEASURES.length);
        expect(resolveFifteenMinuteStyling("poi-food")).toBeUndefined();
    });

    test("buildings keep one layer from footprint to 3D and appear from the neighbourhood scale", () => {
        const [first] = buildingStyleOptions();
        const fill = first.layers.find((layer) => layer.type === "fill-extrusion")!;
        expect(first.layers.filter((layer) => layer.type === "fill-extrusion")).toHaveLength(1);
        expect(fill.minzoom).toBe(BUILDING_MIN_ZOOM);
        expect(BUILDING_MIN_ZOOM).toBeGreaterThanOrEqual(11);
        const height = (zoom: number, props: Record<string, unknown>): number => numberAt(buildingExtrusionHeightExpression(), props, zoom);
        expect(height(BUILDING_3D_START_ZOOM, { building_height_m: 20 })).toBe(0);
        expect(height(BUILDING_3D_FULL_ZOOM, { building_height_m: 20 })).toBe(20);
        expect(height(BUILDING_3D_START_ZOOM + 0.75, { building_height_m: 20 })).toBeGreaterThan(0);
        expect(height(BUILDING_3D_START_ZOOM + 0.75, { building_height_m: 20 })).toBeLessThan(20);
    });

    test("the extrusion height is the building's own height, never a score", () => {
        const at = (props: Record<string, unknown>): number => numberAt(buildingExtrusionHeightExpression(), props, 17);
        expect(at({ building_height_m: 12.5, score_15min_decay: 99, comfort_mean_400m: 90 })).toBe(12.5);
        expect(at({ score_15min_decay: 99 })).toBe(0);
        expect(at({ building_height_m: 0, score_15min_decay: 99 })).toBe(0);
        expect(at({ building_height_m: "12" })).toBe(0);
        expect(numberAt(selectionExtrusionHeightExpression(), { height: 10 }, 17)).toBe(10.5);
    });

    test("a low-confidence building gets its own outline colour", () => {
        expect(colorAt(outlineColor(), { score_confidence: "low" })).not.toBe(colorAt(outlineColor(), { score_confidence: "high" }));
        expect(colorAt(outlineColor(), {})).toBe(colorAt(outlineColor(), { score_confidence: "medium" }));
    });
});

describe("colours and legends agree", () => {
    const scaleMeasures: [MeasureId, typeof ACCESS_SCALE][] = [
        ["access", ACCESS_SCALE], ["comfort", COMFORT_SCALE], ["safety", SAFETY_SCALE], ["green", GREEN_SCALE],
    ];

    test.each(scaleMeasures)("%s: each class colour is drawn inside its class limits", (measure, scale) => {
        const field = BUILDING_FIELD[measure];
        const inside = (index: number): number => {
            const lower = index === 0 ? scale.limits[0] - 5 : scale.limits[index - 1];
            const upper = index === scale.colors.length - 1 ? scale.limits[scale.limits.length - 1] + 5 : scale.limits[index];
            return (lower + upper) / 2 + (index === 0 && measure === "green" ? 0 : 0);
        };
        scale.colors.forEach((color, index) => {
            expect(colorAt(buildingColor(measure), { [field]: inside(index) })).toBe(color);
        });
        // The lower limit belongs to the upper class.
        scale.limits.forEach((limit, index) => {
            expect(colorAt(buildingColor(measure), { [field]: limit })).toBe(scale.colors[index + 1]);
        });
    });

    test.each(ALL_MEASURES.map((measure) => [measure]))("%s: missing and non-numeric values are never drawn as the lowest class", (measure) => {
        const info = measureInfo(measure);
        expect(colorAt(buildingColor(measure), {})).toBe(NO_DATA_COLOR);
        expect(colorAt(buildingColor(measure), { [info.field]: null })).toBe(NO_DATA_COLOR);
        expect(colorAt(buildingColor(measure), { [info.field]: "12" })).toBe(NO_DATA_COLOR);
        expect(colorAt(adminColor(measure), {})).toBe(NO_DATA_COLOR);
        expect(colorAt(adminColor(measure), { [adminField(measure)]: null })).toBe(NO_DATA_COLOR);
    });

    test("a real zero of the green score is its own class; no value is not zero", () => {
        expect(colorAt(buildingColor("green"), { score_green: 0 })).toBe(NONE_COLOR);
        expect(colorAt(buildingColor("green"), { score_green: 0.5 })).toBe(RAMPS.green[0]);
        expect(colorAt(buildingColor("green"), {})).toBe(NO_DATA_COLOR);
        const legend = legendFor("building", "green");
        expect(legend.items[0].color).toBe(NONE_COLOR);
        expect(legend.items).toHaveLength(GREEN_SCALE.colors.length + 1);
    });

    test("category colours separate none within 15 minutes from not computable", () => {
        const colour = (props: Record<string, unknown>): string => colorAt(buildingColor(categoryMeasure("culture")), props);
        expect(colour({ n_culture_15min: 0 })).toBe(NONE_COLOR);
        expect(colour({})).toBe(NO_DATA_COLOR);
        expect(colour({ n_culture_15min: 3, walk_min_culture: 4.9 })).toBe(RAMPS.minutes[0]);
        expect(colour({ n_culture_15min: 3, walk_min_culture: 5 })).toBe(RAMPS.minutes[0]);
        expect(colour({ n_culture_15min: 3, walk_min_culture: 5.01 })).toBe(RAMPS.minutes[1]);
        expect(colour({ n_culture_15min: 3, walk_min_culture: 10 })).toBe(RAMPS.minutes[1]);
        expect(colour({ n_culture_15min: 3, walk_min_culture: 14.9 })).toBe(RAMPS.minutes[2]);
        const legend = legendFor("building", categoryMeasure("culture"));
        expect(legend.items.map((item) => item.color)).toEqual([...RAMPS.minutes, NONE_COLOR]);
    });

    test("the share of buildings reaching a category: zero is its own class", () => {
        const colour = (value: unknown): string => colorAt(adminColor(categoryMeasure("culture")), { m15_share_culture: value });
        expect(colour(0)).toBe(NONE_COLOR);
        expect(colour(0.05)).toBe(SHARE_SCALE.colors[0]);
        expect(colour(0.2)).toBe(SHARE_SCALE.colors[1]);
        expect(colour(1)).toBe(SHARE_SCALE.colors[4]);
        expect(legendFor("admin", categoryMeasure("culture")).items).toHaveLength(SHARE_SCALE.colors.length + 1);
    });

    test("official park minutes use five classes without a cut-off", () => {
        const colour = (value: number): string => colorAt(buildingColor("green-park"), { walk_min_dgp_park: value });
        expect([3, 8, 12, 20, 104].map(colour)).toEqual([...RAMPS.greenMinutes]);
        expect(legendFor("building", "green-park").items.map((item) => item.color)).toEqual([...RAMPS.greenMinutes]);
    });

    test.each(ALL_MEASURES.map((measure) => [measure]))("%s: legend rows use the colours the expression can draw", (measure) => {
        for (const level of ["building", "admin"] as const) {
            const legend = legendFor(level, measure);
            expect(legend.styleName).toBe(styleNameOf(level, measure));
            expect(legend.items.length).toBeGreaterThan(2);
            expect(new Set(legend.items.map((item) => item.color)).size).toBe(legend.items.length);
            expect(legend.items.map((item) => item.color)).not.toContain(legend.noData.color);
        }
    });

    test("a higher comfort, safety or accessibility value is never lighter than a lower one", () => {
        const luminance = (hex: string): number => {
            const channel = (offset: number): number => {
                const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
                return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
            };
            return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
        };
        for (const colors of [ACCESS_SCALE.colors, COMFORT_SCALE.colors, SAFETY_SCALE.colors, RAMPS.teal, RAMPS.green]) {
            for (let index = 1; index < colors.length; index++) expect(luminance(colors[index])).toBeLessThan(luminance(colors[index - 1]));
        }
    });
});

describe("building profile", () => {
    test("reads values, keeps missing values missing and tells none from unknown", () => {
        const profile = buildBuildingProfile({
            gml_id: "DEHHALKAP0000rWE", is_residential: true, score_15min: 9, score_15min_decay: 72.79, comfort_mean_400m: 59.08,
            comfort_scored_share_400m: 1, safety_index_400m: 30.42, score_green: 0, n_culture_15min: 0, walk_min_culture: null,
            n_food_15min: 4, walk_min_food: 3.5, building_height_m: 9.77,
        });
        expect(profile.id).toBe("DEHHALKAP0000rWE");
        expect(profile.count).toBe(9);
        expect(profile.decay).toBe(72.79);
        expect(profile.green).toBe(0);
        expect(profile.comfort).toBe(59.08);
        expect(profile.dgpPark).toBeNull();
        expect(profile.categories.find((item) => item.id === "culture")?.state).toBe("none");
        expect(profile.categories.find((item) => item.id === "food")).toMatchObject({ state: "within", walkMinutes: 3.5 });
        expect(profile.categories.find((item) => item.id === "sport")?.state).toBe("unknown");
    });

    test("reads WFS records the same way (nulls and strings)", () => {
        const profile = buildBuildingProfile({ gml_id: "x", is_residential: "false", score_15min: null, comfort_mean_400m: null, comfort_null_reason_400m: "connector_exceeds_radius" });
        expect(profile.residential).toBe(false);
        expect(profile.count).toBeNull();
        expect(profile.comfort).toBeNull();
        expect(profile.comfortReason).toBe("connector_exceeds_radius");
    });
});

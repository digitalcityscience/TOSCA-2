import { describe, expect, test } from "vitest";
import { colorAt, numberAt, styleErrors } from "../fifteenMinute/__fixtures__/evaluate";
import {
    adminOutsideLegend,
    agreementClassOf,
    AGREEMENT_COLORS,
    agreementColorExpression,
    buildBuildingProfile,
    buildingLegend,
    buildingStyleOptionId,
    buildingStyleOptions,
    BUILDING_3D_FULL_ZOOM,
    BUILDING_3D_START_ZOOM,
    buildingExtrusionHeightExpression,
    coverageColorExpression,
    COVERAGE_COLORS,
    criteriaActive,
    criteriaColorExpression,
    criteriaCql,
    criteriaSignature,
    DEPARTURE_CLASSES,
    DEPARTURE_INCOMPLETE_COLOR,
    DEPARTURE_ZERO_COLOR,
    departuresColorExpression,
    MATCH_COLOR,
    matchesCriteria,
    NO_CRITERIA,
    NO_DATA_AREA_COLOR,
    NO_DATA_COLOR,
    NO_MATCH_COLOR,
    OTHER_BUILDING_COLOR,
    outsideShareColorExpression,
    OUTSIDE_SHARE_STOPS,
    resolveEquityStyling,
    selectionExtrusionHeightExpression,
    stopsLegend,
    WALK_THRESHOLD_MIN,
    type Criteria,
} from "./index";

const housing = { building_function_code: 1000, pt_district_match: "contains", origin_quality: "good", pt_departures_complete: true };
const residential = (extra: Record<string, unknown>): Record<string, unknown> => ({ ...housing, ...extra });

describe("coverage view", () => {
    const expression = coverageColorExpression();

    test("inside and outside have their own colours, in the boolean and in the string encoding", () => {
        expect(colorAt(expression, residential({ pt_in_catchment_any: true }))).toBe(COVERAGE_COLORS.inside);
        expect(colorAt(expression, residential({ pt_in_catchment_any: "true" }))).toBe(COVERAGE_COLORS.inside);
        expect(colorAt(expression, residential({ pt_in_catchment_any: false }))).toBe(COVERAGE_COLORS.outside);
        expect(colorAt(expression, residential({ pt_in_catchment_any: "false" }))).toBe(COVERAGE_COLORS.outside);
    });

    test("buildings outside the residential statistic are pale context in every view, not a class colour", () => {
        const other = { building_function_code: 2000, pt_district_match: "contains", pt_in_catchment_any: false };
        const nearest = { ...housing, pt_district_match: "nearest", pt_in_catchment_any: false };
        for (const expression of [coverageColorExpression(), agreementColorExpression(), departuresColorExpression(), criteriaColorExpression(NO_CRITERIA)]) {
            expect(colorAt(expression, other)).toBe(OTHER_BUILDING_COLOR);
            expect(colorAt(expression, nearest)).toBe(OTHER_BUILDING_COLOR);
        }
    });

    test("the same colour is drawn at city, neighbourhood and 3D zoom: 2D and 3D share one expression", () => {
        for (const zoom of [11, 13, 15, 17]) {
            expect(colorAt(expression, residential({ pt_in_catchment_any: false }), zoom)).toBe(COVERAGE_COLORS.outside);
        }
    });
});

describe("agreement view", () => {
    const expression = agreementColorExpression();
    const base = (inside: boolean, walk: number | undefined, origin = "good"): Record<string, unknown> => residential({
        pt_in_catchment_any: inside, origin_quality: origin, ...(walk === undefined ? {} : { walk_min_stop_any: walk }),
    });

    test("four classes follow the threshold, boundary included", () => {
        expect(colorAt(expression, base(true, WALK_THRESHOLD_MIN))).toBe(AGREEMENT_COLORS.both);
        expect(colorAt(expression, base(true, WALK_THRESHOLD_MIN + 0.01))).toBe(AGREEMENT_COLORS.officialOnly);
        expect(colorAt(expression, base(true, undefined))).toBe(AGREEMENT_COLORS.officialOnly);
        expect(colorAt(expression, base(false, 2))).toBe(AGREEMENT_COLORS.walkingOnly);
        expect(colorAt(expression, base(false, 9))).toBe(AGREEMENT_COLORS.neither);
        expect(colorAt(expression, base(false, undefined))).toBe(AGREEMENT_COLORS.neither);
    });

    test("a building without a walking origin is missing data, never one of the four classes", () => {
        expect(colorAt(expression, base(true, undefined, "none"))).toBe(NO_DATA_COLOR);
        expect(Object.values(AGREEMENT_COLORS)).not.toContain(NO_DATA_COLOR);
    });

    test("the four classes are distinct", () => {
        expect(new Set(Object.values(AGREEMENT_COLORS)).size).toBe(4);
    });

    test("the JS twin gives the same class as the expression", () => {
        const cases: [boolean, number | undefined, string][] = [[true, 3, "both"], [true, 8, "officialOnly"], [false, 5, "walkingOnly"], [false, undefined, "neither"]];
        for (const [inside, walk, expected] of cases) {
            expect(agreementClassOf(base(inside, walk))).toBe(expected);
        }
        expect(agreementClassOf(base(true, 1, "none"))).toBe("no-origin");
    });
});

describe("departures view", () => {
    const expression = departuresColorExpression();
    const withDepartures = (value: number | undefined, complete = true): Record<string, unknown> => residential({
        pt_departures_complete: complete, ...(value === undefined ? {} : { pt_departures_daily_sum: value }),
    });

    test("zero is its own real class and is not the colour of missing data", () => {
        expect(colorAt(expression, withDepartures(0))).toBe(DEPARTURE_ZERO_COLOR);
        expect(colorAt(expression, withDepartures(undefined))).toBe(NO_DATA_COLOR);
        expect(DEPARTURE_ZERO_COLOR).not.toBe(NO_DATA_COLOR);
    });

    test("every class is drawn from its first to its last value and the legend lists the same colours", () => {
        for (const item of DEPARTURE_CLASSES) {
            expect(colorAt(expression, withDepartures(item.min)), `${item.min}`).toBe(item.color);
            if (item.max !== null) expect(colorAt(expression, withDepartures(item.max)), `${item.max}`).toBe(item.color);
        }
        const legendColors = buildingLegend("departures").rows.map((row) => row.color);
        expect(legendColors).toEqual([DEPARTURE_ZERO_COLOR, ...DEPARTURE_CLASSES.map((item) => item.color)]);
    });

    test("incomplete data (a lower bound) never gets a class colour", () => {
        expect(colorAt(expression, withDepartures(50, false))).toBe(DEPARTURE_INCOMPLETE_COLOR);
        expect(colorAt(expression, withDepartures(5000, false))).toBe(DEPARTURE_INCOMPLETE_COLOR);
    });

    test("the classes form one sequential ramp: lightness falls from the lowest to the highest class", () => {
        const lightness = (hex: string): number => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
        const values = DEPARTURE_CLASSES.map((item) => lightness(item.color));
        for (let index = 1; index < values.length; index += 1) expect(values[index]).toBeLessThan(values[index - 1]);
    });
});

describe("outside-share choropleth", () => {
    const expression = outsideShareColorExpression("ptr_resid_uncovered_share");

    test("each ramp stop is drawn with its colour; null and missing are grey, not the colour of zero", () => {
        for (const stop of OUTSIDE_SHARE_STOPS) {
            expect(colorAt(expression, { ptr_resid_uncovered_share: stop.value })).toBe(stop.color);
        }
        expect(colorAt(expression, {})).toBe(NO_DATA_AREA_COLOR);
        expect(colorAt(expression, { ptr_resid_uncovered_share: null })).toBe(NO_DATA_AREA_COLOR);
        expect(colorAt(expression, { ptr_resid_uncovered_share: 0 })).not.toBe(NO_DATA_AREA_COLOR);
    });

    test("the legend gradient stops are exactly the expression stops", () => {
        const legend = adminOutsideLegend();
        expect(legend.kind).toBe("gradient");
        expect(legend.gradient?.map((stop) => stop.color)).toEqual(OUTSIDE_SHARE_STOPS.map((stop) => stop.color));
        expect(legend.special[0].color).toBe(NO_DATA_AREA_COLOR);
    });
});

describe("criteria", () => {
    const criteria = (patch: Partial<Criteria>): Criteria => ({ ...NO_CRITERIA, ...patch });
    // A vector tile omits a NULL property; an `undefined` here means "left out".
    const building = (extra: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(Object.entries(
        residential({ pt_in_catchment_any: true, walk_min_stop_any: 4, pt_departures_daily_sum: 120, pt_line_n_unique: 2, stadtteil_code: "413", ...extra })
    ).filter(([, value]) => value !== undefined));

    test("matching buildings are highlighted, other housing is dimmed, and the JS twin agrees", () => {
        const cases: [Partial<Criteria>, Record<string, unknown>, boolean][] = [
            [{ coverage: "outside" }, building({ pt_in_catchment_any: false }), true],
            [{ coverage: "outside" }, building({}), false],
            [{ coverage: "inside" }, building({}), true],
            [{ walkMoreThan: 6 }, building({ walk_min_stop_any: 7 }), true],
            [{ walkMoreThan: 6 }, building({ walk_min_stop_any: 6 }), false],
            [{ walkMoreThan: 6 }, building({ walk_min_stop_any: undefined }), true],
            [{ walkMoreThan: 6 }, building({ walk_min_stop_any: undefined, origin_quality: "none" }), false],
            [{ departuresAtMost: 100 }, building({ pt_departures_daily_sum: 100 }), true],
            [{ departuresAtMost: 100 }, building({ pt_departures_daily_sum: 101 }), false],
            [{ departuresAtMost: 100 }, building({ pt_departures_daily_sum: 10, pt_departures_complete: false }), false],
            [{ linesAtMost: 1 }, building({ pt_line_n_unique: 1 }), true],
            [{ linesAtMost: 1 }, building({ pt_line_n_unique: 2 }), false],
            [{ area: "413" }, building({}), true],
            [{ area: "411" }, building({}), false],
            [{ coverage: "outside", departuresAtMost: 0 }, building({ pt_in_catchment_any: false, pt_departures_daily_sum: 0 }), true],
            [{ coverage: "outside", departuresAtMost: 0 }, building({ pt_in_catchment_any: true, pt_departures_daily_sum: 0 }), false],
        ];
        for (const [patch, props, expected] of cases) {
            const active = criteria(patch);
            expect(colorAt(criteriaColorExpression(active), props), JSON.stringify(patch)).toBe(expected ? MATCH_COLOR : NO_MATCH_COLOR);
            expect(matchesCriteria(props, active), JSON.stringify(patch)).toBe(expected);
        }
    });

    test("the signature identifies the criteria, the CQL carries the same conditions", () => {
        expect(criteriaSignature(NO_CRITERIA)).toBe("");
        expect(criteriaActive(NO_CRITERIA)).toBe(false);
        const active = criteria({ coverage: "outside", walkMoreThan: 9, departuresAtMost: 100, linesAtMost: 2, area: "413" });
        expect(criteriaActive(active)).toBe(true);
        expect(criteriaSignature(active)).toBe("cov=outside,walk>9,dep<=100,lines<=2,area=413");
        const cql = criteriaCql(active);
        for (const part of ["stadtteil_code='413'", "pt_in_catchment_any=false", "walk_min_stop_any>9", "walk_min_stop_any IS NULL", "pt_departures_daily_sum<=100", "pt_departures_complete=true", "pt_line_n_unique<=2"]) {
            expect(cql).toContain(part);
        }
        expect(criteriaCql(NO_CRITERIA)).toBe("");
    });

    test("every criteria view gets its own style id and the others stay unchanged", () => {
        expect(buildingStyleOptionId("criteria", criteria({ coverage: "outside" }))).not.toBe(buildingStyleOptionId("criteria", NO_CRITERIA));
        expect(buildingStyleOptionId("coverage", criteria({ coverage: "outside" }))).toBe("frontend:equity:building:coverage");
    });
});

describe("style layers", () => {
    test("building styles validate against the MapLibre style spec and carry the story's zoom floor", () => {
        for (const entryKey of ["buildings-pt", "stadtteile-pt", "units-pt"]) {
            const bundle = resolveEquityStyling(entryKey)!;
            expect(bundle).toBeDefined();
            const layers = bundle.styles.flatMap((style) => style.layers);
            expect(styleErrors(layers, [])).toEqual([]);
        }
        const buildings = resolveEquityStyling("buildings-pt")!.styles;
        expect(buildings.map((style) => style.name)).toEqual(buildingStyleOptions().map((style) => style.name));
        for (const style of buildings) {
            expect(style.layers.every((layer) => layer.minzoom === 11)).toBe(true);
            expect(style.layers.some((layer) => layer.type === "fill-extrusion")).toBe(true);
        }
        expect(resolveEquityStyling("unknown")).toBeUndefined();
    });

    test("one layer per view: footprints are flat up to the 3D start zoom and reach their real height at the full zoom", () => {
        const height = buildingExtrusionHeightExpression();
        expect(numberAt(height, { building_height_m: 20 }, BUILDING_3D_START_ZOOM - 1)).toBe(0);
        expect(numberAt(height, { building_height_m: 20 }, BUILDING_3D_START_ZOOM)).toBe(0);
        expect(numberAt(height, { building_height_m: 20 }, BUILDING_3D_FULL_ZOOM)).toBe(20);
        expect(numberAt(height, { building_height_m: 20 }, BUILDING_3D_FULL_ZOOM + 2)).toBe(20);
        // No height means flat; nothing is estimated.
        for (const props of [{}, { building_height_m: null }, { building_height_m: 0 }, { building_height_m: -3 }]) {
            expect(numberAt(height, props, 17)).toBe(0);
        }
        expect(numberAt(selectionExtrusionHeightExpression(), { height: 20 }, BUILDING_3D_FULL_ZOOM)).toBe(20.5);
        expect(numberAt(selectionExtrusionHeightExpression(), { height: 20 }, 12)).toBe(0);
    });

    test("the admin styles keep their outline at every zoom and fade only the fill", () => {
        const [style] = resolveEquityStyling("stadtteile-pt")!.styles;
        const outline = style.layers.find((layer) => layer.type === "line")!;
        expect(outline.minzoom).toBeUndefined();
        expect(outline.maxzoom).toBeUndefined();
        const fill = style.layers.find((layer) => layer.type === "fill")!;
        expect(fill.maxzoom).toBeUndefined();
    });

    test("every view has a legend whose rows are colours the expression can draw", () => {
        for (const view of ["coverage", "agreement", "departures", "criteria"] as const) {
            const legend = buildingLegend(view);
            expect(legend.rows.length).toBeGreaterThan(0);
            expect(legend.note.en.length).toBeGreaterThan(20);
            expect(legend.note.de.length).toBeGreaterThan(20);
        }
        expect(stopsLegend().rows).toHaveLength(3);
    });
});

describe("building profile", () => {
    test("reads a tile feature without turning missing values into zero", () => {
        const profile = buildBuildingProfile({ gml_id: "A", ...housing, pt_in_catchment_any: "true", walk_min_stop_any: 4.5, pt_departures_daily_sum: 0, pt_line_n_unique: 0 });
        expect(profile).toMatchObject({ id: "A", residential: true, inCatchment: true, walkState: "minutes", walkMin: 4.5, departures: 0, lines: 0, departuresComplete: true, agreement: "both" });
        const missing = buildBuildingProfile({ ...housing, pt_in_catchment_any: false });
        expect(missing).toMatchObject({ walkState: "none-within-15", walkMin: null, departures: null, lines: null, agreement: "neither" });
        expect(buildBuildingProfile({ ...housing, origin_quality: "none", pt_in_catchment_any: false }).walkState).toBe("no-origin");
        expect(buildBuildingProfile({ ...housing, pt_departures_complete: "false", pt_departures_daily_sum: 4 }).departuresComplete).toBe(false);
        expect(buildBuildingProfile(undefined)).toMatchObject({ residential: false, inCatchment: null, departures: null });
    });
});

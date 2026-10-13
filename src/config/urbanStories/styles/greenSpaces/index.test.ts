import { describe, expect, test } from "vitest";
import {
    AREA_CLASSES,
    AREA_CLASS_INFO,
    AREA_STYLES,
    BUILDING_3D_FULL_ZOOM,
    BUILDING_3D_START_ZOOM,
    BUILDING_MIN_ZOOM,
    ENTRY_AREAS,
    ENTRY_BUILDINGS,
    ENTRY_STADTTEILE,
    FEATURE_GROUPS,
    FRONTEND_PREFIX,
    MINUTE_COLORS,
    MINUTE_LIMITS,
    MISSING_COLOR,
    NO_ORIGIN_COLOR,
    ZERO_SHARE_COLOR,
    RECREATIONAL_SHARE_SCALE,
    SCENE_KEYS,
    accessValue,
    adminColor,
    adminLegend,
    areaClassColor,
    areaLegend,
    buildBuildingProfile,
    buildingExtrusionHeightExpression,
    buildingLegend,
    buildingMinutesColor,
    featureGroupColor,
    featureLegend,
    formatArea,
    formatMinutes,
    minuteItems,
    planFor,
    resolveGreenSpacesStyling,
    shareItems,
    styleNamesFor,
    buildingMeasureOf,
    adminMeasureOf,
    type PlanState,
    type SceneKey,
} from "./index";
import { colorAt, numberAt, styleErrors } from "../fifteenMinute/__fixtures__/evaluate";

const ENTRIES = ["green-areas", "green-features-polygon", "green-features-line", "green-features-point", "park-pois", ENTRY_BUILDINGS, ENTRY_STADTTEILE];

/** MapLibre only accepts zoom as the input of a top-level interpolate or step; a nested one makes the layer fail to add. */
function zoomMisuse(value: unknown, topLevel = true): boolean {
    if (!Array.isArray(value)) return false;
    if (value[0] === "zoom") return !topLevel;
    const allowed = topLevel && (value[0] === "interpolate" || value[0] === "step" || value[0] === "interpolate-hcl" || value[0] === "interpolate-lab");
    return value.some((part, index) => zoomMisuse(part, allowed && index === (value[0] === "step" ? 1 : 2) ? true : false) && !(allowed && Array.isArray(part) && part[0] === "zoom"));
}

describe("styles", () => {
    test.each(ENTRIES)("%s: every look is a valid MapLibre style with a local name and a hidden default or a visible one", (entryKey) => {
        const bundle = resolveGreenSpacesStyling(entryKey)!;
        expect(bundle.styles.length).toBeGreaterThan(1);
        expect(bundle.styles.some((style) => style.id === bundle.defaultStyleId)).toBe(true);
        for (const style of bundle.styles) {
            expect(style.name.startsWith(FRONTEND_PREFIX)).toBe(true);
            expect(style.id).toBe(style.name);
            expect(styleErrors(style.layers, [])).toEqual([]);
            for (const layer of style.layers) {
                expect(zoomMisuse(layer.paint ?? {})).toBe(false);
                expect(zoomMisuse(layer.layout ?? {})).toBe(false);
            }
        }
    });

    test("the resolver serves the seven entries of the story and nothing else", () => {
        expect(resolveGreenSpacesStyling("buildings-15min")).toBeUndefined();
        expect(resolveGreenSpacesStyling("poi-food")).toBeUndefined();
    });

    test("a hidden look matches no feature and keeps the zoom floor of heavy layers", () => {
        for (const entryKey of ["green-features-polygon", ENTRY_BUILDINGS]) {
            const none = resolveGreenSpacesStyling(entryKey)!.styles.find((style) => style.name.endsWith(":none"))!;
            expect(none.layers).toHaveLength(1);
            expect(none.layers[0].minzoom).toBeGreaterThanOrEqual(11);
            expect(none.id).toBe(resolveGreenSpacesStyling(entryKey)!.defaultStyleId);
        }
    });

    test("buildings keep one layer from footprint to 3D, appear from the neighbourhood scale and use the real height", () => {
        const park = resolveGreenSpacesStyling(ENTRY_BUILDINGS)!.styles.find((style) => style.name.endsWith(":park"))!;
        const extrusions = park.layers.filter((layer) => layer.type === "fill-extrusion");
        expect(extrusions).toHaveLength(1);
        expect(extrusions[0].minzoom).toBe(BUILDING_MIN_ZOOM);
        const height = (zoom: number, props: Record<string, unknown>): number => numberAt(buildingExtrusionHeightExpression(), props, zoom);
        expect(height(BUILDING_3D_START_ZOOM, { building_height_m: 20 })).toBe(0);
        expect(height(BUILDING_3D_FULL_ZOOM, { building_height_m: 20 })).toBe(20);
        // The walking time is a colour, never the height.
        expect(height(17, { walk_min_dgp_park: 30 })).toBe(0);
        expect(height(17, { building_height_m: 9, walk_min_dgp_park: 30 })).toBe(9);
    });

    test("park and playground buildings share the 2D and 3D colour: one expression", () => {
        const styles = resolveGreenSpacesStyling(ENTRY_BUILDINGS)!.styles;
        for (const measure of ["park", "playground"]) {
            const style = styles.find((candidate) => candidate.name.endsWith(`:${measure}`))!;
            const fill = style.layers.find((layer) => layer.type === "fill-extrusion")!;
            expect(fill.paint?.["fill-extrusion-color"]).toEqual(buildingMinutesColor(measure as "park" | "playground"));
        }
    });
});

describe("categorical land use", () => {
    test("every class has its own colour and a legend row of that colour", () => {
        const colors = AREA_CLASSES.map((id) => AREA_CLASS_INFO[id].color);
        expect(new Set(colors).size).toBe(AREA_CLASSES.length);
        const legend = areaLegend("classes")!;
        for (const id of AREA_CLASSES) {
            expect(colorAt(areaClassColor(), { area_class: id })).toBe(AREA_CLASS_INFO[id].color);
            expect(legend.items.some((item) => item.color === AREA_CLASS_INFO[id].color)).toBe(true);
        }
        expect(colorAt(areaClassColor(), { area_class: "unknown" })).not.toBe(AREA_CLASS_INFO.recreational_park.color);
    });

    test("parks are green, playgrounds an accent colour, and only parks and playgrounds are recreational", () => {
        expect(AREA_CLASS_INFO.recreational_park.color).not.toBe(AREA_CLASS_INFO.playground.color);
        expect(AREA_CLASSES.filter((id) => AREA_CLASS_INFO[id].recreational)).toEqual(["recreational_park", "playground"]);
        expect(AREA_CLASS_INFO.allotment.recreational).toBe(false);
        expect(AREA_CLASS_INFO.cemetery.recreational).toBe(false);
    });

    test("every detailed feature group has one colour and the legend lists them all", () => {
        expect(new Set(FEATURE_GROUPS.map((group) => group.color)).size).toBe(FEATURE_GROUPS.length);
        for (const group of FEATURE_GROUPS) expect(colorAt(featureGroupColor(), { category_code_0: group.code })).toBe(group.color);
        // The vector tiles deliver the smallint category code as a string.
        for (const group of FEATURE_GROUPS) expect(colorAt(featureGroupColor(), { category_code_0: String(group.code) })).toBe(group.color);
        expect(featureLegend("all")!.items).toHaveLength(FEATURE_GROUPS.length);
        expect(featureLegend("none")).toBeUndefined();
        expect(featureLegend("play")!.items).toHaveLength(1);
    });

    test("every area look but the hidden one has a legend", () => {
        for (const style of AREA_STYLES) expect(areaLegend(style) === undefined).toBe(style === "none");
    });
});

describe("walking minutes", () => {
    const classes: [number, number][] = [[2, 0], [5, 0], [5.01, 1], [10, 1], [12, 2], [15, 2], [20, 3], [30, 3], [30.1, 4], [64, 4]];

    test.each(classes)("%s min is class %s of the one shared scale", (minutes, index) => {
        for (const measure of ["park", "playground"] as const) {
            const field = measure === "park" ? "walk_min_dgp_park" : "walk_min_dgp_playground";
            expect(colorAt(buildingMinutesColor(measure), { [field]: minutes, [`dgp_${measure}_status`]: "ok" })).toBe(MINUTE_COLORS[index]);
        }
        expect(colorAt(adminColor("park"), { dgp_park_median_min: minutes })).toBe(MINUTE_COLORS[index]);
        expect(colorAt(adminColor("playground"), { dgp_playground_median_min: minutes })).toBe(MINUTE_COLORS[index]);
    });

    test("the ramp is sequential: a longer walk is never lighter", () => {
        const luminance = (hex: string): number => [1, 3, 5].reduce((sum, offset, i) => sum + parseInt(hex.slice(offset, offset + 2), 16) * [0.2126, 0.7152, 0.0722][i], 0);
        for (let i = 1; i < MINUTE_COLORS.length; i += 1) expect(luminance(MINUTE_COLORS[i])).toBeLessThan(luminance(MINUTE_COLORS[i - 1]));
    });

    test("the legend rows are the expression's classes, in order, and the scale is not capped at 15 minutes", () => {
        const items = minuteItems();
        expect(items.map((item) => item.color)).toEqual([...MINUTE_COLORS]);
        expect(items).toHaveLength(MINUTE_LIMITS.length + 1);
        expect(items[items.length - 1].label.en).toBe(`over ${MINUTE_LIMITS[MINUTE_LIMITS.length - 1]} min`);
        expect(MINUTE_LIMITS[MINUTE_LIMITS.length - 1]).toBeGreaterThan(15);
        expect(buildingLegend("park").items.map((item) => item.color)).toEqual(adminLegend("park").items.map((item) => item.color));
        expect(buildingLegend("playground").items.map((item) => item.color)).toEqual(buildingLegend("park").items.map((item) => item.color));
    });

    test("park and playground read their own field and are never combined", () => {
        expect(colorAt(buildingMinutesColor("park"), { walk_min_dgp_park: 2, walk_min_dgp_playground: 40 })).toBe(MINUTE_COLORS[0]);
        expect(colorAt(buildingMinutesColor("playground"), { walk_min_dgp_park: 2, walk_min_dgp_playground: 40 })).toBe(MINUTE_COLORS[4]);
        // score_green is another definition and is not read.
        expect(colorAt(buildingMinutesColor("park"), { score_green: 100 })).toBe(MISSING_COLOR);
    });

    test("no walking origin, a missing value and a real zero are three different things", () => {
        expect(colorAt(buildingMinutesColor("park"), { dgp_park_status: "no_origin" })).toBe(NO_ORIGIN_COLOR);
        expect(colorAt(buildingMinutesColor("park"), {})).toBe(MISSING_COLOR);
        expect(colorAt(buildingMinutesColor("park"), { walk_min_dgp_park: "3" })).toBe(MISSING_COLOR);
        expect(colorAt(buildingMinutesColor("park"), { walk_min_dgp_park: 0, dgp_park_status: "ok" })).toBe(MINUTE_COLORS[0]);
        expect(NO_ORIGIN_COLOR).not.toBe(MISSING_COLOR);
        expect(colorAt(adminColor("park"), {})).toBe(MISSING_COLOR);
        expect(buildingLegend("park").noData.map((row) => row.color)).toEqual([NO_ORIGIN_COLOR, MISSING_COLOR]);
    });

    test("profiles keep a missing time missing and read the published status", () => {
        expect(accessValue(null, "no_origin")).toEqual({ minutes: null, status: "no_origin", state: "no-origin" });
        expect(accessValue(undefined, undefined).state).toBe("missing");
        expect(accessValue(0, "ok")).toEqual({ minutes: 0, status: "ok", state: "ok" });
        expect(accessValue(4.5, "no_origin").state).toBe("ok");
        const profile = buildBuildingProfile({ gml_id: "X", is_residential: true, walk_min_dgp_park: 2, walk_min_dgp_playground: 9, dgp_park_status: "ok", dgp_playground_status: "ok", building_height_m: 8 });
        expect(profile.park.minutes).toBe(2);
        expect(profile.playground.minutes).toBe(9);
        expect(formatMinutes(null, "en")).toBe("–");
        expect(formatMinutes(2.46, "en")).toBe("2.5 min");
        expect(formatArea(238773, "en")).toBe("23.9 ha");
        expect(formatArea(1629, "en")).toBe("1,629 m²");
    });
});

describe("coverage shares", () => {
    test("a valid zero is its own class, no value is not zero, and the legend matches", () => {
        const colour = (props: Record<string, unknown>): string => colorAt(adminColor("coverage-recreational"), props);
        expect(colour({ cov_dgp_recreational_share: 0 })).toBe(ZERO_SHARE_COLOR);
        expect(colour({})).toBe(MISSING_COLOR);
        const { limits, colors } = RECREATIONAL_SHARE_SCALE;
        expect(colour({ cov_dgp_recreational_share: 0.001 })).toBe(colors[0]);
        limits.forEach((limit, index) => expect(colour({ cov_dgp_recreational_share: limit })).toBe(colors[index + 1]));
        expect(shareItems(RECREATIONAL_SHARE_SCALE).map((item) => item.color)).toEqual([ZERO_SHARE_COLOR, ...colors]);
    });

    test("coverage and walking time never share a legend", () => {
        expect(adminLegend("coverage-green").items.map((item) => item.color)).not.toEqual(adminLegend("park").items.map((item) => item.color));
        expect(adminLegend("large-green").title.en).not.toBe(adminLegend("coverage-recreational").title.en);
    });
});

describe("scene plans", () => {
    const state: PlanState = { theme: "classes", coverage: "coverage-recreational", compare: "park", zoom: 10 };
    const plan = (scene: SceneKey, over: Partial<PlanState> = {}) => planFor(scene, { ...state, ...over });

    test("there are exactly six scenes, in order", () => {
        expect(SCENE_KEYS).toHaveLength(6);
        expect(planFor(undefined, state).buildings).toBe("none");
    });

    test("scene 1 shows the classes only; the heavy layers are hidden", () => {
        expect(plan("what-counts-as-a-park")).toEqual({ areas: "classes", features: "none", pois: "none", buildings: "none", admin: "outline" });
    });

    test("scene 2 shows one park's detailed objects through its dgp_idnr", () => {
        const p = plan("inside-the-park");
        expect([p.areas, p.features]).toEqual(["focus-park", "focus"]);
        expect(buildingMeasureOf(p)).toBeUndefined();
    });

    test("scene 3 is about parks and scene 4 about playgrounds, never mixed", () => {
        const three = plan("park-nearby-how-far");
        const four = plan("where-can-children-play");
        expect([three.buildings, three.admin, three.areas]).toEqual(["park", "park", "parks-only"]);
        expect([four.buildings, four.admin, four.areas]).toEqual(["playground", "playground", "playgrounds-only"]);
        expect(four.features).toBe("play");
    });

    test("scene 5 switches the metric of buildings and Stadtteile together and keeps both destinations drawn", () => {
        for (const compare of ["park", "playground"] as const) {
            const p = plan("park-vs-playground", { compare });
            expect([p.buildings, p.admin, p.areas]).toEqual([compare, compare, "access-both"]);
            expect(buildingMeasureOf(p)).toBe(compare);
            expect(adminMeasureOf(p)).toBe(compare);
        }
    });

    test("scene 6 offers every theme with its own look", () => {
        const look = (theme: PlanState["theme"], over: Partial<PlanState> = {}) => plan("explore-green-hamburg", { theme, ...over });
        expect(look("classes").areas).toBe("classes");
        expect(look("parks").areas).toBe("parks-only");
        expect(look("playgrounds").areas).toBe("playgrounds-only");
        expect(look("park-access").buildings).toBe("park");
        expect(look("playground-access").admin).toBe("playground");
        expect(look("coverage", { coverage: "large-green" }).admin).toBe("large-green");
        expect(look("details").features).toBe("all");
        expect(look("osm").pois).toBe("outline");
        expect(look("osm").areas).toBe("parks-only");
    });

    test("the coverage theme draws the official areas only once the Stadtteil fill has faded", () => {
        expect(plan("explore-green-hamburg", { theme: "coverage", zoom: 10 }).areas).toBe("none");
        expect(plan("explore-green-hamburg", { theme: "coverage", zoom: 13 }).areas).toBe("classes");
    });

    test("every plan resolves to a style the resolver really has", () => {
        const scenes = [...SCENE_KEYS];
        const themes = ["classes", "parks", "playgrounds", "park-access", "playground-access", "coverage", "details", "osm"] as const;
        for (const scene of scenes) {
            for (const theme of themes) {
                for (const compare of ["park", "playground"] as const) {
                    const names = styleNamesFor(plan(scene, { theme, compare, zoom: 13, coverage: "coverage-green" }));
                    for (const [entryKey, name] of Object.entries(names)) {
                        expect(resolveGreenSpacesStyling(entryKey)!.styles.map((style) => style.name)).toContain(name);
                    }
                }
            }
        }
        expect(ENTRY_AREAS).toBe("green-areas");
    });
});

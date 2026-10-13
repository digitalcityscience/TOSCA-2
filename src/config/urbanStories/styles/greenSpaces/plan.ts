import {
    ENTRY_AREAS,
    ENTRY_BUILDINGS,
    ENTRY_FEATURE_LINE,
    ENTRY_FEATURE_POINT,
    ENTRY_FEATURE_POLYGON,
    ENTRY_PARK_POIS,
    ENTRY_STADTTEILE,
    FEATURE_MIN_ZOOM,
    SCENE_KEYS,
    styleNameOf,
    type AccessMeasure,
    type AdminMeasure,
    type AdminStyle,
    type AreaStyle,
    type BuildingStyle,
    type FeatureStyle,
    type PoiStyle,
    type SceneKey,
} from "./constants";

/**
 * What every layer of the story shows in a given scene state. Pure, so the scene logic can be tested without a map: the
 * store only turns a plan into style swaps.
 */

/** The seven themes of the exploration scene. */
export const THEMES = ["classes", "parks", "playgrounds", "park-access", "playground-access", "coverage", "details", "osm"] as const;
export type ThemeId = typeof THEMES[number];

export type CoverageMeasure = Extract<AdminMeasure, "coverage-recreational" | "coverage-green" | "large-green">;
export const COVERAGE_MEASURES: readonly CoverageMeasure[] = ["coverage-recreational", "coverage-green", "large-green"];

export interface ScenePlan {
    areas: AreaStyle;
    features: FeatureStyle;
    pois: PoiStyle;
    buildings: BuildingStyle;
    admin: AdminStyle;
}

export interface PlanState {
    theme: ThemeId;
    coverage: CoverageMeasure;
    /** The measure of the comparison scene. */
    compare: AccessMeasure;
    /** Map zoom; the coverage theme shows the areas once the Stadtteil fill has faded. */
    zoom: number;
}

/** The Stadtteil fill is gone from this zoom on; the coverage theme then draws the official areas underneath. */
export const COVERAGE_AREAS_ZOOM = 11.8;

const OVERVIEW: ScenePlan = { areas: "classes", features: "none", pois: "none", buildings: "none", admin: "outline" };

export function planFor(scene: SceneKey | undefined, state: PlanState): ScenePlan {
    switch (scene) {
        case "inside-the-park":
            return { areas: "focus-park", features: "focus", pois: "none", buildings: "context", admin: "outline" };
        case "park-nearby-how-far":
            return { areas: "parks-only", features: "none", pois: "none", buildings: "park", admin: "park" };
        case "where-can-children-play":
            return { areas: "playgrounds-only", features: "play", pois: "none", buildings: "playground", admin: "playground" };
        case "park-vs-playground":
            return { areas: "access-both", features: "none", pois: "none", buildings: state.compare, admin: state.compare };
        case "explore-green-hamburg":
            return explorePlan(state);
        default:
            return OVERVIEW;
    }
}

function explorePlan(state: PlanState): ScenePlan {
    switch (state.theme) {
        case "parks":
            return { ...OVERVIEW, areas: "parks-only", buildings: "context" };
        case "playgrounds":
            return { ...OVERVIEW, areas: "playgrounds-only", buildings: "context" };
        case "park-access":
            return { areas: "access-both", features: "none", pois: "none", buildings: "park", admin: "park" };
        case "playground-access":
            return { areas: "access-both", features: "none", pois: "none", buildings: "playground", admin: "playground" };
        case "coverage":
            return { ...OVERVIEW, areas: state.zoom >= COVERAGE_AREAS_ZOOM ? "classes" : "none", admin: state.coverage };
        case "details":
            return { areas: "parks-only", features: "all", pois: "none", buildings: "context", admin: "outline" };
        case "osm":
            return { ...OVERVIEW, areas: "parks-only", pois: "outline" };
        default:
            return OVERVIEW;
    }
}

/** The local style name each entry has to show for a plan. */
export function styleNamesFor(plan: ScenePlan): Record<string, string> {
    const feature = (kind: "feature-polygon" | "feature-line" | "feature-point"): string => styleNameOf(kind, plan.features);
    return {
        [ENTRY_STADTTEILE]: styleNameOf("admin", plan.admin),
        [ENTRY_AREAS]: styleNameOf("areas", plan.areas),
        [ENTRY_FEATURE_POLYGON]: feature("feature-polygon"),
        [ENTRY_FEATURE_LINE]: feature("feature-line"),
        [ENTRY_FEATURE_POINT]: feature("feature-point"),
        [ENTRY_PARK_POIS]: styleNameOf("pois", plan.pois),
        [ENTRY_BUILDINGS]: styleNameOf("building", plan.buildings),
    };
}

/** The measure a Stadtteil fill shows in a plan, or `undefined` when only outlines are drawn. */
export const adminMeasureOf = (plan: ScenePlan): AdminMeasure | undefined => (plan.admin === "outline" ? undefined : plan.admin);

/** The access measure the buildings show in a plan, or `undefined` for context or hidden buildings. */
export const buildingMeasureOf = (plan: ScenePlan): AccessMeasure | undefined => (
    plan.buildings === "park" || plan.buildings === "playground" ? plan.buildings : undefined
);

export const detailsVisible = (plan: ScenePlan, zoom: number): boolean => plan.features !== "none" && zoom >= FEATURE_MIN_ZOOM;

export { SCENE_KEYS };

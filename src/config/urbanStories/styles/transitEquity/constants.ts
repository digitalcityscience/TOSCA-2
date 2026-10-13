import type { Localized } from "../../types";

/**
 * Public Transport Equity: fields, colours and thresholds shared by the map styles, the legends, the scene panel
 * and the tests. Every colour appears here once; expressions and legends are derived from these constants.
 */

export const EQUITY_STYLE_PREFIX = "frontend:equity:";

/** Hamburg buildings layer: fields read from the vector tiles and from WFS. */
export const FIELDS = {
    id: "gml_id",
    function: "building_function_code",
    districtMatch: "pt_district_match",
    inCatchment: "pt_in_catchment_any",
    walkMin: "walk_min_stop_any",
    originQuality: "origin_quality",
    departures: "pt_departures_daily_sum",
    departuresComplete: "pt_departures_complete",
    lines: "pt_line_n_unique",
    stops: "pt_stop_n_total",
    accessClass: "pt_access_class",
    height: "building_height_m",
    stadtteil: "stadtteil_code",
} as const;

export const BUILDING_SOURCE_LAYER = "hamburg_buildings";
export const STADTTEILE_SOURCE_LAYER = "hamburg_stadtteile";
export const UNITS_SOURCE_LAYER = "hamburg_statistical_units";

/**
 * The residential denominator of every share in this story: housing buildings (ALKIS function 1000, 1010, 1020)
 * assigned to their district by containment. It is exactly the `ptr_resid_*` population of the admin layers.
 */
export const RESIDENTIAL_CODES: readonly number[] = [1000, 1010, 1020];
export const RESIDENTIAL_CODES_CQL = RESIDENTIAL_CODES.join(",");
export const RESIDENTIAL_CQL = `${FIELDS.function} IN (${RESIDENTIAL_CODES_CQL}) AND ${FIELDS.districtMatch}='contains'`;

/** Admin share the choropleths show: residential buildings outside every official catchment. */
export const ADMIN_OUTSIDE_SHARE = "ptr_resid_uncovered_share";
export const ADMIN_RESIDENTIAL_COUNT = "ptr_resid_n";
export const ADMIN_OUTSIDE_COUNT = "ptr_resid_uncovered_n";

/**
 * Walking minutes at which the official-versus-walking comparison is made. 6 minutes is what the official bus
 * catchment radius (480 m) takes at the walking model's 1.33 m/s on flat ground.
 */
export const WALK_THRESHOLD_MIN = 6;

// --- colours ---------------------------------------------------------------------------------

/** Missing data: a building without a walking origin, an area without a value. Never used for a real zero. */
export const NO_DATA_COLOR = "#b9b9b9";
export const NO_DATA_AREA_COLOR = "#d1d5db";
/** Buildings that are not part of the residential statistic: pale context. */
export const OTHER_BUILDING_COLOR = "#e6e9ed";
export const OUTLINE_COLOR = "#ffffff";
export const INK = "#1f2937";
export const SELECTION_COLOR = "#06b6d4";

/**
 * Colour roles of this story. Vermilion is the single "problem" colour (outside every catchment, zero departures,
 * criteria match, neither definition says near) and appears only on buildings. The Stadtteil / area choropleth is
 * indigo, so the two layers stay distinguishable where they overlap. Covered buildings are a calm steel blue (grey is reserved for "no data" and "not housing").
 */
export const PROBLEM_COLOR = "#d55e00";

/** Official catchment: inside / outside. Inside is calm; outside is the highlighted problem. */
export const COVERAGE_COLORS = { inside: "#6c9fc4", outside: PROBLEM_COLOR } as const;

/** Two definitions, four classes. Vermilion = near by neither definition; blue = near by both; amber and magenta = only one. */
export const AGREEMENT_COLORS = {
    both: "#3b6fb6",
    officialOnly: "#e0a800",
    walkingOnly: "#b5338a",
    neither: PROBLEM_COLOR,
} as const;

export type AgreementClass = keyof typeof AGREEMENT_COLORS;

/** Daily departures within reach: 0 is a real, separate state; the rest is a sequential ramp. */
export const DEPARTURE_ZERO_COLOR = PROBLEM_COLOR;
export const DEPARTURE_INCOMPLETE_COLOR = "#a8b0bb";
export const DEPARTURE_CLASSES: readonly { min: number; max: number | null; color: string }[] = [
    { min: 1, max: 99, color: "#edf8b1" },
    { min: 100, max: 299, color: "#c7e9b4" },
    { min: 300, max: 699, color: "#7fcdbb" },
    { min: 700, max: 1499, color: "#41b6c4" },
    { min: 1500, max: null, color: "#225ea8" },
];

/** Share of residential buildings outside the catchment: continuous sequential ramp on the Stadtteil choropleth. */
export const OUTSIDE_SHARE_STOPS: readonly { value: number; color: string }[] = [
    { value: 0, color: "#eef0fb" },
    { value: 0.1, color: "#d4d9f3" },
    { value: 0.2, color: "#a9b2e6" },
    { value: 0.35, color: "#7b86d4" },
    { value: 0.5, color: "#5560b8" },
    { value: 0.7, color: "#33378f" },
];

/** Scene 6: buildings that match the user's criteria versus the rest. */
export const MATCH_COLOR = PROBLEM_COLOR;
export const NO_MATCH_COLOR = "#cfd5dc";

/** Transport family of stops and catchments (nominal). Distinct from the vermilion / amber / magenta meanings above. */
export const FAMILY_COLORS = { bus: "#374151", rail: "#1c7ed6", ferry: "#364fc7" } as const;
export type TransportFamily = keyof typeof FAMILY_COLORS;

// --- map rendering ---------------------------------------------------------------------------

/** Footprints from the neighbourhood scale; the Stadtteil choropleth carries the city scale. */
export const BUILDING_MIN_ZOOM = 11;
export const BUILDING_FADE_FULL_ZOOM = 12.2;
/** Flat footprints up to here; full real height from `BUILDING_3D_FULL_ZOOM`. */
export const BUILDING_3D_START_ZOOM = 14.5;
export const BUILDING_3D_FULL_ZOOM = 16;
export const BUILDING_OPACITY = 0.92;
/** Admin fills give way to the buildings between these zooms; the outlines stay. */
export const ADMIN_FILL_FULL_ZOOM = 11;
export const ADMIN_FILL_GONE_ZOOM = 12.2;
/** Statistical areas (scene 6) fade out a little later: they fill the district scale between the Stadtteile and the footprints. */
export const ADMIN_UNITS_GONE_ZOOM = 13;
export const ADMIN_FILL_OPACITY = 0.78;
/** Official catchment polygons are loaded by viewport from this zoom on. */
export const CATCHMENT_MIN_ZOOM = 14;
/** Stop areas are individual points from this zoom on; below it they are clusters. */
export const STOP_CLUSTER_MAX_ZOOM = 13;

export const STYLE_NAMES = {
    coverage: `${EQUITY_STYLE_PREFIX}building:coverage`,
    agreement: `${EQUITY_STYLE_PREFIX}building:agreement`,
    departures: `${EQUITY_STYLE_PREFIX}building:departures`,
    criteria: `${EQUITY_STYLE_PREFIX}building:criteria`,
    adminOutside: `${EQUITY_STYLE_PREFIX}admin:outside-share`,
} as const;

export type BuildingView = "coverage" | "agreement" | "departures" | "criteria";

export interface LegendRow {
    color: string;
    label: Localized;
    /** Documented class limits or a note on the row. */
    detail?: Localized;
}

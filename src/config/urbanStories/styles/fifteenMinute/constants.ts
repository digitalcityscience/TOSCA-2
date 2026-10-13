import type { Localized } from "../../types";
import { FIFTEEN_MINUTE_CATEGORIES } from "../../metrics";

/**
 * Beyond the 15-Minute City: fields, ramps, class limits and zoom behaviour shared by the map styles, the legends,
 * the scene panel and the tests. Every colour and every class limit appears here once; expressions and legends
 * are derived from these constants.
 *
 * @remarks
 * Field meanings (R17 export metadata, `hamburg_buildings` and `hamburg_stadtteile`):
 * - `score_15min`: count of the nine categories reached within 15 min (0–9). `score_15min_decay`: equal-weight mean of
 *   the nine distance-decay category scores (100 up to 5 min, linear to 0 at 15 min), 0–100. Different measures.
 * - `walk_min_<c>` is NULL both for "none within 15 min" and for "not computable"; `n_<c>_15min` separates the two
 *   (0 = none, NULL = not computable).
 * - `comfort_mean_400m` (0–100, higher = more comfortable): modelled mean pedestrian comfort of the street network within
 *   400 m of walking distance. `safety_index_400m` (0–100, HIGHER = LOWER modelled recorded-crash concentration).
 *   Both describe the surrounding network, not a route to a destination.
 * - `score_green` (0–100): decay of the walk to the nearest LARGE green space (park ≥ 2,000 m², forest/cemetery
 *   ≥ 10,000 m²); `walk_min_dgp_park`: unbounded walking minutes to the nearest official Digitaler Grünplan park.
 */

export const FRONTEND_PREFIX = "frontend:15min:";

export const CATEGORY_IDS = ["food", "health", "education", "restaurant", "culture", "bank_post", "sport", "park", "stop_any"] as const;
export type CategoryId = typeof CATEGORY_IDS[number];

export function isCategoryId(value: unknown): value is CategoryId {
    return typeof value === "string" && (CATEGORY_IDS as readonly string[]).includes(value);
}

export const CATEGORY_LABELS: Record<CategoryId, Localized> = Object.fromEntries(
    FIFTEEN_MINUTE_CATEGORIES.map((category) => [category.id, category.label])
) as Record<CategoryId, Localized>;

/**
 * What each category contains, from the POI taxonomy of the data release. `health` is a broad set of healthcare
 * places (it is not emergency care, not a count of appointments and not capacity).
 */
export const CATEGORY_DESCRIPTIONS: Record<CategoryId, Localized> = {
    food: { en: "supermarkets, convenience stores, bakeries, greengrocers, butchers, weekly markets", de: "Supermärkte, Kioske/Nahversorger, Bäckereien, Obst- und Gemüsehändler, Metzgereien, Wochenmärkte" },
    health: { en: "pharmacies, hospitals, clinics and general or internal-medicine practices (a broad set of healthcare places; not emergency care, appointments or capacity)", de: "Apotheken, Krankenhäuser, Kliniken sowie Hausarzt- und internistische Praxen (eine breite Auswahl an Gesundheitsorten; keine Notfallversorgung, keine Termine, keine Kapazität)" },
    education: { en: "kindergartens, childcare, schools", de: "Kindergärten, Kinderbetreuung, Schulen" },
    restaurant: { en: "restaurants and cafés", de: "Restaurants und Cafés" },
    culture: { en: "libraries, cinemas, theatres, museums", de: "Bibliotheken, Kinos, Theater, Museen" },
    bank_post: { en: "banks, ATMs, post offices", de: "Banken, Geldautomaten, Postfilialen" },
    sport: { en: "public sports facilities, fitness centres, swimming pools", de: "Öffentliche Sportanlagen, Fitnessstudios, Schwimmbäder" },
    park: { en: "parks and large public green spaces", de: "Parks und große öffentliche Grünflächen" },
    stop_any: { en: "any HVV public transport stop (bus, rail, ferry)", de: "Jede HVV-Haltestelle (Bus, Bahn, Fähre)" },
};

/** Fields of the building layer (vector tiles and WFS). */
export const FIELDS = {
    id: "gml_id",
    residential: "is_residential",
    function: "building_function_code",
    stadtteil: "stadtteil_id",
    originQuality: "origin_quality",
    confidence: "score_confidence",
    count: "score_15min",
    decay: "score_15min_decay",
    comfort: "comfort_mean_400m",
    comfortConfidence: "comfort_confidence_400m",
    comfortShare: "comfort_scored_share_400m",
    comfortReason: "comfort_null_reason_400m",
    safety: "safety_index_400m",
    safetyLength: "safety_covered_len_400m_m",
    safetyReason: "safety_null_reason_400m",
    green: "score_green",
    dgpPark: "walk_min_dgp_park",
    dgpParkStatus: "dgp_park_status",
    dgpPlayground: "walk_min_dgp_playground",
    height: "building_height_m",
} as const;

export const walkMinField = (id: CategoryId): string => `walk_min_${id}`;
export const countField = (id: CategoryId): string => `n_${id}_15min`;

/** Fields of the Stadtteil layer. */
export const ADMIN_FIELDS = {
    id: "stadtteil_id",
    name: "stadtteil_name",
    bezirk: "bezirk_name",
    n: "m15_n",
    categoriesMean: "m15_categories_mean",
    decayMean: "m15_decay_mean",
    lowConfidenceShare: "m15_share_low_confidence",
    comfortN: "cmf_n",
    comfortMean: "cmf_mean",
    comfortMedian: "cmf_median",
    safetyN: "saf_n",
    safetyMean: "saf_mean",
    safetyMedian: "saf_median",
    greenN: "grn_n",
    greenMean: "grn_mean",
    greenMedian: "grn_median",
    greenShare: "grn_share_large_green_15min",
    dgpN: "dgp_park_n",
    dgpMedian: "dgp_park_median_min",
    dgpP90: "dgp_park_p90_min",
} as const;

export const shareField = (id: CategoryId): string => `m15_share_${id}`;

export const BUILDING_SOURCE_LAYER = "hamburg_buildings";
export const STADTTEILE_SOURCE_LAYER = "hamburg_stadtteile";

export const ENTRY_BUILDINGS = "buildings-15min";
export const ENTRY_STADTTEILE = "stadtteile-15min";

// --- measures ------------------------------------------------------------------------------------

/** One thing the map can colour: a building field and the Stadtteil summary that belongs to it. */
export type MeasureId =
    | "access"
    | `category-${CategoryId}`
    | "comfort"
    | "safety"
    | "green"
    | "green-park";

export const categoryMeasure = (id: CategoryId): MeasureId => `category-${id}`;

export function categoryOfMeasure(measure: MeasureId): CategoryId | undefined {
    if (!measure.startsWith("category-")) return undefined;
    const id = measure.slice("category-".length);
    return isCategoryId(id) ? id : undefined;
}

export const ALL_MEASURES: readonly MeasureId[] = [
    "access", ...CATEGORY_IDS.map(categoryMeasure), "comfort", "safety", "green", "green-park",
];

/** The five themes of the exploration scene. */
export const THEMES = ["access", "category", "comfort", "safety", "green"] as const;
export type ThemeId = typeof THEMES[number];

export type GreenMeasure = "green" | "green-park";

export const styleNameOf = (kind: "building" | "admin", measure: MeasureId): string => `${FRONTEND_PREFIX}${kind}:${measure}`;

// --- colours -----------------------------------------------------------------------------------

/** Missing: no walking origin, or the value could not be computed. Never used for a real zero. */
export const NO_DATA_COLOR = "#a3a3a3";
/** A real zero that means "nothing within 15 minutes". The one "problem" colour of the story. */
export const NONE_COLOR = "#d55e00";
export const OUTLINE_COLOR = "#ffffff";
export const LOW_CONFIDENCE_OUTLINE = "#9d174d";
export const INK = "#1f2937";
export const SELECTION_COLOR = "#06b6d4";
/** The two compared places of a scene. */
export const AREA_COLORS = { a: "#111827", b: "#7c3aed" } as const;

/** Sequential single-hue ramps, light = little, dark = much. One hue per dimension. */
export const RAMPS = {
    access: ["#cfe0f2", "#9cc2e3", "#5b97cf", "#2d68ad", "#173f7d"],
    comfort: ["#f9dea0", "#f3b76a", "#e48a3a", "#bb5a17", "#74320a"],
    safety: ["#e4dbf0", "#c7b8e0", "#a38fcf", "#7c5bb8", "#59349a", "#37196c"],
    green: ["#d6edc3", "#a8d98f", "#67b862", "#2b8f45", "#0b5d2b"],
    teal: ["#cdebe6", "#9ad8cf", "#5bb9ae", "#2a8f86", "#0b5f5a"],
    /** Walking minutes: near = dark. */
    minutes: ["#0b5f5a", "#3fa49b", "#aedbd4"],
    greenMinutes: ["#0b5d2b", "#2b8f45", "#67b862", "#a8d98f", "#d6edc3"],
} as const;

// --- class limits ------------------------------------------------------------------------------

/** Lower-inclusive class limits of a numeric scale; `colors.length === limits.length + 1`. */
export interface ClassScale {
    /** Ascending lower limits of every class but the first. */
    limits: readonly number[];
    colors: readonly string[];
    unit: Localized;
    /** Number formatting of legend labels. */
    digits: number;
}

export const ACCESS_SCALE: ClassScale = { limits: [20, 40, 60, 80], colors: RAMPS.access, unit: { en: "points", de: "Punkte" }, digits: 0 };
/** The observed building values run from 36 to 91, 90 % of them between 73 and 87: classes follow that spread. */
export const COMFORT_SCALE: ClassScale = { limits: [70, 75, 80, 85], colors: RAMPS.comfort, unit: { en: "points", de: "Punkte" }, digits: 0 };
/** The observed building values run from 0 to 87, 90 % of them between 28 and 40: classes follow that spread. */
export const SAFETY_SCALE: ClassScale = { limits: [28, 30, 32, 34, 36], colors: RAMPS.safety, unit: { en: "points", de: "Punkte" }, digits: 0 };
/** `score_green` = 0 means no large green space within 15 min and is a class of its own. */
export const GREEN_SCALE: ClassScale = { limits: [20, 40, 60, 80], colors: RAMPS.green, unit: { en: "points", de: "Punkte" }, digits: 0 };
/** Share of residential buildings of a Stadtteil that reach a category (0–1). A share of 0 is a class of its own. */
export const SHARE_SCALE: ClassScale = { limits: [0.2, 0.4, 0.6, 0.8], colors: RAMPS.teal, unit: { en: "of buildings", de: "der Gebäude" }, digits: 0 };

/** Walking-minute classes to a category (building level): up to 5 min is the full-score range of the decay. */
export const CATEGORY_MINUTE_LIMITS = [5, 10, 15] as const;
/** Minutes to the nearest official park (unbounded): upper limits of the first four classes. */
export const PARK_MINUTE_LIMITS = [5, 10, 15, 30] as const;

/** The scale of a measure at building level; categories and park minutes have their own expression. */
export function scaleOf(measure: MeasureId): ClassScale | undefined {
    switch (measure) {
        case "access": return ACCESS_SCALE;
        case "comfort": return COMFORT_SCALE;
        case "safety": return SAFETY_SCALE;
        case "green": return GREEN_SCALE;
        default: return undefined;
    }
}

// --- zoom behaviour ----------------------------------------------------------------------------

/** Footprints from the neighbourhood scale; the Stadtteil summaries carry the city scale. Tiles below 11 are not requested. */
export const BUILDING_MIN_ZOOM = 11;
export const BUILDING_FADE_FULL_ZOOM = 12.2;
/** Flat footprints up to here; the building's own height from `BUILDING_3D_FULL_ZOOM` on. */
export const BUILDING_3D_START_ZOOM = 14.5;
export const BUILDING_3D_FULL_ZOOM = 16;
export const BUILDING_OPACITY = 0.92;
/** The Stadtteil fill gives way to the footprints between these two zooms; the outlines stay. */
export const ADMIN_FILL_FULL_ZOOM = 11;
export const ADMIN_FILL_GONE_ZOOM = 12.2;
export const ADMIN_FILL_OPACITY = 0.8;

export interface LegendRow {
    color: string;
    label: Localized;
}

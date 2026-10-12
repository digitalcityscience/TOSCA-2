import type { Localized } from "../../types";
import {
    ADMIN_FILL_FULL_ZOOM,
    ADMIN_FILL_GONE_ZOOM,
    ADMIN_FILL_OPACITY,
    BUILDING_3D_FULL_ZOOM,
    BUILDING_3D_START_ZOOM,
    BUILDING_FADE_FULL_ZOOM,
    BUILDING_MIN_ZOOM,
    BUILDING_OPACITY,
    INK,
    NO_DATA_COLOR,
    OUTLINE_COLOR,
    SELECTION_COLOR,
} from "../fifteenMinute/constants";

/**
 * Green on the Map: fields, colours, class limits and zoom behaviour shared by the map styles, the legends, the scene
 * panel and the tests. Every colour and every class limit appears here once; expressions and legends derive from it.
 *
 * @remarks
 * Field meanings (R17 / R09-R11 export metadata):
 * - `walk_min_dgp_park` / `walk_min_dgp_playground`: walking minutes from the building's network origin to the nearest
 *   official Digitaler Grünplan (DGP) recreational park / playground, baseline 1.33 m/s with Tobler slope cost,
 *   UNBOUNDED (no 15-minute cutoff). NULL only when `dgp_*_status = no_origin`. Two different destinations: never combined.
 *   Entrances are modelled for most areas (130 of 951 parks have supported entrances, all playgrounds are modelled),
 *   so times are optimistic and are not walks to a verified entrance.
 * - `score_green` is the separate large-green-space score of the OSM/ALKIS inventory and is not used in this story.
 * - Stadtteil `dgp_*_median_min`, `dgp_*_p90_min`: statistics of the building values, NULL below 5 buildings.
 *   `cov_dgp_*_share`: union-based land coverage (never a sum of polygon areas), NOT accessibility.
 */

/** The six scenes, in story order; they are the chapter keys of the story config. */
export const SCENE_KEYS = [
    "what-counts-as-a-park",
    "inside-the-park",
    "park-nearby-how-far",
    "where-can-children-play",
    "park-vs-playground",
    "explore-green-hamburg",
] as const;
export type SceneKey = typeof SCENE_KEYS[number];

export const FRONTEND_PREFIX = "frontend:green:";

export const NO_DATA = NO_DATA_COLOR;
export { INK, OUTLINE_COLOR, SELECTION_COLOR };

// --- fields -----------------------------------------------------------------------------------------

export const AREA_FIELDS = {
    id: "green_area_id",
    idnr: "dgp_idnr",
    name: "name",
    class: "area_class",
    categoryEn: "category_en",
    categoryDe: "category_de",
    area: "geom_area_m2",
    reportedHa: "reported_area_ha",
    district: "district_name",
    borough: "borough_name",
    ownership: "ownership_de",
    administration: "administration_de",
    sourceVersion: "source_version",
    valid: "source_geom_valid",
} as const;

export const FEATURE_FIELDS = {
    id: "green_feature_id",
    idnr: "dgp_idnr",
    name: "name",
    group: "feature_group",
    type: "feature_type",
    code0: "category_code_0",
    code1: "category_code_1",
    code2: "category_code_2",
    code3: "category_code_3",
    label0: "category_0_de",
    label1: "category_1_de",
    label2: "category_2_de",
    label3: "category_3_de",
    parentCategory: "green_area_category_de",
    duplicates: "duplicate_group_size",
    valid: "source_geom_valid",
} as const;

export const BUILDING_FIELDS = {
    id: "gml_id",
    residential: "is_residential",
    park: "walk_min_dgp_park",
    playground: "walk_min_dgp_playground",
    parkStatus: "dgp_park_status",
    playgroundStatus: "dgp_playground_status",
    height: "building_height_m",
    heightSource: "building_height_source",
    stadtteil: "stadtteil_id",
} as const;

export const ADMIN_FIELDS = {
    id: "stadtteil_id",
    name: "stadtteil_name",
    bezirk: "bezirk_name",
    parkN: "dgp_park_n",
    parkMedian: "dgp_park_median_min",
    parkP90: "dgp_park_p90_min",
    playgroundN: "dgp_playground_n",
    playgroundMedian: "dgp_playground_median_min",
    playgroundP90: "dgp_playground_p90_min",
    covGreen: "cov_dgp_green_share",
    covRecreational: "cov_dgp_recreational_share",
    largeGreenShare: "grn_share_large_green_15min",
} as const;

export const SOURCE_LAYERS = {
    areas: "green_areas",
    featurePolygon: "green_features_polygon",
    featureLine: "green_features_line",
    featurePoint: "green_features_point",
    parkPoi: "park",
    stadtteile: "hamburg_stadtteile",
    buildings: "hamburg_buildings",
} as const;

export const ENTRY_AREAS = "green-areas";
export const ENTRY_FEATURE_POLYGON = "green-features-polygon";
export const ENTRY_FEATURE_LINE = "green-features-line";
export const ENTRY_FEATURE_POINT = "green-features-point";
export const ENTRY_PARK_POIS = "park-pois";
export const ENTRY_BUILDINGS = "buildings-green-access";
export const ENTRY_STADTTEILE = "stadtteile-green-access";

// --- official land-use classes -----------------------------------------------------------------------

/** `area_class` of the DGP export, in legend order. Nominal categories: one distinct colour each, never a ramp. */
export const AREA_CLASSES = [
    "recreational_park", "playground", "sports_area", "allotment", "cemetery", "protective_green", "other_public_green",
] as const;
export type AreaClass = typeof AREA_CLASSES[number];

export function isAreaClass(value: unknown): value is AreaClass {
    return typeof value === "string" && (AREA_CLASSES as readonly string[]).includes(value);
}

export interface AreaClassInfo {
    id: AreaClass;
    label: Localized;
    /** Official German category label(s) (`category_de`) behind the class. */
    official: string;
    color: string;
    /** Darker tone of the same class for outlines and labels. */
    ink: string;
    /** Whether the class is a place for everyday recreation, as far as the category tells. */
    recreational: boolean;
    meaning: Localized;
}

export const AREA_CLASS_INFO: Record<AreaClass, AreaClassInfo> = {
    recreational_park: {
        id: "recreational_park",
        label: { en: "Recreational parks", de: "Parkanlagen" },
        official: "Parkanlagen",
        color: "#2f9e57",
        ink: "#145c2e",
        recreational: true,
        meaning: { en: "Parks for everyday recreation. This is the destination of the park walking time.", de: "Parks für die alltägliche Erholung. Das ist das Ziel der Park-Gehzeit." },
    },
    playground: {
        id: "playground",
        label: { en: "Playgrounds", de: "Spielplätze" },
        official: "Spielplätze",
        color: "#f28e2b",
        ink: "#a8530a",
        recreational: true,
        meaning: { en: "Official children's playgrounds. This is the destination of the playground walking time.", de: "Amtliche Kinderspielplätze. Das ist das Ziel der Spielplatz-Gehzeit." },
    },
    sports_area: {
        id: "sports_area",
        label: { en: "Sports grounds", de: "Sportanlagen" },
        official: "Sportplätze",
        color: "#4a90d9",
        ink: "#1f5a99",
        recreational: false,
        meaning: { en: "Sports grounds: specialised use, not an open park.", de: "Sportplätze: Spezialnutzung, kein offener Park." },
    },
    allotment: {
        id: "allotment",
        label: { en: "Allotment gardens", de: "Kleingärten" },
        official: "Dauerkleingärten, Kleingärten",
        color: "#c8b45a",
        ink: "#7d6a1b",
        recreational: false,
        meaning: { en: "Private garden plots with restricted access.", de: "Private Gartenparzellen mit eingeschränktem Zugang." },
    },
    cemetery: {
        id: "cemetery",
        label: { en: "Cemeteries", de: "Friedhöfe" },
        official: "Friedhöfe",
        color: "#8e9aa3",
        ink: "#4c5860",
        recreational: false,
        meaning: { en: "Cemeteries: green, but a place of remembrance with its own rules.", de: "Friedhöfe: grün, aber Orte des Gedenkens mit eigenen Regeln." },
    },
    protective_green: {
        id: "protective_green",
        label: { en: "Protective green", de: "Schutzgrün" },
        official: "Schutzgrün",
        color: "#6aa6a0",
        ink: "#2f6b66",
        recreational: false,
        meaning: { en: "Buffer green along roads, industry and rail; not meant for recreation.", de: "Abstandsgrün an Straßen, Gewerbe und Bahn; nicht zur Erholung gedacht." },
    },
    other_public_green: {
        id: "other_public_green",
        label: { en: "Other public green", de: "Sonstiges öffentliches Grün" },
        official: "Allgemeines Grün, Wanderwege, Grün an Kleingärten, Anderweitige Flächen",
        color: "#b9c9a5",
        ink: "#66794d",
        recreational: false,
        meaning: { en: "General green, hiking routes, green at allotments and other areas; use varies.", de: "Allgemeines Grün, Wanderwege, Grün an Kleingärten und andere Flächen; die Nutzung ist unterschiedlich." },
    },
};

export const classColor = (id: AreaClass): string => AREA_CLASS_INFO[id].color;

// --- detailed Feinkartierung objects ------------------------------------------------------------------

/** Level-0 categories of the Feinkartierung (`category_code_0`), as delivered; the colour only tells groups apart. */
export const FEATURE_GROUPS = [
    { code: 1, label: { en: "Path network", de: "Wegenetz" }, color: "#a9865a" },
    { code: 2, label: { en: "Sports and play areas", de: "Sport- und Spielflächen" }, color: "#9b4fc0" },
    { code: 3, label: { en: "Boundaries and enclosures", de: "Abgrenzungen" }, color: "#4b5563" },
    { code: 4, label: { en: "Technical installations", de: "Technische Anlagen" }, color: "#7b8794" },
    { code: 5, label: { en: "Water engineering", de: "Wassertechnik" }, color: "#2a6fb0" },
    { code: 6, label: { en: "Water bodies", de: "Gewässer" }, color: "#6fc0e8" },
    { code: 7, label: { en: "Planting and vegetation", de: "Bepflanzung" }, color: "#7cc472" },
    { code: 8, label: { en: "Special areas", de: "Sonderflächen" }, color: "#d1a82c" },
    { code: 9, label: { en: "Structures and fixtures", de: "Bauten und Einbauten" }, color: "#8a6a52" },
    { code: 10, label: { en: "Near-natural areas", de: "Naturnahe Flächen" }, color: "#8aa05a" },
    { code: 99, label: { en: "Unclassified", de: "Nicht klassifiziert" }, color: "#bdbdbd" },
] as const satisfies { code: number; label: Localized; color: string }[];

export const FEATURE_FALLBACK_COLOR = "#bdbdbd";

// --- walking minutes -----------------------------------------------------------------------------------

/**
 * Class limits for walking minutes to the nearest official park AND to the nearest official playground. One scale for
 * both, so the two maps and the two Stadtteile summaries can be compared colour for colour. They are visualisation
 * classes, not new indicators, and the values are not capped at 15 minutes.
 */
export const MINUTE_LIMITS = [5, 10, 15, 30] as const;

/** Sequential: light = a short walk, dark = a long walk. Distinct from every land-use colour. */
export const MINUTE_COLORS = ["#e3dcf2", "#c0b2e0", "#9a85c8", "#6e4aa8", "#42207a"] as const;

/** No walking origin (`dgp_*_status = no_origin`): the time is not computable. */
export const NO_ORIGIN_COLOR = "#6b7280";
/** Any other missing time (no status given, or a Stadtteil with fewer than 5 buildings). */
export const MISSING_COLOR = NO_DATA_COLOR;

export type AccessMeasure = "park" | "playground";
export const ACCESS_MEASURES: readonly AccessMeasure[] = ["park", "playground"];

export const accessField = (measure: AccessMeasure): string => (measure === "park" ? BUILDING_FIELDS.park : BUILDING_FIELDS.playground);
export const accessStatusField = (measure: AccessMeasure): string => (measure === "park" ? BUILDING_FIELDS.parkStatus : BUILDING_FIELDS.playgroundStatus);
export const accessMedianField = (measure: AccessMeasure): string => (measure === "park" ? ADMIN_FIELDS.parkMedian : ADMIN_FIELDS.playgroundMedian);
export const accessP90Field = (measure: AccessMeasure): string => (measure === "park" ? ADMIN_FIELDS.parkP90 : ADMIN_FIELDS.playgroundP90);
export const accessNField = (measure: AccessMeasure): string => (measure === "park" ? ADMIN_FIELDS.parkN : ADMIN_FIELDS.playgroundN);

// --- shares ---------------------------------------------------------------------------------------------

export interface ShareScale {
    /** Ascending lower limits of every class but the first (0 is its own class). */
    limits: readonly number[];
    colors: readonly string[];
}

export const SHARE_RAMP = ["#e2f0d2", "#b5dba0", "#78bd6d", "#2f9a52", "#0d6234"] as const;
/** A valid zero: no polygon of the class lies in the unit. Not the same as "no value". */
export const ZERO_SHARE_COLOR = "#f6f3ea";

/** Observed Stadtteil values: recreational share 0–19 % (median 2.5 %), all-green share 0–62 % (median 7.5 %). */
export const RECREATIONAL_SHARE_SCALE: ShareScale = { limits: [0.025, 0.05, 0.1, 0.15], colors: SHARE_RAMP };
export const GREEN_SHARE_SCALE: ShareScale = { limits: [0.05, 0.1, 0.2, 0.4], colors: SHARE_RAMP };
/** Share of residential buildings with a large green space within 15 min: almost every Stadtteil is at 100 %. */
export const LARGE_GREEN_SCALE: ShareScale = { limits: [0.6, 0.8, 0.95, 0.999], colors: SHARE_RAMP };

export type AdminMeasure = AccessMeasure | "coverage-recreational" | "coverage-green" | "large-green";
export const ADMIN_MEASURES: readonly AdminMeasure[] = ["park", "playground", "coverage-recreational", "coverage-green", "large-green"];

export const adminFieldOf = (measure: AdminMeasure): string => {
    switch (measure) {
        case "park": return ADMIN_FIELDS.parkMedian;
        case "playground": return ADMIN_FIELDS.playgroundMedian;
        case "coverage-recreational": return ADMIN_FIELDS.covRecreational;
        case "coverage-green": return ADMIN_FIELDS.covGreen;
        default: return ADMIN_FIELDS.largeGreenShare;
    }
};

export function shareScaleOf(measure: AdminMeasure): ShareScale | undefined {
    switch (measure) {
        case "coverage-recreational": return RECREATIONAL_SHARE_SCALE;
        case "coverage-green": return GREEN_SHARE_SCALE;
        case "large-green": return LARGE_GREEN_SCALE;
        default: return undefined;
    }
}

// --- scenes, styles -------------------------------------------------------------------------------------

/** What the green-area layer shows. */
export const AREA_STYLES = ["classes", "focus-park", "parks-only", "playgrounds-only", "access-both", "none"] as const;
export type AreaStyle = typeof AREA_STYLES[number];

/** What the detailed-feature layers show. */
export const FEATURE_STYLES = ["all", "focus", "play", "none"] as const;
export type FeatureStyle = typeof FEATURE_STYLES[number];

export const POI_STYLES = ["outline", "none"] as const;
export type PoiStyle = typeof POI_STYLES[number];

/** What the building layer shows: a thematic walking time, or a neutral context. */
export type BuildingStyle = AccessMeasure | "context" | "none";
export type AdminStyle = AdminMeasure | "outline";

export type StyleKind = "areas" | "feature-polygon" | "feature-line" | "feature-point" | "pois" | "building" | "admin";

export const styleNameOf = (kind: StyleKind, key: string): string => `${FRONTEND_PREFIX}${kind}:${key}`;

export const PLAYGROUND_ICON = "gs-playground";

// --- zoom behaviour ----------------------------------------------------------------------------------

export {
    ADMIN_FILL_FULL_ZOOM,
    ADMIN_FILL_GONE_ZOOM,
    ADMIN_FILL_OPACITY,
    BUILDING_3D_FULL_ZOOM,
    BUILDING_3D_START_ZOOM,
    BUILDING_FADE_FULL_ZOOM,
    BUILDING_MIN_ZOOM,
    BUILDING_OPACITY,
};

/** Official green areas are light enough to be drawn from the whole-city view. */
export const AREA_MIN_ZOOM = 8;
/** Detailed Feinkartierung objects are fetched from here; they fade in over the next 1.2 zoom levels. */
export const FEATURE_MIN_ZOOM = 14;
export const FEATURE_FULL_ZOOM = 15.2;
/** Zoom from which official park names are labelled; other names follow later, so labels never clutter the city view. */
export const PARK_LABEL_ZOOM = 12;
export const OTHER_LABEL_ZOOM = 14.5;
export const PLAYGROUND_ICON_ZOOM = 11.5;

/** Neutral building colour for scenes in which buildings are context, not data. */
export const CONTEXT_BUILDING_COLOR = "#d8d4cb";
export const FOCUS_OUTLINE = "#0f3d22";
export const POI_COLOR = "#6b21a8";

export interface LegendRow {
    color: string;
    label: Localized;
}

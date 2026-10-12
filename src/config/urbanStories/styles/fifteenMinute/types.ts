import type { MapLayerStyleOption } from "@store/map";
import type { Localized } from "../../types";

/**
 * Types of the frontend-owned 15-Minute City styling.
 *
 * @remarks
 * Nothing here is fetched from GeoServer: every style, expression, filter and legend of the story is
 * built from the constants in this folder. GeoServer only supplies geometries, tiles and attributes.
 */

export const FIFTEEN_MINUTE_CATEGORY_IDS = [
    "food", "health", "education", "restaurant", "culture", "bank_post", "sport", "park", "stop_any",
] as const;

export type FifteenMinuteCategoryId = typeof FIFTEEN_MINUTE_CATEGORY_IDS[number];

export function isFifteenMinuteCategoryId(value: unknown): value is FifteenMinuteCategoryId {
    return typeof value === "string" && (FIFTEEN_MINUTE_CATEGORY_IDS as readonly string[]).includes(value);
}

/** Per-building access state of one category. `unknown` = not computable or the attribute is absent. */
export type AccessState = "accessible" | "inaccessible" | "unknown";

export type AdministrativeLevel = "stadtteile" | "bezirke";

/** Aggregate attribute of the administrative layers. They are different measures, never one scale. */
export type AdministrativeMetric = "m15_categories_mean" | "m15_decay_mean";

/** The user-adjustable accessibility-gap filter of chapter 5. `maxScore: null` = no score filter. */
export interface GapFilterSelection {
    maxScore: number | null;
    /** Keep only buildings whose selected category is inaccessible (`n_<c>_15min = 0`). */
    missingCategory: FifteenMinuteCategoryId | null;
}

export const NO_GAP_FILTER: GapFilterSelection = { maxScore: null, missingCategory: null };

export interface LegendItem {
    color: string;
    label: Localized;
    /** The attribute value the colour stands for; absent for the no-data row. */
    value?: number;
}

export interface LegendSpec {
    /** Same string as the local style name the legend belongs to. */
    styleName: string;
    title: Localized;
    kind: "classes" | "gradient" | "ramp";
    /** Captions under the two ends of a `ramp`. */
    rampEnds?: { low: Localized; high: Localized };
    items: LegendItem[];
    /** Colour of buildings or areas without a value, when the style draws them. */
    noData: LegendItem;
    note?: Localized;
    /** What the legend counts, one row per category: name and what it contains. */
    categories?: { label: Localized; description: Localized }[];
    categoriesTitle?: Localized;
}

/** A locally built set of styles for one catalog layer, in the shape the layer loader already accepts. */
export interface LocalStylingBundle {
    styles: MapLayerStyleOption[];
    defaultStyleId: string;
}

/** Every local style name starts with this, so catalog styles can never be mistaken for them. */
export const FRONTEND_STYLE_PREFIX = "frontend:15min:";

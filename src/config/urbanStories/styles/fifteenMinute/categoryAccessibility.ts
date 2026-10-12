import type { Localized } from "../../types";
import { NO_DATA_COLOR } from "./buildingAccessibility";
import type { AccessState, FifteenMinuteCategoryId, LegendItem } from "./types";
import { FIFTEEN_MINUTE_CATEGORY_IDS } from "./types";

/**
 * Category-specific building accessibility.
 *
 * @remarks
 * Field semantics, verified on 2026-10-11 against the published feature type and WFS counts
 * (`hamburg_buildings`, 382,000 buildings, 279 without a score):
 *
 * - `n_<c>_15min` (Integer): distinct places of category `c` within 15 minutes. `0` = none, NULL = not
 *   computable. `n_<c>_15min > 0` is exactly `walk_min_<c> IS NOT NULL` (0 mismatches in all nine categories).
 * - `cat_score_<c>` (Double, 0–100) is a distance-decay score: 100 up to 5 minutes, linear to 0 at 15 minutes.
 *   It is **not** a reachability flag: buildings at exactly 15 minutes have `n > 0` and `cat_score = 0`
 *   (1 to 12 buildings per category), so "score > 0" would misclassify them. It is never used here.
 *
 * Access is therefore read from `n_<c>_15min` alone: `> 0` accessible, `= 0` inaccessible, missing unknown.
 */
export interface CategoryFields {
    id: FifteenMinuteCategoryId;
    label: Localized;
    /** Count of places within 15 minutes; the access flag. */
    accessField: string;
    /** Walking minutes to the nearest place, NULL when none within 15 minutes. */
    walkMinField: string;
    /** Decay score, shown in the details panel only. */
    scoreField: string;
    /** Published POI layer (workspace HAMBURG-POIs) of the category. */
    poiEntryKey: string;
}

const LABELS: Record<FifteenMinuteCategoryId, Localized> = {
    food: { en: "Food", de: "Lebensmittel" },
    health: { en: "Health", de: "Gesundheit" },
    education: { en: "Education", de: "Bildung" },
    restaurant: { en: "Restaurants", de: "Gastronomie" },
    culture: { en: "Culture", de: "Kultur" },
    bank_post: { en: "Bank & post", de: "Bank & Post" },
    sport: { en: "Sport", de: "Sport" },
    park: { en: "Parks", de: "Parks" },
    stop_any: { en: "Public transport stops", de: "ÖPNV-Haltestellen" },
};

/** What each category contains, from the POI taxonomy (`config/taxonomy/poi_categories.yml`) of the data release. */
export const CATEGORY_DESCRIPTIONS: Record<FifteenMinuteCategoryId, Localized> = {
    food: { en: "Supermarkets, convenience stores, bakeries, greengrocers, butchers, weekly markets", de: "Supermärkte, Kioske/Nahversorger, Bäckereien, Obst- und Gemüsehändler, Metzgereien, Wochenmärkte" },
    health: { en: "Pharmacies, hospitals, clinics, general practitioners", de: "Apotheken, Krankenhäuser, Kliniken, Hausärztinnen und Hausärzte" },
    education: { en: "Kindergartens, childcare, schools", de: "Kindergärten, Kinderbetreuung, Schulen" },
    restaurant: { en: "Restaurants and cafés", de: "Restaurants und Cafés" },
    culture: { en: "Libraries, cinemas, theatres, museums", de: "Bibliotheken, Kinos, Theater, Museen" },
    bank_post: { en: "Banks, ATMs, post offices", de: "Banken, Geldautomaten, Postfilialen" },
    sport: { en: "Public sports facilities, fitness centres, swimming pools", de: "Öffentliche Sportanlagen, Fitnessstudios, Schwimmbäder" },
    park: { en: "Parks and large public green spaces", de: "Parks und große öffentliche Grünflächen" },
    stop_any: { en: "Any HVV public transport stop (bus, rail, ferry)", de: "Jede HVV-Haltestelle (Bus, Bahn, Fähre)" },
};

export const CATEGORY_FIELDS: Record<FifteenMinuteCategoryId, CategoryFields> = Object.fromEntries(
    FIFTEEN_MINUTE_CATEGORY_IDS.map((id) => [id, {
        id,
        label: LABELS[id],
        accessField: `n_${id}_15min`,
        walkMinField: `walk_min_${id}`,
        scoreField: `cat_score_${id}`,
        poiEntryKey: id === "stop_any" ? "poi-pt-stops" : `poi-${id.replace("_", "-")}`,
    } satisfies CategoryFields])
) as Record<FifteenMinuteCategoryId, CategoryFields>;

export const ACCESS_COLORS: Record<AccessState, string> = {
    accessible: "#1b9e77",
    inaccessible: "#d95f02",
    unknown: NO_DATA_COLOR,
};

/** Access state of a property value (`n_<c>_15min`). Negative, fractional, non-numeric values are unknown. */
export function accessStateOf(count: unknown): AccessState {
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) return "unknown";
    return count > 0 ? "accessible" : "inaccessible";
}

/** MapLibre expression for the category fill. A missing property is the NULL case and stays unknown. */
export function categoryAccessColorExpression(category: FifteenMinuteCategoryId): unknown[] {
    const value = ["get", CATEGORY_FIELDS[category].accessField];
    return [
        "case",
        ["!=", ["typeof", value], "number"], ACCESS_COLORS.unknown,
        ["!=", ["%", value, 1], 0], ACCESS_COLORS.unknown,
        [">", value, 0], ACCESS_COLORS.accessible,
        ["==", value, 0], ACCESS_COLORS.inaccessible,
        ACCESS_COLORS.unknown,
    ];
}

/** Buildings of this category that are inaccessible (`n_<c>_15min = 0`); NULL is not "inaccessible". */
export function missingCategoryFilter(category: FifteenMinuteCategoryId): unknown[] {
    const value = ["get", CATEGORY_FIELDS[category].accessField];
    return ["all", ["==", ["typeof", value], "number"], ["==", value, 0]];
}

export function categoryLegendItems(category: FifteenMinuteCategoryId): LegendItem[] {
    const label = LABELS[category];
    return [
        { color: ACCESS_COLORS.accessible, label: { en: `${label.en}: within 15 min`, de: `${label.de}: innerhalb von 15 Min.` } },
        { color: ACCESS_COLORS.inaccessible, label: { en: `${label.en}: none within 15 min`, de: `${label.de}: keines innerhalb von 15 Min.` } },
    ];
}

export const CATEGORY_UNKNOWN_LEGEND_ITEM: LegendItem = {
    color: ACCESS_COLORS.unknown,
    label: { en: "Unknown (not computable)", de: "Unbekannt (nicht berechenbar)" },
};

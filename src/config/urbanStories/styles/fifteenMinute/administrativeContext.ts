import type { Localized } from "../../types";
import { NO_DATA_COLOR } from "./buildingAccessibility";
import type { AdministrativeLevel, AdministrativeMetric, LegendItem } from "./types";

/**
 * Administrative context for the building-level story: Stadtteile and Bezirke coloured by the
 * building-weighted aggregates `m15_*`.
 *
 * @remarks
 * The two aggregates are different measures and get different scales:
 * `m15_categories_mean` is the mean of the building count `score_15min` (0–9);
 * `m15_decay_mean` is the mean of the distance-decay score `score_15min_decay` (0–100). Neither is
 * a percentage, and the decay mean is not the mean of `score_15min`. Both cover residential buildings
 * with a score (`m15_n`) and are NULL where fewer than 5 such buildings contribute.
 */
export const ADMIN_SOURCE_LAYER: Record<AdministrativeLevel, string> = {
    stadtteile: "hamburg_stadtteile",
    bezirke: "hamburg_bezirke",
};

export const ADMIN_NAME_FIELD: Record<AdministrativeLevel, string> = {
    stadtteile: "stadtteil_name",
    bezirke: "bezirk_name",
};

export const ADMIN_FILL_OPACITY = 0.6;
export const ADMIN_OUTLINE_COLOR = "#1f2937";
/** The area colours give way to individual buildings from the building zoom floor on. */
export const ADMIN_FILL_MAX_ZOOM = 12;

export interface AdminMetricScale {
    metric: AdministrativeMetric;
    label: Localized;
    unit: Localized;
    /** Colour stops, low to high; the legend shows exactly these. */
    stops: readonly { value: number; color: string }[];
    note: Localized;
}

export const ADMIN_METRIC_SCALES: Record<AdministrativeMetric, AdminMetricScale> = {
    m15_categories_mean: {
        metric: "m15_categories_mean",
        label: { en: "Mean categories reached", de: "Mittlere erreichte Kategorien" },
        unit: { en: "0–9 categories (mean of the building count)", de: "0–9 Kategorien (Mittel der Gebäudeanzahl)" },
        stops: [
            { value: 0, color: "#eff3ff" },
            { value: 2.25, color: "#bdd7e7" },
            { value: 4.5, color: "#6baed6" },
            { value: 6.75, color: "#3182bd" },
            { value: 9, color: "#08519c" },
        ],
        note: {
            en: "Mean of the building-level count (0–9) over residential buildings with a score.",
            de: "Mittel der gebäudebezogenen Anzahl (0–9) über Wohngebäude mit Score.",
        },
    },
    m15_decay_mean: {
        metric: "m15_decay_mean",
        label: { en: "Mean decay-weighted score", de: "Mittlerer distanzgewichteter Score" },
        unit: { en: "0–100 points (decay-weighted, not the mean of the 0–9 count)", de: "0–100 Punkte (distanzgewichtet, nicht das Mittel der 0–9-Anzahl)" },
        stops: [
            { value: 0, color: "#feedde" },
            { value: 25, color: "#fdbe85" },
            { value: 50, color: "#fd8d3c" },
            { value: 75, color: "#e6550d" },
            { value: 100, color: "#a63603" },
        ],
        note: {
            en: "Mean of the distance-decay score (100 up to 5 minutes, linear to 0 at 15 minutes). A different measure from the 0–9 count.",
            de: "Mittel des Distanz-Scores (100 bis 5 Minuten, linear auf 0 bei 15 Minuten). Ein anderes Maß als die 0–9-Anzahl.",
        },
    },
};

export const ADMIN_NO_DATA_ITEM: LegendItem = {
    color: NO_DATA_COLOR,
    label: { en: "No value (fewer than 5 buildings)", de: "Kein Wert (weniger als 5 Gebäude)" },
};

/** Continuous colour for the aggregate, grey for NULL, missing or non-numeric values. */
export function adminColorExpression(metric: AdministrativeMetric): unknown[] {
    const value = ["get", metric];
    const stops = ADMIN_METRIC_SCALES[metric].stops.flatMap((stop) => [stop.value, stop.color]);
    return [
        "case",
        ["==", ["typeof", value], "number"],
        ["interpolate", ["linear"], value, ...stops],
        NO_DATA_COLOR,
    ];
}

/** JS twin of the interpolation, for tests: the colour at a stop value. `undefined` = no-data grey. */
export function adminColorAtStop(metric: AdministrativeMetric, value: unknown): string {
    const stop = typeof value === "number"
        ? ADMIN_METRIC_SCALES[metric].stops.find((candidate) => candidate.value === value)
        : undefined;
    return stop?.color ?? NO_DATA_COLOR;
}

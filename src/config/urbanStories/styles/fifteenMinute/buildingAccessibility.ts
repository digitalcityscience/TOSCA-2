import type { Localized } from "../../types";
import type { LegendItem } from "./types";

/**
 * Overall building accessibility: `score_15min`, the number (0–9) of everyday destination categories
 * reached within a 15-minute walk. It is a count, never a percentage.
 */
export const BUILDING_SCORE_FIELD = "score_15min";
export const BUILDING_SCORE_DECAY_FIELD = "score_15min_decay";
export const BUILDING_SOURCE_LAYER = "hamburg_buildings";

export const NO_DATA_COLOR = "#9e9e9e";
export const BUILDING_OUTLINE_COLOR = "#ffffff";
export const BUILDING_FILL_OPACITY = 0.9;

/**
 * Building height above ground in metres (LoD2-DE `measuredHeight`, 0.74–158.47 m, NULL for 6,036 buildings
 * without an LoD2 match; never filled or estimated). The export metadata names it for `fill-extrusion-height`.
 */
export const BUILDING_HEIGHT_FIELD = "building_height_m";

/** Extrusion height in metres. NULL, missing, non-numeric or non-positive heights stay flat (0): nothing is estimated. */
export function buildingHeightExpression(field: string = BUILDING_HEIGHT_FIELD): unknown[] {
    const value = ["get", field];
    return ["case", ["all", ["==", ["typeof", value], "number"], [">", value, 0]], value, 0];
}

/**
 * Diverging scale, poor to good: dark brown (nothing within 15 minutes) through cream (about half) to deep
 * teal (all nine). ColorBrewer BrBG, 10 classes: a brown–teal pair stays distinguishable for colour-blind
 * readers, adjacent classes differ visibly, and the ends read as "little" and "much". The classes are the
 * integers 0–9, so the legend lists exactly what the expression draws.
 */
export const SCORE_15MIN_CLASSES: readonly { value: number; color: string }[] = [
    { value: 0, color: "#7f3b08" },
    { value: 1, color: "#b35806" },
    { value: 2, color: "#e08214" },
    { value: 3, color: "#fdb863" },
    { value: 4, color: "#fee0b6" },
    { value: 5, color: "#d4ecea" },
    { value: 6, color: "#a1d9d3" },
    { value: 7, color: "#5ab4ac" },
    { value: 8, color: "#238b84" },
    { value: 9, color: "#01534d" },
];

export const SCORE_15MIN_MIN = 0;
export const SCORE_15MIN_MAX = 9;

/** True for a finite integer in 0–9, the only values that get a class colour. */
export function isValidScore15min(value: unknown): value is number {
    return typeof value === "number"
        && Number.isInteger(value)
        && value >= SCORE_15MIN_MIN
        && value <= SCORE_15MIN_MAX;
}

/**
 * JS twin of {@link score15minColorExpression}, used by tests and the details panel.
 * NULL, a missing attribute, a non-number and an out-of-domain number all give the no-data colour,
 * never the colour of 0.
 */
export function score15minColor(value: unknown): string {
    return isValidScore15min(value)
        ? SCORE_15MIN_CLASSES[value].color
        : NO_DATA_COLOR;
}

/**
 * MapLibre expression for the building fill. MVT does not encode NULL, so a missing property is
 * the NULL case. `to-number` is deliberately not applied before the type check: it turns NULL into 0.
 */
export function score15minColorExpression(field: string = BUILDING_SCORE_FIELD): unknown[] {
    const value = ["get", field];
    return [
        "case",
        [
            "all",
            ["==", ["typeof", value], "number"],
            [">=", value, SCORE_15MIN_MIN],
            ["<=", value, SCORE_15MIN_MAX],
            ["==", ["%", value, 1], 0],
        ],
        ["match", value, ...SCORE_15MIN_CLASSES.flatMap((item) => [item.value, item.color]), NO_DATA_COLOR],
        NO_DATA_COLOR,
    ];
}

/** `score_15min <= maxScore`, with NULL and non-numbers excluded (never counted as 0). */
export function maxScoreFilter(maxScore: number, field: string = BUILDING_SCORE_FIELD): unknown[] {
    return [
        "all",
        ["==", ["typeof", ["get", field]], "number"],
        ["<=", ["get", field], maxScore],
    ];
}

export const SCORE_15MIN_CLASS_LABELS: Record<number, Localized> = Object.fromEntries(
    SCORE_15MIN_CLASSES.map((item) => {
        const base = {
            en: item.value === 1 ? "1 of 9 categories" : `${item.value} of 9 categories`,
            de: item.value === 1 ? "1 von 9 Kategorien" : `${item.value} von 9 Kategorien`,
        };
        if (item.value === 0) return [item.value, { en: `${base.en} (none within 15 min)`, de: `${base.de} (keine in 15 Min.)` }];
        if (item.value === 9) return [item.value, { en: `${base.en} (all within 15 min)`, de: `${base.de} (alle in 15 Min.)` }];
        return [item.value, base];
    })
);

export function scoreLegendItems(): LegendItem[] {
    return SCORE_15MIN_CLASSES.map((item) => ({
        value: item.value,
        color: item.color,
        label: SCORE_15MIN_CLASS_LABELS[item.value],
    }));
}

export const NO_DATA_LEGEND_ITEM: LegendItem = {
    color: NO_DATA_COLOR,
    label: { en: "No score (not computable)", de: "Kein Score (nicht berechenbar)" },
};

/** Buildings are flat footprints up to this zoom and grow to their full height by `BUILDING_3D_FULL_ZOOM`. */
export const BUILDING_3D_START_ZOOM = 12;
export const BUILDING_3D_FULL_ZOOM = 13;

/**
 * Zoom-dependent extrusion height: 0 (flat) at and below the start zoom, the building's own height from the
 * full zoom on, linear in between. Kept in one layer so the thematic colour, filter and layer controls are unchanged.
 */
export function buildingExtrusionHeightExpression(field: string = BUILDING_HEIGHT_FIELD): unknown[] {
    return [
        "interpolate", ["linear"], ["zoom"],
        BUILDING_3D_START_ZOOM, 0,
        BUILDING_3D_FULL_ZOOM, buildingHeightExpression(field),
    ];
}

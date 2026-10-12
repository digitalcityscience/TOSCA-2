import {
    ACCESS_SCALE,
    ADMIN_FIELDS,
    BUILDING_3D_FULL_ZOOM,
    BUILDING_3D_START_ZOOM,
    CATEGORY_MINUTE_LIMITS,
    COMFORT_SCALE,
    FIELDS,
    GREEN_SCALE,
    LOW_CONFIDENCE_OUTLINE,
    NONE_COLOR,
    NO_DATA_COLOR,
    OUTLINE_COLOR,
    PARK_MINUTE_LIMITS,
    RAMPS,
    SAFETY_SCALE,
    SHARE_SCALE,
    categoryOfMeasure,
    countField,
    shareField,
    walkMinField,
    type ClassScale,
    type MeasureId,
} from "./constants";

type Expression = unknown[];

/**
 * MapLibre expressions of the story. Every expression type-checks before it reads a number, because a NULL is not
 * encoded in a vector tile: `to-number` of a missing property is 0, which would draw missing data as the lowest class.
 */

const isNumber = (value: unknown): Expression => ["==", ["typeof", value], "number"];

/** `step` over the lower class limits of a scale. */
function stepColor(value: Expression, scale: ClassScale): Expression {
    return ["step", ["number", value], scale.colors[0], ...scale.limits.flatMap((limit, index) => [limit, scale.colors[index + 1]])];
}

/** Colour of a numeric field by class; non-numbers are no-data, a real zero may get a colour of its own. */
export function classedColor(field: string, scale: ClassScale, zeroColor?: string): Expression {
    const value = ["get", field];
    const classed = zeroColor === undefined ? stepColor(value, scale) : ["case", ["==", ["number", value], 0], zeroColor, stepColor(value, scale)];
    return ["case", isNumber(value), classed, NO_DATA_COLOR];
}

/**
 * Walking minutes to the nearest place of a category. `n_<c>_15min` tells the two NULL cases of `walk_min_<c>` apart:
 * 0 = none within 15 minutes (a real, coloured state), NULL = not computable (no-data grey).
 */
export function categoryMinutesColor(field: string, countFieldName: string): Expression {
    const minutes = ["get", field];
    const count = ["get", countFieldName];
    const [near, middle, far] = CATEGORY_MINUTE_LIMITS;
    return [
        "case",
        ["!", isNumber(count)], NO_DATA_COLOR,
        ["==", ["number", count], 0], NONE_COLOR,
        ["!", isNumber(minutes)], NO_DATA_COLOR,
        ["<=", ["number", minutes], near], RAMPS.minutes[0],
        ["<=", ["number", minutes], middle], RAMPS.minutes[1],
        ["<=", ["number", minutes], far], RAMPS.minutes[2],
        NO_DATA_COLOR,
    ];
}

/** Minutes to the nearest official park, unbounded: five classes, no cut-off, so no "none" state. */
export function parkMinutesColor(field: string): Expression {
    const minutes = ["get", field];
    const [a, b, c, d] = PARK_MINUTE_LIMITS;
    return [
        "case",
        ["!", isNumber(minutes)], NO_DATA_COLOR,
        ["<=", ["number", minutes], a], RAMPS.greenMinutes[0],
        ["<=", ["number", minutes], b], RAMPS.greenMinutes[1],
        ["<=", ["number", minutes], c], RAMPS.greenMinutes[2],
        ["<=", ["number", minutes], d], RAMPS.greenMinutes[3],
        RAMPS.greenMinutes[4],
    ];
}

/** Building fill colour of a measure. */
export function buildingColor(measure: MeasureId): Expression {
    const category = categoryOfMeasure(measure);
    if (category !== undefined) return categoryMinutesColor(walkMinField(category), countField(category));
    switch (measure) {
        case "access": return classedColor(FIELDS.decay, ACCESS_SCALE);
        case "comfort": return classedColor(FIELDS.comfort, COMFORT_SCALE);
        case "safety": return classedColor(FIELDS.safety, SAFETY_SCALE);
        case "green": return classedColor(FIELDS.green, GREEN_SCALE, NONE_COLOR);
        default: return parkMinutesColor(FIELDS.dgpPark);
    }
}

/** The Stadtteil summary attribute that matches a building measure. */
export function adminField(measure: MeasureId): string {
    const category = categoryOfMeasure(measure);
    if (category !== undefined) return shareField(category);
    switch (measure) {
        case "access": return ADMIN_FIELDS.decayMean;
        case "comfort": return ADMIN_FIELDS.comfortMean;
        case "safety": return ADMIN_FIELDS.safetyMean;
        case "green": return ADMIN_FIELDS.greenMean;
        default: return ADMIN_FIELDS.dgpMedian;
    }
}

/** Stadtteil fill colour of a measure. NULL (fewer than 5 buildings) is no-data. */
export function adminColor(measure: MeasureId): Expression {
    const field = adminField(measure);
    if (categoryOfMeasure(measure) !== undefined) return classedColor(field, SHARE_SCALE, NONE_COLOR);
    switch (measure) {
        case "access": return classedColor(field, ACCESS_SCALE);
        case "comfort": return classedColor(field, COMFORT_SCALE);
        case "safety": return classedColor(field, SAFETY_SCALE);
        case "green": return classedColor(field, GREEN_SCALE);
        default: return parkMinutesColor(field);
    }
}

// --- geometry ------------------------------------------------------------------------------------

/** Real building height in metres; NULL, missing or non-positive heights stay flat. Nothing is estimated. */
export function buildingHeightExpression(): Expression {
    const value = ["get", FIELDS.height];
    return ["case", ["all", isNumber(value), [">", value, 0]], value, 0];
}

/** 0 (a flat footprint) up to the 3D start zoom, the building's own height from the full zoom on. */
export function buildingExtrusionHeightExpression(): Expression {
    return ["interpolate", ["linear"], ["zoom"], BUILDING_3D_START_ZOOM, 0, BUILDING_3D_FULL_ZOOM, buildingHeightExpression()];
}

/** Same zoom behaviour for the selection overlay (a GeoJSON feature carrying `height`). */
export function selectionExtrusionHeightExpression(): Expression {
    return ["interpolate", ["linear"], ["zoom"], BUILDING_3D_START_ZOOM, 0, BUILDING_3D_FULL_ZOOM, ["+", ["coalesce", ["get", "height"], 0], 0.5]];
}

/** White footprint outline; a building whose walking origin is poor or crosses a barrier (`score_confidence` low) gets a magenta one. */
export function outlineColor(): Expression {
    return ["case", ["==", ["get", FIELDS.confidence], "low"], LOW_CONFIDENCE_OUTLINE, OUTLINE_COLOR];
}

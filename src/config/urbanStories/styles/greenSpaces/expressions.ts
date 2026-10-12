import { BUILDING_3D_FULL_ZOOM, BUILDING_3D_START_ZOOM } from "../fifteenMinute/constants";
import {
    AREA_CLASSES,
    AREA_CLASS_INFO,
    AREA_FIELDS,
    BUILDING_FIELDS,
    FEATURE_FALLBACK_COLOR,
    FEATURE_FIELDS,
    FEATURE_GROUPS,
    MINUTE_COLORS,
    MINUTE_LIMITS,
    MISSING_COLOR,
    NO_ORIGIN_COLOR,
    ZERO_SHARE_COLOR,
    accessField,
    accessStatusField,
    adminFieldOf,
    shareScaleOf,
    type AccessMeasure,
    type AdminMeasure,
    type ShareScale,
} from "./constants";

type Expression = unknown[];

/**
 * MapLibre expressions of the story. A NULL is not encoded in a vector tile, so every expression checks the type before
 * it reads a number: `to-number` of a missing property is 0 and would draw missing data as a short walk.
 */

const isNumber = (value: unknown): Expression => ["==", ["typeof", value], "number"];

// --- walking minutes --------------------------------------------------------------------------------

/** The five minute classes (upper-inclusive), shared by park and playground. */
function minuteClasses(value: Expression): Expression {
    const [a, b, c, d] = MINUTE_LIMITS;
    return [
        "case",
        ["<=", ["number", value], a], MINUTE_COLORS[0],
        ["<=", ["number", value], b], MINUTE_COLORS[1],
        ["<=", ["number", value], c], MINUTE_COLORS[2],
        ["<=", ["number", value], d], MINUTE_COLORS[3],
        MINUTE_COLORS[4],
    ];
}

/**
 * Building colour of one access measure. `no_origin` (the building is not connected to the network: not computable) and
 * any other missing time are two different greys; a real number, zero included, always gets a class.
 */
export function buildingMinutesColor(measure: AccessMeasure): Expression {
    const minutes = ["get", accessField(measure)];
    return [
        "case",
        ["==", ["get", accessStatusField(measure)], "no_origin"], NO_ORIGIN_COLOR,
        ["!", isNumber(minutes)], MISSING_COLOR,
        minuteClasses(minutes),
    ];
}

/** Stadtteil colour of a minute statistic; NULL (fewer than 5 buildings) is missing. */
export function adminMinutesColor(field: string): Expression {
    const minutes = ["get", field];
    return ["case", ["!", isNumber(minutes)], MISSING_COLOR, minuteClasses(minutes)];
}

/** Stadtteil colour of a 0–1 share. A real zero has a class of its own; NULL is missing. */
export function shareColor(field: string, scale: ShareScale): Expression {
    const share = ["get", field];
    return [
        "case",
        ["!", isNumber(share)], MISSING_COLOR,
        ["==", ["number", share], 0], ZERO_SHARE_COLOR,
        ["step", ["number", share], scale.colors[0], ...scale.limits.flatMap((limit, index) => [limit, scale.colors[index + 1]])],
    ];
}

export function adminColor(measure: AdminMeasure): Expression {
    if (measure === "park" || measure === "playground") return adminMinutesColor(adminFieldOf(measure));
    return shareColor(adminFieldOf(measure), shareScaleOf(measure) as ShareScale);
}

// --- buildings -----------------------------------------------------------------------------------------

/** Real building height in metres; NULL, missing or non-positive heights stay flat. Nothing is estimated. */
export function buildingHeightExpression(): Expression {
    const value = ["get", BUILDING_FIELDS.height];
    return ["case", ["all", isNumber(value), [">", value, 0]], value, 0];
}

export function buildingExtrusionHeightExpression(): Expression {
    return ["interpolate", ["linear"], ["zoom"], BUILDING_3D_START_ZOOM, 0, BUILDING_3D_FULL_ZOOM, buildingHeightExpression()];
}

// --- official green areas ------------------------------------------------------------------------------

/** Fill colour by `area_class`: nominal categories, one colour each. */
export function areaClassColor(): Expression {
    return ["match", ["get", AREA_FIELDS.class], ...AREA_CLASSES.flatMap((id) => [id, AREA_CLASS_INFO[id].color]), FEATURE_FALLBACK_COLOR];
}

/** Outline and label colour: the darker tone of the same class. */
export function areaClassInk(): Expression {
    return ["match", ["get", AREA_FIELDS.class], ...AREA_CLASSES.flatMap((id) => [id, AREA_CLASS_INFO[id].ink]), "#4b5563"];
}

export const isClass = (id: string): Expression => ["==", ["get", AREA_FIELDS.class], id];
export const isNamed = (): Expression => ["all", ["==", ["typeof", ["get", AREA_FIELDS.name]], "string"], ["!=", ["get", AREA_FIELDS.name], ""]];

// --- detailed features -------------------------------------------------------------------------------

/** Colour by the level-0 category code of the Feinkartierung. */
export function featureGroupColor(): Expression {
    return ["match", ["to-number", ["get", FEATURE_FIELDS.code0], -1], ...FEATURE_GROUPS.flatMap((group) => [group.code, group.color]), FEATURE_FALLBACK_COLOR];
}

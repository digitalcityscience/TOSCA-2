import {
    AGREEMENT_COLORS,
    BUILDING_3D_FULL_ZOOM,
    BUILDING_3D_START_ZOOM,
    COVERAGE_COLORS,
    DEPARTURE_CLASSES,
    DEPARTURE_INCOMPLETE_COLOR,
    DEPARTURE_ZERO_COLOR,
    FIELDS,
    MATCH_COLOR,
    NO_DATA_COLOR,
    NO_MATCH_COLOR,
    OTHER_BUILDING_COLOR,
    OUTSIDE_SHARE_STOPS,
    RESIDENTIAL_CODES,
    WALK_THRESHOLD_MIN,
    NO_DATA_AREA_COLOR,
    type AgreementClass,
} from "./constants";

/**
 * MapLibre expressions of the story's thematic building and area styles, plus JS twins used by the scene panel and
 * the tests. MVT does not encode NULL, so a missing property is the NULL case; `to-number` is therefore only ever
 * used with a fallback and `has` guards every "no value" branch.
 */

type Expression = unknown[];

/** Reads booleans whether the tile encodes them as a boolean or as the string "true". */
export function boolTrue(field: string): Expression {
    return ["==", ["to-string", ["get", field]], "true"];
}

function boolFalse(field: string): Expression {
    return ["==", ["to-string", ["get", field]], "false"];
}

function numberOr(field: string, fallback: number): Expression {
    return ["to-number", ["get", field], fallback];
}

/** Housing building assigned to its district by containment: the residential denominator of the story. */
export const RESIDENTIAL_EXPRESSION: Expression = [
    "all",
    ["in", numberOr(FIELDS.function, -1), ["literal", [...RESIDENTIAL_CODES]]],
    ["==", ["to-string", ["get", FIELDS.districtMatch]], "contains"],
];

const NO_ORIGIN: Expression = ["==", ["to-string", ["get", FIELDS.originQuality]], "none"];
const WALK_REACHED: Expression = [
    "all", ["has", FIELDS.walkMin], ["<=", numberOr(FIELDS.walkMin, 999), WALK_THRESHOLD_MIN],
];

/** Wraps a residential colour expression: everything outside the statistic is pale context, never a class colour. */
function residentialOnly(expression: Expression): Expression {
    return ["case", RESIDENTIAL_EXPRESSION, expression, OTHER_BUILDING_COLOR];
}

export function coverageColorExpression(): Expression {
    return residentialOnly(["case", boolTrue(FIELDS.inCatchment), COVERAGE_COLORS.inside, COVERAGE_COLORS.outside]);
}

export function agreementColorExpression(): Expression {
    return residentialOnly([
        "case",
        NO_ORIGIN, NO_DATA_COLOR,
        ["all", boolTrue(FIELDS.inCatchment), WALK_REACHED], AGREEMENT_COLORS.both,
        boolTrue(FIELDS.inCatchment), AGREEMENT_COLORS.officialOnly,
        WALK_REACHED, AGREEMENT_COLORS.walkingOnly,
        AGREEMENT_COLORS.neither,
    ]);
}

export function departuresColorExpression(): Expression {
    const steps = DEPARTURE_CLASSES.flatMap((item) => [item.min, item.color]);
    return residentialOnly([
        "case",
        ["!", ["has", FIELDS.departures]], NO_DATA_COLOR,
        boolFalse(FIELDS.departuresComplete), DEPARTURE_INCOMPLETE_COLOR,
        ["step", numberOr(FIELDS.departures, 0), DEPARTURE_ZERO_COLOR, ...steps],
    ]);
}

// --- scene 6 criteria --------------------------------------------------------------------------

export type CoverageFilter = "any" | "inside" | "outside";

/** What the user calls a gap. `null` / "any" = the criterion is off; active criteria are combined with AND. */
export interface Criteria {
    coverage: CoverageFilter;
    /** Walking time to the nearest stop is more than this many minutes (or no stop within 15). */
    walkMoreThan: number | null;
    /** Daily departures within reach are at most this many (complete data only). */
    departuresAtMost: number | null;
    /** Distinct lines within reach are at most this many. */
    linesAtMost: number | null;
    /** Limit the search to one Stadtteil (`stadtteil_code`); `null` = all of Hamburg. */
    area: string | null;
}

export const NO_CRITERIA: Criteria = { coverage: "any", walkMoreThan: null, departuresAtMost: null, linesAtMost: null, area: null };

export function criteriaActive(criteria: Criteria): boolean {
    return criteria.coverage !== "any" || criteria.walkMoreThan !== null
        || criteria.departuresAtMost !== null || criteria.linesAtMost !== null || criteria.area !== null;
}

/** Compact signature; "" when no criterion is on. Part of the style option id. */
export function criteriaSignature(criteria: Criteria): string {
    const parts = [
        criteria.coverage === "any" ? "" : `cov=${criteria.coverage}`,
        criteria.walkMoreThan === null ? "" : `walk>${criteria.walkMoreThan}`,
        criteria.departuresAtMost === null ? "" : `dep<=${criteria.departuresAtMost}`,
        criteria.linesAtMost === null ? "" : `lines<=${criteria.linesAtMost}`,
        criteria.area === null ? "" : `area=${criteria.area}`,
    ].filter((part) => part !== "");
    return parts.join(",");
}

function criteriaOperands(criteria: Criteria): Expression[] {
    const operands: Expression[] = [];
    if (criteria.area !== null) operands.push(["==", ["to-string", ["get", FIELDS.stadtteil]], criteria.area]);
    if (criteria.coverage === "inside") operands.push(boolTrue(FIELDS.inCatchment));
    if (criteria.coverage === "outside") operands.push(["!", boolTrue(FIELDS.inCatchment)]);
    if (criteria.walkMoreThan !== null) {
        operands.push(["all", ["!", NO_ORIGIN], ["any", ["!", ["has", FIELDS.walkMin]], [">", numberOr(FIELDS.walkMin, 0), criteria.walkMoreThan]]]);
    }
    if (criteria.departuresAtMost !== null) {
        operands.push(["all", ["has", FIELDS.departures], ["!", boolFalse(FIELDS.departuresComplete)], ["<=", numberOr(FIELDS.departures, 0), criteria.departuresAtMost]]);
    }
    if (criteria.linesAtMost !== null) {
        operands.push(["all", ["has", FIELDS.lines], ["<=", numberOr(FIELDS.lines, 0), criteria.linesAtMost]]);
    }
    return operands;
}

export function criteriaMatchExpression(criteria: Criteria): Expression {
    const operands = criteriaOperands(criteria);
    return operands.length === 0 ? ["literal", true] : ["all", ...operands];
}

/** Matching residential buildings are highlighted, the other residential buildings are dimmed, the rest is context. */
export function criteriaColorExpression(criteria: Criteria): Expression {
    return residentialOnly(["case", criteriaMatchExpression(criteria), MATCH_COLOR, NO_MATCH_COLOR]);
}

export function areaCql(area: string): string {
    return `${FIELDS.stadtteil}='${area.replace(/'/g, "")}'`;
}

/** Same criteria as a GeoServer CQL filter (residential population only), for the counts shown beside the map. */
export function criteriaCql(criteria: Criteria): string {
    const parts: string[] = [];
    if (criteria.area !== null) parts.push(areaCql(criteria.area));
    if (criteria.coverage === "inside") parts.push(`${FIELDS.inCatchment}=true`);
    if (criteria.coverage === "outside") parts.push(`${FIELDS.inCatchment}=false`);
    if (criteria.walkMoreThan !== null) {
        parts.push(`${FIELDS.originQuality}<>'none' AND (${FIELDS.walkMin}>${criteria.walkMoreThan} OR ${FIELDS.walkMin} IS NULL)`);
    }
    if (criteria.departuresAtMost !== null) {
        parts.push(`${FIELDS.departuresComplete}=true AND ${FIELDS.departures}<=${criteria.departuresAtMost}`);
    }
    if (criteria.linesAtMost !== null) parts.push(`${FIELDS.lines}<=${criteria.linesAtMost}`);
    return parts.join(" AND ");
}

// --- geometry ----------------------------------------------------------------------------------

/** Real building height in metres; NULL, missing or non-positive heights stay flat. Nothing is estimated. */
export function buildingHeightExpression(field: string = FIELDS.height): Expression {
    const value = ["get", field];
    return ["case", ["all", ["==", ["typeof", value], "number"], [">", value, 0]], value, 0];
}

/** 0 (a flat footprint) up to the 3D start zoom, the building's own height from the full zoom on. */
export function buildingExtrusionHeightExpression(field: string = FIELDS.height): Expression {
    return [
        "interpolate", ["linear"], ["zoom"],
        BUILDING_3D_START_ZOOM, 0,
        BUILDING_3D_FULL_ZOOM, buildingHeightExpression(field),
    ];
}

/** Same zoom behaviour for the selection overlay (a GeoJSON feature carrying `height`). */
export function selectionExtrusionHeightExpression(): Expression {
    return [
        "interpolate", ["linear"], ["zoom"],
        BUILDING_3D_START_ZOOM, 0,
        BUILDING_3D_FULL_ZOOM, ["+", ["coalesce", ["get", "height"], 0], 0.5],
    ];
}

// --- areas -------------------------------------------------------------------------------------

/** Continuous sequential colour of the outside share; grey for NULL, never the colour of 0. */
export function outsideShareColorExpression(field: string): Expression {
    const value = ["get", field];
    return [
        "case",
        ["==", ["typeof", value], "number"],
        ["interpolate", ["linear"], value, ...OUTSIDE_SHARE_STOPS.flatMap((stop) => [stop.value, stop.color])],
        NO_DATA_AREA_COLOR,
    ];
}

// --- JS twins (panel and tests) ----------------------------------------------------------------

export interface BuildingProps {
    [key: string]: unknown;
}

function num(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
    return null;
}

export function isTrue(value: unknown): boolean {
    return value === true || value === "true";
}

export function isResidentialProps(props: BuildingProps): boolean {
    const code = num(props[FIELDS.function]);
    return code !== null && RESIDENTIAL_CODES.includes(code) && props[FIELDS.districtMatch] === "contains";
}

export function hasWalkOrigin(props: BuildingProps): boolean {
    return props[FIELDS.originQuality] !== "none";
}

export function walkReached(props: BuildingProps): boolean {
    const walk = num(props[FIELDS.walkMin]);
    return walk !== null && walk <= WALK_THRESHOLD_MIN;
}

export function agreementClassOf(props: BuildingProps): AgreementClass | "no-origin" {
    if (!hasWalkOrigin(props)) return "no-origin";
    const official = isTrue(props[FIELDS.inCatchment]);
    const walking = walkReached(props);
    if (official && walking) return "both";
    if (official) return "officialOnly";
    return walking ? "walkingOnly" : "neither";
}

export function matchesCriteria(props: BuildingProps, criteria: Criteria): boolean {
    if (criteria.area !== null && String(props[FIELDS.stadtteil]) !== criteria.area) return false;
    if (criteria.coverage === "inside" && !isTrue(props[FIELDS.inCatchment])) return false;
    if (criteria.coverage === "outside" && isTrue(props[FIELDS.inCatchment])) return false;
    if (criteria.walkMoreThan !== null) {
        const walk = num(props[FIELDS.walkMin]);
        if (!hasWalkOrigin(props) || (walk !== null && walk <= criteria.walkMoreThan)) return false;
    }
    if (criteria.departuresAtMost !== null) {
        const departures = num(props[FIELDS.departures]);
        if (departures === null || props[FIELDS.departuresComplete] === false || props[FIELDS.departuresComplete] === "false"
            || departures > criteria.departuresAtMost) return false;
    }
    if (criteria.linesAtMost !== null) {
        const lines = num(props[FIELDS.lines]);
        if (lines === null || lines > criteria.linesAtMost) return false;
    }
    return true;
}

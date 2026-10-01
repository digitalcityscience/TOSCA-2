import type { OgcApiQueryable, OgcQueryableType } from "@store/externalDataSources";

export type OgcFilterOperator = "eq" | "neq" | "lt" | "lte" | "gt" | "gte" | "contains";

export interface OgcFilterCondition {
    property: string;
    operator: OgcFilterOperator;
    value: string;
}

export class OgcFilterValueError extends Error {
    constructor(readonly property: string, readonly value: string) {
        super(`Invalid value "${value}" for ${property}`);
        this.name = "OgcFilterValueError";
    }
}

const COMPARISON_SYMBOLS: Record<Exclude<OgcFilterOperator, "contains">, string> = {
    eq: "=",
    neq: "<>",
    lt: "<",
    lte: "<=",
    gt: ">",
    gte: ">=",
};

export function operatorsForType(type: OgcQueryableType): OgcFilterOperator[] {
    switch (type) {
        case "string":
            return ["eq", "neq", "contains"];
        case "number":
        case "integer":
            return ["eq", "neq", "lt", "lte", "gt", "gte"];
        case "boolean":
            return ["eq"];
        default:
            return ["eq", "neq"];
    }
}

function cql2Identifier(name: string): string {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `"${name.replace(/"/g, "\"\"")}"`;
}

function cql2String(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

function cql2Literal(queryable: OgcApiQueryable, value: string): string {
    if (queryable.type === "number" || queryable.type === "integer") {
        const trimmed = value.trim();
        const parsed = Number(trimmed);
        if (trimmed === "" || !Number.isFinite(parsed) || (queryable.type === "integer" && !Number.isInteger(parsed))) {
            throw new OgcFilterValueError(queryable.name, value);
        }
        return String(parsed);
    }
    if (queryable.type === "boolean") {
        if (value !== "true" && value !== "false") throw new OgcFilterValueError(queryable.name, value);
        return value;
    }
    return cql2String(value);
}

/** Conditions with a known, non-geometry property and a value; the rest are ignored. */
export function completeConditions(
    conditions: OgcFilterCondition[],
    queryables: OgcApiQueryable[]
): OgcFilterCondition[] {
    return conditions.filter((condition) =>
        condition.value !== "" &&
        queryables.some((queryable) => queryable.name === condition.property && !queryable.isGeometry)
    );
}

/**
 * Builds a CQL2-text filter that ANDs the given conditions.
 * Property names are validated against the queryables and literals are quoted,
 * so user input cannot change the structure of the expression.
 *
 * @throws {OgcFilterValueError} when a numeric/boolean value cannot be parsed.
 */
export function buildCql2Filter(
    conditions: OgcFilterCondition[],
    queryables: OgcApiQueryable[]
): string | undefined {
    const clauses = completeConditions(conditions, queryables).map((condition) => {
        const queryable = queryables.find((item) => item.name === condition.property)!;
        const identifier = cql2Identifier(queryable.name);
        if (condition.operator === "contains") {
            return `CASEI(${identifier}) LIKE CASEI(${cql2String(`%${condition.value}%`)})`;
        }
        return `${identifier} ${COMPARISON_SYMBOLS[condition.operator]} ${cql2Literal(queryable, condition.value)}`;
    });
    return clauses.length === 0 ? undefined : clauses.join(" AND ");
}

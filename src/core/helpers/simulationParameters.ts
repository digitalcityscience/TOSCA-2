/**
 * Run forms generated from a simulation model's `parameter_schema` (JSON Schema,
 * draft 2020-12). Supported: integer/number (`minimum`/`maximum`), `enum`,
 * boolean, and strings (`"format": "date"` as a date input). Properties of other
 * types are not shown; the backend fills them from `default_parameters`.
 * The backend validates again and answers with `"path: message"` errors.
 */

export type ParameterFieldKind = "integer" | "number" | "enum" | "boolean" | "date" | "text";
export type ParameterValue = string | number | boolean | null;

export interface ParameterField {
    name: string;
    title: string;
    description: string;
    kind: ParameterFieldKind;
    minimum?: number;
    maximum?: number;
    options?: Array<string | number | boolean>;
    required: boolean;
}

export type ParameterProblem =
    | { code: "required" }
    | { code: "number" }
    | { code: "integer" }
    | { code: "minimum"; limit: number }
    | { code: "maximum"; limit: number }
    | { code: "option" }
    | { code: "date" };

interface PropertySchema {
    type?: string | string[];
    enum?: Array<string | number | boolean>;
    title?: string;
    description?: string;
    minimum?: number;
    maximum?: number;
    format?: string;
}

function humanize(name: string): string {
    const words = name.replaceAll("_", " ").trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
}

function kindOf(property: PropertySchema): ParameterFieldKind | undefined {
    if (Array.isArray(property.enum)) return "enum";
    const type = Array.isArray(property.type) ? property.type.find((item) => item !== "null") : property.type;
    if (type === "integer") return "integer";
    if (type === "number") return "number";
    if (type === "boolean") return "boolean";
    if (type === "string") return property.format === "date" ? "date" : "text";
    return undefined;
}

/**
 * Property names in form order: the schema's `x-order` list when present (the
 * backend stores schemas as Postgres jsonb, which does not keep key order),
 * then any remaining properties.
 */
function propertyOrder(schema: Record<string, unknown>, properties: Record<string, PropertySchema>): string[] {
    const listed = Array.isArray(schema["x-order"])
        ? (schema["x-order"] as unknown[]).filter((name): name is string => typeof name === "string" && name in properties)
        : [];
    return [...listed, ...Object.keys(properties).filter((name) => !listed.includes(name))];
}

/** Form fields in the schema's form order. */
export function parameterFields(schema: Record<string, unknown> | null | undefined): ParameterField[] {
    const properties = (schema?.properties ?? {}) as Record<string, PropertySchema>;
    const required = new Set(Array.isArray(schema?.required) ? (schema.required as string[]) : []);
    const fields: ParameterField[] = [];
    for (const name of propertyOrder(schema ?? {}, properties)) {
        const property = properties[name];
        const kind = kindOf(property ?? {});
        if (kind === undefined) continue;
        fields.push({
            name,
            title: property.title ?? humanize(name),
            description: property.description ?? "",
            kind,
            ...(typeof property.minimum === "number" ? { minimum: property.minimum } : {}),
            ...(typeof property.maximum === "number" ? { maximum: property.maximum } : {}),
            ...(kind === "enum" ? { options: property.enum } : {}),
            required: required.has(name),
        });
    }
    return fields;
}

/** Start values: the model's defaults, else empty (booleans false). */
export function initialParameterValues(
    fields: ParameterField[],
    defaults: Record<string, unknown> | null | undefined
): Record<string, ParameterValue> {
    return Object.fromEntries(fields.map((field) => {
        const value = defaults?.[field.name];
        if (value !== undefined) return [field.name, value as ParameterValue];
        return [field.name, field.kind === "boolean" ? false : null];
    }));
}

/** Problems the form can show before submitting (the backend checks everything again). */
export function validateParameterValues(
    fields: ParameterField[],
    values: Record<string, ParameterValue>
): Record<string, ParameterProblem> {
    const problems: Record<string, ParameterProblem> = {};
    for (const field of fields) {
        const value = values[field.name];
        if (value === null || value === undefined || value === "") {
            if (field.required) problems[field.name] = { code: "required" };
            continue;
        }
        if (field.kind === "integer" || field.kind === "number") {
            if (typeof value !== "number" || !Number.isFinite(value)) {
                problems[field.name] = { code: "number" };
            } else if (field.kind === "integer" && !Number.isInteger(value)) {
                problems[field.name] = { code: "integer" };
            } else if (field.minimum !== undefined && value < field.minimum) {
                problems[field.name] = { code: "minimum", limit: field.minimum };
            } else if (field.maximum !== undefined && value > field.maximum) {
                problems[field.name] = { code: "maximum", limit: field.maximum };
            }
        } else if (field.kind === "enum" && !(field.options ?? []).includes(value as string | number | boolean)) {
            problems[field.name] = { code: "option" };
        } else if (field.kind === "date" && (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))) {
            problems[field.name] = { code: "date" };
        }
    }
    return problems;
}

/** The values to send: empty optional fields are left out so the backend applies its defaults. */
export function submittedParameters(values: Record<string, ParameterValue>): Record<string, ParameterValue> {
    return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== null && value !== ""));
}

/** Split backend messages (`"agents: 0 is less than the minimum of 1"`) by field. */
export function serverParameterErrors(
    errors: string[],
    fields: ParameterField[]
): { byField: Record<string, string>; other: string[] } {
    const names = new Set(fields.map((field) => field.name));
    const byField: Record<string, string> = {};
    const other: string[] = [];
    for (const error of errors) {
        const separator = error.indexOf(": ");
        const path = separator > 0 ? error.slice(0, separator) : "";
        const name = path.split(".")[0];
        if (names.has(name)) byField[name] = error.slice(separator + 2);
        else other.push(error);
    }
    return { byField, other };
}

import { expression, validateStyleMin } from "@maplibre/maplibre-gl-style-spec";

/**
 * Evaluate a real MapLibre expression with the style-spec engine MapLibre itself uses, so tests
 * assert what the map would draw, not what the config object looks like.
 */
type Evaluable = { evaluate: (globals: unknown, feature?: unknown) => unknown };

function compile(value: unknown, spec: { type: string; "property-type"?: string; expression?: unknown }): Evaluable {
    const created = expression.createExpression(value as never, spec as never);
    if (created.result !== "success") {
        throw new Error(created.value.map((error) => `${error.key}: ${error.message}`).join("; "));
    }
    return created.value as unknown as Evaluable;
}

export function colorAt(value: unknown, properties: Record<string, unknown>, zoom = 15): string {
    const compiled = compile(value, {
        type: "color",
        "property-type": "data-driven",
        expression: { interpolated: true, parameters: ["zoom", "feature"] },
    });
    const result = compiled.evaluate({ zoom }, { type: "Polygon", properties }) as { toString?: () => string };
    // Colors evaluate to a Color object; compare as a lowercase hex via its channel values.
    const color = result as unknown as { r: number; g: number; b: number; a: number };
    const hex = (channel: number): string => Math.round(channel * 255).toString(16).padStart(2, "0");
    return `#${hex(color.r / (color.a || 1))}${hex(color.g / (color.a || 1))}${hex(color.b / (color.a || 1))}`;
}

export function passesFilter(filter: unknown, properties: Record<string, unknown>, zoom = 15): boolean {
    const compiled = compile(filter, {
        type: "boolean",
        "property-type": "data-driven",
        expression: { interpolated: false, parameters: ["zoom", "feature"] },
    });
    try {
        return compiled.evaluate({ zoom }, { type: "Polygon", properties }) === true;
    } catch {
        return false;
    }
}

/** Validate a whole style layer set against the MapLibre style spec; returns the error messages. */
export function styleErrors(layers: unknown[], sourceLayerNames: string[]): string[] {
    const style = {
        version: 8,
        sources: { tiles: { type: "vector", tiles: ["https://example.test/{z}/{x}/{y}.pbf"] } },
        layers: layers.map((layer) => ({ ...(layer as object), source: "tiles" })),
    };
    void sourceLayerNames;
    return validateStyleMin(style as never).map((error) => error.message);
}

export function numberAt(value: unknown, properties: Record<string, unknown>, zoom = 15): number {
    const compiled = compile(value, {
        type: "number",
        "property-type": "data-driven",
        expression: { interpolated: true, parameters: ["zoom", "feature"] },
    });
    return compiled.evaluate({ zoom }, { type: "Polygon", properties }) as number;
}

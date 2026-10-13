import type { WalkScale } from "./metrics";
import { NO_DATA_COLOR } from "./metrics";

export const WALK_SELECTED_STATE = "walkability-selected";
export const selectedAccent = (normal: unknown): unknown[] => ["case", ["boolean", ["feature-state", WALK_SELECTED_STATE], false], "#ffdc00", normal];

/** Screen pixels, not measured sidewalk widths. Zoom remains the top-level expression input. */
export function streetWidth(casing = false): unknown[] {
    const halo = casing ? 1.7 : 0;
    return ["interpolate", ["linear"], ["zoom"], 9, 0.8 + halo, 11, 1.25 + halo, 13, 2 + halo, 15, 3.6 + halo, 16, 5 + halo, 18, 8 + halo, 20, 12 + halo];
}

/** At city scale the network is a quiet overview; close up every individual segment is selectable. */
export const streetOpacity = (): unknown[] => ["interpolate", ["linear"], ["zoom"], 9, 0.72, 11, 0.8, 13, 0.9, 15, 1];

/** Explicit type guards prevent to-number(null) turning unknown into a real zero. */
export function colorExpression(scale: WalkScale): unknown[] {
    const get = ["get", scale.field];
    if (typeof scale.values[0] === "string") {
        return ["match", get, ...scale.values.flatMap((value, i) => [value, scale.colors[i]]), NO_DATA_COLOR];
    }
    const number = ["number", get, -1];
    const valid: unknown[] = ["all", ["==", ["typeof", get], "number"], [">=", number, 0]];
    if (scale.max !== undefined) valid.push(["<=", number, scale.max]);
    if (scale.integer === true) valid.push(["==", number, ["floor", number]]);
    return ["case", valid,
        ["step", number, scale.colors[0], ...scale.values.slice(1).flatMap((value, i) => [value, scale.colors[i + 1]])],
        NO_DATA_COLOR];
}

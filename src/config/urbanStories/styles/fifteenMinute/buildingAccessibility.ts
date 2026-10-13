/**
 * Shared building-rendering constants of the frontend-styled Urban Stories (the Walking-around-your-building
 * story uses them; the 15-Minute City story has its own zoom behaviour in `./constants`).
 */

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

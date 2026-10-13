import type { OverviewCamera } from "./types";

/**
 * Places the Green Spaces story flies to. Every identifier below was read from the published R09–R11 / R17 GeoStories
 * layers on the live TOSCA GeoServer (2026-10-12). The story chain is one place: Nienstedten, a Stadtteil in Altona with
 * the Hirschpark, good modelled park access and comparatively long modelled walks to a playground; its neighbour
 * Othmarschen has similar park access and clearly shorter playground walks. The panel reads every number again at
 * runtime, so no statistic below is ever copied into a narrative text.
 */

export interface VerifiedBuilding {
    /** ALKIS building id (`gml_id`), a stable geographic identifier. */
    id: string;
    /** `[lon, lat]` of the footprint centre. */
    center: [number, number];
    /** What the building illustrates; shown as a button label. */
    role: "near-park" | "far-park" | "near-playground" | "far-playground";
}

export interface VerifiedArea {
    /** Stadtteil id (`stadtteil_id`). */
    id: string;
    name: string;
    /** `[west, south, east, north]` from the WFS bounding box. */
    bounds: [number, number, number, number];
}

export interface VerifiedGreenArea {
    /** `green_area_id` of the official DGP polygon. */
    areaId: string;
    /** `dgp_idnr`, the key that ties Feinkartierung objects to the DGP polygon. */
    idnr: number;
    name: string;
    /** `[west, south, east, north]` of the polygon. */
    bounds: [number, number, number, number];
    center: [number, number];
}

// --- scene 2: inside the park --------------------------------------------------------------------------------

/**
 * Official recreational park (`area_class = recreational_park`, 23.9 ha, Nienstedten). Its `dgp_idnr` carries 142 point,
 * 38 line and 229 polygon Feinkartierung objects: 45 path polygons, 115 planting areas, lawns, fences, a stream and one
 * playground surface.
 */
export const HIRSCHPARK: VerifiedGreenArea = {
    areaId: "dgp:public_green:2692",
    idnr: 2692,
    name: "Hirschpark",
    bounds: [9.8213, 53.5534, 9.8325, 53.5596],
    center: [9.8269, 53.5565],
};

/** The official playground polygon in the same park (`area_class = playground`, 1,629 m², its own `dgp_idnr`). */
export const HIRSCHPARK_PLAYGROUND: VerifiedGreenArea = {
    areaId: "dgp:public_green:3281",
    idnr: 3281,
    name: "Hirschpark",
    bounds: [9.8233, 53.5575, 9.824, 53.558],
    center: [9.82365, 53.55775],
};

// --- scenes 3 to 5: Nienstedten and Othmarschen ---------------------------------------------------------------

/** Median walk to a park 5.2 min (90th percentile 11.3), to a playground 16.4 min (90th percentile 23.0). */
export const NIENSTEDTEN: VerifiedArea = { id: "210", name: "Nienstedten", bounds: [9.8204, 53.5442, 9.8651, 53.5654] };
/** Median walk to a park 4.8 min (90th percentile 7.6), to a playground 9.2 min (90th percentile 14.7). */
export const OTHMARSCHEN: VerifiedArea = { id: "207", name: "Othmarschen", bounds: [9.8639, 53.5415, 9.9175, 53.56] };

/** Next to the Hirschpark: 0.9 min to a park, 8.5 min to a playground. */
export const PARK_NEAR: VerifiedBuilding = { id: "DEHHALKAP0000yad", center: [9.83112, 53.5578], role: "near-park" };
/** Farther east: 10.7 min to a park, 17.4 min to a playground. */
export const PARK_FAR: VerifiedBuilding = { id: "DEHHALKAP0000yZF", center: [9.83876, 53.55668], role: "far-park" };

/** Beside the Hirschpark playground: 4.5 min to a park, 2.4 min to a playground. */
export const PLAYGROUND_NEAR: VerifiedBuilding = { id: "DEHHALKAP0000xKE", center: [9.82268, 53.55667], role: "near-playground" };
/** 325 m away: 3.6 min to a park (a similar time), but 17.2 min to a playground. */
export const PLAYGROUND_FAR: VerifiedBuilding = { id: "DEHHALKAP0000x8O", center: [9.82564, 53.55433], role: "far-playground" };

export const PARK_EXAMPLES: readonly VerifiedBuilding[] = [PARK_NEAR, PARK_FAR];
export const PLAYGROUND_EXAMPLES: readonly VerifiedBuilding[] = [PLAYGROUND_NEAR, PLAYGROUND_FAR];

// --- cameras --------------------------------------------------------------------------------------------------

export const CITY_CAMERA: OverviewCamera = { center: [10.03, 53.565], zoom: 9.8 };
export const PARK_CAMERA: OverviewCamera = { center: HIRSCHPARK.center, zoom: 15.6 };
/** District scale: the Stadtteile carry the colour; the story then flies in to Nienstedten. */
export const DISTRICT_CAMERA: OverviewCamera = { center: [9.86, 53.555], zoom: 11 };
export const COMPARE_CAMERA: OverviewCamera = { center: [9.8245, 53.5555], zoom: 15.1, pitch: 45 };
export const EXPLORE_CAMERA: OverviewCamera = { center: [10.03, 53.565], zoom: 10.2 };

/** Zoom of the neighbourhood view the district view flies in to: flat footprints, readable parks and playgrounds. */
export const NEIGHBOURHOOD_MAX_ZOOM = 14.4;

import type { OverviewCamera } from "./types";

/**
 * Places the 15-Minute City story flies to. Each was verified against the R17 GeoStories export
 * (`export/hamburg_buildings`, `export/hamburg_administrative`) and against the live TOSCA GeoServer on 2026-10-12.
 * The panel reads every number again at runtime, so no statistic below is ever copied into a narrative text.
 */

export interface VerifiedBuilding {
    /** ALKIS building id (`gml_id`), a stable geographic identifier. */
    id: string;
    /** `[lon, lat]` of the footprint centre. */
    center: [number, number];
}

export interface VerifiedArea {
    /** Stadtteil id (`stadtteil_id`). */
    id: string;
    name: string;
    /** `[west, south, east, north]` from the WFS bounding box. */
    bounds: [number, number, number, number];
}

// --- scene 2 and 3: similar score, different profile ----------------------------------------------------------

/** Mean overall score 64.3 (count mean 7.40 of 9); health reached by 73 %, culture by 65 % of housing buildings. */
export const WILHELMSBURG: VerifiedArea = { id: "116", name: "Wilhelmsburg", bounds: [9.9388, 53.4539, 10.079, 53.5264] };
/** Mean overall score 64.7 (count mean 7.34 of 9); health, food, education, restaurants reached by 100 %, culture by 0 %. */
export const LANGENBEK: VerifiedArea = { id: "706", name: "Langenbek", bounds: [9.9788, 53.428, 9.9972, 53.4374] };

/** Scene 3: a housing building in Langenbek that reaches 8 of 9 categories (score 77.3); no culture place within 15 min. */
export const LANGENBEK_EXAMPLE: VerifiedBuilding = { id: "DEHHALKAz0000G0q", center: [9.98483, 53.4364] };

// --- scene 4: accessible, but comfortable? ------------------------------------------------------------------

/** Mean overall score 69.6 (8.13 of 9 categories), mean comfort 73.6: the lowest comfort mean among Stadtteile averaging 8 or more categories. */
export const BLANKENESE: VerifiedArea = { id: "211", name: "Blankenese", bounds: [9.7618, 53.5508, 9.8267, 53.5743] };
/** Mean overall score 68.4, mean comfort 80.3: nearly the same score, a different comfort. */
export const FARMSEN_BERNE: VerifiedArea = { id: "506", name: "Farmsen-Berne", bounds: [10.0947, 53.5907, 10.1505, 53.639] };

/** Score 72.8 (9 of 9 categories), comfort 59.1; high confidence, comfort data covers 100 % of the network within 400 m. */
export const BLANKENESE_EXAMPLE: VerifiedBuilding = { id: "DEHHALKAP0000rWE", center: [9.81002, 53.55636] };
/** Score 72.1 (9 of 9 categories), comfort 85.1; high confidence, comfort data covers 100 %. */
export const FARMSEN_EXAMPLE: VerifiedBuilding = { id: "DEHHALKA700023bv", center: [10.12919, 53.59811] };

// --- scene 5: accessible, but safe? ---------------------------------------------------------------------------

/** Mean overall score 92.8, mean safety index 27.8. */
export const OTTENSEN: VerifiedArea = { id: "204", name: "Ottensen", bounds: [9.9094, 53.5415, 9.9349, 53.5601] };
/** Mean overall score 90.8, mean safety index 33.3. */
export const HOHELUFT_WEST: VerifiedArea = { id: "304", name: "Hoheluft-West", bounds: [9.957, 53.5761, 9.9762, 53.5862] };

/** Score 96.8 (9 of 9), comfort 84.5, safety index 25.0; 3.4 km of scored network within 400 m. */
export const OTTENSEN_EXAMPLE: VerifiedBuilding = { id: "DEHHALKAP0001FnI", center: [9.9311, 53.55561] };
/** Score 96.2 (9 of 9), comfort 85.0, safety index 37.3; 7.0 km of scored network within 400 m. */
export const HOHELUFT_EXAMPLE: VerifiedBuilding = { id: "DEHHALKAV0000vd5", center: [9.97087, 53.57949] };

// --- scene cameras --------------------------------------------------------------------------------------

export const CITY_CAMERA: OverviewCamera = { center: [10.03, 53.565], zoom: 9.8 };
export const COMPARE_CAMERA: OverviewCamera = { center: [9.985, 53.4785], zoom: 11.2 };
export const WEAKEST_CAMERA: OverviewCamera = { center: [9.9885, 53.4325], zoom: 14.6, pitch: 45 };
export const COMFORT_CAMERA: OverviewCamera = { center: [9.8075, 53.5575], zoom: 15.2, pitch: 50 };
export const SAFETY_CAMERA: OverviewCamera = { center: [9.9311, 53.5545], zoom: 15.2, pitch: 50 };
export const EXPLORE_CAMERA: OverviewCamera = { center: [10.03, 53.565], zoom: 10.2 };

/** A building shown as a worked example, with the Stadtteil it lies in. `tone` is the outline colour of that place. */
export interface SceneExample {
    building: VerifiedBuilding;
    area: VerifiedArea;
    tone: "a" | "b";
}

/** The places and buildings of the scenes that compare two examples. Scene 3 shows its single example in Langenbek. */
export const SCENE_EXAMPLES = {
    weakest: [{ building: LANGENBEK_EXAMPLE, area: LANGENBEK, tone: "a" }],
    comfort: [
        { building: BLANKENESE_EXAMPLE, area: BLANKENESE, tone: "a" },
        { building: FARMSEN_EXAMPLE, area: FARMSEN_BERNE, tone: "b" },
    ],
    safety: [
        { building: OTTENSEN_EXAMPLE, area: OTTENSEN, tone: "a" },
        { building: HOHELUFT_EXAMPLE, area: HOHELUFT_WEST, tone: "b" },
    ],
} as const satisfies Record<string, readonly SceneExample[]>;

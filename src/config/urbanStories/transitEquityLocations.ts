import type { OverviewCamera } from "./types";

/**
 * Locations the Public Transport Equity story flies to. Every entry was verified against the GeoStories export
 * served by the TOSCA GeoServer (Export R17, 2026-10-12) and the official HVV catchment service; the verification
 * facts are noted per entry. The story panel reads the live values again at runtime, so no statistic below is
 * ever copied into a narrative text.
 */

export interface VerifiedBuilding {
    /** ALKIS building id (`gml_id`), a stable geographic identifier. */
    id: string;
    /** `[lon, lat]` of the building's label point. */
    center: [number, number];
    role: string;
}

export interface VerifiedArea {
    /** Stadtteil id (= `stadtteil_code` of its buildings). */
    id: string;
    name: string;
    bounds: [number, number, number, number];
}

/** Langenhorn (Bezirk Hamburg-Nord): 7,918 housing buildings, 2,930 (37.0 %) outside every official catchment. */
export const LANGENHORN: VerifiedArea = { id: "413", name: "Langenhorn", bounds: [9.9852, 53.637, 10.0435, 53.682] };

/** Ohlsdorf: Langenhorn's southern neighbour, 1,963 housing buildings, 10.4 % without any departure in reach. */
export const OHLSDORF: VerifiedArea = { id: "411", name: "Ohlsdorf", bounds: [10.0113, 53.6065, 10.0852, 53.6382] };

/** Scene 2: housing building outside every catchment, 8.95 min modelled walk to the nearest stop, no departures. */
export const GAP_EXAMPLE: VerifiedBuilding = { id: "DEHHALKAP0007MMr", center: [10.00868, 53.66384], role: "outside" };

/** Scene 3: same Stadtteil, both inside an official catchment, very different service. */
export const SERVICE_HIGH: VerifiedBuilding = { id: "DEHHALKAP0007QTC", center: [10.01305, 53.64847], role: "high-service" };
export const SERVICE_LOW: VerifiedBuilding = { id: "DEHHALKAP0007R8B", center: [10.02495, 53.64526], role: "low-service" };

/** Scene 4: within 400 m of [10.0215, 53.680], 42 buildings are official-only and 39 walking-only (threshold 6 min). */
export const OFFICIAL_ONLY_EXAMPLE: VerifiedBuilding = { id: "DEHHALKAP0007T2N", center: [10.02149, 53.67967], role: "official-only" };
export const WALKING_ONLY_EXAMPLE: VerifiedBuilding = { id: "DEHHALKAP0007KSJ", center: [10.0198, 53.68122], role: "walking-only" };

export const CITY_CAMERA: OverviewCamera = { center: [10.03, 53.565], zoom: 9.8 };
export const LANGENHORN_CAMERA: OverviewCamera = { center: [10.0143, 53.6595], zoom: 12.6 };
export const SERVICE_CAMERA: OverviewCamera = { center: [10.019, 53.6468], zoom: 14.6, pitch: 45 };
export const AGREEMENT_CAMERA: OverviewCamera = { center: [10.0208, 53.6805], zoom: 16.2, pitch: 55 };
export const COMPARE_CAMERA: OverviewCamera = { center: [10.0355, 53.6445], zoom: 11.9 };
export const EXPLORE_CAMERA: OverviewCamera = { center: [10.0, 53.57], zoom: 11.3 };

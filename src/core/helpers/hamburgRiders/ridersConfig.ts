/**
 * Constants of the HamburgRiders module.
 * Adapted from hamburgriders `constants.ts` / `types/index.ts` (MIT, see NOTICE.md); colours and ordering are unchanged.
 */

export const RIDERS_NS = "hamburgriders";

/** Seconds since service-day midnight. The timeline spans 05:00 to 05:00 of the next day. */
export const ANIM_START_SEC = 18000;
export const ANIM_END_SEC = 104400;
export const DEFAULT_START = 25200;
export const DEFAULT_SPEED = 300;
export const SPEED_OPTIONS = [10, 30, 120, 300, 600, 1200, 3600] as const;

export const RIDERS_MODES = ["s-bahn", "u-bahn", "bus", "regional"] as const;
export type RidersMode = typeof RIDERS_MODES[number];

/** The GTFS `transit_type` strings of the pre-built data, per mode. */
export const MODE_GTFS_TYPE: Record<RidersMode, string> = {
    "s-bahn": "S-Bahn",
    "u-bahn": "U-Bahn",
    bus: "Bus",
    regional: "Regional",
};

export interface RidersModeStyle {
    hex: string;
    rgb: [number, number, number];
}

export const MODE_STYLE: Record<RidersMode, RidersModeStyle> = {
    "s-bahn": { hex: "#50c878", rgb: [0, 180, 80] },
    "u-bahn": { hex: "#E2001A", rgb: [226, 0, 26] },
    regional: { hex: "#F39100", rgb: [243, 145, 0] },
    bus: { hex: "#5b9bd5", rgb: [91, 155, 213] },
};

export const BUS_TYPES = ["MetroBus", "ExpressBus", "NightBus", "StandardBus"] as const;
export type RidersBusType = typeof BUS_TYPES[number];

export const BUS_TYPE_CONFIG: Record<RidersBusType, { label: string; color: string; icon: string; description: string }> = {
    MetroBus: { label: "Metrobus", color: "38BDF8", icon: "F", description: "Frequent high-capacity HVV bus lines, shown as MetroBus in the feed." },
    ExpressBus: { label: "Express", color: "C084FC", icon: "X", description: "Fast bus services with fewer stops, including XpressBus and SchnellBus routes." },
    NightBus: { label: "Night", color: "F0ABFC", icon: "N", description: "Night bus routes, mainly 600-series HVV lines." },
    StandardBus: { label: "Regular", color: "E2E8F0", icon: "R", description: "Regular bus routes that are not classified as frequent, express, or night services." },
};

/** Vehicle colours that override the GTFS route colour (S-Bahn and U-Bahn keep their line colours). */
export const VEHICLE_TYPE_COLORS: Record<string, string> = {
    Regional: "FFD166",
    MetroBus: "38BDF8",
    ExpressBus: "C084FC",
    NightBus: "F0ABFC",
    StandardBus: "E2E8F0",
};

/** Dark basemap of the original application (CARTO Dark Matter). */
export const RIDERS_DARK_STYLE_URL = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
export const RIDERS_DARK_BASEMAP_ID = "hamburgriders-dark";

/** Camera of the original application. */
export const RIDERS_CAMERA = { center: [10.0, 53.55] as [number, number], zoom: 9 };

export const RIDERS_DATA_BASE_URL = "/hamburgriders/data/";

export interface RidersFeedMeta {
    date: string;
    dateLabel: string;
    title: string;
    stats: { totalTrips: number; totalStops: number; totalRoutes: number };
    feed: { publisher: string; version: string; startDate: string; endDate: string; url: string; description: string };
}

export interface RidersRoute {
    id: string;
    short_name: string;
    long_name: string;
    color: string;
    agency_id: string;
    transit_type: string;
    bus_type?: string;
    /** Resolved by the loader. */
    mode: RidersMode;
    busType?: RidersBusType;
    /** Colour the vehicles of this route are drawn in (hex without `#`). */
    vehicleColor: string;
}

/** One entry of the route list: GTFS routes with the same mode and short name share one line. */
export interface RidersLine {
    /** `u-bahn|U3`. Stable id used by the API and the state. */
    key: string;
    mode: RidersMode;
    shortName: string;
    longName: string;
    color: string;
    routeIds: string[];
    tripCount: number;
}

export interface RidersStopFeature {
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: { id: string; name: string; mode: RidersMode; transit_type: string };
}

/** Compact, transferable timetable: trip `i` owns points `tripOffset[i] .. tripOffset[i+1]`. */
export interface RidersTimetable {
    tripCount: number;
    tripRoute: Uint16Array;
    tripStart: Int32Array;
    tripEnd: Int32Array;
    tripOffset: Uint32Array;
    ptLon: Float32Array;
    ptLat: Float32Array;
    ptTime: Int32Array;
    tripIds: string[];
    headsigns: string[];
}

export interface RidersWorkerResult {
    meta: RidersFeedMeta;
    routes: RidersRoute[];
    routeTripCounts: number[];
    timetable: RidersTimetable;
    stops: RidersStopFeature[];
}

export interface RidersWorkerRequest {
    baseUrl: string;
}

export type RidersWorkerResponse =
    | { type: "result"; result: RidersWorkerResult }
    | { type: "error"; message: string };

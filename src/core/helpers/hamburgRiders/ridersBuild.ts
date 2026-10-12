/**
 * Turns the raw hamburgriders JSON files into the compact structures the module renders from.
 * Pure (no fetch, no DOM) so it runs in the worker and in tests. Classification mirrors hamburgriders `DataManager`.
 */
import {
    MODE_GTFS_TYPE,
    RIDERS_MODES,
    VEHICLE_TYPE_COLORS,
    type RidersBusType,
    type RidersFeedMeta,
    type RidersMode,
    type RidersRoute,
    type RidersStopFeature,
    type RidersWorkerResult,
} from "./ridersConfig";

interface RawRoute {
    id: string;
    short_name: string;
    long_name: string;
    color: string;
    agency_id: string;
    transit_type: string;
    bus_type?: string;
}

interface RawStop { id: string; name: string; lat: number; lon: number }
interface RawStopTime { stop_id: string; arr: number | null; dep: number | null }
interface RawTrip { trip_id: string; route_id: string; headsign: string; stops: RawStopTime[] }

export interface RawRidersFiles {
    meta: RidersFeedMeta;
    stops: RawStop[];
    /** `stop id -> [lat, lon]` */
    stopCoords: Record<string, [number, number]>;
    routes: RawRoute[];
    trips: RawTrip[];
}

export function busTypeOf(route: Pick<RawRoute, "bus_type">): RidersBusType {
    if (route.bus_type === "XpressBus" || route.bus_type === "SchnellBus") return "ExpressBus";
    return (route.bus_type as RidersBusType | undefined) ?? "StandardBus";
}

/** A route with a `bus_type` is a bus whatever its GTFS `transit_type` says ("Night" routes are buses). */
export function modeOfRoute(route: Pick<RawRoute, "bus_type" | "transit_type">): RidersMode {
    if (route.bus_type !== undefined) return "bus";
    const match = RIDERS_MODES.find((mode) => MODE_GTFS_TYPE[mode] === route.transit_type);
    return match ?? "bus";
}

export function vehicleColorOf(route: RawRoute): string {
    if (route.bus_type !== undefined) return VEHICLE_TYPE_COLORS[busTypeOf(route)] ?? route.color ?? "4a90d9";
    return VEHICLE_TYPE_COLORS[route.transit_type] ?? route.color ?? "4a90d9";
}

export function buildRidersDataset(raw: RawRidersFiles): RidersWorkerResult {
    const routes: RidersRoute[] = raw.routes.map((route) => {
        const mode = modeOfRoute(route);
        return {
            ...route,
            mode,
            busType: mode === "bus" ? busTypeOf(route) : undefined,
            vehicleColor: vehicleColorOf(route),
        };
    });
    const routeIndex = new Map(routes.map((route, index) => [route.id, index]));
    const routeTripCounts = new Array<number>(routes.length).fill(0);

    let pointBudget = 0;
    for (const trip of raw.trips) pointBudget += trip.stops.length;

    const tripRoute: number[] = [];
    const tripStart: number[] = [];
    const tripEnd: number[] = [];
    const tripOffset: number[] = [0];
    const tripIds: string[] = [];
    const headsigns: string[] = [];
    const ptLon = new Float32Array(pointBudget);
    const ptLat = new Float32Array(pointBudget);
    const ptTime = new Int32Array(pointBudget);
    let points = 0;

    for (const trip of raw.trips) {
        const index = routeIndex.get(trip.route_id);
        if (index === undefined) continue;
        routeTripCounts[index] += 1;
        const first = points;
        for (const stopTime of trip.stops) {
            const coords = raw.stopCoords[stopTime.stop_id];
            const time = stopTime.arr ?? stopTime.dep;
            if (coords === undefined || time === null) continue;
            ptLon[points] = coords[1];
            ptLat[points] = coords[0];
            ptTime[points] = time;
            points += 1;
        }
        if (points - first < 2) {
            points = first;
            continue;
        }
        tripRoute.push(index);
        tripStart.push(ptTime[first]);
        tripEnd.push(ptTime[points - 1]);
        tripOffset.push(points);
        tripIds.push(trip.trip_id);
        headsigns.push(trip.headsign || "");
    }

    // Stops are listed once per mode that serves them (a station can be S-Bahn and U-Bahn at once).
    const modesByStop = new Map<string, Set<RidersMode>>();
    for (const trip of raw.trips) {
        const index = routeIndex.get(trip.route_id);
        if (index === undefined) continue;
        const mode = routes[index].mode;
        for (const stopTime of trip.stops) {
            let modes = modesByStop.get(stopTime.stop_id);
            if (modes === undefined) {
                modes = new Set();
                modesByStop.set(stopTime.stop_id, modes);
            }
            modes.add(mode);
        }
    }
    const stops: RidersStopFeature[] = [];
    for (const mode of RIDERS_MODES) {
        for (const stop of raw.stops) {
            if (!modesByStop.get(stop.id)?.has(mode)) continue;
            stops.push({
                type: "Feature",
                geometry: { type: "Point", coordinates: [stop.lon, stop.lat] },
                properties: { id: stop.id, name: stop.name, mode, transit_type: MODE_GTFS_TYPE[mode] },
            });
        }
    }

    return {
        meta: raw.meta,
        routes,
        routeTripCounts,
        timetable: {
            tripCount: tripRoute.length,
            tripRoute: Uint16Array.from(tripRoute),
            tripStart: Int32Array.from(tripStart),
            tripEnd: Int32Array.from(tripEnd),
            tripOffset: Uint32Array.from(tripOffset),
            ptLon: ptLon.slice(0, points),
            ptLat: ptLat.slice(0, points),
            ptTime: ptTime.slice(0, points),
            tripIds,
            headsigns,
        },
        stops,
    };
}

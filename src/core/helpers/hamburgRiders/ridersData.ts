/**
 * Dataset access of the HamburgRiders module: a single cached load (parsed in a worker), plus the grouping of
 * routes into the selectable entries of the control panel.
 */
import {
    BUS_TYPES,
    BUS_TYPE_CONFIG,
    RIDERS_DATA_BASE_URL,
    RIDERS_MODES,
    type RidersMode,
    type RidersRoute,
    type RidersStopFeature,
    type RidersTimetable,
    type RidersWorkerResponse,
    type RidersWorkerResult,
    type RidersFeedMeta,
} from "./ridersConfig";

/**
 * One selectable vehicle group. Rail and regional lines are grouped by short name (several GTFS routes can share
 * "U3"); buses are grouped by bus type, as in the original panel.
 */
export interface RidersGroup {
    /** `u-bahn|U3` or `bus|MetroBus`. */
    key: string;
    kind: "line" | "bus-type";
    mode: RidersMode;
    label: string;
    longName: string;
    /** Hex without `#`. */
    color: string;
    tripCount: number;
    routeIds: string[];
}

export interface RidersDataset {
    meta: RidersFeedMeta;
    routes: RidersRoute[];
    groups: RidersGroup[];
    groupIndex: Map<string, number>;
    /** Route index -> group index. */
    routeGroup: number[];
    /** Trip index -> group index. */
    tripGroup: Uint16Array;
    modeGroups: Record<RidersMode, number[]>;
    timetable: RidersTimetable;
    stops: RidersStopFeature[];
}

const numericCollator = new Intl.Collator(undefined, { numeric: true });

export function prepareRidersDataset(result: RidersWorkerResult): RidersDataset {
    const groups: RidersGroup[] = [];
    const groupIndex = new Map<string, number>();
    const routeGroup: number[] = [];

    result.routes.forEach((route, routeIndex) => {
        let key: string;
        let build: () => RidersGroup;
        if (route.mode === "bus") {
            const busType = route.busType ?? "StandardBus";
            key = `bus|${busType}`;
            build = () => ({
                key, kind: "bus-type", mode: "bus", label: BUS_TYPE_CONFIG[busType].label, longName: BUS_TYPE_CONFIG[busType].description,
                color: BUS_TYPE_CONFIG[busType].color, tripCount: 0, routeIds: [],
            });
        } else {
            const shortName = route.short_name || route.id;
            key = `${route.mode}|${shortName}`;
            build = () => ({
                key, kind: "line", mode: route.mode, label: shortName, longName: route.long_name || "",
                color: route.vehicleColor, tripCount: 0, routeIds: [],
            });
        }
        let index = groupIndex.get(key);
        if (index === undefined) {
            index = groups.length;
            groups.push(build());
            groupIndex.set(key, index);
        }
        const group = groups[index];
        group.routeIds.push(route.id);
        group.tripCount += result.routeTripCounts[routeIndex] ?? 0;
        if (group.longName === "" && route.long_name) group.longName = route.long_name;
        routeGroup.push(index);
    });

    // Stable order: modes in display order, lines by natural short-name order, bus types in their fixed order.
    const order = (group: RidersGroup): number => RIDERS_MODES.indexOf(group.mode);
    const sorted = [...groups].sort((a, b) => {
        if (order(a) !== order(b)) return order(a) - order(b);
        if (a.kind === "bus-type" && b.kind === "bus-type") {
            return BUS_TYPES.indexOf(a.key.split("|")[1] as typeof BUS_TYPES[number]) - BUS_TYPES.indexOf(b.key.split("|")[1] as typeof BUS_TYPES[number]);
        }
        return numericCollator.compare(a.label, b.label);
    });
    const remap = new Map(groups.map((group, oldIndex) => [oldIndex, sorted.indexOf(group)]));
    sorted.forEach((group, index) => groupIndex.set(group.key, index));
    const remappedRouteGroup = routeGroup.map((oldIndex) => remap.get(oldIndex) ?? oldIndex);

    const timetable = result.timetable;
    const tripGroup = new Uint16Array(timetable.tripCount);
    for (let trip = 0; trip < timetable.tripCount; trip += 1) {
        tripGroup[trip] = remappedRouteGroup[timetable.tripRoute[trip]];
    }
    const modeGroups = { "s-bahn": [], "u-bahn": [], bus: [], regional: [] } as Record<RidersMode, number[]>;
    sorted.forEach((group, index) => modeGroups[group.mode].push(index));

    return {
        meta: result.meta,
        routes: result.routes,
        groups: sorted,
        groupIndex,
        routeGroup: remappedRouteGroup,
        tripGroup,
        modeGroups,
        timetable,
        stops: result.stops,
    };
}

/**
 * Resolves a caller's reference to a group key: an exact key (`u-bahn|U3`), a line short name (`U3`,
 * case-insensitive, optionally limited to `mode`) or a bus type (`MetroBus`). Undefined when unknown or ambiguous.
 */
export function resolveGroupKey(dataset: RidersDataset, reference: string, mode?: RidersMode): string | undefined {
    if (dataset.groupIndex.has(reference)) return reference;
    const wanted = reference.trim().toLowerCase();
    const matches = dataset.groups.filter((group) => (
        (mode === undefined || group.mode === mode)
        && (group.label.toLowerCase() === wanted || (group.kind === "bus-type" && group.key.split("|")[1].toLowerCase() === wanted))
    ));
    return matches.length === 1 ? matches[0].key : undefined;
}

let cached: Promise<RidersDataset> | undefined;

function runWorker(baseUrl: string): Promise<RidersWorkerResult> {
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL("../../workers/hamburgRidersData.worker.ts", import.meta.url), { type: "module" });
        const finish = (): void => worker.terminate();
        worker.onmessage = (event: MessageEvent<RidersWorkerResponse>) => {
            finish();
            if (event.data.type === "result") resolve(event.data.result);
            else reject(new Error(event.data.message));
        };
        worker.onerror = (event) => {
            finish();
            reject(new Error(event.message || "HamburgRiders data worker failed"));
        };
        worker.postMessage({ baseUrl });
    });
}

/** Loads the timetable once and reuses it for every consumer; a failed load can be retried. */
export function loadRidersDataset(baseUrl: string = RIDERS_DATA_BASE_URL): Promise<RidersDataset> {
    if (cached === undefined) {
        cached = runWorker(baseUrl).then(prepareRidersDataset);
        cached.catch(() => {
            cached = undefined;
        });
    }
    return cached;
}

/** Drops the cached dataset (tests). */
export function resetRidersDatasetCache(): void {
    cached = undefined;
}

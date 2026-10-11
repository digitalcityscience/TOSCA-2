/**
 * The `tosca-trips` v1 replay bundle (contract: TOSCA-Backend
 * docs/development/geosimulation_frontend_integration.md, "Replay") flattened
 * into typed arrays for deck.gl's binary path data, so hundreds of thousands
 * of vertices never exist as JS objects on the main thread.
 */

export const STOP_KINDS = ["red_wait", "queued", "discharging"] as const;
export type StopKind = (typeof STOP_KINDS)[number];

export interface TripsBundle {
    encoding: "tosca-trips";
    encoding_version: 1;
    time_end_s: number;
    attributes: string[];
    trips: Array<{ id: string; a: Array<string | null>; p: Array<[number, number]>; t: number[] }>;
    stops: Array<{ id: string; kind: string; p: [number, number]; t0: number; t1: number; movement?: string }>;
}

export interface ReplayData {
    timeEnd: number;
    tripCount: number;
    vertexCount: number;
    /** Index of each trip's first vertex. */
    startIndices: Uint32Array;
    /** lon, lat per vertex. */
    positions: Float32Array;
    /** Seconds since the run's start, per vertex. */
    timestamps: Float32Array;
    tripIds: string[];
    attributeNames: string[];
    /** Distinct values per attribute. */
    attributeValues: string[][];
    /** Per attribute: one code (index into attributeValues) per trip. */
    attributeCodes: Uint16Array[];
    stopCount: number;
    stopPositions: Float32Array;
    /** t0, t1 per stop. */
    stopTimes: Float32Array;
    /** Index into STOP_KINDS per stop. */
    stopKinds: Uint8Array;
    /** Trip index per stop (-1 when the agent is unknown). */
    stopTrips: Int32Array;
}

export class ReplayFormatError extends Error {}

export function flattenTripsBundle(bundle: TripsBundle): ReplayData {
    if (bundle.encoding !== "tosca-trips" || bundle.encoding_version !== 1) {
        throw new ReplayFormatError(`Unsupported replay encoding ${bundle.encoding} v${bundle.encoding_version}`);
    }
    const tripCount = bundle.trips.length;
    const vertexCount = bundle.trips.reduce((sum, trip) => sum + trip.t.length, 0);
    const startIndices = new Uint32Array(tripCount);
    const positions = new Float32Array(vertexCount * 2);
    const timestamps = new Float32Array(vertexCount);
    const tripIds: string[] = new Array(tripCount);
    const attributeNames = bundle.attributes;
    const valueIndex = attributeNames.map(() => new Map<string, number>());
    const attributeValues: string[][] = attributeNames.map(() => []);
    const attributeCodes = attributeNames.map(() => new Uint16Array(tripCount));
    const tripIndex = new Map<string, number>();

    let vertex = 0;
    bundle.trips.forEach((trip, index) => {
        if (trip.p.length !== trip.t.length) {
            throw new ReplayFormatError(`Trip ${trip.id} has ${trip.p.length} positions but ${trip.t.length} times`);
        }
        startIndices[index] = vertex;
        tripIds[index] = trip.id;
        tripIndex.set(trip.id, index);
        for (let point = 0; point < trip.t.length; point += 1) {
            positions[(vertex + point) * 2] = trip.p[point][0];
            positions[(vertex + point) * 2 + 1] = trip.p[point][1];
            timestamps[vertex + point] = trip.t[point];
        }
        vertex += trip.t.length;
        attributeNames.forEach((_, attribute) => {
            const value = trip.a[attribute] ?? "";
            let code = valueIndex[attribute].get(value);
            if (code === undefined) {
                code = attributeValues[attribute].length;
                valueIndex[attribute].set(value, code);
                attributeValues[attribute].push(value);
            }
            attributeCodes[attribute][index] = code;
        });
    });

    const stops = bundle.stops.filter((stop) => (STOP_KINDS as readonly string[]).includes(stop.kind));
    const stopCount = stops.length;
    const stopPositions = new Float32Array(stopCount * 2);
    const stopTimes = new Float32Array(stopCount * 2);
    const stopKinds = new Uint8Array(stopCount);
    const stopTrips = new Int32Array(stopCount);
    stops.forEach((stop, index) => {
        stopPositions[index * 2] = stop.p[0];
        stopPositions[index * 2 + 1] = stop.p[1];
        stopTimes[index * 2] = stop.t0;
        stopTimes[index * 2 + 1] = stop.t1;
        stopKinds[index] = STOP_KINDS.indexOf(stop.kind as StopKind);
        stopTrips[index] = tripIndex.get(stop.id) ?? -1;
    });

    return {
        timeEnd: bundle.time_end_s,
        tripCount,
        vertexCount,
        startIndices,
        positions,
        timestamps,
        tripIds,
        attributeNames,
        attributeValues,
        attributeCodes,
        stopCount,
        stopPositions,
        stopTimes,
        stopKinds,
        stopTrips,
    };
}

/** Buffers to transfer from the worker instead of copying them. */
export function replayTransferables(data: ReplayData): ArrayBuffer[] {
    return [
        data.startIndices,
        data.positions,
        data.timestamps,
        ...data.attributeCodes,
        data.stopPositions,
        data.stopTimes,
        data.stopKinds,
        data.stopTrips,
    ].map((array) => array.buffer as ArrayBuffer);
}

export type Rgba = [number, number, number, number];

/** Same categorical palette as the backend's style templates (Tableau 10). */
export const REPLAY_PALETTE: Rgba[] = [
    "#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f",
    "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac",
].map(hexToRgba);
export const REPLAY_DEFAULT_COLOR: Rgba = hexToRgba("#2563eb");
export const STOP_COLORS: Record<StopKind, Rgba> = {
    red_wait: hexToRgba("#dc2626"),
    queued: hexToRgba("#f59e0b"),
    discharging: hexToRgba("#9333ea"),
};

export function hexToRgba(hex: string): Rgba {
    const value = Number.parseInt(hex.replace("#", ""), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255, 255];
}

export function rgbaToCss(color: Rgba): string {
    return `rgb(${color[0]} ${color[1]} ${color[2]})`;
}

export interface ReplayColoring {
    /** One colour per trip. */
    colors: Rgba[];
    legend: Array<{ value: string; color: Rgba; count: number }>;
}

/** Colour trips by one attribute (null: one colour for all). */
export function colorTripsBy(data: ReplayData, attributeName: string | null): ReplayColoring {
    const attribute = attributeName === null ? -1 : data.attributeNames.indexOf(attributeName);
    if (attribute < 0) {
        return {
            colors: new Array<Rgba>(data.tripCount).fill(REPLAY_DEFAULT_COLOR),
            legend: [],
        };
    }
    const codes = data.attributeCodes[attribute];
    const counts = new Array<number>(data.attributeValues[attribute].length).fill(0);
    codes.forEach((code) => { counts[code] += 1; });
    // Most frequent values get the first palette colours; beyond the palette, grey.
    const order = counts.map((count, code) => ({ count, code })).sort((a, b) => b.count - a.count);
    const colorByCode = new Array<Rgba>(counts.length);
    order.forEach(({ code }, rank) => {
        colorByCode[code] = REPLAY_PALETTE[rank] ?? REPLAY_PALETTE[REPLAY_PALETTE.length - 1];
    });
    return {
        colors: Array.from(codes, (code) => colorByCode[code]),
        legend: order.map(({ code, count }) => ({
            value: data.attributeValues[attribute][code],
            color: colorByCode[code],
            count,
        })),
    };
}

/** Attribute values of one trip, keyed by attribute name. */
export function tripProperties(data: ReplayData, trip: number): Record<string, string> {
    const properties: Record<string, string> = { agent: data.tripIds[trip] };
    data.attributeNames.forEach((name, attribute) => {
        properties[name] = data.attributeValues[attribute][data.attributeCodes[attribute][trip]];
    });
    return properties;
}

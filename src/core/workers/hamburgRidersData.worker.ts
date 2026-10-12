/**
 * Fetches and parses the HamburgRiders GTFS extract (~30 MB of JSON) off the main thread and answers with
 * compact typed arrays. One worker is spawned per load and terminated afterwards (see `ridersData.ts`).
 */
import { buildRidersDataset, type RawRidersFiles } from "../helpers/hamburgRiders/ridersBuild";
import type { RidersWorkerRequest, RidersWorkerResponse, RidersWorkerResult } from "../helpers/hamburgRiders/ridersConfig";

interface WorkerScope {
    postMessage: (message: RidersWorkerResponse, transfer?: Transferable[]) => void;
    onmessage: ((event: MessageEvent<RidersWorkerRequest>) => void) | null;
}

const scope = self as unknown as WorkerScope;

async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status} ${response.statusText}`);
    return await response.json() as T;
}

function transferablesOf(result: RidersWorkerResult): Transferable[] {
    const t = result.timetable;
    return [t.tripRoute.buffer, t.tripStart.buffer, t.tripEnd.buffer, t.tripOffset.buffer, t.ptLon.buffer, t.ptLat.buffer, t.ptTime.buffer];
}

scope.onmessage = (event) => {
    const base = event.data.baseUrl;
    void (async () => {
        try {
            const [meta, stops, stopCoords, routes, trips] = await Promise.all([
                fetchJson<RawRidersFiles["meta"]>(`${base}meta.json`),
                fetchJson<RawRidersFiles["stops"]>(`${base}stops.json`),
                fetchJson<RawRidersFiles["stopCoords"]>(`${base}stop_coords.json`),
                fetchJson<RawRidersFiles["routes"]>(`${base}routes.json`),
                fetchJson<RawRidersFiles["trips"]>(`${base}trips.json`),
            ]);
            const result = buildRidersDataset({ meta, stops, stopCoords, routes, trips });
            scope.postMessage({ type: "result", result }, transferablesOf(result));
        } catch (error) {
            scope.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
        }
    })();
};

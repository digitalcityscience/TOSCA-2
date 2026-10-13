/** Test fixtures: a tiny timetable and a minimal in-memory MapLibre double. Not used by the app. */
import { buildRidersDataset } from "./ridersBuild";
import { prepareRidersDataset, type RidersDataset } from "./ridersData";
import type { RidersFeedMeta } from "./ridersConfig";

const meta: RidersFeedMeta = {
    date: "20260531", dateLabel: "31 May 2026", title: "t",
    stats: { totalTrips: 3, totalStops: 3, totalRoutes: 3 },
    feed: { publisher: "HVV", version: "1", startDate: "20260408", endDate: "20261212", url: "", description: "" },
};

export function fixtureDataset(): RidersDataset {
    return prepareRidersDataset(buildRidersDataset({
        meta,
        stops: [
            { id: "a", name: "A", lat: 53.5, lon: 10.0 },
            { id: "b", name: "B", lat: 53.6, lon: 10.2 },
            { id: "c", name: "C", lat: 53.7, lon: 10.4 },
        ],
        stopCoords: { a: [53.5, 10.0], b: [53.6, 10.2], c: [53.7, 10.4] },
        routes: [
            { id: "r1", short_name: "U3", long_name: "Ring", color: "F9A602", agency_id: "1", transit_type: "U-Bahn" },
            { id: "r2", short_name: "U3", long_name: "Ring 2", color: "F9A602", agency_id: "1", transit_type: "U-Bahn" },
            { id: "r3", short_name: "S1", long_name: "S", color: "009A44", agency_id: "1", transit_type: "S-Bahn" },
            { id: "r4", short_name: "5", long_name: "Metro", color: "4a90d9", agency_id: "1", transit_type: "Bus", bus_type: "MetroBus" },
        ],
        trips: [
            { trip_id: "t1", route_id: "r1", headsign: "X", stops: [{ stop_id: "a", arr: 30000, dep: 30000 }, { stop_id: "b", arr: 30600, dep: 30600 }] },
            { trip_id: "t2", route_id: "r2", headsign: "Y", stops: [{ stop_id: "b", arr: 31000, dep: 31000 }, { stop_id: "c", arr: 31600, dep: 31600 }] },
            { trip_id: "t3", route_id: "r3", headsign: "Z", stops: [{ stop_id: "a", arr: 30000, dep: 30000 }, { stop_id: "c", arr: 32000, dep: 32000 }] },
            { trip_id: "t4", route_id: "r4", headsign: "B", stops: [{ stop_id: "a", arr: 30000, dep: 30000 }, { stop_id: "c", arr: 33000, dep: 33000 }] },
            { trip_id: "bad", route_id: "unknown", headsign: "", stops: [] },
        ],
    }));
}

type Listener = (...args: unknown[]) => void;

/** Implements only the MapLibre surface the module touches. */
export class FakeMap {
    sources = new Map<string, unknown>();
    layers: Array<{ id: string; type: string; layout: Record<string, unknown>; [key: string]: unknown }> = [];
    sprites: string[] = [];
    handlers: Array<{ type: string; layerId?: string; fn: Listener }> = [];
    canvas = { style: { cursor: "" } };

    addSource(id: string, spec: unknown): void { this.sources.set(id, { spec, setData: () => undefined }); }
    getSource(id: string): unknown { return this.sources.get(id); }
    removeSource(id: string): void { this.sources.delete(id); }
    addLayer(spec: { id: string; type: string; layout?: Record<string, unknown> }, before?: string): void {
        const layer = { ...spec, layout: { ...(spec.layout ?? {}) } };
        const at = before === undefined ? -1 : this.layers.findIndex((l) => l.id === before);
        if (at === -1) this.layers.push(layer); else this.layers.splice(at, 0, layer);
    }
    getLayer(id: string): unknown { return this.layers.find((l) => l.id === id); }
    removeLayer(id: string): void { this.layers = this.layers.filter((l) => l.id !== id); }
    setLayoutProperty(id: string, name: string, value: unknown): void { const l = this.layers.find((x) => x.id === id); if (l) l.layout[name] = value; }
    getLayoutProperty(id: string, name: string): unknown { return this.layers.find((l) => l.id === id)?.layout[name]; }
    setFilter(): void { /* not needed */ }
    getStyle(): { layers: Array<{ id: string }> } { return { layers: this.layers }; }
    addSprite(id: string): void { this.sprites.push(id); }
    removeSprite(id: string): void { this.sprites = this.sprites.filter((s) => s !== id); }
    getSprite(): Array<{ id: string }> { return this.sprites.map((id) => ({ id })); }
    getCanvas(): { style: { cursor: string } } { return this.canvas; }
    on(type: string, a: string | Listener, b?: Listener): void { this.handlers.push(typeof a === "string" ? { type, layerId: a, fn: b! } : { type, fn: a }); }
    off(type: string, a: string | Listener, b?: Listener): void {
        const fn = typeof a === "string" ? b : a;
        this.handlers = this.handlers.filter((h) => !(h.type === type && h.fn === fn));
    }
    once(type: string, fn: Listener): void { this.on(type, fn); }
    emit(type: string): void { this.handlers.filter((h) => h.type === type && h.layerId === undefined).forEach((h) => h.fn()); }
    jumpTo(): void { /* not needed */ }
    flyTo(): void { /* not needed */ }
}

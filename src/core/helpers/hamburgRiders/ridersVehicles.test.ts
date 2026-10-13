import { describe, expect, test } from "vitest";
import { buildRidersDataset } from "./ridersBuild";
import { fixtureDataset } from "./ridersFixtures";
import { resolveGroupKey } from "./ridersData";
import { computeVehicleFrame, parseRidersTime, RidersClock } from "./ridersVehicles";

describe("timetable", () => {
    test("groups lines by short name, buses by type, and skips unusable trips", () => {
        const ds = fixtureDataset();
        expect(ds.timetable.tripCount).toBe(4);
        expect(ds.groups.map((group) => group.key)).toEqual(["s-bahn|S1", "u-bahn|U3", "bus|MetroBus"]);
        expect(ds.groups[1].routeIds).toEqual(["r1", "r2"]);
        expect(ds.groups[1].tripCount).toBe(2);
        expect(ds.stops.filter((stop) => stop.properties.mode === "u-bahn")).toHaveLength(3);
    });

    test("resolves references to group keys", () => {
        const ds = fixtureDataset();
        expect(resolveGroupKey(ds, "u3")).toBe("u-bahn|U3");
        expect(resolveGroupKey(ds, "MetroBus")).toBe("bus|MetroBus");
        expect(resolveGroupKey(ds, "U9")).toBeUndefined();
        expect(resolveGroupKey(ds, "S1", "u-bahn")).toBeUndefined();
    });

    test("a route with a bus type is a bus even when GTFS calls it Night", () => {
        const result = buildRidersDataset({
            meta: fixtureDataset().meta, stops: [], stopCoords: {}, trips: [],
            routes: [{ id: "n", short_name: "N1", long_name: "", color: "", agency_id: "", transit_type: "Night", bus_type: "XpressBus" }],
        });
        expect(result.routes[0]).toMatchObject({ mode: "bus", busType: "ExpressBus" });
    });
});

describe("vehicle frame", () => {
    const ds = fixtureDataset();
    const all = new Set(ds.groups.map((_, index) => index));

    test("interpolates between stops and counts active, cumulative and total for the selection", () => {
        const u3 = new Set([ds.groupIndex.get("u-bahn|U3")!]);
        const frame = computeVehicleFrame(ds, 30300, u3);
        expect(frame).toMatchObject({ active: 1, cumulative: 1, total: 2 });
        expect(frame.features[0].geometry.coordinates[0]).toBeCloseTo(10.1, 3);
        expect(computeVehicleFrame(ds, 29000, u3)).toMatchObject({ active: 0, cumulative: 0, total: 2 });
        expect(computeVehicleFrame(ds, 40000, u3)).toMatchObject({ active: 0, cumulative: 2 });
    });

    test("an empty selection yields no vehicles", () => {
        expect(computeVehicleFrame(ds, 30300, new Set())).toMatchObject({ active: 0, total: 0, features: [] });
        expect(computeVehicleFrame(ds, 30300, all).active).toBe(3);
    });

    test("parses service times", () => {
        expect(parseRidersTime("08:30")).toBe(30600);
        expect(parseRidersTime("25:00")).toBe(90000);
        expect(parseRidersTime("nonsense")).toBeUndefined();
        expect(parseRidersTime(1)).toBe(18000);
    });
});

describe("RidersClock", () => {
    function harness() {
        const callbacks: Array<(ts: number) => void> = [];
        const frames: number[] = [];
        const clock = new RidersClock((time) => frames.push(time), {
            request: (cb) => callbacks.push(cb),
            cancel: () => callbacks.splice(0),
        });
        const step = (ts: number): void => callbacks.splice(0).forEach((cb) => cb(ts));
        return { clock, frames, step, pending: () => callbacks.length };
    }

    test("start is idempotent: one loop only, and stop cancels it", () => {
        const { clock, step, pending } = harness();
        clock.start();
        clock.start();
        expect(pending()).toBe(1);
        step(0);
        expect(pending()).toBe(1);
        clock.stop();
        expect(pending()).toBe(0);
    });

    test("advances by speed while playing, holds while paused, and seeks", () => {
        const { clock, frames, step } = harness();
        clock.speed = 600;
        clock.time = 30000;
        clock.start();
        step(0);
        step(100);
        expect(clock.time).toBeCloseTo(30060, 3);
        clock.setPlaying(false);
        step(200);
        step(300);
        expect(clock.time).toBeCloseTo(30060, 3);
        clock.seek(40000);
        step(400);
        expect(frames.at(-1)).toBe(40000);
    });
});

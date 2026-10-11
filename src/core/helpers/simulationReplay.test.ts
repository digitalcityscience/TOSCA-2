import { describe, expect, test } from "vitest";
import {
    colorTripsBy,
    flattenTripsBundle,
    REPLAY_DEFAULT_COLOR,
    REPLAY_PALETTE,
    ReplayFormatError,
    replayTransferables,
    STOP_KINDS,
    tripProperties,
    type TripsBundle,
} from "./simulationReplay";

// Shaped like the seed replay (tosca-trips v1): waits are repeated coordinates.
function bundle(): TripsBundle {
    return {
        encoding: "tosca-trips",
        encoding_version: 1,
        time_end_s: 60,
        attributes: ["bike", "routing_profile"],
        trips: [
            { id: "cyclist-1", a: ["cargo", "comfortable"], p: [[10, 53.5], [10.001, 53.5], [10.001, 53.5]], t: [0, 20, 32] },
            { id: "cyclist-2", a: ["conventional", "comfortable"], p: [[10.002, 53.5], [10.003, 53.501]], t: [5, 60] },
            { id: "cyclist-3", a: ["conventional", "shortest"], p: [[10.004, 53.5], [10.005, 53.5]], t: [10, 40] },
        ],
        stops: [
            { id: "cyclist-1", kind: "queued", p: [10.001, 53.5], t0: 20, t1: 22, movement: "left" },
            { id: "cyclist-1", kind: "red_wait", p: [10.001, 53.5], t0: 22, t1: 30 },
            { id: "cyclist-9", kind: "discharging", p: [10.002, 53.5], t0: 30, t1: 32 },
            { id: "cyclist-2", kind: "teleporting", p: [0, 0], t0: 0, t1: 1 },
        ],
    };
}

describe("simulation replay data", () => {
    test("flattens trips into binary path data", () => {
        const data = flattenTripsBundle(bundle());

        expect(data.tripCount).toBe(3);
        expect(data.vertexCount).toBe(7);
        expect(Array.from(data.startIndices)).toEqual([0, 3, 5]);
        expect(Array.from(data.timestamps)).toEqual([0, 20, 32, 5, 60, 10, 40]);
        expect(data.positions[2]).toBeCloseTo(10.001, 5);
        expect(data.positions[13]).toBeCloseTo(53.5, 5);
        expect(data.tripIds).toEqual(["cyclist-1", "cyclist-2", "cyclist-3"]);
        expect(data.timeEnd).toBe(60);
    });

    test("encodes categorical attributes once per distinct value", () => {
        const data = flattenTripsBundle(bundle());

        expect(data.attributeValues).toEqual([["cargo", "conventional"], ["comfortable", "shortest"]]);
        expect(Array.from(data.attributeCodes[0])).toEqual([0, 1, 1]);
        expect(tripProperties(data, 2)).toEqual({ agent: "cyclist-3", bike: "conventional", routing_profile: "shortest" });
    });

    test("keeps known stop kinds with their agent and time window", () => {
        const data = flattenTripsBundle(bundle());

        expect(data.stopCount).toBe(3);
        expect(Array.from(data.stopKinds).map((kind) => STOP_KINDS[kind])).toEqual(["queued", "red_wait", "discharging"]);
        expect(Array.from(data.stopTimes)).toEqual([20, 22, 22, 30, 30, 32]);
        expect(Array.from(data.stopTrips)).toEqual([0, 0, -1]);
    });

    test("rejects other encodings and mismatched trips", () => {
        expect(() => flattenTripsBundle({ ...bundle(), encoding_version: 2 } as unknown as TripsBundle)).toThrow(ReplayFormatError);
        const broken = bundle();
        broken.trips[0].t.pop();
        expect(() => flattenTripsBundle(broken)).toThrow("3 positions but 2 times");
    });

    test("transfers every typed array buffer", () => {
        const data = flattenTripsBundle(bundle());

        expect(replayTransferables(data)).toHaveLength(9);
    });

    test("colours by attribute, most frequent value first", () => {
        const data = flattenTripsBundle(bundle());

        const byBike = colorTripsBy(data, "bike");
        expect(byBike.legend.map((entry) => [entry.value, entry.count])).toEqual([["conventional", 2], ["cargo", 1]]);
        expect(byBike.colors[1]).toEqual(REPLAY_PALETTE[0]);
        expect(byBike.colors[0]).toEqual(REPLAY_PALETTE[1]);

        const single = colorTripsBy(data, null);
        expect(single.legend).toEqual([]);
        expect(single.colors).toEqual([REPLAY_DEFAULT_COLOR, REPLAY_DEFAULT_COLOR, REPLAY_DEFAULT_COLOR]);
        expect(colorTripsBy(data, "unknown").legend).toEqual([]);
    });
});

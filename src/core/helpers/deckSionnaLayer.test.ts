import { describe, expect, test } from "vitest";
import { classifyPaths, deviceIcon, pathTimes } from "./deckSionnaLayer";

const path = (gain: number): GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>> => ({
    type: "Feature",
    geometry: { type: "LineString", coordinates: [] },
    properties: { gain_db: gain },
});

describe("classifyPaths", () => {
    test("puts paths in 10 dB classes below the strongest, weakest drawn first", () => {
        const { features, classes } = classifyPaths([path(-60), path(-69.9), path(-70), path(-130)]);
        expect(features.map((feature) => feature.properties.class)).toEqual([5, 1, 0, 0]);
        expect(classes.map((entry) => entry.count)).toEqual([2, 1, 0, 0, 0, 1]);
        expect(classes[1]).toMatchObject({ max: -70, min: -80 });
        expect(classes[5]).toMatchObject({ max: -110, min: null });
    });
});

test("device icons are SVG data URLs", () => {
    expect(decodeURIComponent(deviceIcon("transmitters"))).toContain("#dc2626");
});

test("a pulse passes each path vertex after its distance at the speed of light", () => {
    const times = pathTimes([[10, 53, 0], [10, 53, 299.792458], [10, 53, 0]]);
    expect(times.map((value) => Math.round(value))).toEqual([0, 1000, 2000]);
});

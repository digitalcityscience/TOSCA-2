import { describe, expect, test } from "vitest";
import { inArea, openPoint, tallest, USE_CASES } from "./sionnaUseCases";

/** A square building of `size` degrees with its south west corner at (lng, lat). */
const building = (lng: number, lat: number, size: number, height: number): GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>> => ({
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [[[lng, lat], [lng + size, lat], [lng + size, lat + size], [lng, lat + size], [lng, lat]]] },
    properties: { height },
});
const buildings = [building(10, 53, 0.001, 12), building(10.003, 53.002, 0.0005, 30), building(10.001, 53.003, 0.0005, 8)];

test("the tallest building carries the macro cell", () => {
    expect(tallest(buildings).properties?.height).toBe(30);
});

test("a tower or spire does not carry the macro cell", () => {
    expect(tallest([...buildings, building(10.002, 53, 0.0002, 130)]).properties?.height).toBe(30);
});

test("an area keeps only the buildings whose centre lies in it", () => {
    const area: Array<[number, number]> = [[9.999, 53.0015], [10.0015, 53.0015], [10.0015, 52.999], [9.999, 52.999]];
    expect(inArea(buildings, area).map((feature) => feature.properties?.height)).toEqual([12]);
    expect(inArea(buildings, [[0, 1], [1, 1], [1, 0], [0, 0]])).toBe(buildings);
});

test("an open point is moved out of a building into the street", () => {
    const point = openPoint(buildings, [10.0005, 53.0005]);
    const [lng, lat] = point;
    expect(lng < 10 || lng > 10.001 || lat < 53 || lat > 53.001).toBe(true);
});

describe("every use case", () => {
    test.each(USE_CASES.map((useCase) => [useCase.id, useCase]))("%s places a transmitter and computes something", (_, useCase) => {
        const plan = useCase.plan(buildings);
        expect(plan.devices.filter((device) => device.kind === "transmitters")).toHaveLength(1);
        expect(useCase.radioMap || useCase.paths).toBe(true);
        if (useCase.paths) expect(plan.devices.some((device) => device.kind === "receivers")).toBe(true);
        plan.devices.forEach((device) => device.at.forEach((value) => expect(Number.isFinite(value)).toBe(true)));
    });
});

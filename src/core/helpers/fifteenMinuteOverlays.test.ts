import { describe, expect, test } from "vitest";
import { labelPoint } from "./fifteenMinuteOverlays";

describe("label position", () => {
    test("the centroid of a convex shape", () => {
        expect(labelPoint({ type: "Polygon", coordinates: [[[0, 0], [4, 0], [4, 2], [0, 2], [0, 0]]] })).toEqual([2, 1]);
    });

    test("a crescent whose centroid lies outside is labelled inside the shape", () => {
        // A "C": the centroid falls in the opening.
        const c: GeoJSON.Polygon = { type: "Polygon", coordinates: [[[0, 0], [6, 0], [6, 1], [1, 1], [1, 5], [6, 5], [6, 6], [0, 6], [0, 0]]] };
        const [x, y] = labelPoint(c)!;
        const insideBar = (y >= 0 && y <= 1) || (y >= 5 && y <= 6) || (x >= 0 && x <= 1);
        expect(insideBar).toBe(true);
    });

    test("uses the largest part of a multi-part shape and passes a point through", () => {
        const multi: GeoJSON.MultiPolygon = { type: "MultiPolygon", coordinates: [
            [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
            [[[10, 10], [20, 10], [20, 20], [10, 20], [10, 10]]],
        ] };
        expect(labelPoint(multi)).toEqual([15, 15]);
        expect(labelPoint({ type: "Point", coordinates: [3, 4] })).toEqual([3, 4]);
        expect(labelPoint({ type: "LineString", coordinates: [[0, 0], [1, 1]] })).toBeUndefined();
    });
});

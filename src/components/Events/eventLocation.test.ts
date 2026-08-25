import { describe, expect, test } from "vitest";
import { parseEventPointLocation } from "./eventLocation";

describe("event location parsing", () => {
    test("reads a GeoJSON point", () => {
        expect(parseEventPointLocation({
            type: "Point",
            coordinates: [10.073, 53.5715],
        })).toEqual([10.073, 53.5715]);
    });

    test("reads a WKT point", () => {
        expect(parseEventPointLocation("POINT (10.073 53.5715)")).toEqual([
            10.073,
            53.5715,
        ]);
    });

    test("rejects unsupported or invalid locations", () => {
        expect(parseEventPointLocation(null)).toBeUndefined();
        expect(parseEventPointLocation("LINESTRING (10 53, 11 54)")).toBeUndefined();
        expect(parseEventPointLocation({ type: "Point", coordinates: [Number.NaN, 53] }))
            .toBeUndefined();
    });
});

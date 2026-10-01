import { describe, expect, test } from "vitest";
import { intersectBbox } from "./ogcLayers";

describe("OGC layer viewport helpers", () => {
    test("intersects the view with the collection extent", () => {
        expect(intersectBbox([9, 53, 11, 54], [9.5, 53.2, 10.5, 53.8])).toEqual([9.5, 53.2, 10.5, 53.8]);
        expect(intersectBbox([9, 53, 10, 54], undefined)).toEqual([9, 53, 10, 54]);
        expect(intersectBbox([0, 0, 1, 1], [9, 53, 10, 54])).toBeUndefined();
    });
});

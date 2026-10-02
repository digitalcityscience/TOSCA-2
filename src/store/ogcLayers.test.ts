import { describe, expect, test } from "vitest";
import { intersectBbox, queryableAttributeLabels } from "./ogcLayers";

describe("OGC layer viewport helpers", () => {
    test("intersects the view with the collection extent", () => {
        expect(intersectBbox([9, 53, 11, 54], [9.5, 53.2, 10.5, 53.8])).toEqual([9.5, 53.2, 10.5, 53.8]);
        expect(intersectBbox([9, 53, 10, 54], undefined)).toEqual([9, 53, 10, 54]);
        expect(intersectBbox([0, 0, 1, 1], [9, 53, 10, 54])).toBeUndefined();
    });
});

describe("OGC attribute labels", () => {
    const queryables = [
        { name: "strassenname", title: "Straßenname", type: "string" as const, isGeometry: false },
        { name: "breite", title: "Breite", type: "number" as const, isGeometry: false },
        { name: "geom", title: "geom", type: "other" as const, isGeometry: true },
    ];

    test("uses queryable titles, limited to the selected properties", () => {
        expect(queryableAttributeLabels(queryables)).toEqual([
            { name: "strassenname", labels: { en: "Straßenname" } },
            { name: "breite", labels: { en: "Breite" } },
        ]);
        expect(queryableAttributeLabels(queryables, ["breite"])).toEqual([{ name: "breite", labels: { en: "Breite" } }]);
        expect(queryableAttributeLabels([])).toBeUndefined();
    });
});

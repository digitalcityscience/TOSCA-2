import { describe, expect, test } from "vitest";
import { commonQueryables, intersectBbox, queryableAttributeLabels } from "./ogcLayers";

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

describe("OGC merged collection queryables", () => {
    test("keeps only shared names and preserves the first collection's title", () => {
        expect(commonQueryables([
            [
                { name: "name", title: "Display name", type: "string", isGeometry: false },
                { name: "height", title: "Height", type: "number", isGeometry: false },
                { name: "geom", title: "Geometry", type: "other", isGeometry: true },
            ],
            [
                { name: "name", title: "Name", type: "string", isGeometry: false },
                { name: "status", title: "Status", type: "string", isGeometry: false },
                { name: "shape", title: "Shape", type: "other", isGeometry: true },
            ],
        ])).toEqual([
            { name: "name", title: "Display name", type: "string", isGeometry: false },
        ]);
    });
});

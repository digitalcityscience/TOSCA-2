import { describe, expect, test } from "vitest";
import type { OgcApiQueryable } from "@store/externalDataSources";
import { buildCql2Filter, operatorsForType, OgcFilterValueError } from "./ogcCql2";

const queryables: OgcApiQueryable[] = [
    { name: "strassenname", title: "Straßenname", type: "string", isGeometry: false },
    { name: "breite", title: "Breite", type: "number", isGeometry: false },
    { name: "gid", title: "gid", type: "integer", isGeometry: false },
    { name: "zweirichtung", title: "zweirichtung", type: "boolean", isGeometry: false },
    { name: "odd name", title: "Odd", type: "string", isGeometry: false },
    { name: "geom", title: "geom", type: "other", isGeometry: true },
];

describe("CQL2 filter builder", () => {
    test("offers operators per attribute type", () => {
        expect(operatorsForType("string")).toContain("contains");
        expect(operatorsForType("number")).toContain("gte");
        expect(operatorsForType("boolean")).toEqual(["eq"]);
    });

    test("ANDs complete conditions and quotes literals", () => {
        expect(buildCql2Filter([
            { property: "breite", operator: "gt", value: " 4.5 " },
            { property: "strassenname", operator: "eq", value: "Hein's Weg" },
            { property: "zweirichtung", operator: "eq", value: "true" },
            { property: "strassenname", operator: "contains", value: "allee" },
            { property: "odd name", operator: "neq", value: "x" },
        ], queryables)).toBe(
            "breite > 4.5 AND strassenname = 'Hein''s Weg' AND zweirichtung = true AND " +
            "CASEI(strassenname) LIKE CASEI('%allee%') AND \"odd name\" <> 'x'"
        );
    });

    test("ignores empty, unknown and geometry conditions", () => {
        expect(buildCql2Filter([
            { property: "breite", operator: "gt", value: "" },
            { property: "nope", operator: "eq", value: "1" },
            { property: "geom", operator: "eq", value: "x" },
        ], queryables)).toBeUndefined();
    });

    test("rejects values that don't match the attribute type", () => {
        expect(() => buildCql2Filter([{ property: "breite", operator: "gt", value: "1 OR 1=1" }], queryables))
            .toThrow(OgcFilterValueError);
        expect(() => buildCql2Filter([{ property: "gid", operator: "eq", value: "1.5" }], queryables))
            .toThrow(OgcFilterValueError);
    });
});

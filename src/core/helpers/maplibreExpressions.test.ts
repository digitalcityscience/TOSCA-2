import { describe, expect, test } from "vitest";
import { combineStyleAndUserFilter, flattenFilterExpression, unwrapIfAll } from "./maplibreExpressions";

const style = ["==", ["get", "kind"], "park"];
const user = ["all", ["all", [">", ["get", "score"], 5]], ["<", ["get", "area"], 10]];

describe("maplibre expression helpers", () => {
    test("unwrapIfAll", () => {
        expect(unwrapIfAll(["all", ["a"], ["b"]])).toEqual([["a"], ["b"]]);
        expect(unwrapIfAll(["==", 1, 1])).toEqual([["==", 1, 1]]);
        expect(unwrapIfAll(undefined)).toEqual([]);
    });

    test("flattenFilterExpression drops empty blocks", () => {
        expect(flattenFilterExpression(["all"])).toBeNull();
        expect(flattenFilterExpression(["all", ["any"], ["==", 1, 1]])).toEqual(["all", ["==", 1, 1]]);
    });

    test("no user filter leaves the style filter unchanged", () => {
        expect(combineStyleAndUserFilter(style, ["all"])).toBe(style);
        expect(combineStyleAndUserFilter(undefined, ["all"])).toBeUndefined();
    });

    test("user filter alone", () => {
        expect(combineStyleAndUserFilter(undefined, ["all", [">", ["get", "score"], 5]])).toEqual(["all", [">", ["get", "score"], 5]]);
    });

    test("style and user filters are combined in one flat all", () => {
        expect(combineStyleAndUserFilter(["all", style], user)).toEqual([
            "all", style, [">", ["get", "score"], 5], ["<", ["get", "area"], 10],
        ]);
    });

    test("an any-relation user block stays intact", () => {
        const anyBlock = ["any", [">", ["get", "a"], 1], ["<", ["get", "b"], 2]];
        expect(combineStyleAndUserFilter(style, ["all", anyBlock])).toEqual(["all", style, anyBlock]);
    });
});

import { afterEach, describe, expect, test, vi } from "vitest";
import {
    fetchBuilding,
    fetchGreenInventory,
    fetchParkDetail,
    resetGreenSpacesDataCache,
    summariseFeatures,
    summariseInventory,
    summariseStadtteile,
    toStadtteilRow,
    type StadtteilRow,
} from "./greenSpacesData";

afterEach(() => {
    resetGreenSpacesDataCache();
    vi.unstubAllGlobals();
});

function stubFetch(handler: (url: URL) => unknown): ReturnType<typeof vi.fn> {
    const fn = vi.fn(async (input: string | URL) => ({ ok: true, status: 200, json: async () => handler(new URL(input)) }));
    vi.stubGlobal("fetch", fn);
    return fn;
}

const row = (over: Partial<StadtteilRow>): StadtteilRow => ({
    id: "1", name: "A", bezirk: "", bounds: [0, 0, 0, 0], parkN: 10, parkMedian: null, parkP90: null, playgroundN: 10,
    playgroundMedian: null, playgroundP90: null, coverageGreen: null, coverageRecreational: null, largeGreenShare: null, ...over,
});

describe("inventory", () => {
    test("counts the published area_class and nothing else", () => {
        const inventory = summariseInventory(["recreational_park", "playground", "playground", "cemetery", "something-new", null]);
        expect(inventory.total).toBe(6);
        expect(inventory.counts.recreational_park).toBe(1);
        expect(inventory.counts.playground).toBe(2);
        expect(inventory.counts.allotment).toBe(0);
    });

    test("reads only the class column", async () => {
        const fn = stubFetch(() => ({ features: [{ properties: { area_class: "playground" } }] }));
        expect((await fetchGreenInventory()).counts.playground).toBe(1);
        expect(new URL(String(fn.mock.calls[0][0])).searchParams.get("propertyName")).toBe("area_class");
        await fetchGreenInventory();
        expect(fn).toHaveBeenCalledTimes(1);
    });
});

describe("detailed objects of a park", () => {
    test("groups by the official level-0 code and keeps the level-1 types", () => {
        const groups = summariseFeatures([
            { category_code_0: 1, feature_group: "Path network", feature_type: "Paths" },
            { category_code_0: 1, feature_group: "Path network", feature_type: "Paths" },
            { category_code_0: 1, feature_group: "Path network", feature_type: "Stairs" },
            { category_code_0: 7, feature_group: "Planting and vegetation", feature_type: "Utility lawn" },
            { category_code_0: null, feature_group: "x" },
        ]);
        expect(groups.map((group) => [group.code, group.count])).toEqual([[1, 3], [7, 1]]);
        expect(groups[0].types).toEqual([{ type: "Paths", count: 2 }, { type: "Stairs", count: 1 }]);
    });

    test("joins by the published dgp_idnr in all three geometry layers", async () => {
        const fn = stubFetch((url) => ({ features: url.searchParams.get("typeNames")?.endsWith("polygon") ? [{ properties: { category_code_0: 1, feature_group: "Path network", feature_type: "Paths" } }] : [] }));
        const detail = await fetchParkDetail(2692);
        expect(detail).toMatchObject({ idnr: 2692, polygons: 1, lines: 0, points: 0 });
        const filters = fn.mock.calls.map((call) => new URL(String(call[0])).searchParams.get("cql_filter"));
        expect(filters).toEqual(["dgp_idnr=2692", "dgp_idnr=2692", "dgp_idnr=2692"]);
    });
});

describe("Stadtteile", () => {
    test("reads the published statistics and keeps NULL as null", () => {
        const parsed = toStadtteilRow({
            bbox: [1, 2, 3, 4],
            properties: {
                stadtteil_id: "210", stadtteil_name: "Nienstedten", bezirk_name: "Altona", dgp_park_n: 1896, dgp_park_median_min: 5.17,
                dgp_park_p90_min: 11.3, dgp_playground_n: 1896, dgp_playground_median_min: 16.375, dgp_playground_p90_min: null,
                cov_dgp_green_share: 0.14, cov_dgp_recreational_share: 0, grn_share_large_green_15min: null,
            },
        });
        expect(parsed).toMatchObject({ id: "210", parkMedian: 5.17, playgroundMedian: 16.375, playgroundP90: null, coverageRecreational: 0, largeGreenShare: null, bounds: [1, 2, 3, 4] });
    });

    test("the city summary is a median of published values, never a sum, and ignores missing ones", () => {
        const summary = summariseStadtteile([
            row({ parkMedian: 2, playgroundMedian: 4, coverageGreen: 0.1, coverageRecreational: 0 }),
            row({ parkMedian: 4, playgroundMedian: 8, coverageGreen: 0.3, coverageRecreational: 0.1 }),
            row({ parkMedian: null, playgroundMedian: null, coverageGreen: 0.2, coverageRecreational: 0.05 }),
        ])!;
        expect(summary.stadtteile).toBe(2);
        expect(summary.medianParkMinutes).toBe(3);
        expect(summary.medianPlaygroundMinutes).toBe(6);
        expect(summary.medianCoverageGreen).toBeCloseTo(0.2);
        expect(summary.medianCoverageRecreational).toBeCloseTo(0.05);
        expect(summariseStadtteile([])).toBeUndefined();
    });
});

describe("buildings", () => {
    test("reads one building by its ALKIS id with only the story's fields", async () => {
        const fn = stubFetch(() => ({ features: [{ properties: { gml_id: "B1", walk_min_dgp_park: 3 }, geometry: { type: "Point", coordinates: [1, 2] } }] }));
        expect((await fetchBuilding("B1'"))?.properties.gml_id).toBe("B1");
        const params = new URL(String(fn.mock.calls[0][0])).searchParams;
        expect(params.get("cql_filter")).toBe("gml_id='B1'");
        expect(params.get("propertyName")).toContain("walk_min_dgp_playground");
        expect(params.get("propertyName")).not.toContain("score_green");
    });

    test("an unknown id gives undefined", async () => {
        stubFetch(() => ({ features: [] }));
        expect(await fetchBuilding("nope")).toBeUndefined();
    });
});

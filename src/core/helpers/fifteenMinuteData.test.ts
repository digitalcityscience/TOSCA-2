import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
    fetchBuilding,
    fetchStadtteilRows,
    resetFifteenMinuteDataCache,
    summariseStadtteile,
    toStadtteilRow,
} from "./fifteenMinuteData";
import { CATEGORY_IDS } from "../../config/urbanStories/styles/fifteenMinute";

const fetchMock = vi.fn();
beforeEach(() => {
    resetFifteenMinuteDataCache();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const json = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body });

const feature = (id: string, name: string, decay: number | null, categories: number | null, shares: Record<string, number | null> = {}) => ({
    properties: {
        stadtteil_id: id, stadtteil_name: name, bezirk_name: "Nord", m15_n: decay === null ? 3 : 1000, m15_decay_mean: decay, m15_categories_mean: categories,
        cmf_mean: 80, saf_mean: 31, grn_mean: 90, ...Object.fromEntries(CATEGORY_IDS.map((id2) => [`m15_share_${id2}`, shares[id2] ?? (decay === null ? null : 1)])),
    },
    bbox: [9.9, 53.4, 10.0, 53.5],
});

describe("Stadtteil rows", () => {
    test("reads the published values, keeps NULL as null and never as zero", () => {
        const row = toStadtteilRow(feature("5", "Tiny", null, null));
        expect(row).toMatchObject({ id: "5", name: "Tiny", decayMean: null, categoriesMean: null, scored: 3, comfortMean: 80, bounds: [9.9, 53.4, 10, 53.5] });
        expect(row.shares.food).toBeNull();
    });

    test("one attribute-only WFS request, sorted by name, cached for the session", async () => {
        fetchMock.mockImplementation(() => json({ features: [feature("2", "Zoo", 50, 6), feature("1", "Ahrensburg", 70, 8)] }));
        const rows = await fetchStadtteilRows();
        expect(rows.map((row) => row.name)).toEqual(["Ahrensburg", "Zoo"]);
        await fetchStadtteilRows();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const url = new URL(String(fetchMock.mock.calls[0][0]));
        expect(url.searchParams.get("typeNames")).toBe("HAMBURG-ADMINISTRATIVE:hamburg_stadtteile");
        const requested = url.searchParams.get("propertyName")!.split(",");
        expect(requested).toEqual(expect.arrayContaining(["m15_decay_mean", "cmf_mean", "saf_mean", "grn_mean", "m15_share_culture"]));
        expect(requested).not.toContain("geom");
    });

    test("a failed request is not cached", async () => {
        fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
        await expect(fetchStadtteilRows()).rejects.toThrow("503");
        fetchMock.mockImplementation(() => json({ features: [] }));
        await expect(fetchStadtteilRows()).resolves.toEqual([]);
    });
});

describe("summary of the published values", () => {
    const rows = [
        toStadtteilRow(feature("1", "A", 95, 9, { culture: 1 })),
        toStadtteilRow(feature("2", "B", 65, 7, { culture: 0.5 })),
        toStadtteilRow(feature("3", "C", 35, 5, { culture: 0 })),
        toStadtteilRow(feature("4", "D", 100, 9, { culture: 1 })),
        toStadtteilRow(feature("5", "Tiny", null, null)),
    ];

    test("counts and medians only the Stadtteile that have a published value", () => {
        const summary = summariseStadtteile(rows)!;
        expect(summary.stadtteile).toBe(4);
        expect(summary.medianDecay).toBe(80);
        expect(summary.medianCategories).toBe(8);
        expect(summary.decayHistogram).toEqual([0, 1, 0, 1, 2]);
        expect(summary.decayHistogram.reduce((sum, count) => sum + count, 0)).toBe(4);
        const culture = summary.categories.find((item) => item.id === "culture")!;
        expect(culture).toMatchObject({ median: 0.75, min: 0, max: 1 });
    });

    test("nothing to summarise without published values", () => {
        expect(summariseStadtteile([])).toBeUndefined();
        expect(summariseStadtteile([rows[4]])).toBeUndefined();
    });
});

describe("one building", () => {
    test("asks for the building by ALKIS id and returns its attributes and geometry", async () => {
        fetchMock.mockImplementation(() => json({ features: [{ properties: { gml_id: "X", score_15min: 9 }, geometry: { type: "Polygon", coordinates: [] } }] }));
        const detail = await fetchBuilding("X'; DROP");
        expect(detail?.properties.score_15min).toBe(9);
        const url = new URL(String(fetchMock.mock.calls[0][0]));
        expect(url.searchParams.get("cql_filter")).toBe("gml_id='X; DROP'");
        expect(url.searchParams.get("propertyName")).toContain("comfort_mean_400m");
        expect(url.searchParams.get("propertyName")).toContain("safety_index_400m");
    });

    test("an unknown building has no detail", async () => {
        fetchMock.mockImplementation(() => json({ features: [] }));
        expect(await fetchBuilding("missing")).toBeUndefined();
    });
});

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
    citywideOutside,
    fetchAgreementCounts,
    fetchCriteriaCounts,
    fetchResidentialValues,
    fetchStadtteile,
    parseResidentialCsv,
    resetEquityDataCache,
    summariseDepartures,
    summariseOutsideWalk,
    wfsHits,
    type ResidentialValue,
    type StadtteilRow,
} from "./transitEquityData";
import { NO_CRITERIA } from "../../config/urbanStories/styles/transitEquity";

const value = (patch: Partial<ResidentialValue>): ResidentialValue => ({
    inCatchment: true, walkMin: 4, originNone: false, departures: 100, departuresComplete: true, lines: 2, ...patch,
});

const fetchMock = vi.fn();
beforeEach(() => {
    resetEquityDataCache();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const text = (body: string) => Promise.resolve({ ok: true, status: 200, text: async () => body, json: async () => JSON.parse(body) });
const hitsBody = (n: number) => `<wfs:FeatureCollection numberMatched="${n}" numberReturned="0"/>`;

describe("CSV and summaries", () => {
    test("parses the booleans, the empty NULL cells and the walking origin", () => {
        const csv = [
            "FID,gml_id,origin_quality,walk_min_stop_any,pt_in_catchment_any,pt_line_n_unique,pt_departures_daily_sum,pt_departures_complete",
            "b.1,A,good,6.4,true,3,250,true",
            "b.2,B,none,,false,0,0,true",
            "b.3,C,good,,false,0,0,false",
        ].join("\n");
        expect(parseResidentialCsv(csv)).toEqual([
            { inCatchment: true, walkMin: 6.4, originNone: false, departures: 250, departuresComplete: true, lines: 3 },
            { inCatchment: false, walkMin: null, originNone: true, departures: 0, departuresComplete: true, lines: 0 },
            { inCatchment: false, walkMin: null, originNone: false, departures: 0, departuresComplete: false, lines: 0 },
        ]);
        expect(parseResidentialCsv("")).toEqual([]);
    });

    test("quantiles and bands use complete data only; incomplete values are counted apart, zero stays a band of its own", () => {
        const values = [0, 0, 50, 150, 400, 800, 2000].map((departures) => value({ departures }))
            .concat([value({ departures: 3, departuresComplete: false }), value({ inCatchment: false, departures: 0 })]);
        const summary = summariseDepartures(values);
        expect(summary.count).toBe(8);
        expect(summary.incompleteCount).toBe(1);
        expect(summary.median).toBe(50);
        expect(summary.bandShares[0]).toBeCloseTo(3 / 8);
        expect(summary.bandShares.reduce((sum, share) => sum + share, 0)).toBeCloseTo(1);
        expect(summary.outsideShare).toBeCloseTo(1 / 9);
        expect(summariseDepartures([])).toMatchObject({ count: 0, median: 0, outsideShare: 0 });
    });

    test("the walk of the buildings outside coverage treats a missing walk as more than 15 minutes and skips buildings without an origin", () => {
        const summary = summariseOutsideWalk([
            value({ inCatchment: false, walkMin: 5 }),
            value({ inCatchment: false, walkMin: 9 }),
            value({ inCatchment: false, walkMin: null }),
            value({ inCatchment: false, walkMin: null, originNone: true }),
            value({ inCatchment: true, walkMin: 1 }),
        ]);
        expect(summary.count).toBe(3);
        expect(summary.medianWalkMin).toBe(9);
        expect(summariseOutsideWalk([value({ inCatchment: false, walkMin: 4 }), value({ inCatchment: false, walkMin: 8 })]).medianWalkMin).toBe(6);
        expect(summary.withinNineShare).toBeCloseTo(2 / 3);
        expect(summariseOutsideWalk([value({ inCatchment: false, walkMin: null })]).medianWalkMin).toBeNull();
        expect(summariseOutsideWalk([])).toEqual({ count: 0, medianWalkMin: null, withinNineShare: 0 });
    });

    test("the Hamburg-wide share is built from the same housing buildings as the Stadtteil shares", () => {
        const rows = [
            { residentialCount: 100, outsideCount: 10 },
            { residentialCount: 300, outsideCount: 90 },
            { residentialCount: 0, outsideCount: 0 },
        ] as StadtteilRow[];
        expect(citywideOutside(rows)).toEqual({ residential: 400, outside: 100, share: 0.25 });
        expect(citywideOutside([])).toEqual({ residential: 0, outside: 0, share: 0 });
    });
});

describe("WFS reads", () => {
    test("hits are read from numberMatched and cached by request", async () => {
        fetchMock.mockImplementation(() => text(hitsBody(1234)));
        expect(await wfsHits("HAMBURG-BUILDINGS:hamburg_buildings", "a=1")).toBe(1234);
        expect(await wfsHits("HAMBURG-BUILDINGS:hamburg_buildings", "a=1")).toBe(1234);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const url = new URL(fetchMock.mock.calls[0][0] as string, "http://x");
        expect(url.searchParams.get("resultType")).toBe("hits");
        expect(url.searchParams.get("cql_filter")).toBe("a=1");
    });

    test("a failed request is reported and not cached", async () => {
        fetchMock.mockImplementationOnce(() => Promise.resolve({ ok: false, status: 503, text: async () => "" }));
        await expect(wfsHits("T", "x")).rejects.toThrow("503");
        fetchMock.mockImplementationOnce(() => text(hitsBody(5)));
        expect(await wfsHits("T", "x")).toBe(5);
    });

    test("the four agreement classes count the housing buildings with a walking origin and sum to the total", async () => {
        const answers = [100, 20, 10, 30];
        fetchMock.mockImplementation((url: string) => {
            const filter = new URL(url, "http://x").searchParams.get("cql_filter") ?? "";
            const inside = filter.includes("pt_in_catchment_any=true");
            const walking = filter.includes("walk_min_stop_any<=6");
            return text(hitsBody(answers[(inside ? 0 : 2) + (walking ? 0 : 1)]));
        });
        const counts = await fetchAgreementCounts();
        expect(counts).toEqual({ both: 100, officialOnly: 20, walkingOnly: 10, neither: 30, total: 160 });
        const filters = fetchMock.mock.calls.map(([url]) => new URL(url as string, "http://x").searchParams.get("cql_filter") ?? "");
        expect(filters.every((filter) => filter.includes("origin_quality<>'none'") && filter.includes("building_function_code IN (1000,1010,1020)"))).toBe(true);
    });

    test("criteria counts use the housing population as the total, and the Stadtteil when one is chosen", async () => {
        fetchMock.mockImplementation((url: string) => text(hitsBody((new URL(url, "http://x").searchParams.get("cql_filter") ?? "").includes("pt_in_catchment_any=false") ? 7 : 70)));
        expect(await fetchCriteriaCounts({ ...NO_CRITERIA, coverage: "outside", area: "413" })).toEqual({ matching: 7, total: 70 });
        const filters = fetchMock.mock.calls.map(([url]) => new URL(url as string, "http://x").searchParams.get("cql_filter") ?? "");
        expect(filters.every((filter) => filter.includes("stadtteil_code='413'"))).toBe(true);
    });

    test("Stadtteil rows come from one attribute-only read, sorted by name, with the feature bounds and a null share kept null", async () => {
        const body = JSON.stringify({
            features: [
                { properties: { stadtteil_id: "2", stadtteil_name: "Zeta", bezirk_name: "B", ptr_resid_n: 0, ptr_resid_uncovered_n: 0, ptr_resid_uncovered_share: null }, bbox: [1, 2, 3, 4] },
                { properties: { stadtteil_id: "1", stadtteil_name: "Alpha", bezirk_name: "B", ptr_resid_n: 10, ptr_resid_uncovered_n: 4, ptr_resid_uncovered_share: 0.4 }, bbox: [5, 6, 7, 8] },
            ],
        });
        fetchMock.mockImplementation(() => text(body));
        const rows = await fetchStadtteile();
        expect(rows.map((row) => row.name)).toEqual(["Alpha", "Zeta"]);
        expect(rows[0]).toMatchObject({ id: "1", outsideShare: 0.4, bounds: [5, 6, 7, 8], residentialCount: 10, outsideCount: 4 });
        expect(rows[1].outsideShare).toBeNull();
        const url = new URL(fetchMock.mock.calls[0][0] as string, "http://x");
        expect(url.searchParams.get("propertyName")).not.toContain("geom");
        await fetchStadtteile();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test("the housing values of a Stadtteil are requested as CSV with the residential filter", async () => {
        fetchMock.mockImplementation(() => text("FID,pt_in_catchment_any,walk_min_stop_any,origin_quality,pt_departures_daily_sum,pt_departures_complete,pt_line_n_unique\nx,true,3,good,10,true,1"));
        expect(await fetchResidentialValues("413")).toHaveLength(1);
        const params = new URL(fetchMock.mock.calls[0][0] as string, "http://x").searchParams;
        expect(params.get("outputFormat")).toBe("csv");
        expect(params.get("cql_filter")).toBe("stadtteil_code='413' AND building_function_code IN (1000,1010,1020) AND pt_district_match='contains'");
    });
});

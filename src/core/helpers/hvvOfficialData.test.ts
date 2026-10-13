import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
    cellsForBounds,
    CELL_LAT,
    CELL_LON,
    familyOfFeatureId,
    fetchCatchmentCell,
    fetchStopAreas,
    kindOfFeatureId,
    resetHvvCache,
    tooManyCells,
} from "./hvvOfficialData";

const fetchMock = vi.fn();
beforeEach(() => {
    resetHvvCache();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const json = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body });

describe("official HVV data", () => {
    test("the transport family comes from the feature id", () => {
        expect(familyOfFeatureId("DE.HH.UP_HVV_BAHN_U_12")).toBe("rail");
        expect(familyOfFeatureId("DE.HH.UP_HALTESTELLENBEREICHE_BAHN_3")).toBe("rail");
        expect(familyOfFeatureId("DE.HH.UP_HVV_BUS_STADT_77")).toBe("bus");
        expect(familyOfFeatureId("DE.HH.UP_HVV_FAEHRE_2")).toBe("ferry");
        expect(kindOfFeatureId("DE.HH.UP_HVV_BUS_NACHT_9")).toBe("bus_nacht");
        expect(kindOfFeatureId("garbage")).toBe("unknown");
    });

    test("the viewport is covered by whole cells and a huge viewport is refused", () => {
        const cells = cellsForBounds(10.001, 53.641, 10.019, 53.655);
        expect(cells.length).toBe(4);
        expect(new Set(cells.map((cell) => cell.key)).size).toBe(cells.length);
        for (const cell of cells) {
            expect(cell.west).toBeLessThanOrEqual(10.019);
            expect(cell.south).toBeLessThanOrEqual(53.655);
        }
        expect(tooManyCells(cellsForBounds(9.7, 53.4, 10.3, 53.8))).toBe(true);
        expect(tooManyCells(cells)).toBe(false);
    });

    test("stop areas load once, keep departures and lines, and drop records without departures", async () => {
        fetchMock.mockImplementation(() => json({
            features: [
                { id: "DE.HH.UP_HALTESTELLENBEREICHE_BUS_1", geometry: { type: "Point", coordinates: [10, 53.6] }, properties: { name: "A", dhid: "d1", linien: "1,2", linienzahl: 2, art: "Stadtbus", abfahrten: 120 } },
                { id: "DE.HH.UP_HALTESTELLENBEREICHE_BAHN_2", geometry: { type: "Point", coordinates: [10.1, 53.6] }, properties: { name: "B", dhid: "d2", linien: "U1", linienzahl: 1, art: "U-Bahn", abfahrten: 800 } },
                { id: "DE.HH.UP_HALTESTELLENBEREICHE_BUS_3", geometry: { type: "Point", coordinates: [10.2, 53.6] }, properties: { name: "no value", dhid: "d3" } },
            ],
        }));
        const stops = await fetchStopAreas();
        expect(stops.map((stop) => [stop.properties.name, stop.properties.family, stop.properties.abfahrten])).toEqual([["A", "bus", 120], ["B", "rail", 800]]);
        await fetchStopAreas();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const params = new URL(fetchMock.mock.calls[0][0] as string).searchParams;
        expect(params.get("srsName")).toBe("EPSG:4326");
        expect(params.get("typeNames")).toBe("app:haltestellenbereiche_bahn,app:haltestellenbereiche_bus,app:haltestellenbereiche_faehre");
    });

    test("a catchment cell is requested with the bbox in latitude-longitude order, cached, and its coordinates are rounded", async () => {
        const square = [[[10.123456789, 53.1234567891], [10.2, 53.1], [10.2, 53.2], [10.123456789, 53.1234567891]]];
        fetchMock.mockImplementation(() => json({
            features: [
                { id: "DE.HH.UP_HVV_BUS_STADT_5", geometry: { type: "Polygon", coordinates: square }, properties: { name: "S", dhid: "d", einwohner: 1200, linien: "5" } },
                { id: "DE.HH.UP_HVV_BAHN_U_6", geometry: { type: "Point", coordinates: [10, 53] }, properties: { name: "skip" } },
            ],
        }));
        const [cell] = cellsForBounds(10.0, 53.1, 10.001, 53.101);
        const features = await fetchCatchmentCell(cell);
        expect(features).toHaveLength(1);
        expect(features[0].properties).toMatchObject({ family: "bus", kind: "bus_stadt", einwohner: 1200, fid: "DE.HH.UP_HVV_BUS_STADT_5" });
        expect((features[0].geometry.coordinates as number[][][])[0][0]).toEqual([10.12346, 53.12346]);
        const bbox = new URL(fetchMock.mock.calls[0][0] as string).searchParams.get("bbox")!;
        expect(bbox).toBe(`${cell.south},${cell.west},${cell.south + CELL_LAT},${cell.west + CELL_LON},urn:ogc:def:crs:EPSG::4326`);
        await fetchCatchmentCell(cell);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test("a response without features is an empty cell, a failed request is retried", async () => {
        const [cell] = cellsForBounds(10.0, 53.1, 10.001, 53.101);
        fetchMock.mockImplementationOnce(() => json({}));
        expect(await fetchCatchmentCell(cell)).toEqual([]);
        resetHvvCache();
        fetchMock.mockImplementationOnce(() => Promise.resolve({ ok: false, status: 500, json: async () => ({}) }));
        await expect(fetchCatchmentCell(cell)).rejects.toThrow("500");
        fetchMock.mockImplementationOnce(() => json({ features: [] }));
        expect(await fetchCatchmentCell(cell)).toEqual([]);
    });
});

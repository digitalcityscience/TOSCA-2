import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
    DEFAULT_EXTERNAL_DATA_SOURCES,
    parseExternalDataSources,
    type ExternalDataSourceConfig,
} from "../config/externalDataSources";
import {
    buildSensorThingsDatastreamsUrl,
    parseOgcApiCollections,
    parseOgcApiDatasets,
    parseOgcApiQueryables,
    parseSensorThingsDatastream,
    sensorThingsDatastreamFeature,
    toPlainText,
    useExternalDataSourcesStore,
} from "./externalDataSources";

const ogcSource: ExternalDataSourceConfig = {
    id: "ogc",
    type: "ogc-api",
    title: "OGC",
    url: "https://api.example.test/datasets/v1",
};
const staSource: ExternalDataSourceConfig = {
    id: "sta",
    type: "sensorthings",
    title: "STA",
    url: "https://iot.example.test/",
};

function requestedUrl(call: number): string {
    const input = vi.mocked(fetch).mock.calls[call][0];
    return input instanceof Request ? input.url : input.toString();
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status });
}

describe("external data source config", () => {
    test("uses defaults when unset and accepts an explicit empty list", () => {
        expect(parseExternalDataSources(undefined)).toBe(DEFAULT_EXTERNAL_DATA_SOURCES);
        expect(parseExternalDataSources("[]")).toEqual([]);
    });

    test("drops invalid entries", () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        expect(parseExternalDataSources(JSON.stringify([
            ogcSource,
            { ...staSource, type: "wfs" },
            { ...staSource, url: "ftp://nope" },
        ]))).toEqual([ogcSource]);
    });
});

describe("external data source parsing", () => {
    test("strips HTML from descriptions", () => {
        expect(toPlainText("Data of <a href=\"x\">Hamburg</a>&nbsp;&amp; more\n")).toBe("Data of Hamburg & more");
    });

    test("reads datasets from a multi-API catalog", () => {
        expect(parseOgcApiDatasets(ogcSource, {
            apis: [
                { id: "trees", title: "Trees", description: "<b>Street</b> trees", landingPageUri: "https://api.example.test/datasets/v1/trees/" },
                { id: "broken", title: "No landing page" },
            ],
        })).toEqual([{
            id: "trees",
            title: "Trees",
            description: "Street trees",
            landingPageUrl: "https://api.example.test/datasets/v1/trees",
        }]);
    });

    test("treats a plain landing page as a single dataset", () => {
        expect(parseOgcApiDatasets(ogcSource, {
            title: "Single API",
            links: [{ rel: "data", href: "https://api.example.test/datasets/v1/collections" }],
        })).toEqual([{
            id: "ogc",
            title: "Single API",
            description: "",
            landingPageUrl: ogcSource.url,
        }]);
    });

    test("prefers GeoJSON and HTML item links for collections", () => {
        const [collection] = parseOgcApiCollections({
            collections: [{
                id: "trees",
                itemType: "feature",
                itemCount: 42,
                extent: { spatial: { bbox: [[9, 53, 10, 54]] } },
                links: [
                    { rel: "items", type: "text/html", href: "https://x.test/items?f=html" },
                    { rel: "items", type: "application/geo+json", href: "https://x.test/items?f=json" },
                ],
            }],
        });
        expect(collection).toMatchObject({
            id: "trees",
            title: "trees",
            itemCount: 42,
            bbox: [9, 53, 10, 54],
            itemsUrl: "https://x.test/items?f=json",
            htmlUrl: "https://x.test/items?f=html",
        });
    });

    test("quotes string ids in SensorThings URLs", () => {
        expect(buildSensorThingsDatastreamsUrl("https://iot.example.test/v1.1", "a'b").pathname)
            .toBe("/v1.1/ObservedProperties('a''b')/Datastreams");
        expect(buildSensorThingsDatastreamsUrl("https://iot.example.test/v1.1", 7).searchParams.get("$top"))
            .toBe("20");
    });
});

describe("external data sources store", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.stubGlobal("fetch", vi.fn());
    });

    test("requests OGC JSON and caches datasets", async () => {
        const fetchMock = vi.mocked(fetch);
        fetchMock.mockResolvedValueOnce(jsonResponse({ apis: [] }));
        const store = useExternalDataSourcesStore();

        await store.getOgcApiDatasets(ogcSource);
        await store.getOgcApiDatasets(ogcSource);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(requestedUrl(0)).toBe("https://api.example.test/datasets/v1?f=json");
    });

    test("evicts failed loads so they can be retried", async () => {
        const fetchMock = vi.mocked(fetch);
        fetchMock
            .mockResolvedValueOnce(new Response("", { status: 503 }))
            .mockResolvedValueOnce(jsonResponse({ apis: [] }));
        const store = useExternalDataSourcesStore();

        await expect(store.getOgcApiDatasets(ogcSource)).rejects.toThrow("503");
        await expect(store.getOgcApiDatasets(ogcSource)).resolves.toEqual([]);
    });

    test("falls back to SensorThings v1.0 and hides empty observed properties", async () => {
        const fetchMock = vi.mocked(fetch);
        fetchMock
            .mockResolvedValueOnce(new Response("", { status: 404 }))
            .mockResolvedValueOnce(jsonResponse({ value: [] }))
            .mockResolvedValueOnce(jsonResponse({
                value: [
                    { "@iot.id": 1, name: "Empty", "Datastreams@iot.count": 0 },
                    { "@iot.id": 2, name: "Bikes", description: "Available bikes", "Datastreams@iot.count": 5 },
                ],
            }));
        const store = useExternalDataSourcesStore();

        await expect(store.getSensorThingsObservedProperties(staSource)).resolves.toEqual([
            { id: 2, name: "Bikes", description: "Available bikes", datastreamCount: 5 },
        ]);
        expect(requestedUrl(1)).toBe("https://iot.example.test/v1.0");
        expect(requestedUrl(2)).toMatch(/^https:\/\/iot\.example\.test\/v1\.0\/ObservedProperties\?/);
    });

    test("pages datastreams and refuses cross-origin next links", async () => {
        const fetchMock = vi.mocked(fetch);
        fetchMock.mockResolvedValueOnce(jsonResponse({
            "@iot.count": 30,
            "@iot.nextLink": "https://iot.example.test/v1.1/ObservedProperties(2)/Datastreams?$skip=20",
            value: [{
                "@iot.id": 9,
                name: "Station A",
                unitOfMeasurement: { name: null, symbol: null },
                Thing: { name: "Thing A" },
                Observations: [{ phenomenonTime: "2026-09-30T08:00:00Z", result: 4 }],
            }],
        }));
        const store = useExternalDataSourcesStore();
        const source = { ...staSource, url: "https://iot.example.test/v1.1" };

        const page = await store.getSensorThingsDatastreams(source, 2);
        expect(page.total).toBe(30);
        expect(page.items[0]).toMatchObject({
            id: 9,
            name: "Station A",
            thingName: "Thing A",
            unitSymbol: undefined,
            latestObservation: { result: 4 },
        });

        await expect(
            store.getSensorThingsDatastreams(source, 2, "https://evil.example.test/v1.1/Datastreams")
        ).rejects.toThrow("another origin");
    });

    test("loads OGC features up to the cap across same-origin pages", async () => {
        const fetchMock = vi.mocked(fetch);
        const feature = (id: number) => ({ type: "Feature", id, geometry: { type: "Point", coordinates: [10, 53] }, properties: {} });
        fetchMock
            .mockResolvedValueOnce(jsonResponse({
                type: "FeatureCollection",
                numberMatched: 5,
                features: [feature(1), feature(2)],
                links: [{ rel: "next", type: "application/geo+json", href: "https://x.test/items?f=json&offset=2" }],
            }))
            .mockResolvedValueOnce(jsonResponse({
                type: "FeatureCollection",
                features: [feature(3), feature(4)],
                links: [{ rel: "next", type: "application/geo+json", href: "https://x.test/items?f=json&offset=4" }],
            }));
        const store = useExternalDataSourcesStore();

        const result = await store.getOgcApiCollectionFeatures({
            id: "trees",
            title: "Trees",
            description: "",
            itemsUrl: "https://x.test/items?f=json",
        }, { maxFeatures: 3 });

        expect(result.numberMatched).toBe(5);
        expect(result.features.features.map((item) => item.id)).toEqual([1, 2, 3]);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(new URL(requestedUrl(0)).searchParams.get("limit")).toBe("3");
    });

    test("loads every datastream of an observed property with locations", async () => {
        const fetchMock = vi.mocked(fetch);
        const stream = (id: number) => ({
            "@iot.id": id,
            name: `Stream ${id}`,
            Thing: { name: "Thing", Locations: [{ location: { type: "Feature", geometry: { type: "Point", coordinates: [10, 53] } } }] },
        });
        fetchMock
            .mockResolvedValueOnce(jsonResponse({
                value: [stream(1)],
                "@iot.nextLink": "https://iot.example.test/v1.1/ObservedProperties(2)/Datastreams?$skip=1000",
            }))
            .mockResolvedValueOnce(jsonResponse({ value: [stream(2)] }));
        const store = useExternalDataSourcesStore();

        const streams = await store.getAllSensorThingsDatastreams(
            { ...staSource, url: "https://iot.example.test/v1.1" },
            2
        );

        expect(streams.map((item) => item.id)).toEqual([1, 2]);
        expect(new URL(requestedUrl(0)).searchParams.get("$top")).toBe("1000");
        expect(streams[0].geometry).toEqual({ type: "Point", coordinates: [10, 53] });
    });
});

describe("SensorThings map features", () => {
    test("turns a datastream into a feature keyed by datastream id", () => {
        const datastream = parseSensorThingsDatastream({
            "@iot.id": 9,
            name: "Station A",
            unitOfMeasurement: { name: "Watt", symbol: "W" },
            Thing: { name: "Thing A", Locations: [{ location: { type: "Point", coordinates: [10, 53] } }] },
            Observations: [{ phenomenonTime: "2026-09-30T08:00:00Z", result: 4 }],
        });

        expect(sensorThingsDatastreamFeature(datastream)).toEqual({
            type: "Feature",
            id: 9,
            geometry: { type: "Point", coordinates: [10, 53] },
            properties: {
                datastream_id: 9,
                datastream: "Station A",
                thing: "Thing A",
                latest_value: 4,
                unit: "W",
                observed_at: "2026-09-30T08:00:00Z",
            },
        });
    });

    test("skips datastreams without a location", () => {
        expect(sensorThingsDatastreamFeature(parseSensorThingsDatastream({ "@iot.id": 1, Thing: { Locations: [] } })))
            .toBeUndefined();
    });
});

describe("OGC API queries", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.stubGlobal("fetch", vi.fn());
    });

    const collection = {
        id: "radwege",
        title: "Radwege",
        description: "",
        itemsUrl: "https://x.test/datasets/v1/rad/collections/radwege/items?f=json",
    };

    test("parses queryables and flags geometry properties", () => {
        expect(parseOgcApiQueryables({
            properties: {
                breite: { type: "number", title: "Breite" },
                name: { type: ["string", "null"] },
                geom: { format: "geometry-linestring" },
                shape: { $ref: "https://geojson.org/schema/Polygon.json" },
            },
        })).toEqual([
            { name: "breite", title: "Breite", type: "number", isGeometry: false },
            { name: "name", title: "name", type: "string", isGeometry: false },
            { name: "geom", title: "geom", type: "other", isGeometry: true },
            { name: "shape", title: "shape", type: "other", isGeometry: true },
        ]);
    });

    test("sends bbox, properties and CQL2 filter with the feature request", async () => {
        const fetchMock = vi.mocked(fetch);
        fetchMock.mockResolvedValueOnce(jsonResponse({ type: "FeatureCollection", features: [], numberMatched: 0 }));
        const store = useExternalDataSourcesStore();

        await store.getOgcApiCollectionFeatures(collection, {
            bbox: [9.9, 53.5, 10, 53.6],
            properties: ["breite", "geom"],
            filter: "breite > 4",
        });

        const params = new URL(requestedUrl(0)).searchParams;
        expect(params.get("bbox")).toBe("9.9,53.5,10,53.6");
        expect(params.get("properties")).toBe("breite,geom");
        expect(params.get("filter")).toBe("breite > 4");
        expect(params.get("filter-lang")).toBe("cql2-text");
    });

    test("counts with a one-feature request and treats missing queryables as none", async () => {
        const fetchMock = vi.mocked(fetch);
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ numberMatched: 48098, features: [] }))
            .mockResolvedValueOnce(new Response("", { status: 404 }));
        const store = useExternalDataSourcesStore();

        await expect(store.countOgcApiFeatures(collection)).resolves.toBe(48098);
        expect(new URL(requestedUrl(0)).searchParams.get("limit")).toBe("1");
        await expect(store.getOgcApiQueryables(collection)).resolves.toEqual([]);
        expect(new URL(requestedUrl(1)).pathname).toBe("/datasets/v1/rad/collections/radwege/queryables");
    });

    test("reports rejected filters with their status", async () => {
        vi.mocked(fetch).mockResolvedValueOnce(new Response("<html>", { status: 400 }));
        const store = useExternalDataSourcesStore();

        await expect(store.countOgcApiFeatures(collection, { filter: "x" })).rejects.toMatchObject({ status: 400 });
    });
});

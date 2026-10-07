import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { ExternalDataSourceConfig } from "../config/externalDataSources";
import {
    buildExternalCategoriesUrl,
    buildExternalCategoryUrl,
    buildExternalServicesUrl,
    buildSensorThingsDatastreamsUrl,
    buildSensorThingsLayerDatastreamsUrl,
    mapExternalService,
    parseOgcApiCollections,
    parseOgcApiDatasets,
    parseOgcApiQueryables,
    parseSensorThingsDatastream,
    sensorThingsDatastreamFeature,
    toPlainText,
    useExternalDataSourcesStore,
} from "./externalDataSources";

const capabilities = {
    show_uncurated: true,
    full_load: true,
    live_updates: true,
    server_filters: true,
    max_features: 10000,
};

const ogcSource: ExternalDataSourceConfig = {
    id: "ogc",
    type: "ogc-api",
    title: "OGC",
    url: "https://api.example.test/datasets/v1",
    attribution: "Example data",
    capabilities,
};
const staSource: ExternalDataSourceConfig = {
    id: "sta",
    type: "sensorthings",
    title: "STA",
    url: "https://iot.example.test/",
    attribution: "Example data",
    capabilities,
};

function requestedUrl(call: number): string {
    const input = vi.mocked(fetch).mock.calls[call][0];
    return input instanceof Request ? input.url : input.toString();
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status });
}

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

    test("ignores non-GeoJSON items links (e.g. CityJSON, glTF)", () => {
        const [building] = parseOgcApiCollections({
            collections: [{
                id: "building",
                itemType: "feature",
                links: [
                    { rel: "items", type: "application/city+json", href: "https://x.test/items?f=cityjson" },
                    { rel: "items", type: "model/gltf-binary", href: "https://x.test/items?f=glb" },
                ],
            }],
        });
        expect(building.itemsUrl).toBeUndefined();
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
        vi.stubEnv("VITE_BACKEND_ROOT_URL", "http://localhost:8000");
        vi.stubGlobal("fetch", vi.fn());
    });

    test("builds the service URL and maps backend service fields", () => {
        expect(buildExternalServicesUrl().toString()).toBe(
            "http://localhost:8000/api/v1/catalog/external-services"
        );
        expect(mapExternalService({
            slug: "hamburg-sta",
            service_type: "sensorthings",
            title: "Hamburg SensorThings",
            base_url: "https://iot.example.test",
            mqtt_url: "wss://iot.example.test/mqtt",
            attribution: "Urban Data Platform Hamburg",
            capabilities,
        })).toEqual({
            id: "hamburg-sta",
            type: "sensorthings",
            title: "Hamburg SensorThings",
            url: "https://iot.example.test",
            mqttUrl: "wss://iot.example.test/mqtt",
            attribution: "Urban Data Platform Hamburg",
            capabilities,
        });
    });

    test("builds category URLs with encoded slugs", () => {
        expect(buildExternalCategoriesUrl().toString()).toBe(
            "http://localhost:8000/api/v1/catalog/external-categories"
        );
        expect(buildExternalCategoryUrl("traffic & bikes").toString()).toBe(
            "http://localhost:8000/api/v1/catalog/external-categories/traffic%20%26%20bikes"
        );
    });

    test("loads backend services once and exposes the loaded state", async () => {
        const fetchMock = vi.mocked(fetch);
        fetchMock.mockResolvedValueOnce(jsonResponse([{
            slug: "hamburg-ogc",
            service_type: "ogc_api_features",
            title: "Hamburg OGC API",
            base_url: "https://api.example.test/datasets/v1",
            mqtt_url: null,
            attribution: "Example data",
            capabilities,
        }]));
        const store = useExternalDataSourcesStore();

        expect(store.loaded).toBe(false);
        await store.loadExternalServices();
        await store.loadExternalServices();

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(store.loaded).toBe(true);
        expect(store.loading).toBe(false);
        expect(store.error).toBe("");
        expect(store.sources).toEqual([{ ...ogcSource, id: "hamburg-ogc", title: "Hamburg OGC API" }]);
    });

    test("reports service errors and allows retrying", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        const fetchMock = vi.mocked(fetch);
        fetchMock
            .mockResolvedValueOnce(new Response("", { status: 503 }))
            .mockResolvedValueOnce(jsonResponse([]));
        const store = useExternalDataSourcesStore();

        await expect(store.loadExternalServices()).rejects.toThrow("503");
        expect(store.loaded).toBe(false);
        expect(store.sources).toEqual([]);
        expect(store.error).toBe(
            "We couldn't reach the external catalog service. Please try again in a moment."
        );

        await expect(store.loadExternalServices()).resolves.toEqual([]);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(store.loaded).toBe(true);
        expect(store.error).toBe("");
    });

    test("loads the category list once", async () => {
        const fetchMock = vi.mocked(fetch);
        const categories = [{
            slug: "shared-mobility",
            title: "Shared mobility",
            description: "Bikes and charging",
            display_order: 3,
            item_count: 2,
        }];
        fetchMock.mockResolvedValueOnce(jsonResponse(categories));
        const store = useExternalDataSourcesStore();

        await store.loadExternalCategories();
        await store.loadExternalCategories();

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(requestedUrl(0)).toBe(
            "http://localhost:8000/api/v1/catalog/external-categories"
        );
        expect(store.categories).toEqual(categories);
        expect(store.categoriesLoaded).toBe(true);
        expect(store.categoriesError).toBe("");
    });

    test("loads and caches category details per slug", async () => {
        const fetchMock = vi.mocked(fetch);
        const detail = {
            slug: "shared-mobility",
            title: "Shared mobility",
            description: "Bikes and charging",
            items: [{
                id: "item-1",
                title: "StadtRAD stations",
                description: "Bike stations",
                service: "hamburg-ogc",
                service_type: "ogc_api_features",
                ogc: { dataset_id: "stadtrad", collection_ids: ["stadtrad_stationen"] },
                style: { color: "#0288d1" },
                loading: { min_zoom: null },
                defaults: { properties: [], filter: [] },
                availability: { state: "OK", feature_count: 358, checked_at: "2026-10-07T08:00:00Z" },
            }],
        };
        fetchMock.mockResolvedValueOnce(jsonResponse(detail));
        const store = useExternalDataSourcesStore();

        await store.getExternalCategory("shared-mobility");
        await store.getExternalCategory("shared-mobility");

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(requestedUrl(0)).toBe(
            "http://localhost:8000/api/v1/catalog/external-categories/shared-mobility"
        );
        expect(store.categoryDetails["shared-mobility"]).toEqual(detail);
        expect(store.categoryLoading["shared-mobility"]).toBe(false);
    });

    test("evicts failed category details so they can be retried", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        const fetchMock = vi.mocked(fetch);
        fetchMock
            .mockResolvedValueOnce(new Response("", { status: 503 }))
            .mockResolvedValueOnce(jsonResponse({
                slug: "traffic",
                title: "Traffic",
                description: "",
                items: [],
            }));
        const store = useExternalDataSourcesStore();

        await expect(store.getExternalCategory("traffic")).rejects.toThrow("503");
        expect(store.categoryErrors.traffic).toBe(
            "We couldn't reach the external catalog service. Please try again in a moment."
        );

        await expect(store.getExternalCategory("traffic")).resolves.toMatchObject({ slug: "traffic" });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(store.categoryErrors.traffic).toBe("");
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

    test("loads a curated service/layer pair without requesting a count", async () => {
        const fetchMock = vi.mocked(fetch);
        const stream = (id: number) => ({
            "@iot.id": id,
            name: `Stream ${id}`,
            Thing: { Locations: [{ location: { type: "Point", coordinates: [10, 53] } }] },
        });
        fetchMock
            .mockResolvedValueOnce(jsonResponse({
                value: [stream(1)],
                "@iot.nextLink": "https://iot.example.test/v1.1/Datastreams?$skip=1000",
            }))
            .mockResolvedValueOnce(jsonResponse({ value: [stream(2)] }));
        const store = useExternalDataSourcesStore();

        const streams = await store.getAllSensorThingsLayerDatastreams(
            { ...staSource, url: "https://iot.example.test/v1.1" },
            "HH_STA_O'Brien",
            "Status Ladepunkt"
        );

        expect(streams.map((item) => item.id)).toEqual([1, 2]);
        const params = new URL(requestedUrl(0)).searchParams;
        expect(params.get("$filter")).toBe(
            "properties/serviceName eq 'HH_STA_O''Brien' and properties/layerName eq 'Status Ladepunkt'"
        );
        expect(params.get("$top")).toBe("1000");
        expect(params.has("$count")).toBe(false);
    });

    test("caps SensorThings bulk loads with the service feature limit", async () => {
        const fetchMock = vi.mocked(fetch);
        fetchMock.mockResolvedValueOnce(jsonResponse({
            value: [1, 2, 3].map((id) => ({ "@iot.id": id, name: `Stream ${id}` })),
            "@iot.nextLink": "https://iot.example.test/v1.1/Datastreams?$skip=3",
        }));
        const store = useExternalDataSourcesStore();

        const streams = await store.getAllSensorThingsLayerDatastreams(
            {
                ...staSource,
                url: "https://iot.example.test/v1.1",
                capabilities: { ...staSource.capabilities, max_features: 2 },
            },
            "service",
            "layer"
        );

        expect(streams.map((item) => item.id)).toEqual([1, 2]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(new URL(requestedUrl(0)).searchParams.get("$top")).toBe("2");
    });
});

describe("SensorThings curated layer URLs", () => {
    test("escapes string literals and omits the slow count parameter", () => {
        const url = buildSensorThingsLayerDatastreamsUrl(
            "https://iot.example.test/v1.1",
            "service's name",
            "layer's name"
        );

        expect(url.searchParams.get("$filter")).toBe(
            "properties/serviceName eq 'service''s name' and properties/layerName eq 'layer''s name'"
        );
        expect(url.searchParams.has("$count")).toBe(false);
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

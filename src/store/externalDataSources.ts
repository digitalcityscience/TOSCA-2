import { acceptHMRUpdate, defineStore } from "pinia";
import { ref } from "vue";
import type {
    ExternalDataSourceCapabilities,
    ExternalDataSourceConfig,
    ExternalDataSourceType,
} from "../config/externalDataSources";
import type { Feature, FeatureCollection } from "@helpers/geojson";
import { reportDeveloperError, serviceUnavailableMessage } from "@helpers/userFacingError";
import { fetchBackendJson, getBackendRootUrl } from "./backend";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OgcApiDataset {
    id: string;
    title: string;
    description: string;
    landingPageUrl: string;
}

export interface OgcApiCollection {
    id: string;
    title: string;
    description: string;
    itemType?: string;
    itemCount?: number;
    bbox?: number[];
    /** GeoJSON items endpoint, when the collection advertises one. */
    itemsUrl?: string;
    /** Human-readable page for the collection. */
    htmlUrl?: string;
}

export interface SensorThingsObservedProperty {
    id: number | string;
    name: string;
    description: string;
    datastreamCount: number;
}

export interface SensorThingsObservation {
    phenomenonTime: string;
    result: unknown;
}

export interface SensorThingsDatastream {
    id: number | string;
    name: string;
    description: string;
    unitSymbol?: string;
    unitName?: string;
    thingName?: string;
    latestObservation?: SensorThingsObservation;
    /** Location of the datastream's Thing, when it has one. */
    geometry?: GeoJSON.Geometry;
}

export type OgcQueryableType = "string" | "number" | "integer" | "boolean" | "other";

export interface OgcApiQueryable {
    name: string;
    title: string;
    type: OgcQueryableType;
    isGeometry: boolean;
}

export interface OgcApiFeatureQuery {
    /** Upper bound of features to load; defaults to OGC_API_MAX_FEATURES. */
    maxFeatures?: number;
    /** [minX, minY, maxX, maxY] in CRS84. */
    bbox?: [number, number, number, number];
    /** Properties to return. Must include the geometry property to keep geometries. */
    properties?: string[];
    /** CQL2 text filter. */
    filter?: string;
    signal?: AbortSignal;
}

export interface OgcApiFeatureLoadResult {
    features: FeatureCollection;
    /** Total matching features reported by the server, if any. */
    numberMatched?: number;
}

export interface SensorThingsPage<T> {
    items: T[];
    total?: number;
    nextLink?: string;
}

export interface ExternalCategorySummary {
    slug: string;
    title: string;
    description: string;
    display_order: number;
    item_count: number;
}

export type ExternalCategoryAvailabilityState = "UNKNOWN" | "OK" | "MISSING" | "ERROR";

export interface ExternalCategoryItem {
    id: string;
    title: string;
    description: string;
    service: string;
    service_type: "ogc_api_features" | "sensorthings";
    ogc?: {
        dataset_id: string;
        collection_ids: string[];
    };
    sensorthings?: {
        service_name: string;
        layer_name: string;
    };
    style: { color: string };
    loading: { min_zoom: number | null };
    defaults?: {
        properties: string[];
        filter: Array<{
            property: string;
            operator: "eq" | "neq" | "lt" | "lte" | "gt" | "gte" | "contains";
            value: string | number | boolean;
        }>;
    };
    availability: {
        state: ExternalCategoryAvailabilityState;
        feature_count: number | null;
        checked_at: string | null;
    };
}

export interface ExternalCategoryDetail {
    slug: string;
    title: string;
    description: string;
    items: ExternalCategoryItem[];
}

interface OgcLink {
    href: string;
    rel?: string;
    type?: string;
}

interface OgcApiCatalogResponse {
    title?: string;
    description?: string;
    apis?: Array<{
        id?: string;
        title?: string;
        description?: string;
        landingPageUri?: string;
    }>;
    links?: OgcLink[];
}

interface OgcApiCollectionsResponse {
    collections?: Array<{
        id: string;
        title?: string;
        description?: string;
        itemType?: string;
        itemCount?: number;
        extent?: { spatial?: { bbox?: number[][] } };
        links?: OgcLink[];
    }>;
}

interface SensorThingsCollectionResponse<T> {
    "@iot.count"?: number;
    "@iot.nextLink"?: string;
    value: T[];
}

interface SensorThingsObservedPropertyResponse {
    "@iot.id": number | string;
    name?: string;
    description?: string;
    "Datastreams@iot.count"?: number;
}

interface SensorThingsDatastreamResponse {
    "@iot.id": number | string;
    name?: string;
    description?: string;
    unitOfMeasurement?: { name?: string | null; symbol?: string | null } | null;
    Thing?: {
        name?: string;
        Locations?: Array<{ location?: GeoJSON.Geometry | GeoJSON.Feature | null }>;
    };
    Observations?: SensorThingsObservation[];
}

interface ExternalServiceResponse {
    slug: string;
    service_type: "ogc_api_features" | "sensorthings";
    title: string;
    base_url: string;
    mqtt_url?: string | null;
    attribution: string;
    capabilities: ExternalDataSourceCapabilities;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const SENSORTHINGS_PAGE_SIZE = 20;
/** Page size used when loading every datastream of an observed property. */
const SENSORTHINGS_BULK_PAGE_SIZE = 1000;
const SENSORTHINGS_MAX_BULK_PAGES = 50;
/** Upper bound of features loaded from one OGC API collection. */
export const OGC_API_MAX_FEATURES = 10000;
export const OGC_API_MAX_PAGE_SIZE = 10000;
const SENSORTHINGS_MAX_PROPERTY_PAGES = 10;
const EXTERNAL_SERVICES_API_PATH = "/api/v1/catalog/external-services";
const EXTERNAL_CATEGORIES_API_PATH = "/api/v1/catalog/external-categories";
const OGC_DATA_RELS = new Set(["data", "http://www.opengis.net/def/rel/ogc/1.0/data"]);

export function buildExternalServicesUrl(): URL {
    return new URL(EXTERNAL_SERVICES_API_PATH, getBackendRootUrl());
}

export function buildExternalCategoriesUrl(): URL {
    return new URL(EXTERNAL_CATEGORIES_API_PATH, getBackendRootUrl());
}

export function buildExternalCategoryUrl(slug: string): URL {
    return new URL(
        `${EXTERNAL_CATEGORIES_API_PATH}/${encodeURIComponent(slug)}`,
        getBackendRootUrl()
    );
}

export function mapExternalService(service: ExternalServiceResponse): ExternalDataSourceConfig {
    const type: ExternalDataSourceType = service.service_type === "ogc_api_features"
        ? "ogc-api"
        : "sensorthings";
    return {
        id: service.slug,
        type,
        title: service.title,
        url: service.base_url,
        ...(service.mqtt_url == null ? {} : { mqttUrl: service.mqtt_url }),
        attribution: service.attribution,
        capabilities: service.capabilities,
    };
}

function trimTrailingSlash(value: string): string {
    return value.replace(/\/+$/, "");
}

/** Reduces HTML-bearing descriptions (common in OGC catalogs) to plain text. */
export function toPlainText(value: unknown): string {
    if (typeof value !== "string") return "";
    return value
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim();
}

function withJsonFormat(url: string): URL {
    const resolved = new URL(url);
    resolved.searchParams.set("f", "json");
    return resolved;
}

/**
 * GET JSON from a public third-party API. Only safelisted headers are sent so
 * the browser can skip the CORS preflight.
 */
export class ExternalRequestError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
        this.name = "ExternalRequestError";
    }
}

async function fetchExternalJson<T>(
    url: URL | string,
    resourceName: string,
    signal?: AbortSignal
): Promise<T> {
    const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: new Headers({ Accept: "application/json" }),
        signal,
    });
    if (!response.ok) {
        throw new ExternalRequestError(
            `${resourceName} request failed (${response.status} ${response.statusText})`,
            response.status
        );
    }
    return await response.json() as T;
}

/**
 * Picks the first link of a relation in the preferred media types. A link
 * without a `type` is accepted as a last resort; links of other types are not
 * (an `items` link may be CityJSON or glTF, which we cannot read as GeoJSON).
 */
function pickLink(links: OgcLink[] | undefined, rel: string, types: string[]): string | undefined {
    const candidates = (links ?? []).filter((link) => link.rel === rel);
    for (const type of types) {
        const match = candidates.find((link) => link.type === type);
        if (match !== undefined) return match.href;
    }
    return candidates.find((link) => link.type === undefined)?.href;
}

export function parseOgcApiDatasets(
    source: ExternalDataSourceConfig,
    response: OgcApiCatalogResponse
): OgcApiDataset[] {
    // Multi-API catalog (e.g. ldproxy): one landing page per dataset.
    if (Array.isArray(response.apis)) {
        return response.apis
            .filter((api) => typeof api.landingPageUri === "string" && api.landingPageUri !== "")
            .map((api) => ({
                id: api.id ?? api.landingPageUri as string,
                title: api.title ?? api.id ?? api.landingPageUri as string,
                description: toPlainText(api.description),
                landingPageUrl: trimTrailingSlash(api.landingPageUri as string),
            }));
    }
    // Plain OGC API landing page: the source itself is the only dataset.
    if ((response.links ?? []).some((link) => OGC_DATA_RELS.has(link.rel ?? ""))) {
        return [{
            id: source.id,
            title: response.title ?? source.title,
            description: toPlainText(response.description),
            landingPageUrl: trimTrailingSlash(source.url),
        }];
    }
    return [];
}

export function parseOgcApiCollections(response: OgcApiCollectionsResponse): OgcApiCollection[] {
    return (response.collections ?? []).map((collection) => ({
        id: collection.id,
        title: collection.title ?? collection.id,
        description: toPlainText(collection.description),
        itemType: collection.itemType,
        itemCount: typeof collection.itemCount === "number" ? collection.itemCount : undefined,
        bbox: collection.extent?.spatial?.bbox?.[0],
        itemsUrl: pickLink(collection.links, "items", ["application/geo+json", "application/json"]),
        htmlUrl: pickLink(collection.links, "items", ["text/html"]) ??
            pickLink(collection.links, "alternate", ["text/html"]),
    }));
}

function sensorThingsEntityId(id: number | string): string {
    return typeof id === "number" ? String(id) : `'${id.replace(/'/g, "''")}'`;
}

/** SensorThings locations are either a bare GeoJSON geometry or a Feature. */
function sensorThingsGeometry(
    locations: Array<{ location?: GeoJSON.Geometry | GeoJSON.Feature | null }> | undefined
): GeoJSON.Geometry | undefined {
    for (const entry of locations ?? []) {
        const location = entry.location;
        if (location === undefined || location === null) continue;
        const geometry = location.type === "Feature" ? location.geometry : location;
        if (geometry !== null && geometry !== undefined && "type" in geometry) return geometry;
    }
    return undefined;
}

export function parseSensorThingsDatastream(
    response: SensorThingsDatastreamResponse
): SensorThingsDatastream {
    const unit = response.unitOfMeasurement;
    return {
        id: response["@iot.id"],
        name: response.name ?? String(response["@iot.id"]),
        description: toPlainText(response.description),
        unitSymbol: unit?.symbol ?? undefined,
        unitName: unit?.name ?? undefined,
        thingName: response.Thing?.name,
        latestObservation: response.Observations?.[0],
        geometry: sensorThingsGeometry(response.Thing?.Locations),
    };
}

/** Map feature for a datastream; its id is the datastream id so layers can merge streams. */
export function sensorThingsDatastreamFeature(datastream: SensorThingsDatastream): Feature | undefined {
    if (datastream.geometry === undefined) return undefined;
    const observation = datastream.latestObservation;
    const result = observation?.result;
    return {
        type: "Feature",
        id: typeof datastream.id === "number" ? datastream.id : undefined,
        geometry: datastream.geometry,
        properties: {
            datastream_id: datastream.id,
            datastream: datastream.name,
            thing: datastream.thingName ?? null,
            latest_value: typeof result === "object" && result !== null ? JSON.stringify(result) : result ?? null,
            unit: datastream.unitSymbol ?? datastream.unitName ?? null,
            observed_at: observation?.phenomenonTime ?? null,
        },
    };
}

const DATASTREAM_EXPAND =
    "Thing($select=name;$expand=Locations($select=location))," +
    "Observations($top=1;$orderby=phenomenonTime desc;$select=phenomenonTime,result)";

export function buildSensorThingsDatastreamsUrl(
    baseUrl: string,
    observedPropertyId: number | string,
    pageSize = SENSORTHINGS_PAGE_SIZE
): URL {
    const url = new URL(
        `${baseUrl}/ObservedProperties(${sensorThingsEntityId(observedPropertyId)})/Datastreams`
    );
    url.searchParams.set("$count", "true");
    url.searchParams.set("$top", String(pageSize));
    url.searchParams.set("$orderby", "name");
    url.searchParams.set("$select", "@iot.id,name,description,unitOfMeasurement");
    url.searchParams.set("$expand", DATASTREAM_EXPAND);
    return url;
}

function sensorThingsStringLiteral(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

/** Datastreams selected by the Hamburg serviceName/layerName convention. */
export function buildSensorThingsLayerDatastreamsUrl(
    baseUrl: string,
    serviceName: string,
    layerName: string,
    pageSize = SENSORTHINGS_BULK_PAGE_SIZE
): URL {
    const url = new URL(`${baseUrl}/Datastreams`);
    url.searchParams.set(
        "$filter",
        `properties/serviceName eq ${sensorThingsStringLiteral(serviceName)} and ` +
        `properties/layerName eq ${sensorThingsStringLiteral(layerName)}`
    );
    url.searchParams.set("$top", String(pageSize));
    url.searchParams.set("$orderby", "name");
    url.searchParams.set("$select", "@iot.id,name,description,unitOfMeasurement");
    url.searchParams.set("$expand", DATASTREAM_EXPAND);
    return url;
}

/** Only follow server-provided paging links that stay on the configured service. */
function assertSameOrigin(link: string, baseUrl: string): string {
    if (new URL(link).origin !== new URL(baseUrl).origin) {
        throw new Error(`Refusing to follow paging link to another origin: ${link}`);
    }
    return link;
}

/** Resolves a sibling endpoint of a collection's items URL, e.g. `queryables`. */
function collectionEndpoint(collection: OgcApiCollection, endpoint: string): URL {
    if (collection.itemsUrl === undefined) {
        throw new Error(`Collection ${collection.id} has no items endpoint`);
    }
    const url = new URL(collection.itemsUrl);
    url.pathname = url.pathname.replace(/\/items\/?$/, `/${endpoint}`);
    url.search = "";
    return withJsonFormat(url.toString());
}

function queryableType(schema: Record<string, unknown>): OgcQueryableType {
    const type = Array.isArray(schema.type) ? schema.type.find((item) => item !== "null") : schema.type;
    return type === "string" || type === "number" || type === "integer" || type === "boolean" ? type : "other";
}

export function parseOgcApiQueryables(response: { properties?: Record<string, Record<string, unknown>> }): OgcApiQueryable[] {
    return Object.entries(response.properties ?? {}).map(([name, schema]) => {
        const format = typeof schema.format === "string" ? schema.format : "";
        const ref = typeof schema.$ref === "string" ? schema.$ref : "";
        return {
            name,
            title: typeof schema.title === "string" && schema.title !== "" ? schema.title : name,
            type: queryableType(schema),
            isGeometry: format.startsWith("geometry") || /geojson|geometry/i.test(ref),
        };
    });
}

function applyFeatureQuery(url: URL, query: OgcApiFeatureQuery): void {
    if (query.bbox !== undefined) url.searchParams.set("bbox", query.bbox.join(","));
    if (query.properties !== undefined) url.searchParams.set("properties", query.properties.join(","));
    if (query.filter !== undefined && query.filter !== "") {
        url.searchParams.set("filter", query.filter);
        url.searchParams.set("filter-lang", "cql2-text");
    }
}

/** First `items` page URL for a query (GeoJSON, with filter/properties/bbox). */
export function buildOgcApiItemsUrl(
    collection: OgcApiCollection,
    query: Omit<OgcApiFeatureQuery, "maxFeatures" | "signal">,
    limit: number
): URL {
    if (collection.itemsUrl === undefined) {
        throw new Error(`Collection ${collection.id} has no GeoJSON items endpoint`);
    }
    const url = withJsonFormat(collection.itemsUrl);
    url.searchParams.set("limit", String(limit));
    applyFeatureQuery(url, query);
    return url;
}

export function isOgcApiFeatureCollection(collection: OgcApiCollection): boolean {
    return collection.itemsUrl !== undefined &&
        (collection.itemType === undefined || collection.itemType.toLowerCase() === "feature");
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useExternalDataSourcesStore = defineStore("externalDataSources", () => {
    const sources = ref<ExternalDataSourceConfig[]>([]);
    const loading = ref(false);
    const loaded = ref(false);
    const error = ref("");
    const categories = ref<ExternalCategorySummary[]>([]);
    const categoriesLoading = ref(false);
    const categoriesLoaded = ref(false);
    const categoriesError = ref("");
    const categoryDetails = ref<Record<string, ExternalCategoryDetail>>({});
    const categoryLoading = ref<Record<string, boolean>>({});
    const categoryErrors = ref<Record<string, string>>({});
    const ogcDatasetCache = new Map<string, Promise<OgcApiDataset[]>>();
    const ogcCollectionCache = new Map<string, Promise<OgcApiCollection[]>>();
    const ogcQueryablesCache = new Map<string, Promise<OgcApiQueryable[]>>();
    const sensorThingsBaseCache = new Map<string, Promise<string>>();
    const observedPropertyCache = new Map<string, Promise<SensorThingsObservedProperty[]>>();
    let servicesLoadPromise: Promise<ExternalDataSourceConfig[]> | undefined;
    let categoriesLoadPromise: Promise<ExternalCategorySummary[]> | undefined;
    const categoryDetailPromises = new Map<string, Promise<ExternalCategoryDetail>>();

    async function loadExternalServices(): Promise<ExternalDataSourceConfig[]> {
        if (loaded.value) return sources.value;
        if (servicesLoadPromise !== undefined) return await servicesLoadPromise;

        const request = (async (): Promise<ExternalDataSourceConfig[]> => {
            loading.value = true;
            error.value = "";
            try {
                const response = await fetchBackendJson<ExternalServiceResponse[]>(
                    buildExternalServicesUrl(),
                    "External catalog"
                );
                sources.value = response.map(mapExternalService);
                loaded.value = true;
                return sources.value;
            } catch (cause) {
                sources.value = [];
                error.value = serviceUnavailableMessage("external catalog");
                reportDeveloperError("Loading external catalog services", cause);
                throw cause;
            } finally {
                loading.value = false;
            }
        })();

        servicesLoadPromise = request;
        try {
            return await request;
        } finally {
            servicesLoadPromise = undefined;
        }
    }

    async function loadExternalCategories(): Promise<ExternalCategorySummary[]> {
        if (categoriesLoaded.value) return categories.value;
        if (categoriesLoadPromise !== undefined) return await categoriesLoadPromise;

        const request = (async (): Promise<ExternalCategorySummary[]> => {
            categoriesLoading.value = true;
            categoriesError.value = "";
            try {
                categories.value = await fetchBackendJson<ExternalCategorySummary[]>(
                    buildExternalCategoriesUrl(),
                    "External categories"
                );
                categoriesLoaded.value = true;
                return categories.value;
            } catch (cause) {
                categories.value = [];
                categoriesError.value = serviceUnavailableMessage("external catalog");
                reportDeveloperError("Loading external catalog categories", cause);
                throw cause;
            } finally {
                categoriesLoading.value = false;
            }
        })();

        categoriesLoadPromise = request;
        try {
            return await request;
        } finally {
            categoriesLoadPromise = undefined;
        }
    }

    async function getExternalCategory(slug: string): Promise<ExternalCategoryDetail> {
        const existing = categoryDetails.value[slug];
        if (existing !== undefined) return existing;
        const pending = categoryDetailPromises.get(slug);
        if (pending !== undefined) return await pending;

        categoryLoading.value = { ...categoryLoading.value, [slug]: true };
        categoryErrors.value = { ...categoryErrors.value, [slug]: "" };
        const request = fetchBackendJson<ExternalCategoryDetail>(
            buildExternalCategoryUrl(slug),
            "External category"
        ).then((category) => {
            categoryDetails.value = { ...categoryDetails.value, [slug]: category };
            return category;
        }).catch((cause: unknown) => {
            categoryErrors.value = {
                ...categoryErrors.value,
                [slug]: serviceUnavailableMessage("external catalog"),
            };
            reportDeveloperError(`Loading external category ${slug}`, cause);
            throw cause;
        }).finally(() => {
            categoryLoading.value = { ...categoryLoading.value, [slug]: false };
            categoryDetailPromises.delete(slug);
        });

        categoryDetailPromises.set(slug, request);
        return await request;
    }

    /** Caches a promise but evicts it on failure so the user can retry. */
    function cached<T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> {
        const existing = cache.get(key);
        if (existing !== undefined) return existing;
        const promise = load().catch((error: unknown) => {
            cache.delete(key);
            throw error;
        });
        cache.set(key, promise);
        return promise;
    }

    async function getOgcApiDatasets(source: ExternalDataSourceConfig): Promise<OgcApiDataset[]> {
        return await cached(ogcDatasetCache, source.id, async () => {
            const response = await fetchExternalJson<OgcApiCatalogResponse>(
                withJsonFormat(source.url),
                `${source.title} catalog`
            );
            return parseOgcApiDatasets(source, response);
        });
    }

    async function getOgcApiCollections(dataset: OgcApiDataset): Promise<OgcApiCollection[]> {
        return await cached(ogcCollectionCache, dataset.landingPageUrl, async () => {
            const response = await fetchExternalJson<OgcApiCollectionsResponse>(
                withJsonFormat(`${dataset.landingPageUrl}/collections`),
                `${dataset.title} collections`
            );
            return parseOgcApiCollections(response);
        });
    }

    /** Resolves the versioned SensorThings base URL (…/v1.1 or …/v1.0). */
    async function getSensorThingsBaseUrl(source: ExternalDataSourceConfig): Promise<string> {
        return await cached(sensorThingsBaseCache, source.id, async () => {
            const root = trimTrailingSlash(source.url);
            if (/\/v1\.\d+$/.test(root)) return root;
            for (const version of ["v1.1", "v1.0"]) {
                const candidate = `${root}/${version}`;
                try {
                    const response = await fetchExternalJson<{ value?: unknown }>(
                        candidate,
                        `${source.title} service`
                    );
                    if (Array.isArray(response.value)) return candidate;
                } catch {
                    // Try the next version.
                }
            }
            throw new Error(`No SensorThings v1.x endpoint found at ${source.url}`);
        });
    }

    /** Observed properties that have at least one datastream, sorted by name. */
    async function getSensorThingsObservedProperties(
        source: ExternalDataSourceConfig
    ): Promise<SensorThingsObservedProperty[]> {
        return await cached(observedPropertyCache, source.id, async () => {
            const baseUrl = await getSensorThingsBaseUrl(source);
            const url = new URL(`${baseUrl}/ObservedProperties`);
            url.searchParams.set("$top", "200");
            url.searchParams.set("$orderby", "name");
            url.searchParams.set("$select", "@iot.id,name,description");
            url.searchParams.set("$expand", "Datastreams($count=true;$top=0;$select=@iot.id)");

            const properties: SensorThingsObservedProperty[] = [];
            let next: string | undefined = url.toString();
            for (let page = 0; next !== undefined && page < SENSORTHINGS_MAX_PROPERTY_PAGES; page++) {
                const response: SensorThingsCollectionResponse<SensorThingsObservedPropertyResponse> =
                    await fetchExternalJson(next, `${source.title} observed properties`);
                for (const item of response.value) {
                    properties.push({
                        id: item["@iot.id"],
                        name: item.name ?? String(item["@iot.id"]),
                        description: toPlainText(item.description),
                        datastreamCount: item["Datastreams@iot.count"] ?? 0,
                    });
                }
                next = response["@iot.nextLink"] === undefined
                    ? undefined
                    : assertSameOrigin(response["@iot.nextLink"], baseUrl);
            }
            return properties.filter((property) => property.datastreamCount > 0);
        });
    }

    /**
     * One page of datastreams for an observed property, each with its Thing
     * and latest observation. Pass the previous page's `nextLink` to continue.
     */
    async function getSensorThingsDatastreams(
        source: ExternalDataSourceConfig,
        observedPropertyId: number | string,
        nextLink?: string
    ): Promise<SensorThingsPage<SensorThingsDatastream>> {
        const baseUrl = await getSensorThingsBaseUrl(source);
        const url = nextLink === undefined
            ? buildSensorThingsDatastreamsUrl(baseUrl, observedPropertyId)
            : assertSameOrigin(nextLink, baseUrl);
        const response = await fetchExternalJson<SensorThingsCollectionResponse<SensorThingsDatastreamResponse>>(
            url,
            `${source.title} datastreams`
        );
        return {
            items: response.value.map(parseSensorThingsDatastream),
            total: response["@iot.count"],
            nextLink: response["@iot.nextLink"],
        };
    }

    /**
     * Loads up to `maxFeatures` GeoJSON features of an OGC API collection,
     * following `next` links on the same origin.
     */
    async function getOgcApiCollectionFeatures(
        collection: OgcApiCollection,
        query: OgcApiFeatureQuery = {}
    ): Promise<OgcApiFeatureLoadResult> {
        if (collection.itemsUrl === undefined) {
            throw new Error(`Collection ${collection.id} has no GeoJSON items endpoint`);
        }
        const maxFeatures = query.maxFeatures ?? OGC_API_MAX_FEATURES;
        const features: Feature[] = [];
        let numberMatched: number | undefined;
        const firstPage = buildOgcApiItemsUrl(collection, query, Math.min(maxFeatures, OGC_API_MAX_PAGE_SIZE));
        let next: string | undefined = firstPage.toString();
        while (next !== undefined && features.length < maxFeatures) {
            const page: GeoJSON.FeatureCollection & { numberMatched?: number; links?: OgcLink[] } =
                await fetchExternalJson(next, `${collection.title} features`, query.signal);
            numberMatched ??= typeof page.numberMatched === "number" ? page.numberMatched : undefined;
            features.push(...(page.features ?? []).slice(0, maxFeatures - features.length));
            const nextLink = pickLink(page.links, "next", ["application/geo+json", "application/json"]);
            next = nextLink === undefined || (page.features ?? []).length === 0
                ? undefined
                : assertSameOrigin(nextLink, collection.itemsUrl);
        }
        return {
            features: { type: "FeatureCollection", features },
            numberMatched,
        };
    }

    /** Number of features matching a filter (and bbox), via a one-feature request. */
    async function countOgcApiFeatures(
        collection: OgcApiCollection,
        query: Omit<OgcApiFeatureQuery, "maxFeatures" | "properties"> = {}
    ): Promise<number | undefined> {
        if (collection.itemsUrl === undefined) return undefined;
        const url = withJsonFormat(collection.itemsUrl);
        url.searchParams.set("limit", "1");
        applyFeatureQuery(url, query);
        const page = await fetchExternalJson<{ numberMatched?: number }>(
            url,
            `${collection.title} feature count`,
            query.signal
        );
        return typeof page.numberMatched === "number" ? page.numberMatched : undefined;
    }

    /** Filterable/selectable properties of a collection; empty when not advertised. */
    async function getOgcApiQueryables(collection: OgcApiCollection): Promise<OgcApiQueryable[]> {
        return await cached(ogcQueryablesCache, collection.itemsUrl ?? collection.id, async () => {
            try {
                return parseOgcApiQueryables(await fetchExternalJson(
                    collectionEndpoint(collection, "queryables"),
                    `${collection.title} queryables`
                ));
            } catch (error) {
                if (error instanceof ExternalRequestError && error.status === 404) return [];
                throw error;
            }
        });
    }

    /** Every datastream of an observed property, with Thing location and latest observation. */
    async function getAllSensorThingsDatastreams(
        source: ExternalDataSourceConfig,
        observedPropertyId: number | string
    ): Promise<SensorThingsDatastream[]> {
        const baseUrl = await getSensorThingsBaseUrl(source);
        const datastreams: SensorThingsDatastream[] = [];
        const maxFeatures = source.capabilities.max_features ?? Number.POSITIVE_INFINITY;
        const pageSize = Math.max(1, Math.min(SENSORTHINGS_BULK_PAGE_SIZE, maxFeatures));
        let next: string | undefined = buildSensorThingsDatastreamsUrl(
            baseUrl,
            observedPropertyId,
            pageSize
        ).toString();
        for (let page = 0; next !== undefined && page < SENSORTHINGS_MAX_BULK_PAGES && datastreams.length < maxFeatures; page++) {
            const response: SensorThingsCollectionResponse<SensorThingsDatastreamResponse> =
                await fetchExternalJson(next, `${source.title} datastreams`);
            const remaining = maxFeatures - datastreams.length;
            datastreams.push(...response.value.slice(0, remaining).map(parseSensorThingsDatastream));
            next = response["@iot.nextLink"] === undefined
                ? undefined
                : assertSameOrigin(response["@iot.nextLink"], baseUrl);
        }
        return datastreams;
    }

    /** Every datastream matching a curated service/layer pair, without the slow `$count`. */
    async function getAllSensorThingsLayerDatastreams(
        source: ExternalDataSourceConfig,
        serviceName: string,
        layerName: string
    ): Promise<SensorThingsDatastream[]> {
        const baseUrl = await getSensorThingsBaseUrl(source);
        const datastreams: SensorThingsDatastream[] = [];
        const maxFeatures = source.capabilities.max_features ?? Number.POSITIVE_INFINITY;
        const pageSize = Math.max(1, Math.min(SENSORTHINGS_BULK_PAGE_SIZE, maxFeatures));
        let next: string | undefined = buildSensorThingsLayerDatastreamsUrl(
            baseUrl,
            serviceName,
            layerName,
            pageSize
        ).toString();
        for (let page = 0; next !== undefined && page < SENSORTHINGS_MAX_BULK_PAGES && datastreams.length < maxFeatures; page++) {
            const response: SensorThingsCollectionResponse<SensorThingsDatastreamResponse> =
                await fetchExternalJson(next, `${source.title} datastreams`);
            const remaining = maxFeatures - datastreams.length;
            datastreams.push(...response.value.slice(0, remaining).map(parseSensorThingsDatastream));
            next = response["@iot.nextLink"] === undefined
                ? undefined
                : assertSameOrigin(response["@iot.nextLink"], baseUrl);
        }
        return datastreams;
    }

    return {
        sources,
        loading,
        loaded,
        error,
        categories,
        categoriesLoading,
        categoriesLoaded,
        categoriesError,
        categoryDetails,
        categoryLoading,
        categoryErrors,
        loadExternalServices,
        loadExternalCategories,
        getExternalCategory,
        getOgcApiCollectionFeatures,
        countOgcApiFeatures,
        getOgcApiQueryables,
        getAllSensorThingsDatastreams,
        getAllSensorThingsLayerDatastreams,
        getOgcApiDatasets,
        getOgcApiCollections,
        getSensorThingsBaseUrl,
        getSensorThingsObservedProperties,
        getSensorThingsDatastreams,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useExternalDataSourcesStore, import.meta.hot));
}

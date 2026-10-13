import {
    ADMIN_FIELDS,
    CATEGORY_IDS,
    FIELDS,
    countField,
    shareField,
    walkMinField,
    type CategoryId,
} from "../../config/urbanStories/styles/fifteenMinute";

/**
 * Read-only data access of the 15-Minute City story: small WFS reads against the TOSCA GeoServer (the existing
 * GeoStories layers). The Stadtteil summaries are the exported `m15_*`, `cmf_*`, `saf_*`, `grn_*` and `dgp_*`
 * attributes, read as they are; one building (with its geometry) is fetched by its ALKIS id. Nothing here computes a
 * route or a new indicator. Results are cached for the session by request.
 */

const BUILDINGS = "HAMBURG-BUILDINGS:hamburg_buildings";
const STADTTEILE = "HAMBURG-ADMINISTRATIVE:hamburg_stadtteile";

function owsUrl(): string {
    return `${String(import.meta.env.VITE_GEOSERVER_BASE_URL ?? "").replace(/\/+$/, "")}/ows`;
}

const cache = new Map<string, Promise<unknown>>();

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = cache.get(key) as Promise<T> | undefined;
    if (hit !== undefined) return hit;
    const pending = load().catch((error) => {
        cache.delete(key);
        throw error;
    });
    cache.set(key, pending);
    return pending;
}

/** Test hook: forget every cached response. */
export function resetFifteenMinuteDataCache(): void {
    cache.clear();
}

async function wfs(params: Record<string, string>): Promise<Response> {
    const query = new URLSearchParams({ service: "WFS", version: "2.0.0", request: "GetFeature", outputFormat: "application/json", ...params });
    const response = await fetch(`${owsUrl()}?${query.toString()}`);
    if (!response.ok) throw new Error(`GeoServer WFS answered ${response.status}`);
    return response;
}

interface WfsFeature {
    properties: Record<string, unknown>;
    bbox?: number[];
    geometry?: GeoJSON.Geometry | null;
}

function numberOrNull(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const quote = (value: string): string => value.replace(/'/g, "");

// --- Stadtteile ------------------------------------------------------------------------------------

export interface StadtteilRow {
    id: string;
    name: string;
    bezirk: string;
    /** `[west, south, east, north]` */
    bounds: [number, number, number, number];
    /** Residential buildings with a score; every `m15_*` statistic is over these. */
    scored: number;
    /** Mean count of categories reached (0–9); `null` below 5 buildings. */
    categoriesMean: number | null;
    /** Mean overall score (0–100); `null` below 5 buildings. */
    decayMean: number | null;
    /** Share (0–1) of the scored buildings that reach each category within 15 minutes. */
    shares: Record<CategoryId, number | null>;
    lowConfidenceShare: number | null;
    comfortN: number | null;
    comfortMean: number | null;
    safetyN: number | null;
    safetyMean: number | null;
    greenN: number | null;
    greenMean: number | null;
    greenShare: number | null;
    dgpN: number | null;
    dgpMedian: number | null;
}

const STADTTEIL_FIELDS = [
    ADMIN_FIELDS.id, ADMIN_FIELDS.name, ADMIN_FIELDS.bezirk, ADMIN_FIELDS.n, ADMIN_FIELDS.categoriesMean, ADMIN_FIELDS.decayMean,
    ADMIN_FIELDS.lowConfidenceShare, ADMIN_FIELDS.comfortN, ADMIN_FIELDS.comfortMean, ADMIN_FIELDS.safetyN, ADMIN_FIELDS.safetyMean,
    ADMIN_FIELDS.greenN, ADMIN_FIELDS.greenMean, ADMIN_FIELDS.greenShare, ADMIN_FIELDS.dgpN, ADMIN_FIELDS.dgpMedian,
    ...CATEGORY_IDS.map(shareField),
];

export function toStadtteilRow(feature: WfsFeature): StadtteilRow {
    const p = feature.properties;
    const bbox = feature.bbox ?? [0, 0, 0, 0];
    return {
        id: String(p[ADMIN_FIELDS.id]),
        name: String(p[ADMIN_FIELDS.name]),
        bezirk: typeof p[ADMIN_FIELDS.bezirk] === "string" ? p[ADMIN_FIELDS.bezirk] as string : "",
        bounds: [bbox[0], bbox[1], bbox[2], bbox[3]],
        scored: numberOrNull(p[ADMIN_FIELDS.n]) ?? 0,
        categoriesMean: numberOrNull(p[ADMIN_FIELDS.categoriesMean]),
        decayMean: numberOrNull(p[ADMIN_FIELDS.decayMean]),
        shares: Object.fromEntries(CATEGORY_IDS.map((id) => [id, numberOrNull(p[shareField(id)])])) as Record<CategoryId, number | null>,
        lowConfidenceShare: numberOrNull(p[ADMIN_FIELDS.lowConfidenceShare]),
        comfortN: numberOrNull(p[ADMIN_FIELDS.comfortN]),
        comfortMean: numberOrNull(p[ADMIN_FIELDS.comfortMean]),
        safetyN: numberOrNull(p[ADMIN_FIELDS.safetyN]),
        safetyMean: numberOrNull(p[ADMIN_FIELDS.safetyMean]),
        greenN: numberOrNull(p[ADMIN_FIELDS.greenN]),
        greenMean: numberOrNull(p[ADMIN_FIELDS.greenMean]),
        greenShare: numberOrNull(p[ADMIN_FIELDS.greenShare]),
        dgpN: numberOrNull(p[ADMIN_FIELDS.dgpN]),
        dgpMedian: numberOrNull(p[ADMIN_FIELDS.dgpMedian]),
    };
}

export async function fetchStadtteilRows(): Promise<StadtteilRow[]> {
    return await cached("stadtteile", async () => {
        const response = await wfs({ typeNames: STADTTEILE, srsName: "EPSG:4326", propertyName: STADTTEIL_FIELDS.join(",") });
        const collection = await response.json() as { features: WfsFeature[] };
        return collection.features.map(toStadtteilRow).sort((a, b) => a.name.localeCompare(b.name, "de"));
    });
}

export async function fetchStadtteilGeometry(id: string): Promise<GeoJSON.Geometry | undefined> {
    return await cached(`stadtteil-geometry|${id}`, async () => {
        const response = await wfs({
            typeNames: STADTTEILE, srsName: "EPSG:4326",
            cql_filter: `${ADMIN_FIELDS.id}='${quote(id)}'`, propertyName: `${ADMIN_FIELDS.id},geom`,
        });
        const collection = await response.json() as { features: WfsFeature[] };
        return collection.features[0]?.geometry ?? undefined;
    });
}

// --- the nine categories across Stadtteile ------------------------------------------------------------------------

export interface CategorySpread {
    id: CategoryId;
    /** Median of the published Stadtteil shares. */
    median: number;
    min: number;
    max: number;
}

export interface CitySummary {
    /** Stadtteile with a published overall score (at least 5 scored residential buildings). */
    stadtteile: number;
    /** Median of the published Stadtteil means; a typical Stadtteil, not a building- or resident-weighted citywide figure. */
    medianDecay: number;
    medianCategories: number;
    /** Stadtteile per 20-point class of the mean overall score (0–20, 20–40, 40–60, 60–80, 80–100). */
    decayHistogram: number[];
    categories: CategorySpread[];
}

function median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Summary of the published Stadtteil values, for the opening scene. It only counts and takes medians of the values the
 * export already holds; it is not a new indicator.
 */
export function summariseStadtteile(rows: readonly StadtteilRow[]): CitySummary | undefined {
    const scored = rows.filter((row) => row.decayMean !== null && row.categoriesMean !== null);
    if (scored.length === 0) return undefined;
    const histogram = [0, 0, 0, 0, 0];
    for (const row of scored) histogram[Math.min(4, Math.floor((row.decayMean as number) / 20))] += 1;
    return {
        stadtteile: scored.length,
        medianDecay: median(scored.map((row) => row.decayMean as number)),
        medianCategories: median(scored.map((row) => row.categoriesMean as number)),
        decayHistogram: histogram,
        categories: CATEGORY_IDS.map((id) => {
            const shares = scored.map((row) => row.shares[id]).filter((share): share is number => share !== null);
            return { id, median: median(shares), min: Math.min(...shares), max: Math.max(...shares) };
        }),
    };
}

// --- buildings ----------------------------------------------------------------------------------------

export interface BuildingDetail {
    properties: Record<string, unknown>;
    geometry: GeoJSON.Geometry;
}

const BUILDING_DETAIL_FIELDS = [
    FIELDS.id, FIELDS.residential, FIELDS.originQuality, FIELDS.confidence, FIELDS.count, FIELDS.decay,
    FIELDS.comfort, FIELDS.comfortConfidence, FIELDS.comfortShare, FIELDS.comfortReason,
    FIELDS.safety, FIELDS.safetyLength, FIELDS.safetyReason, FIELDS.green, FIELDS.dgpPark, FIELDS.dgpParkStatus,
    FIELDS.height, FIELDS.stadtteil,
    ...CATEGORY_IDS.flatMap((id) => [walkMinField(id), countField(id)]),
    "geom",
];

export async function fetchBuilding(gmlId: string): Promise<BuildingDetail | undefined> {
    return await cached(`building|${gmlId}`, async () => {
        const response = await wfs({
            typeNames: BUILDINGS, srsName: "EPSG:4326",
            cql_filter: `${FIELDS.id}='${quote(gmlId)}'`, propertyName: BUILDING_DETAIL_FIELDS.join(","),
        });
        const collection = await response.json() as { features: WfsFeature[] };
        const feature = collection.features[0];
        return feature?.geometry == null ? undefined : { properties: feature.properties, geometry: feature.geometry };
    });
}

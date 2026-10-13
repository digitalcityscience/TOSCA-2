import {
    areaCql,
    criteriaCql,
    FIELDS,
    RESIDENTIAL_CQL,
    WALK_THRESHOLD_MIN,
    type Criteria,
} from "../../config/urbanStories/styles/transitEquity";

/**
 * Read-only data access of the Public Transport Equity story: attribute-only and small WFS reads against the
 * TOSCA GeoServer (existing GeoStories layers). No geometry is fetched except for one selected feature, and nothing
 * here computes a route. Results are cached for the session by request.
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
export function resetEquityDataCache(): void {
    cache.clear();
}

async function wfs(params: Record<string, string>): Promise<Response> {
    const query = new URLSearchParams({ service: "WFS", version: "2.0.0", request: "GetFeature", ...params });
    const response = await fetch(`${owsUrl()}?${query.toString()}`);
    if (!response.ok) throw new Error(`GeoServer WFS answered ${response.status}`);
    return response;
}

export async function wfsHits(typeName: string, cql: string): Promise<number> {
    return await cached(`hits|${typeName}|${cql}`, async () => {
        const text = await (await wfs({ typeNames: typeName, resultType: "hits", cql_filter: cql })).text();
        const match = /numberMatched="(\d+)"/.exec(text);
        if (match === null) throw new Error("GeoServer WFS hits response has no numberMatched");
        return Number(match[1]);
    });
}

// --- Stadtteile ---------------------------------------------------------------------------------

export interface StadtteilRow {
    id: string;
    name: string;
    bezirk: string;
    /** `[west, south, east, north]` */
    bounds: [number, number, number, number];
    residentialCount: number;
    outsideCount: number;
    /** Share of housing buildings outside every official catchment; `null` without housing buildings. */
    outsideShare: number | null;
    departuresMedian: number | null;
}

const STADTTEIL_FIELDS = [
    "stadtteil_id", "stadtteil_name", "bezirk_name", "ptr_resid_n", "ptr_resid_uncovered_n",
    "ptr_resid_uncovered_share", "pt_departures_median",
];

interface WfsFeature {
    properties: Record<string, unknown>;
    bbox?: number[];
    geometry?: GeoJSON.Geometry | null;
}

function numberOrNull(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function fetchStadtteile(): Promise<StadtteilRow[]> {
    return await cached("stadtteile", async () => {
        const response = await wfs({
            typeNames: STADTTEILE, outputFormat: "application/json", srsName: "EPSG:4326", propertyName: STADTTEIL_FIELDS.join(","),
        });
        const collection = await response.json() as { features: WfsFeature[] };
        return collection.features.map((feature): StadtteilRow => {
            const p = feature.properties;
            const bbox = feature.bbox ?? [0, 0, 0, 0];
            return {
                id: String(p.stadtteil_id),
                name: String(p.stadtteil_name),
                bezirk: typeof p.bezirk_name === "string" ? p.bezirk_name : "",
                bounds: [bbox[0], bbox[1], bbox[2], bbox[3]],
                residentialCount: numberOrNull(p.ptr_resid_n) ?? 0,
                outsideCount: numberOrNull(p.ptr_resid_uncovered_n) ?? 0,
                outsideShare: numberOrNull(p.ptr_resid_uncovered_share),
                departuresMedian: numberOrNull(p.pt_departures_median),
            };
        }).sort((a, b) => a.name.localeCompare(b.name, "de"));
    });
}

/** Hamburg-wide share of housing buildings outside every catchment, from the same population as the Stadtteil shares. */
export function citywideOutside(rows: readonly StadtteilRow[]): { residential: number; outside: number; share: number } {
    const residential = rows.reduce((sum, row) => sum + row.residentialCount, 0);
    const outside = rows.reduce((sum, row) => sum + row.outsideCount, 0);
    return { residential, outside, share: residential === 0 ? 0 : outside / residential };
}

export async function fetchStadtteilGeometry(id: string): Promise<GeoJSON.Geometry | undefined> {
    return await cached(`stadtteil-geometry|${id}`, async () => {
        const response = await wfs({
            typeNames: STADTTEILE, outputFormat: "application/json", srsName: "EPSG:4326",
            cql_filter: `stadtteil_id='${id.replace(/'/g, "")}'`, propertyName: "stadtteil_id,geom",
        });
        const collection = await response.json() as { features: WfsFeature[] };
        return collection.features[0]?.geometry ?? undefined;
    });
}

// --- buildings ----------------------------------------------------------------------------------

export interface BuildingDetail {
    properties: Record<string, unknown>;
    geometry: GeoJSON.Geometry;
}

const BUILDING_DETAIL_FIELDS = [
    FIELDS.id, FIELDS.function, FIELDS.districtMatch, FIELDS.inCatchment, FIELDS.walkMin, FIELDS.originQuality,
    FIELDS.departures, FIELDS.departuresComplete, FIELDS.lines, FIELDS.stops, FIELDS.accessClass, FIELDS.height, FIELDS.stadtteil, "geom",
];

export async function fetchBuilding(gmlId: string): Promise<BuildingDetail | undefined> {
    return await cached(`building|${gmlId}`, async () => {
        const response = await wfs({
            typeNames: BUILDINGS, outputFormat: "application/json", srsName: "EPSG:4326",
            cql_filter: `${FIELDS.id}='${gmlId.replace(/'/g, "")}'`, propertyName: BUILDING_DETAIL_FIELDS.join(","),
        });
        const collection = await response.json() as { features: WfsFeature[] };
        const feature = collection.features[0];
        return feature?.geometry == null ? undefined : { properties: feature.properties, geometry: feature.geometry };
    });
}

export interface ResidentialValue {
    inCatchment: boolean;
    walkMin: number | null;
    originNone: boolean;
    departures: number | null;
    departuresComplete: boolean;
    lines: number | null;
}

/** Housing buildings of one Stadtteil with the five values the comparison needs (CSV, no geometry, about 70 bytes each). */
export async function fetchResidentialValues(stadtteilId: string): Promise<ResidentialValue[]> {
    return await cached(`values|${stadtteilId}`, async () => {
        const fields = [FIELDS.inCatchment, FIELDS.walkMin, FIELDS.originQuality, FIELDS.departures, FIELDS.departuresComplete, FIELDS.lines];
        const response = await wfs({
            typeNames: BUILDINGS, outputFormat: "csv", propertyName: fields.join(","),
            cql_filter: `${FIELDS.stadtteil}='${stadtteilId.replace(/'/g, "")}' AND ${RESIDENTIAL_CQL}`,
        });
        return parseResidentialCsv(await response.text());
    });
}

export function parseResidentialCsv(text: string): ResidentialValue[] {
    const [header, ...lines] = text.split(/\r?\n/).filter((line) => line !== "");
    if (header === undefined) return [];
    const columns = header.split(",");
    const at = (name: string): number => columns.indexOf(name);
    const idx = {
        inCatchment: at(FIELDS.inCatchment), walk: at(FIELDS.walkMin), origin: at(FIELDS.originQuality),
        departures: at(FIELDS.departures), complete: at(FIELDS.departuresComplete), lines: at(FIELDS.lines),
    };
    const toNumber = (cell: string | undefined): number | null => (cell === undefined || cell === "" || !Number.isFinite(Number(cell)) ? null : Number(cell));
    return lines.map((line) => {
        const cells = line.split(",");
        return {
            inCatchment: cells[idx.inCatchment] === "true",
            walkMin: toNumber(cells[idx.walk]),
            originNone: cells[idx.origin] === "none",
            departures: toNumber(cells[idx.departures]),
            departuresComplete: cells[idx.complete] !== "false",
            lines: toNumber(cells[idx.lines]),
        };
    });
}

// --- distribution summaries ----------------------------------------------------------------------

export interface DepartureBand {
    key: string;
    min: number;
    max: number | null;
}

/** Bands of the departure comparison; `0` is its own band. They are the classes of the map legend. */
export const DEPARTURE_BANDS: readonly DepartureBand[] = [
    { key: "0", min: 0, max: 0 },
    { key: "1-99", min: 1, max: 99 },
    { key: "100-299", min: 100, max: 299 },
    { key: "300-699", min: 300, max: 699 },
    { key: "700-1499", min: 700, max: 1499 },
    { key: "1500+", min: 1500, max: null },
];

export interface DistributionSummary {
    /** Housing buildings with complete departure data. */
    count: number;
    incompleteCount: number;
    median: number;
    p10: number;
    p90: number;
    /** Share of the counted buildings in each `DEPARTURE_BANDS` band. */
    bandShares: number[];
    outsideShare: number;
}

function quantile(sorted: readonly number[], q: number): number {
    if (sorted.length === 0) return 0;
    return sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];
}

/** Summary of daily departures within reach. Incomplete values are lower bounds and stay out of the quantiles. */
export function summariseDepartures(values: readonly ResidentialValue[]): DistributionSummary {
    const complete = values.filter((value) => value.departures !== null && value.departuresComplete);
    const sorted = complete.map((value) => value.departures as number).sort((a, b) => a - b);
    const bandShares = DEPARTURE_BANDS.map((band) => (
        sorted.length === 0 ? 0 : sorted.filter((v) => v >= band.min && (band.max === null || v <= band.max)).length / sorted.length
    ));
    return {
        count: sorted.length,
        incompleteCount: values.length - complete.length,
        median: quantile(sorted, 0.5),
        p10: quantile(sorted, 0.1),
        p90: quantile(sorted, 0.9),
        bandShares,
        outsideShare: values.length === 0 ? 0 : values.filter((value) => !value.inCatchment).length / values.length,
    };
}

export interface OutsideWalkSummary {
    /** Housing buildings outside every catchment that have a walking connection. */
    count: number;
    /** Median modelled walk (minutes) to the nearest stop; `null` when the median building has no stop within 15 minutes. */
    medianWalkMin: number | null;
    /** Share of them with a stop within 9 minutes (the walking time of the 720 m rail radius). */
    withinNineShare: number;
}

/** How far the buildings outside coverage are from a stop: the pattern behind a gap. Missing walk = more than 15 minutes. */
export function summariseOutsideWalk(values: readonly ResidentialValue[]): OutsideWalkSummary {
    const outside = values.filter((value) => !value.inCatchment && !value.originNone);
    const walks = outside.map((value) => value.walkMin ?? Number.POSITIVE_INFINITY).sort((a, b) => a - b);
    const middle = walks.length >> 1;
    const median = walks.length === 0 ? Number.NaN : walks.length % 2 === 1 ? walks[middle] : (walks[middle - 1] + walks[middle]) / 2;
    return {
        count: outside.length,
        medianWalkMin: Number.isFinite(median) ? median : null,
        withinNineShare: walks.length === 0 ? 0 : walks.filter((walk) => walk <= 9).length / walks.length,
    };
}

// --- counts ------------------------------------------------------------------------------------

const WITH_ORIGIN = `${FIELDS.originQuality}<>'none'`;
const WALKING = `${FIELDS.walkMin}<=${WALK_THRESHOLD_MIN}`;
const NOT_WALKING = `(${FIELDS.walkMin}>${WALK_THRESHOLD_MIN} OR ${FIELDS.walkMin} IS NULL)`;

export interface AgreementCounts {
    both: number;
    officialOnly: number;
    walkingOnly: number;
    neither: number;
    total: number;
}

/** Housing buildings with a walking origin in the four official-versus-walking classes; optionally one Stadtteil. */
export async function fetchAgreementCounts(stadtteilId?: string): Promise<AgreementCounts> {
    const base = `${RESIDENTIAL_CQL} AND ${WITH_ORIGIN}${stadtteilId === undefined ? "" : ` AND ${FIELDS.stadtteil}='${stadtteilId}'`}`;
    const inside = `${FIELDS.inCatchment}=true`;
    const outside = `${FIELDS.inCatchment}=false`;
    const [both, officialOnly, walkingOnly, neither] = await Promise.all([
        wfsHits(BUILDINGS, `${base} AND ${inside} AND ${WALKING}`),
        wfsHits(BUILDINGS, `${base} AND ${inside} AND ${NOT_WALKING}`),
        wfsHits(BUILDINGS, `${base} AND ${outside} AND ${WALKING}`),
        wfsHits(BUILDINGS, `${base} AND ${outside} AND ${NOT_WALKING}`),
    ]);
    return { both, officialOnly, walkingOnly, neither, total: both + officialOnly + walkingOnly + neither };
}

/** Housing buildings matching the user's criteria, and the housing buildings in the criteria's scope (Hamburg or one Stadtteil). */
export async function fetchCriteriaCounts(criteria: Criteria): Promise<{ matching: number; total: number }> {
    const scope = `${RESIDENTIAL_CQL}${criteria.area === null ? "" : ` AND ${areaCql(criteria.area)}`}`;
    const extra = criteriaCql(criteria);
    const [matching, total] = await Promise.all([
        wfsHits(BUILDINGS, extra === "" ? scope : `${scope} AND ${extra}`),
        wfsHits(BUILDINGS, scope),
    ]);
    return { matching, total };
}

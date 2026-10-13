import {
    ADMIN_FIELDS,
    AREA_CLASSES,
    AREA_FIELDS,
    BUILDING_FIELDS,
    FEATURE_FIELDS,
    isAreaClass,
    type AreaClass,
} from "../../config/urbanStories/styles/greenSpaces/constants";

/**
 * Read-only data access of the Green Spaces story: small WFS reads against the TOSCA GeoServer (the existing GeoStories
 * layers). The Stadtteil values are the exported `dgp_*`, `cov_dgp_*` and `grn_*` attributes, read as they are; one
 * building or one official green area (with its geometry) is fetched by its published id. Nothing here computes a
 * route or a new indicator. Results are cached for the session by request.
 */

const AREAS = "HAMBURG-GREEN-SPACES:green_areas";
const FEATURE_LAYERS = {
    polygon: "HAMBURG-GREEN-SPACES:green_features_polygon",
    line: "HAMBURG-GREEN-SPACES:green_features_line",
    point: "HAMBURG-GREEN-SPACES:green_features_point",
} as const;
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
export function resetGreenSpacesDataCache(): void {
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

const numberOrNull = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const quote = (value: string): string => value.replace(/'/g, "");

function median(values: number[]): number | undefined {
    if (values.length === 0) return undefined;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// --- the official inventory ------------------------------------------------------------------------------------------

export interface GreenInventory {
    total: number;
    /** Number of official polygons per `area_class`. */
    counts: Record<AreaClass, number>;
}

/** Counts the official polygons per class; the class is the published `area_class`, nothing is re-derived. */
export function summariseInventory(classes: readonly unknown[]): GreenInventory {
    const counts = Object.fromEntries(AREA_CLASSES.map((id) => [id, 0])) as Record<AreaClass, number>;
    let total = 0;
    for (const value of classes) {
        total += 1;
        if (isAreaClass(value)) counts[value] += 1;
    }
    return { total, counts };
}

export async function fetchGreenInventory(): Promise<GreenInventory> {
    return await cached("inventory", async () => {
        const response = await wfs({ typeNames: AREAS, propertyName: AREA_FIELDS.class });
        const collection = await response.json() as { features: WfsFeature[] };
        return summariseInventory(collection.features.map((feature) => feature.properties[AREA_FIELDS.class]));
    });
}

export interface GreenAreaDetail {
    properties: Record<string, unknown>;
    geometry: GeoJSON.Geometry;
}

const AREA_DETAIL_FIELDS = [
    AREA_FIELDS.id, AREA_FIELDS.idnr, AREA_FIELDS.name, AREA_FIELDS.class, AREA_FIELDS.categoryEn, AREA_FIELDS.categoryDe,
    AREA_FIELDS.area, AREA_FIELDS.district, AREA_FIELDS.borough, AREA_FIELDS.ownership, AREA_FIELDS.administration,
    AREA_FIELDS.sourceVersion, AREA_FIELDS.valid, "geom",
];

/** One official green area with its whole polygon (a tile feature is clipped at the tile edge). */
export async function fetchGreenArea(areaId: string): Promise<GreenAreaDetail | undefined> {
    return await cached(`area|${areaId}`, async () => {
        const response = await wfs({
            typeNames: AREAS, srsName: "EPSG:4326",
            cql_filter: `${AREA_FIELDS.id}='${quote(areaId)}'`, propertyName: AREA_DETAIL_FIELDS.join(","),
        });
        const collection = await response.json() as { features: WfsFeature[] };
        const feature = collection.features[0];
        return feature?.geometry == null ? undefined : { properties: feature.properties, geometry: feature.geometry };
    });
}

// --- detailed objects of one park ---------------------------------------------------------------------------------------

export interface FeatureGroupCount {
    /** Level-0 code (`category_code_0`) and its English label (`feature_group`). */
    code: number;
    group: string;
    count: number;
    /** Level-1 English labels (`feature_type`) with their counts, largest first. */
    types: { type: string; count: number }[];
}

export interface ParkDetail {
    idnr: number;
    points: number;
    lines: number;
    polygons: number;
    groups: FeatureGroupCount[];
}

/** Groups the detailed objects that share one `dgp_idnr` by their level-0 and level-1 category. */
export function summariseFeatures(rows: readonly Record<string, unknown>[]): FeatureGroupCount[] {
    const groups = new Map<number, FeatureGroupCount>();
    for (const row of rows) {
        const code = numberOrNull(row[FEATURE_FIELDS.code0]);
        const group = row[FEATURE_FIELDS.group];
        const type = row[FEATURE_FIELDS.type];
        if (code === null || typeof group !== "string") continue;
        const entry = groups.get(code) ?? { code, group, count: 0, types: [] };
        entry.count += 1;
        if (typeof type === "string") {
            const known = entry.types.find((candidate) => candidate.type === type);
            if (known === undefined) entry.types.push({ type, count: 1 });
            else known.count += 1;
        }
        groups.set(code, entry);
    }
    return [...groups.values()]
        .map((entry) => ({ ...entry, types: entry.types.sort((a, b) => b.count - a.count) }))
        .sort((a, b) => b.count - a.count);
}

/**
 * The Feinkartierung objects of one park, joined by the published `dgp_idnr` (never by position). The three geometry
 * layers are read for their category columns only.
 */
export async function fetchParkDetail(idnr: number): Promise<ParkDetail> {
    return await cached(`park-detail|${idnr}`, async () => {
        const read = async (typeName: string): Promise<Record<string, unknown>[]> => {
            const response = await wfs({
                typeNames: typeName, cql_filter: `${FEATURE_FIELDS.idnr}=${Math.trunc(idnr)}`,
                propertyName: [FEATURE_FIELDS.idnr, FEATURE_FIELDS.group, FEATURE_FIELDS.type, FEATURE_FIELDS.code0].join(","),
            });
            const collection = await response.json() as { features: WfsFeature[] };
            return collection.features.map((feature) => feature.properties);
        };
        const [polygons, lines, points] = await Promise.all([read(FEATURE_LAYERS.polygon), read(FEATURE_LAYERS.line), read(FEATURE_LAYERS.point)]);
        return {
            idnr,
            points: points.length,
            lines: lines.length,
            polygons: polygons.length,
            groups: summariseFeatures([...polygons, ...lines, ...points]),
        };
    });
}

// --- Stadtteile ----------------------------------------------------------------------------------------------------------

export interface StadtteilRow {
    id: string;
    name: string;
    bezirk: string;
    /** `[west, south, east, north]` */
    bounds: [number, number, number, number];
    /** Residential buildings with a computable time (denominator of the park statistics). */
    parkN: number;
    parkMedian: number | null;
    parkP90: number | null;
    playgroundN: number;
    playgroundMedian: number | null;
    playgroundP90: number | null;
    /** Union-based land coverage (0–1) of all official green areas / of recreational parks only. */
    coverageGreen: number | null;
    coverageRecreational: number | null;
    /** Share (0–1) of residential buildings with a large green space within 15 minutes (a different definition). */
    largeGreenShare: number | null;
}

const STADTTEIL_FIELDS = [
    ADMIN_FIELDS.id, ADMIN_FIELDS.name, ADMIN_FIELDS.bezirk, ADMIN_FIELDS.parkN, ADMIN_FIELDS.parkMedian, ADMIN_FIELDS.parkP90,
    ADMIN_FIELDS.playgroundN, ADMIN_FIELDS.playgroundMedian, ADMIN_FIELDS.playgroundP90, ADMIN_FIELDS.covGreen,
    ADMIN_FIELDS.covRecreational, ADMIN_FIELDS.largeGreenShare,
];

export function toStadtteilRow(feature: WfsFeature): StadtteilRow {
    const p = feature.properties;
    const bbox = feature.bbox ?? [0, 0, 0, 0];
    return {
        id: String(p[ADMIN_FIELDS.id]),
        name: String(p[ADMIN_FIELDS.name]),
        bezirk: typeof p[ADMIN_FIELDS.bezirk] === "string" ? p[ADMIN_FIELDS.bezirk] as string : "",
        bounds: [bbox[0], bbox[1], bbox[2], bbox[3]],
        parkN: numberOrNull(p[ADMIN_FIELDS.parkN]) ?? 0,
        parkMedian: numberOrNull(p[ADMIN_FIELDS.parkMedian]),
        parkP90: numberOrNull(p[ADMIN_FIELDS.parkP90]),
        playgroundN: numberOrNull(p[ADMIN_FIELDS.playgroundN]) ?? 0,
        playgroundMedian: numberOrNull(p[ADMIN_FIELDS.playgroundMedian]),
        playgroundP90: numberOrNull(p[ADMIN_FIELDS.playgroundP90]),
        coverageGreen: numberOrNull(p[ADMIN_FIELDS.covGreen]),
        coverageRecreational: numberOrNull(p[ADMIN_FIELDS.covRecreational]),
        largeGreenShare: numberOrNull(p[ADMIN_FIELDS.largeGreenShare]),
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

export interface CitySummary {
    /** Stadtteile with a published park and playground median (at least 5 residential buildings). */
    stadtteile: number;
    /** Medians of the published Stadtteil values: a typical Stadtteil, not a building- or resident-weighted citywide figure. */
    medianParkMinutes: number | undefined;
    medianPlaygroundMinutes: number | undefined;
    /** Median land coverage of all official green areas, and of recreational parks only (union-based, 0–1). */
    medianCoverageGreen: number | undefined;
    medianCoverageRecreational: number | undefined;
}

/**
 * Summary of the published Stadtteil values. It only takes medians of the values the export already holds; it is not a
 * new indicator, and nothing is summed from polygon areas.
 */
export function summariseStadtteile(rows: readonly StadtteilRow[]): CitySummary | undefined {
    if (rows.length === 0) return undefined;
    const values = (pick: (row: StadtteilRow) => number | null): number[] => rows.map(pick).filter((value): value is number => value !== null);
    return {
        stadtteile: rows.filter((row) => row.parkMedian !== null && row.playgroundMedian !== null).length,
        medianParkMinutes: median(values((row) => row.parkMedian)),
        medianPlaygroundMinutes: median(values((row) => row.playgroundMedian)),
        medianCoverageGreen: median(values((row) => row.coverageGreen)),
        medianCoverageRecreational: median(values((row) => row.coverageRecreational)),
    };
}

// --- buildings ----------------------------------------------------------------------------------------------------------

export interface BuildingDetail {
    properties: Record<string, unknown>;
    geometry: GeoJSON.Geometry;
}

const BUILDING_DETAIL_FIELDS = [
    BUILDING_FIELDS.id, BUILDING_FIELDS.residential, BUILDING_FIELDS.park, BUILDING_FIELDS.playground,
    BUILDING_FIELDS.parkStatus, BUILDING_FIELDS.playgroundStatus, BUILDING_FIELDS.height, BUILDING_FIELDS.stadtteil, "geom",
];

export async function fetchBuilding(gmlId: string): Promise<BuildingDetail | undefined> {
    return await cached(`building|${gmlId}`, async () => {
        const response = await wfs({
            typeNames: BUILDINGS, srsName: "EPSG:4326",
            cql_filter: `${BUILDING_FIELDS.id}='${quote(gmlId)}'`, propertyName: BUILDING_DETAIL_FIELDS.join(","),
        });
        const collection = await response.json() as { features: WfsFeature[] };
        const feature = collection.features[0];
        return feature?.geometry == null ? undefined : { properties: feature.properties, geometry: feature.geometry };
    });
}

import type { TransportFamily } from "../../config/urbanStories/styles/transitEquity";

/**
 * Official HVV stop areas and catchments from the city's public WFS (`HH_WFS_HVV_Einzugsbereiche`, dl-de/by-2.0,
 * publisher Behörde für Verkehr und Mobilitätswende). The service ignores `propertyName` and returns whole
 * polygons, so catchments are only requested for small viewport cells and cached; stop areas (2,313 points,
 * about 1.2 MB) load once.
 */

const HVV_WFS = "https://geodienste.hamburg.de/HH_WFS_HVV_Einzugsbereiche";
const STOP_TYPES = ["haltestellenbereiche_bahn", "haltestellenbereiche_bus", "haltestellenbereiche_faehre"];
const CATCHMENT_TYPES = [
    "hvv_bus_stadt", "hvv_bus_metro", "hvv_bus_nacht", "hvv_bus_express",
    "hvv_bahn_u", "hvv_bahn_s", "hvv_bahn_regio", "hvv_bahn_fern", "hvv_faehre",
];

export interface StopAreaProperties {
    name: string;
    dhid: string;
    linien: string;
    linienzahl: number;
    art: string;
    /** Official daily departures of the stop area; the source states no reference period. */
    abfahrten: number;
    family: TransportFamily;
}

export type StopAreaFeature = GeoJSON.Feature<GeoJSON.Point, StopAreaProperties>;

export interface CatchmentProperties {
    name: string;
    dhid: string;
    einwohner: number | null;
    linien: string;
    family: TransportFamily;
    kind: string;
    /** WFS feature id; the same polygon can arrive from two viewport cells. */
    fid: string;
}

/** A string property, or the fallback when the service sent anything else. */
function str(value: unknown, fallback = ""): string {
    return typeof value === "string" ? value : fallback;
}

export type CatchmentFeature = GeoJSON.Feature<GeoJSON.MultiPolygon | GeoJSON.Polygon, CatchmentProperties>;

/** Transport family from a WFS feature id such as `DE.HH.UP_HVV_BAHN_U_12` or `DE.HH.UP_HALTESTELLENBEREICHE_BUS_316`. */
export function familyOfFeatureId(id: string): TransportFamily {
    const upper = id.toUpperCase();
    if (upper.includes("BAHN")) return "rail";
    if (upper.includes("FAEHRE") || upper.includes("FÄHRE")) return "ferry";
    return "bus";
}

/** Catchment kind (`bus_stadt`, `bahn_u`, …) from its WFS feature id. */
export function kindOfFeatureId(id: string): string {
    const match = /UP_HVV_([A-Z_]+?)_\d+$/.exec(id.toUpperCase());
    return match === null ? "unknown" : match[1].toLowerCase();
}

async function wfsFeatures(typeNames: string[], extra: Record<string, string> = {}): Promise<{ id: string; geometry: GeoJSON.Geometry; properties: Record<string, unknown> }[]> {
    const query = new URLSearchParams({
        service: "WFS",
        version: "2.0.0",
        request: "GetFeature",
        typeNames: typeNames.map((name) => `app:${name}`).join(","),
        outputFormat: "application/geo+json",
        srsName: "EPSG:4326",
        ...extra,
    });
    const response = await fetch(`${HVV_WFS}?${query.toString()}`);
    if (!response.ok) throw new Error(`HVV WFS answered ${response.status}`);
    const collection = await response.json() as { features: { id: string; geometry: GeoJSON.Geometry; properties: Record<string, unknown> }[] };
    return collection.features ?? [];
}

let stopAreas: Promise<StopAreaFeature[]> | undefined;

export function fetchStopAreas(): Promise<StopAreaFeature[]> {
    stopAreas ??= wfsFeatures(STOP_TYPES).then((features) => features.flatMap((feature) => {
        const p = feature.properties;
        if (feature.geometry?.type !== "Point" || typeof p.abfahrten !== "number") return [];
        return [{
            type: "Feature" as const,
            id: undefined,
            geometry: feature.geometry,
            properties: {
                name: str(p.name),
                dhid: str(p.dhid),
                linien: str(p.linien),
                linienzahl: typeof p.linienzahl === "number" ? p.linienzahl : 0,
                art: str(p.art),
                abfahrten: p.abfahrten,
                family: familyOfFeatureId(feature.id),
            },
        }];
    })).catch((error) => {
        stopAreas = undefined;
        throw error;
    });
    return stopAreas;
}

/** Viewport cells of 0.01° latitude × 0.015° longitude (about 1.1 × 1.0 km). */
export const CELL_LAT = 0.01;
export const CELL_LON = 0.015;
const MAX_CELLS_PER_LOAD = 24;

export interface CatchmentCell {
    key: string;
    south: number;
    west: number;
}

export function cellsForBounds(west: number, south: number, east: number, north: number): CatchmentCell[] {
    const cells: CatchmentCell[] = [];
    for (let row = Math.floor(south / CELL_LAT); row <= Math.floor(north / CELL_LAT); row += 1) {
        for (let column = Math.floor(west / CELL_LON); column <= Math.floor(east / CELL_LON); column += 1) {
            cells.push({ key: `${row}:${column}`, south: row * CELL_LAT, west: column * CELL_LON });
        }
    }
    return cells;
}

export function tooManyCells(cells: readonly CatchmentCell[]): boolean {
    return cells.length > MAX_CELLS_PER_LOAD;
}

const loadedCells = new Map<string, Promise<CatchmentFeature[]>>();

function roundCoordinates(value: unknown): unknown {
    if (typeof value === "number") return Math.round(value * 1e5) / 1e5;
    return Array.isArray(value) ? value.map(roundCoordinates) : value;
}

export function fetchCatchmentCell(cell: CatchmentCell): Promise<CatchmentFeature[]> {
    const cached = loadedCells.get(cell.key);
    if (cached !== undefined) return cached;
    const bbox = `${cell.south},${cell.west},${cell.south + CELL_LAT},${cell.west + CELL_LON},urn:ogc:def:crs:EPSG::4326`;
    const pending = wfsFeatures(CATCHMENT_TYPES, { bbox }).then((features) => features.flatMap((feature) => {
        if (feature.geometry?.type !== "Polygon" && feature.geometry?.type !== "MultiPolygon") return [];
        const p = feature.properties;
        return [{
            type: "Feature" as const,
            id: undefined,
            geometry: { ...feature.geometry, coordinates: roundCoordinates((feature.geometry as GeoJSON.Polygon).coordinates) } as GeoJSON.Polygon,
            properties: {
                name: str(p.name),
                dhid: str(p.dhid),
                einwohner: typeof p.einwohner === "number" ? p.einwohner : null,
                linien: str(p.linien),
                family: familyOfFeatureId(feature.id),
                kind: kindOfFeatureId(feature.id),
                fid: feature.id,
            },
        }];
    })).catch((error) => {
        loadedCells.delete(cell.key);
        throw error;
    });
    loadedCells.set(cell.key, pending);
    return pending;
}

/** Test hook. */
export function resetHvvCache(): void {
    stopAreas = undefined;
    loadedCells.clear();
}

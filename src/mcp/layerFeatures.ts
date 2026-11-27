/**
 * Reading the features of a layer from what the browser already holds, for the AI map commands
 * (`getLayerFeatures`, `zoomToFeatures`).
 *
 * Nothing is asked from GeoServer: TOSCA talks to it only for map tiles (vector tiles over
 * WMTS), and every filter is applied in the browser. So the features come from
 *
 * - the data of GeoJSON layers (drawn, buffer, added GeoJSON, loaded OGC data), and
 * - the vector tiles MapLibre has loaded for a GeoServer layer, which only cover the map area
 *   around the current view, at the current zoom.
 *
 * MapLibre cuts a feature at tile edges and hands out one piece per tile (with some overlap).
 * The pieces are put back together here by the feature's id, so a feature counts once.
 */
import { type Feature, type FeatureCollection } from "@helpers/geojson";
import { type LayerObjectWithAttributes } from "@store/map";

/** What MapLibre's `queryRenderedFeatures` / `querySourceFeatures` hand out (a subset of `MapGeoJSONFeature`). */
type TileFeature = {
    id?: string | number;
    properties?: Record<string, unknown> | null;
    geometry: GeoJSON.Geometry;
};

/** A string, number or boolean as text; anything else (null, objects) has no text to compare. */
export function primitiveText(value: unknown): string | undefined {
    if (typeof value === "string") return value;
    return typeof value === "number" || typeof value === "boolean" ? String(value) : undefined;
}

/** Every property name that occurs in the features, in order of first appearance. */
export function propertyNames(data: FeatureCollection): string[] {
    const names = new Set<string>();
    data.features.forEach((feature: Feature) => {
        Object.keys(feature.properties ?? {}).forEach((key) => names.add(key));
    });
    return [...names];
}

/** One geometry from the tile pieces of one feature: polygons and lines become their Multi* form. */
function joinPieces(geometries: GeoJSON.Geometry[]): GeoJSON.Geometry {
    if (geometries.length === 1) return geometries[0];
    const polygons = geometries.flatMap((geometry) => {
        if (geometry.type === "Polygon") return [geometry.coordinates];
        return geometry.type === "MultiPolygon" ? geometry.coordinates : [];
    });
    const lines = geometries.flatMap((geometry) => {
        if (geometry.type === "LineString") return [geometry.coordinates];
        return geometry.type === "MultiLineString" ? geometry.coordinates : [];
    });
    if (polygons.length > 0 && lines.length === 0) return { type: "MultiPolygon", coordinates: polygons };
    if (lines.length > 0 && polygons.length === 0) return { type: "MultiLineString", coordinates: lines };
    // Points repeat in neighbouring tiles; one copy is the point.
    return geometries[0];
}

/**
 * Puts the tile pieces of each feature back together, by the layer's id attribute (e.g. `gid`),
 * else the tile feature id, else the whole set of attributes.
 */
export function joinTilePieces(pieces: TileFeature[], idAttribute?: string): Feature[] {
    const groups = new Map<string, TileFeature[]>();
    pieces.forEach((piece) => {
        const properties = piece.properties ?? {};
        const own = idAttribute === undefined ? undefined : primitiveText(properties[idAttribute]);
        const key = own !== undefined ? `a:${own}` : piece.id !== undefined ? `t:${piece.id}` : `p:${JSON.stringify(properties)}`;
        const group = groups.get(key);
        if (group === undefined) groups.set(key, [piece]);
        else group.push(piece);
    });
    return [...groups.values()].map((group) => ({
        type: "Feature",
        properties: { ...(group[0].properties ?? {}) },
        geometry: joinPieces(group.map((piece) => piece.geometry)),
    }));
}

/** The render passes of a layer that are on the map (the layer itself and its companion style layers). */
function renderPassIds(map: any, layer: LayerObjectWithAttributes): string[] {
    return [layer.id, ...(layer.companionLayerIds ?? [])].filter((id) => map.getLayer(id) !== undefined);
}

/**
 * The features of a layer drawn in the current map view, with the layer's filters applied
 * (MapLibre evaluates them). Only covers the current view.
 */
export function renderedLayerFeatures(map: any, layer: LayerObjectWithAttributes, idAttribute?: string): Feature[] {
    const layers = renderPassIds(map, layer);
    if (layers.length === 0) return [];
    return joinTilePieces(map.queryRenderedFeatures({ layers }) as TileFeature[], idAttribute);
}

/**
 * The features of a vector tile layer in the tiles MapLibre has loaded (the view and a margin
 * around it), without the layer's filters. Tiles are only loaded while the layer is shown.
 */
export function loadedTileFeatures(map: any, layer: LayerObjectWithAttributes, idAttribute?: string): Feature[] {
    const options = layer["source-layer"] === undefined ? {} : { sourceLayer: layer["source-layer"] };
    return joinTilePieces(map.querySourceFeatures(layer.source, options) as TileFeature[], idAttribute);
}

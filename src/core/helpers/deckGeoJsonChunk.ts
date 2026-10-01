import { geojsonToBinary } from "@loaders.gl/gis";

export type DeckBinaryFeatureCollection = ReturnType<typeof geojsonToBinary>;

/**
 * One page of features in deck.gl's binary layout. Geometry lives in typed
 * arrays (cheap to transfer from a worker and to upload to the GPU); the
 * properties are kept separately, indexed by the feature's position in this
 * chunk, which is the index deck.gl reports when a feature is picked.
 */
export interface DeckGeoJsonChunk {
    binary: DeckBinaryFeatureCollection;
    properties: Array<Record<string, unknown>>;
    featureCount: number;
}

type DrawableGeometry = Exclude<GeoJSON.Geometry, GeoJSON.GeometryCollection>;

function isDrawable(feature: GeoJSON.Feature): feature is GeoJSON.Feature<DrawableGeometry> {
    return feature.geometry !== null &&
        feature.geometry !== undefined &&
        feature.geometry.type !== "GeometryCollection";
}

/**
 * Converts GeoJSON features to a deck.gl chunk. Features without a drawable
 * geometry are dropped. Polygons are triangulated here so deck.gl does not
 * have to tessellate on the main thread, and coordinates stay Float64 because
 * Float32 loses ~0.5 m of precision at Hamburg's latitude.
 */
export function featuresToDeckChunk(features: GeoJSON.Feature[]): DeckGeoJsonChunk {
    const drawable = features.filter(isDrawable);
    const properties = drawable.map((feature) => ({
        ...(feature.id === undefined ? {} : { id: feature.id }),
        ...(feature.properties ?? {}),
    }));
    const binary = geojsonToBinary(
        drawable.map((feature) => ({ type: "Feature", geometry: feature.geometry, properties: {} })) as never,
        { fixRingWinding: true, triangulate: true, PositionDataType: Float64Array }
    );
    return { binary, properties, featureCount: drawable.length };
}

/** Distinct ArrayBuffers inside a chunk, for a zero-copy `postMessage`. */
export function chunkTransferables(chunk: DeckGeoJsonChunk): ArrayBuffer[] {
    const buffers = new Set<ArrayBuffer>();
    const visit = (value: unknown): void => {
        if (ArrayBuffer.isView(value)) {
            if (value.buffer instanceof ArrayBuffer) buffers.add(value.buffer);
            return;
        }
        if (typeof value !== "object" || value === null) return;
        for (const nested of Object.values(value)) visit(nested);
    };
    visit(chunk.binary);
    return [...buffers];
}

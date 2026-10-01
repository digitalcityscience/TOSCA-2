import { describe, expect, test } from "vitest";
import { chunkTransferables, featuresToDeckChunk } from "./deckGeoJsonChunk";

const square = (x: number): GeoJSON.Feature => ({
    type: "Feature",
    id: x,
    geometry: { type: "Polygon", coordinates: [[[x, 53], [x + 1, 53], [x + 1, 54], [x, 54], [x, 53]]] },
    properties: { name: `parcel ${x}` },
});

describe("deck.gl GeoJSON chunks", () => {
    test("converts features to triangulated Float64 binary data with separate properties", () => {
        const chunk = featuresToDeckChunk([
            square(9),
            { type: "Feature", geometry: null as unknown as GeoJSON.Geometry, properties: { name: "no geometry" } },
            { type: "Feature", geometry: { type: "Point", coordinates: [10, 53.5] }, properties: { name: "point" } },
        ]);

        expect(chunk.featureCount).toBe(2);
        expect(chunk.properties).toEqual([{ id: 9, name: "parcel 9" }, { name: "point" }]);
        expect(chunk.binary.polygons?.positions.value).toBeInstanceOf(Float64Array);
        expect(chunk.binary.polygons?.triangles?.value.length).toBeGreaterThan(0);
        expect(chunk.binary.points?.positions.value).toEqual(new Float64Array([10, 53.5]));
        // Properties are not duplicated into the binary payload.
        expect(chunk.binary.polygons?.properties).toEqual([{}]);
    });

    test("lists each typed-array buffer once for transfer", () => {
        const chunk = featuresToDeckChunk([square(9), square(10)]);
        const buffers = chunkTransferables(chunk);
        expect(buffers.length).toBeGreaterThan(0);
        expect(new Set(buffers).size).toBe(buffers.length);
        expect(buffers.every((buffer) => buffer instanceof ArrayBuffer)).toBe(true);
    });
});

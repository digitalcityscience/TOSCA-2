import { describe, expect, test } from "vitest";
import type { PickingInfo } from "@deck.gl/core";
import { ChunkedGeoJsonLayer } from "./deckChunkedGeoJsonLayer";
import { featuresToDeckChunk } from "./deckGeoJsonChunk";

const point = (name: string): GeoJSON.Feature => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [10, 53] },
    properties: { name },
});

describe("ChunkedGeoJsonLayer", () => {
    test("resolves picks to the picked chunk's properties", () => {
        const layer = new ChunkedGeoJsonLayer({
            id: "parcels",
            chunks: [featuresToDeckChunk([point("a"), point("b")]), featuresToDeckChunk([point("c")])],
        });
        const pick = (sourceId: string, index: number): PickingInfo => layer.getPickingInfo({
            info: { index, sourceLayer: { id: sourceId } } as unknown as PickingInfo,
            mode: "query",
            sourceLayer: { id: sourceId } as never,
        });

        expect(pick("parcels-chunk-0-points-circle", 1).object).toEqual({ properties: { name: "b" } });
        expect(pick("parcels-chunk-1-points-circle", 0).object).toEqual({ properties: { name: "c" } });
        expect(pick("other-chunk-0-points-circle", 0).object).toBeUndefined();
    });
});

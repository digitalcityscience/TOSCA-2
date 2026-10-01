import { CompositeLayer, type Color, type DefaultProps, type GetPickingInfoParams, type Layer, type PickingInfo } from "@deck.gl/core";
import { GeoJsonLayer } from "@deck.gl/layers";
import type { DeckGeoJsonChunk } from "./deckGeoJsonChunk";

export interface ChunkedGeoJsonLayerProps {
    /** Binary chunks; pass a new array when chunks are appended. */
    chunks: DeckGeoJsonChunk[];
    fillColor: Color;
    lineColor: Color;
}

const defaultProps: DefaultProps<ChunkedGeoJsonLayerProps> = {
    chunks: { type: "array", value: [], compare: true },
    fillColor: { type: "color", value: [56, 189, 248, 90] },
    lineColor: { type: "color", value: [14, 116, 144, 230] },
};

const CHUNK_ID = /^-chunk-(\d+)/;

/**
 * Renders features that arrive page by page: one binary GeoJsonLayer per
 * chunk, so appending a page never re-uploads the ones already on the GPU.
 * Picks resolve to the chunk's own properties array, because binary
 * GeoJsonLayers report a feature index rather than a feature object.
 */
export class ChunkedGeoJsonLayer extends CompositeLayer<ChunkedGeoJsonLayerProps> {
    static layerName = "ChunkedGeoJsonLayer";
    static defaultProps = defaultProps;

    renderLayers(): Layer[] {
        const { chunks, fillColor, lineColor } = this.props;
        return chunks.map((chunk, index) => new GeoJsonLayer(this.getSubLayerProps({
            id: `chunk-${index}`,
            data: chunk.binary,
            filled: true,
            stroked: true,
            getFillColor: fillColor,
            getLineColor: lineColor,
            lineWidthUnits: "pixels",
            getLineWidth: 1,
            lineWidthMinPixels: 1,
            pointRadiusUnits: "pixels",
            getPointRadius: 4,
            pickable: true,
            updateTriggers: {
                getFillColor: fillColor,
                getLineColor: lineColor,
            },
        })));
    }

    getPickingInfo({ info, sourceLayer }: GetPickingInfoParams): PickingInfo {
        const pickedId = (sourceLayer ?? info.sourceLayer)?.id ?? "";
        const match = pickedId.startsWith(this.id) ? CHUNK_ID.exec(pickedId.slice(this.id.length)) : null;
        const chunk = match === null ? undefined : this.props.chunks[Number(match[1])];
        if (chunk !== undefined && info.index >= 0) {
            info.object = { properties: chunk.properties[info.index] ?? {} };
        }
        return info;
    }
}

/** Total number of features across chunks. */
export function chunkedFeatureCount(chunks: DeckGeoJsonChunk[]): number {
    return chunks.reduce((sum, chunk) => sum + chunk.featureCount, 0);
}

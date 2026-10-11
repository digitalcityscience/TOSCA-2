import maplibre, { type AddLayerObject, type VectorSourceSpecification } from "maplibre-gl";
import { Protocol } from "pmtiles";
import type { LayerObjectWithAttributes, MapLibreLayerTypes } from "@store/map";
import type { SimulationRunDetail, SimulationVectorLayerOutput } from "@store/geosimulation";

/**
 * GeoSimulation map layers are PMTiles files in object storage, read by MapLibre
 * with HTTP range requests through the `pmtiles://` protocol. Each output is one
 * listed layer: its first style layer is the listed record, the others are
 * companions that follow it (visibility, opacity, order, removal).
 */

let protocolRegistered = false;

export function ensurePmtilesProtocol(): void {
    if (protocolRegistered) return;
    maplibre.addProtocol("pmtiles", new Protocol().tile);
    protocolRegistered = true;
}

const MAP_READY_EVENTS = ["load", "style.load", "idle"] as const;

/**
 * Resolve once the map style can take sources (initial load or a basemap switch).
 * `isStyleLoaded()` is also false while tiles are loading, after `load` and
 * `style.load` have fired, so `idle` (all loading finished) resolves that case.
 */
export async function waitForMapStyle(map: any): Promise<void> {
    if (map.isStyleLoaded()) return;
    await new Promise<void>((resolve) => {
        const done = (): void => {
            MAP_READY_EVENTS.forEach((event) => map.off(event, done));
            resolve();
        };
        MAP_READY_EVENTS.forEach((event) => map.once(event, done));
    });
}

export function simulationSourceId(runId: string, outputId: string): string {
    return `geosim:${runId}:${outputId}`;
}

export function buildSimulationSource(output: Pick<SimulationVectorLayerOutput, "url">): VectorSourceSpecification {
    return { type: "vector", url: `pmtiles://${output.url}` };
}

/** Style layers with runtime ids, the run's source, and the output's tile layer. */
export function buildSimulationStyleLayers(
    output: Pick<SimulationVectorLayerOutput, "style" | "source_layer">,
    sourceId: string
): AddLayerObject[] {
    return output.style.map((layer) => ({
        ...layer,
        id: `${sourceId}:${layer.id}`,
        source: sourceId,
        "source-layer": output.source_layer,
    }) as unknown as AddLayerObject);
}

interface SimulationMapStore {
    map: any;
    layersOnMap: LayerObjectWithAttributes[];
    add2MapLayerList: (layer: LayerObjectWithAttributes, index?: number, options?: { notify?: boolean }) => void;
    addCompanionLayer: (parentId: string, layer: AddLayerObject) => void;
    deleteMapLayer: (identifier: string, information?: boolean) => Promise<void>;
}

/** Add one map-layer output of a run; returns the listed record (existing one if already added). */
export function addSimulationOutputLayer(
    mapStore: SimulationMapStore,
    run: Pick<SimulationRunDetail, "id" | "labels">,
    output: SimulationVectorLayerOutput
): LayerObjectWithAttributes | undefined {
    const sourceId = simulationSourceId(run.id, output.id);
    const existing = mapStore.layersOnMap.find((layer) => layer.source === sourceId);
    if (existing !== undefined) return existing;
    const [primary, ...companions] = buildSimulationStyleLayers(output, sourceId);
    if (primary === undefined) return undefined;

    ensurePmtilesProtocol();
    mapStore.map.addSource(sourceId, buildSimulationSource(output));
    try {
        mapStore.map.addLayer(primary);
        const record: LayerObjectWithAttributes = {
            ...(primary as unknown as LayerObjectWithAttributes),
            source: sourceId,
            sourceType: "pmtiles",
            type: primary.type as MapLibreLayerTypes,
            displayName: output.title,
            showOnLayerList: true,
            simulationOutput: {
                runId: run.id,
                outputId: output.id,
                role: output.role,
                legend: output.legend,
                labels: run.labels,
                bounds: output.bounds,
            },
        };
        mapStore.add2MapLayerList(record, undefined, { notify: false });
        companions.forEach((layer) => mapStore.addCompanionLayer(record.id, layer));
        return record;
    } catch (error) {
        if (mapStore.map.getLayer(primary.id) !== undefined) mapStore.map.removeLayer(primary.id);
        if (mapStore.map.getSource(sourceId) !== undefined) mapStore.map.removeSource(sourceId);
        throw error;
    }
}

export function simulationLayersOfRun(mapStore: Pick<SimulationMapStore, "layersOnMap">, runId: string): LayerObjectWithAttributes[] {
    return mapStore.layersOnMap.filter((layer) => layer.simulationOutput?.runId === runId);
}

/** Remove one output's layers and its source. */
export async function removeSimulationOutputLayer(mapStore: SimulationMapStore, layer: LayerObjectWithAttributes): Promise<void> {
    await mapStore.deleteMapLayer(layer.id, false);
    if (mapStore.map.getSource(layer.source) !== undefined) {
        mapStore.map.removeSource(layer.source);
    }
}

export async function removeSimulationRunLayers(mapStore: SimulationMapStore, runId: string): Promise<void> {
    for (const layer of simulationLayersOfRun(mapStore, runId)) {
        await removeSimulationOutputLayer(mapStore, layer);
    }
}

/**
 * Point the run's sources at freshly presigned URLs. MapLibre keeps the
 * layers and only re-reads the tile index, so the map does not flicker.
 */
export function refreshSimulationSourceUrls(mapStore: SimulationMapStore, run: SimulationRunDetail): void {
    for (const output of run.outputs) {
        if (output.kind !== "vector_layer") continue;
        const source = mapStore.map.getSource(simulationSourceId(run.id, output.id));
        source?.setUrl?.(buildSimulationSource(output).url);
    }
}

/** Milliseconds until a URL should be refreshed (one minute before it expires), or undefined. */
export function msUntilRefresh(expiresAt: string | null | undefined, now = Date.now()): number | undefined {
    if (expiresAt === null || expiresAt === undefined) return undefined;
    const expiry = Date.parse(expiresAt);
    if (Number.isNaN(expiry)) return undefined;
    return Math.max(0, expiry - now - 60_000);
}

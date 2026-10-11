import { describe, expect, test, vi } from "vitest";
import type { LayerObjectWithAttributes } from "@store/map";
import { isVectorLayerOutput, type SimulationRunDetail } from "@store/geosimulation";
import runFixture from "@store/__fixtures__/geosimulation-run-detail.json";
import {
    addSimulationOutputLayer,
    buildSimulationSource,
    buildSimulationStyleLayers,
    msUntilRefresh,
    refreshSimulationSourceUrls,
    removeSimulationRunLayers,
    simulationSourceId,
    waitForMapStyle,
} from "./geosimulationLayers";

vi.mock("maplibre-gl", () => ({ default: { addProtocol: vi.fn() } }));
vi.mock("pmtiles", () => ({ Protocol: class { tile = vi.fn(); } }));

const run = runFixture as unknown as SimulationRunDetail;
const outputs = run.outputs.filter(isVectorLayerOutput);
const flow = outputs.find((output) => output.role === "bike_flow")!;
const districts = outputs.find((output) => output.role === "origins_by_district")!;

function fakeMapStore() {
    const sources = new Map<string, { url: string; setUrl: ReturnType<typeof vi.fn> }>();
    const layers = new Map<string, unknown>();
    const store = {
        layersOnMap: [] as LayerObjectWithAttributes[],
        map: {
            addSource: vi.fn((id: string, spec: { url: string }) => {
                sources.set(id, { url: spec.url, setUrl: vi.fn() });
            }),
            getSource: (id: string) => sources.get(id),
            removeSource: vi.fn((id: string) => sources.delete(id)),
            addLayer: vi.fn((layer: { id: string }) => layers.set(layer.id, layer)),
            getLayer: (id: string) => layers.get(id),
            removeLayer: vi.fn((id: string) => layers.delete(id)),
        },
        add2MapLayerList: vi.fn((layer: LayerObjectWithAttributes) => store.layersOnMap.push(layer)),
        addCompanionLayer: vi.fn((parentId: string, layer: { id: string }) => {
            layers.set(layer.id, layer);
            const parent = store.layersOnMap.find((item) => item.id === parentId)!;
            parent.companionLayerIds = [...(parent.companionLayerIds ?? []), layer.id];
        }),
        deleteMapLayer: vi.fn(async (identifier: string) => {
            const record = store.layersOnMap.find((item) => item.id === identifier);
            [identifier, ...(record?.companionLayerIds ?? [])].forEach((id) => layers.delete(id));
            store.layersOnMap = store.layersOnMap.filter((item) => item.id !== identifier);
        }),
    };
    return { store, sources, layers };
}

describe("simulation map layers", () => {
    test("builds a PMTiles source and prefixed style layers", () => {
        const sourceId = simulationSourceId(run.id, flow.id);

        expect(buildSimulationSource(flow)).toEqual({ type: "vector", url: `pmtiles://${flow.url}` });
        const [layer] = buildSimulationStyleLayers(flow, sourceId) as unknown as Array<Record<string, unknown>>;
        expect(layer.id).toBe(`${sourceId}:bike_flow-line`);
        expect(layer.source).toBe(sourceId);
        expect(layer["source-layer"]).toBe("bike_flow");
        expect(layer.paint).toEqual(flow.style[0].paint);
    });

    test("adds one listed layer per output with companions and legend info", () => {
        const { store, layers } = fakeMapStore();

        const record = addSimulationOutputLayer(store, run, districts)!;

        expect(store.map.addSource).toHaveBeenCalledTimes(1);
        expect(store.layersOnMap).toHaveLength(1);
        expect(record.sourceType).toBe("pmtiles");
        expect(record.displayName).toBe("Trip origins by district");
        expect(record.simulationOutput).toMatchObject({ runId: run.id, role: "origins_by_district" });
        expect(record.simulationOutput?.legend?.type).toBe("graduated");
        // Choropleth: fill (listed) + outline (companion).
        expect(record.companionLayerIds).toHaveLength(1);
        expect(layers.size).toBe(2);
        expect(store.add2MapLayerList).toHaveBeenCalledWith(record, undefined, { notify: false });
    });

    test("adding the same output twice reuses the existing layer", () => {
        const { store } = fakeMapStore();
        const first = addSimulationOutputLayer(store, run, flow);

        expect(addSimulationOutputLayer(store, run, flow)).toBe(first);
        expect(store.map.addSource).toHaveBeenCalledTimes(1);
    });

    test("removing a run's layers removes companions and sources", async () => {
        const { store, sources, layers } = fakeMapStore();
        addSimulationOutputLayer(store, run, flow);
        addSimulationOutputLayer(store, run, districts);

        await removeSimulationRunLayers(store, run.id);

        expect(store.layersOnMap).toHaveLength(0);
        expect(layers.size).toBe(0);
        expect(sources.size).toBe(0);
    });

    test("fresh presigned URLs are swapped into existing sources", () => {
        const { store, sources } = fakeMapStore();
        addSimulationOutputLayer(store, run, flow);
        const fresh = {
            ...run,
            outputs: run.outputs.map((output) => (output.id === flow.id ? { ...output, url: "https://storage/new.pmtiles?sig=2" } : output)),
        } as SimulationRunDetail;

        refreshSimulationSourceUrls(store, fresh);

        expect(sources.get(simulationSourceId(run.id, flow.id))?.setUrl).toHaveBeenCalledWith(
            "pmtiles://https://storage/new.pmtiles?sig=2"
        );
    });

    test("waits for the map style before sources are added", async () => {
        const handlers: Record<string, () => void> = {};
        const map = {
            isStyleLoaded: vi.fn(() => false),
            once: vi.fn((event: string, handler: () => void) => { handlers[event] = handler; }),
            off: vi.fn(),
        };
        let ready = false;
        const waiting = waitForMapStyle(map).then(() => { ready = true; });

        await Promise.resolve();
        expect(ready).toBe(false);
        handlers.idle();
        await waiting;
        expect(ready).toBe(true);
        expect(map.off).toHaveBeenCalledWith("load", expect.any(Function));
        expect(map.off).toHaveBeenCalledWith("style.load", expect.any(Function));

        map.isStyleLoaded.mockReturnValue(true);
        await expect(waitForMapStyle(map)).resolves.toBeUndefined();
    });

    test("refreshes a minute before expiry, never in the past", () => {
        const now = Date.parse("2026-10-11T08:00:00Z");

        expect(msUntilRefresh("2026-10-11T08:10:00Z", now)).toBe(9 * 60_000);
        expect(msUntilRefresh("2026-10-11T08:00:30Z", now)).toBe(0);
        expect(msUntilRefresh(null, now)).toBeUndefined();
        expect(msUntilRefresh("not a date", now)).toBeUndefined();
    });
});

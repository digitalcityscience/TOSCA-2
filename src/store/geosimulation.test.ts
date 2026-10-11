import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
    buildModelDetailUrl,
    buildModelListUrl,
    buildRunDetailUrl,
    isTripsOutput,
    isVectorLayerOutput,
    labelForValue,
    resolveSimulationLabel,
    type SimulationModelDetail,
    type SimulationRunDetail,
    useGeosimulationStore,
} from "./geosimulation";
import runFixture from "./__fixtures__/geosimulation-run-detail.json";
import modelListFixture from "./__fixtures__/geosimulation-model-list.json";
import modelFixture from "./__fixtures__/geosimulation-model-detail.json";

// Real responses from the seeded dev backend (signatures removed, tables trimmed).
const run = runFixture as unknown as SimulationRunDetail;
const model = modelFixture as unknown as SimulationModelDetail;

function jsonResponse(body: unknown, init?: ResponseInit): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
        ...init,
    });
}

describe("geosimulation store", () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        setActivePinia(createPinia());
        vi.stubEnv("VITE_BACKEND_ROOT_URL", "http://localhost:8000");
        fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
    });

    test("builds API URLs from the backend root", () => {
        expect(buildModelListUrl().toString()).toBe("http://localhost:8000/api/v1/geosimulations/");
        expect(buildModelDetailUrl("a/b").toString()).toBe("http://localhost:8000/api/v1/geosimulations/a%2Fb/");
        expect(buildRunDetailUrl("r1").toString()).toBe("http://localhost:8000/api/v1/geosimulations/runs/r1/");
    });

    test("loads models, a model with its runs, and a run", async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse(modelListFixture))
            .mockResolvedValueOnce(jsonResponse(model))
            .mockResolvedValueOnce(jsonResponse(run));
        const store = useGeosimulationStore();

        await store.loadModels();
        await store.loadModel(model.id);
        const loaded = await store.loadRun(run.id);

        expect(store.models.map((item) => item.key)).toEqual(["hamburg-bike-abm"]);
        expect(store.selectedModel?.runs.length).toBe(2);
        expect(loaded.outputs.filter(isVectorLayerOutput).map((output) => output.role)).toEqual([
            "bike_flow", "signal_delay", "junction_movements", "origins_by_district", "origins",
        ]);
        expect(loaded.outputs.find(isTripsOutput)?.metadata.agents).toBe(1000);
        expect(store.selectedRun?.id).toBe(run.id);
    });

    test("exposes a user-safe error when the list fails", async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ detail: "down" }, { status: 503 }));
        vi.spyOn(console, "error").mockImplementation(() => {});
        const store = useGeosimulationStore();

        await expect(store.loadModels()).rejects.toThrow();

        expect(store.error).not.toBe("");
        expect(store.loadingModels).toBe(false);
    });
});

describe("simulation labels", () => {
    test("picks the UI language, then English, then the raw value", () => {
        expect(resolveSimulationLabel({ en: "Cargo bike", de: "Lastenrad" }, "de-DE")).toBe("Lastenrad");
        expect(resolveSimulationLabel({ en: "Cargo bike", de: "Lastenrad" }, "tr")).toBe("Cargo bike");
        expect(resolveSimulationLabel("< 5", "de")).toBe("< 5");
        expect(resolveSimulationLabel(undefined, "de", "raw")).toBe("raw");
    });

    test("translates categorical attribute values with the run's labels", () => {
        expect(labelForValue(run.labels, "bike", "cargo", "de")).toBe("Lastenrad");
        expect(labelForValue(run.labels, "infrastructure_type", "radweg", "en")).toBe("Cycle track");
        expect(labelForValue(run.labels, "bike", "unknown", "en")).toBe("unknown");
        expect(labelForValue(run.labels, "missing", 12, "en")).toBe("12");
    });
});

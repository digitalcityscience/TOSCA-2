import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
    buildComparisonDetailUrl,
    buildStartRunUrl,
    StartRunError,
    buildComparisonListUrl,
    buildModelDetailUrl,
    buildModelListUrl,
    buildRunDetailUrl,
    isTripsOutput,
    isVectorLayerOutput,
    labelForValue,
    resolveSimulationLabel,
    type SimulationComparisonDetail,
    type SimulationModelDetail,
    type SimulationRunDetail,
    useGeosimulationStore,
} from "./geosimulation";
import runFixture from "./__fixtures__/geosimulation-run-detail.json";
import modelListFixture from "./__fixtures__/geosimulation-model-list.json";
import modelFixture from "./__fixtures__/geosimulation-model-detail.json";
import comparisonFixture from "./__fixtures__/geosimulation-comparison-detail.json";

// Real responses from the seeded dev backend (signatures removed, tables trimmed).
const run = runFixture as unknown as SimulationRunDetail;
const model = modelFixture as unknown as SimulationModelDetail;
const comparison = comparisonFixture as unknown as SimulationComparisonDetail;

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

    test("builds comparison URLs with optional filters", () => {
        expect(buildComparisonListUrl({ run: "r1" }).toString()).toBe(
            "http://localhost:8000/api/v1/geosimulations/comparisons/?run=r1"
        );
        expect(buildComparisonListUrl().toString()).toBe("http://localhost:8000/api/v1/geosimulations/comparisons/");
        expect(buildComparisonDetailUrl("c1").toString()).toBe(
            "http://localhost:8000/api/v1/geosimulations/comparisons/c1/"
        );
    });

    test("loads a comparison and the comparisons of a run", async () => {
        const summary = { id: comparison.id, key: comparison.key, title: comparison.title };
        fetchMock
            .mockResolvedValueOnce(jsonResponse(comparison))
            .mockResolvedValueOnce(jsonResponse({ next: null, previous: null, results: [summary] }));
        const store = useGeosimulationStore();

        const loaded = await store.loadComparison(comparison.id);
        const ofRun = await store.loadRunComparisons(comparison.baseline.id);

        expect(store.selectedComparison?.id).toBe(comparison.id);
        expect(loaded.outputs.filter(isVectorLayerOutput).map((output) => output.legend?.type)).toEqual(["diverging"]);
        expect(loaded.kpi_changes.length).toBeGreaterThan(0);
        expect(ofRun.map((item) => item.key)).toEqual(["queues_vs_turn_queues_n1000_v2"]);
        expect(String(fetchMock.mock.calls[1][0])).toContain(`comparisons/?run=${comparison.baseline.id}`);
        store.clearComparison();
        expect(store.selectedComparison).toBeUndefined();
    });

    test("starts runs and reports why one could not start", async () => {
        const queued = { id: "r9", title: "My run", execution_state: "queued", visibility: "link", created_at: "2026-10-12T12:00:00Z", reused: false };
        fetchMock
            .mockResolvedValueOnce(jsonResponse(queued, { status: 202 }))
            .mockResolvedValueOnce(jsonResponse({ parameters: ["agents: 0 is less than the minimum of 1"] }, { status: 400 }))
            .mockResolvedValueOnce(jsonResponse({ detail: "Runs from your connection: 1 run(s) already in progress; wait until one finishes." }, {
                status: 429,
                headers: { "Content-Type": "application/json", "Retry-After": "60" },
            }));
        const store = useGeosimulationStore();

        const started = await store.startRun("m1", { parameters: { agents: 5 }, seed: 3 });
        const invalid = await store.startRun("m1", { parameters: { agents: 0 } }).catch((error: unknown) => error);
        const quota = await store.startRun("m1", { parameters: {} }).catch((error: unknown) => error);

        expect(started).toMatchObject({ id: "r9", reused: false, visibility: "link" });
        const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
        expect(String(url)).toBe(buildStartRunUrl("m1").toString());
        expect(init.method).toBe("POST");
        expect(JSON.parse(init.body as string)).toEqual({ parameters: { agents: 5 }, seed: 3 });
        expect(invalid).toBeInstanceOf(StartRunError);
        expect(invalid).toMatchObject({ status: 400, parameterErrors: ["agents: 0 is less than the minimum of 1"] });
        expect(quota).toMatchObject({ status: 429, retryAfterSeconds: 60 });
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

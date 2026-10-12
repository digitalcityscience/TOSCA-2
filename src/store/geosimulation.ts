import { acceptHMRUpdate, defineStore } from "pinia";
import { ref } from "vue";
import { fetchBackendJson, getBackendRootUrl, resolveBackendUrl } from "./backend";
import { reportDeveloperError, serviceUnavailableMessage } from "@helpers/userFacingError";

/**
 * GeoSimulations read API.
 * Contract: TOSCA-Backend docs/development/geosimulation_frontend_integration.md
 */
const GEOSIMULATIONS_API_PATH = "/api/v1/geosimulations";

export type SimulationStatus = "draft" | "published" | "archived";
export type SimulationExecutionState = "imported" | "queued" | "running" | "succeeded" | "failed";
export type SimulationBounds = [number, number, number, number];
/** Display label: a plain string, or one label per language (`{en, de}`). */
export type SimulationLabel = string | Record<string, string>;
/** `{attribute: {value: {en, de}}}` for categorical values. */
export type SimulationLabels = Record<string, Record<string, Record<string, string>>>;

/** Editor.js document (description profile). */
export interface SimulationDescription {
    blocks: Array<{ id?: string; type: string; data?: Record<string, unknown> }>;
}

export interface SimulationTime {
    start: string | null;
    end: string | null;
    timezone: string;
}

export interface SimulationModelListItem {
    id: string;
    key: string;
    title: string;
    summary: string;
    status: SimulationStatus;
    preview_image_url: string | null;
    run_count: number;
    updated_at: string;
}

/** `private`: only the user who started it; `organization`: the model's organization; `link`: anonymous, readable by id. */
export type SimulationVisibility = "private" | "organization" | "link";

export interface SimulationRunSummary {
    id: string;
    key: string;
    title: string;
    status: SimulationStatus;
    visibility?: SimulationVisibility;
    execution_state: SimulationExecutionState;
    model_version: string;
    time: SimulationTime;
    created_at: string;
}

export interface SimulationModelDetail extends SimulationModelListItem {
    description_content: SimulationDescription;
    organization: { slug: string; name: string };
    parameter_schema: Record<string, unknown> | null;
    default_parameters: Record<string, unknown>;
    /** Visitors can start runs (`POST …/{id}/runs/`); absent before backend Task 12.12. */
    runnable?: boolean;
    runs: SimulationRunSummary[];
    /** Comparisons of two of the model's runs; absent from backends before Task 12.10. */
    comparisons?: SimulationComparisonSummary[];
}

export interface SimulationRunRef {
    id: string;
    key: string;
    title: string;
}

export interface SimulationComparisonSummary {
    id: string;
    key: string;
    title: string;
    status: SimulationStatus;
    baseline: SimulationRunRef;
    candidate: SimulationRunRef;
    created_at: string;
}

/** One KPI both runs report: `delta = candidate − baseline`; `delta_percent` is null for a zero baseline. */
export interface SimulationKpiChange {
    metric: string;
    baseline: number;
    candidate: number;
    delta: number;
    delta_percent: number | null;
}

/** Two runs of one model compared; outputs are difference layers and change tables (no replay). */
export interface SimulationComparisonDetail {
    id: string;
    model: { id: string; key: string; title: string };
    key: string;
    title: string;
    description_content: SimulationDescription;
    status: SimulationStatus;
    baseline: SimulationRunSummary;
    candidate: SimulationRunSummary;
    bounds: SimulationBounds | null;
    labels: SimulationLabels;
    kpi_changes: SimulationKpiChange[];
    outputs: SimulationOutput[];
    created_at: string;
    updated_at: string;
}

export interface SimulationLegendItem {
    label: SimulationLabel;
    color?: string;
    value?: string | number | null;
    min?: number;
    max?: number;
    size?: number;
}

export interface SimulationLegend {
    /** `diverging`: changes around zero (comparisons), rendered like `graduated`. */
    type: "graduated" | "proportional" | "categorical" | "heatmap" | "diverging" | "simple";
    title: string;
    geometry: string;
    attribute?: string;
    color?: string;
    colors?: string[];
    items: SimulationLegendItem[];
}

/** A MapLibre style layer without `source` / `source-layer` (the client adds them). */
export interface SimulationStyleLayer {
    id: string;
    type: string;
    paint?: Record<string, unknown>;
    layout?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    minzoom?: number;
    maxzoom?: number;
}

interface SimulationOutputBase {
    id: string;
    role: string;
    title: string;
    display_order: number;
}

interface SimulationFileOutput extends SimulationOutputBase {
    url: string;
    url_expires_at: string | null;
}

export interface SimulationVectorLayerOutput extends SimulationFileOutput {
    kind: "vector_layer";
    source_layer: string;
    geometry_type: string | null;
    minzoom: number | null;
    maxzoom: number | null;
    bounds: SimulationBounds | null;
    features: number | null;
    style: SimulationStyleLayer[];
    legend: SimulationLegend | null;
}

export interface SimulationTripsOutput extends SimulationFileOutput {
    kind: "trips";
    size: number;
    sha256: string;
    metadata: { agents?: number; encoding?: string; encoding_version?: number; vertices?: number; stops?: number };
}

export interface SimulationTableOutput extends SimulationOutputBase {
    kind: "table";
    data: { columns: string[]; rows: Array<Array<string | number | null>> };
}

export interface SimulationImageOutput extends SimulationFileOutput {
    kind: "image";
    mime: string;
}

export type SimulationOutput =
    | SimulationVectorLayerOutput
    | SimulationTripsOutput
    | SimulationTableOutput
    | SimulationImageOutput;

/** Progress of a started run, for its starter (and anyone holding an anonymous run's id). */
export interface SimulationRunExecution {
    message: string;
    error: string;
    started_at: string | null;
    finished_at: string | null;
}

export interface SimulationRunDetail {
    id: string;
    model: { id: string; key: string; title: string };
    key: string;
    title: string;
    description_content: SimulationDescription;
    status: SimulationStatus;
    visibility?: SimulationVisibility;
    is_owner?: boolean;
    execution_state: SimulationExecutionState;
    execution?: SimulationRunExecution | null;
    model_version: string;
    parameters: Record<string, unknown>;
    seed: number | null;
    time: SimulationTime;
    bounds: SimulationBounds | null;
    kpis: Record<string, number>;
    labels: SimulationLabels;
    outputs: SimulationOutput[];
    created_at: string;
    updated_at: string;
}

interface PaginatedResponse<T> {
    next: string | null;
    previous: string | null;
    results: T[];
}

export function buildModelListUrl(): URL {
    return new URL(`${GEOSIMULATIONS_API_PATH}/`, getBackendRootUrl());
}

export function buildModelDetailUrl(modelId: string): URL {
    return new URL(`${GEOSIMULATIONS_API_PATH}/${encodeURIComponent(modelId)}/`, getBackendRootUrl());
}

export function buildRunDetailUrl(runId: string): URL {
    return new URL(`${GEOSIMULATIONS_API_PATH}/runs/${encodeURIComponent(runId)}/`, getBackendRootUrl());
}

export function buildStartRunUrl(modelId: string): URL {
    return new URL(`${GEOSIMULATIONS_API_PATH}/${encodeURIComponent(modelId)}/runs/`, getBackendRootUrl());
}

export interface StartRunRequest {
    parameters: Record<string, unknown>;
    seed?: number | null;
    title?: string;
    visibility?: Exclude<SimulationVisibility, "link">;
}

export interface StartRunResponse extends SimulationRunSummary {
    /** An identical run the caller can read was returned instead of starting a new one. */
    reused: boolean;
}

/** A run could not be started: invalid parameters (400), no runner (409) or a quota (429). */
export class StartRunError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly parameterErrors: string[] = [],
        readonly retryAfterSeconds: number | null = null
    ) {
        super(message);
    }
}

/** Runs that are still being computed. */
export function isRunInProgress(state: SimulationExecutionState): boolean {
    return state === "queued" || state === "running";
}

export function buildComparisonListUrl(filters: { model?: string; run?: string } = {}): URL {
    const url = new URL(`${GEOSIMULATIONS_API_PATH}/comparisons/`, getBackendRootUrl());
    Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) url.searchParams.set(key, value);
    });
    return url;
}

export function buildComparisonDetailUrl(comparisonId: string): URL {
    return new URL(
        `${GEOSIMULATIONS_API_PATH}/comparisons/${encodeURIComponent(comparisonId)}/`,
        getBackendRootUrl()
    );
}

export function isVectorLayerOutput(output: SimulationOutput): output is SimulationVectorLayerOutput {
    return output.kind === "vector_layer";
}

export function isTripsOutput(output: SimulationOutput): output is SimulationTripsOutput {
    return output.kind === "trips";
}

export function isTableOutput(output: SimulationOutput): output is SimulationTableOutput {
    return output.kind === "table";
}

/** Pick a label for the UI language, falling back to English, then to the raw value. */
export function resolveSimulationLabel(label: SimulationLabel | undefined, locale: string, fallback = ""): string {
    if (label === undefined) return fallback;
    if (typeof label === "string") return label;
    const language = locale.split("-")[0];
    return label[language] ?? label.en ?? Object.values(label)[0] ?? fallback;
}

/** Translate a categorical attribute value with the run's labels. */
export function labelForValue(
    labels: SimulationLabels,
    attribute: string,
    value: string | number | boolean | null | undefined,
    locale: string
): string {
    const text = value === null || value === undefined ? "" : String(value);
    return resolveSimulationLabel(labels[attribute]?.[text], locale, text);
}

export const useGeosimulationStore = defineStore("geosimulation", () => {
    const models = ref<SimulationModelListItem[]>([]);
    const nextModelsUrl = ref<string | null>(null);
    const loadingModels = ref(false);
    const loadingModel = ref(false);
    const loadingRun = ref(false);
    const error = ref("");
    const selectedModel = ref<SimulationModelDetail>();
    const selectedRun = ref<SimulationRunDetail>();
    const selectedComparison = ref<SimulationComparisonDetail>();
    const loadingComparison = ref(false);

    async function loadModels(): Promise<void> {
        loadingModels.value = true;
        error.value = "";
        try {
            const response = await fetchBackendJson<PaginatedResponse<SimulationModelListItem>>(
                buildModelListUrl(),
                "GeoSimulations"
            );
            models.value = response.results;
            nextModelsUrl.value = response.next;
        } catch (err) {
            error.value = serviceUnavailableMessage("GeoSimulations");
            reportDeveloperError("Loading simulation models", err);
            throw err;
        } finally {
            loadingModels.value = false;
        }
    }

    async function loadMoreModels(): Promise<void> {
        if (nextModelsUrl.value === null) return;
        loadingModels.value = true;
        try {
            const response = await fetchBackendJson<PaginatedResponse<SimulationModelListItem>>(
                resolveBackendUrl(nextModelsUrl.value),
                "GeoSimulations"
            );
            models.value = [...models.value, ...response.results];
            nextModelsUrl.value = response.next;
        } catch (err) {
            error.value = serviceUnavailableMessage("GeoSimulations");
            reportDeveloperError("Loading more simulation models", err);
            throw err;
        } finally {
            loadingModels.value = false;
        }
    }

    async function loadModel(modelId: string): Promise<SimulationModelDetail> {
        loadingModel.value = true;
        try {
            const response = await fetchBackendJson<SimulationModelDetail>(
                buildModelDetailUrl(modelId),
                "GeoSimulations"
            );
            selectedModel.value = response;
            return response;
        } catch (err) {
            reportDeveloperError(`Loading simulation model ${modelId}`, err);
            throw err;
        } finally {
            loadingModel.value = false;
        }
    }

    /**
     * Load (or reload) a run. File URLs in the response are presigned and expire
     * (`url_expires_at`); call this again to get fresh ones.
     */
    async function loadRun(runId: string): Promise<SimulationRunDetail> {
        loadingRun.value = true;
        try {
            const response = await fetchBackendJson<SimulationRunDetail>(
                buildRunDetailUrl(runId),
                "GeoSimulations"
            );
            selectedRun.value = response;
            return response;
        } catch (err) {
            reportDeveloperError(`Loading simulation run ${runId}`, err);
            throw err;
        } finally {
            loadingRun.value = false;
        }
    }

    function clearRun(): void {
        selectedRun.value = undefined;
    }

    /** Load (or reload, for fresh presigned URLs) a comparison. */
    async function loadComparison(comparisonId: string): Promise<SimulationComparisonDetail> {
        loadingComparison.value = true;
        try {
            const response = await fetchBackendJson<SimulationComparisonDetail>(
                buildComparisonDetailUrl(comparisonId),
                "GeoSimulations"
            );
            selectedComparison.value = response;
            return response;
        } catch (err) {
            reportDeveloperError(`Loading simulation comparison ${comparisonId}`, err);
            throw err;
        } finally {
            loadingComparison.value = false;
        }
    }

    function clearComparison(): void {
        selectedComparison.value = undefined;
    }

    /**
     * Start a run (anonymous visitors allowed while the backend permits it).
     * Resolves for a new run (202) and for a reused identical run (200, `reused`).
     */
    async function startRun(modelId: string, body: StartRunRequest): Promise<StartRunResponse> {
        let response: Response;
        try {
            response = await fetch(buildStartRunUrl(modelId), {
                method: "POST",
                headers: new Headers({ "Content-Type": "application/json", Accept: "application/json" }),
                body: JSON.stringify(body),
            });
        } catch (err) {
            reportDeveloperError("Starting a simulation run", err);
            throw new StartRunError(serviceUnavailableMessage("GeoSimulations"), 0);
        }
        const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
        if (response.ok) return payload as unknown as StartRunResponse;
        const parameterErrors = Array.isArray(payload.parameters) ? payload.parameters.map(String) : [];
        const visibilityErrors = Array.isArray(payload.visibility) ? payload.visibility.map(String) : [];
        const detail = typeof payload.detail === "string" ? payload.detail : visibilityErrors[0] ?? response.statusText;
        const retryAfter = Number(response.headers.get("Retry-After"));
        throw new StartRunError(
            detail,
            response.status,
            parameterErrors,
            Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null
        );
    }

    /** Comparisons with this run on either side (first page, newest first). */
    async function loadRunComparisons(runId: string): Promise<SimulationComparisonSummary[]> {
        const response = await fetchBackendJson<PaginatedResponse<SimulationComparisonSummary>>(
            buildComparisonListUrl({ run: runId }),
            "GeoSimulations"
        );
        return response.results;
    }

    return {
        models,
        nextModelsUrl,
        loadingModels,
        loadingModel,
        loadingRun,
        error,
        selectedModel,
        selectedRun,
        selectedComparison,
        loadingComparison,
        loadModels,
        loadMoreModels,
        loadModel,
        loadRun,
        clearRun,
        startRun,
        loadComparison,
        clearComparison,
        loadRunComparisons,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useGeosimulationStore, import.meta.hot));
}

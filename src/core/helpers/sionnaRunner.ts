/**
 * Client for the TOSCA-Sionna Runner (repository `TOSCA-Sionna-Runner`),
 * which runs on the user's own machine and GPU. Plain `fetch`: the Keycloak
 * token must not go to a service outside the TOSCA backend.
 */

const configured = (import.meta.env.VITE_SIONNA_RUNNER_URL as string | undefined)?.trim().replace(/\/+$/, "");
export const SIONNA_RUNNER_URL = configured !== undefined && configured !== "" ? configured : "http://127.0.0.1:8770";
/**
 * The Sionna CityJSON endpoint: where the runner downloads the LoD3 tiles of an area
 * (`metadata.json`, `tiles/<name>.city.jsonl`). The data comes from this site, the
 * simulation runs on the user's machine. Unset: the runner's own `SIONNA_TILE_SOURCE`.
 */
const cityJsonUrl = (import.meta.env.VITE_SIONNA_CITYJSON_URL as string | undefined)?.trim().replace(/\/+$/, "");
const tileSource = cityJsonUrl !== undefined && cityJsonUrl !== "" ? { tile_source: cityJsonUrl } : {};

/**
 * Where the runner is, for Chrome's Local Network Access: an https TOSCA site may call
 * an http runner on this machine ("loopback") or in the LAN ("local") only if the
 * request says so; the browser then asks the user once. Other browsers ignore it.
 */
export function targetAddressSpace(url: string): "loopback" | "local" | undefined {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host === "::1" || host.startsWith("127.")) return "loopback";
    const lan = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|f[cd][0-9a-f]{2}:|fe80:)/;
    if (lan.test(host) || host.endsWith(".local")) return "local";
    return undefined;
}

const addressSpace = targetAddressSpace(SIONNA_RUNNER_URL);

export interface SionnaHealth {
    status: string;
    version: string;
    variant: string;
    gpu: boolean;
    storage: SionnaStorage;
}

/** Working files the runner keeps on its machine (the open scene); results are never stored. */
export interface SionnaStorage {
    bytes: number;
    files: number;
    scenes: number;
}

/** One entry of `GET /models`, the same shape TOSCA's simulation runners use. */
export interface SionnaModel {
    key: string;
    title: string;
    version: string;
    parameter_schema: Record<string, unknown>;
    default_parameters: Record<string, unknown>;
}

export interface SionnaScene {
    id: string;
    name: string;
    objects: number;
    bounds: { min: [number, number, number]; max: [number, number, number] };
    /** Rendered preview, a PNG data URL; null for scenes on the map. */
    image: string | null;
    /** Set for scenes built from geodata (CityJSON): they can be shown on the map. */
    georeference: {
        crs: string;
        center: LngLat;
        /** Footprints with a `height` property, for an extrusion layer. */
        buildings: GeoJSON.FeatureCollection;
        /** Scenes opened as an area: the radio map area, top left clockwise; null for whole tiles. */
        aoi?: [LngLat, LngLat, LngLat, LngLat] | null;
    } | null;
}

/** A scene that is already on the runner's machine: sample data or a Sionna built-in. */
export interface SionnaLocalScene {
    id: string;
    name: string;
    kind: "area" | "cityjson" | "mitsuba" | "builtin";
}

export type LngLat = [number, number];

export interface SionnaDevice {
    position: [number, number, number];
    yaw_deg?: number;
    pitch_deg?: number;
}

export interface SionnaRunRequest {
    parameters: Record<string, unknown>;
    transmitters: SionnaDevice[];
    receivers: SionnaDevice[];
    radio_map: boolean;
    paths: boolean;
}

export interface SionnaRunResult {
    /** Scenes without a georeference only: the rendered result. */
    image?: string;
    seconds: number;
    radio_map?: {
        cells: [number, number];
        coverage: number;
        min_db: number | null;
        max_db: number | null;
        median_db: number | null;
        /** The colour scale as a PNG strip, vmin on the left. */
        colorbar: string;
        /** Georeferenced scenes only: a north-up PNG and its corners (top left, clockwise). */
        image?: string;
        corners?: [LngLat, LngLat, LngLat, LngLat];
    };
    /** Georeferenced scenes only: where the devices are on the map, and their height above ground. */
    devices?: { transmitters: Array<[number, number, number]>; receivers: Array<[number, number, number]> };
    /**
     * `features`: georeferenced scenes only, one 3D line per path (lon, lat, height above
     * ground), strongest first, with `tx`, `rx`, `type`, `interactions`, `order`, `gain_db`, `delay_ns`.
     */
    paths?: { count: number; features?: GeoJSON.FeatureCollection<GeoJSON.LineString, Record<string, unknown>> };
}

export class SionnaRunnerError extends Error {
    constructor(
        message: string,
        /** 0 when the runner cannot be reached. */
        readonly status: number,
        /** `"name: message"` lines for invalid parameters. */
        readonly details: string[] = []
    ) {
        super(message);
    }
}

/** The runner's `detail` is one message, or a list of `"name: message"` lines. */
export function errorDetails(body: unknown): string[] {
    const detail = (body as { detail?: unknown } | null | undefined)?.detail;
    if (typeof detail === "string") return [detail];
    if (Array.isArray(detail)) return detail.filter((item): item is string => typeof item === "string");
    return [];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
        // Not yet in TypeScript's RequestInit.
        response = await fetch(`${SIONNA_RUNNER_URL}${path}`, { ...init, ...(addressSpace === undefined ? {} : { targetAddressSpace: addressSpace }) } as RequestInit);
    } catch {
        throw new SionnaRunnerError("The local Sionna runner cannot be reached.", 0);
    }
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
        const details = errorDetails(body);
        throw new SionnaRunnerError(details[0] ?? `Runner error ${response.status}`, response.status, details);
    }
    return body as T;
}

export async function runnerHealth(): Promise<SionnaHealth> {
    return await request<SionnaHealth>("/health");
}

export async function runnerModel(): Promise<SionnaModel> {
    const models = await request<SionnaModel[]>("/models");
    return models[0];
}

export async function localScenes(): Promise<SionnaLocalScene[]> {
    return await request<SionnaLocalScene[]>("/scenes");
}

export async function openLocalScene(id: string): Promise<SionnaScene> {
    return await request<SionnaScene>("/scenes/local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...tileSource }),
    });
}

/**
 * A scene of the Hamburg LoD3 buildings around an area of interest ([west, south, east, north]
 * in degrees): the radio map covers the area, buildings up to `bufferM` around it take part.
 */
export async function openArea(bbox: [number, number, number, number], bufferM: number): Promise<SionnaScene> {
    return await request<SionnaScene>("/scenes/area", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bbox, buffer_m: bufferM, ...tileSource }),
    });
}

/** Upload one CityJSON file, or one `.zip` of a Mitsuba scene (XML and meshes). */
export async function uploadScene(file: File): Promise<SionnaScene> {
    const form = new FormData();
    form.append("files", file, file.name);
    return await request<SionnaScene>("/scenes", { method: "POST", body: form });
}

/** A map position in the scene's own metres; `z` is the roof or ground under it. */
/** Closes the open scene and deletes the runner's working files. */
export async function deleteRunnerFiles(): Promise<SionnaStorage> {
    return await request<SionnaStorage>("/scenes", { method: "DELETE" });
}

export async function localPosition(sceneId: string, lon: number, lat: number): Promise<{ x: number; y: number; z: number }> {
    return await request(`/scenes/${encodeURIComponent(sceneId)}/local?lon=${lon}&lat=${lat}`);
}

export async function runScene(sceneId: string, body: SionnaRunRequest): Promise<SionnaRunResult> {
    return await request<SionnaRunResult>(`/scenes/${encodeURIComponent(sceneId)}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

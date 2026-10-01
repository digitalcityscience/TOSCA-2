export type ExternalDataSourceType = "ogc-api" | "sensorthings";

/**
 * A public (unauthenticated) third-party data service listed next to the
 * Django catalog in the datastore sidebar.
 *
 * `url` is either an OGC API landing page / multi-API catalog, or the root of
 * a SensorThings service (with or without the `/v1.x` version segment).
 */
export interface ExternalDataSourceConfig {
    id: string;
    type: ExternalDataSourceType;
    title: string;
    url: string;
}

export const DEFAULT_EXTERNAL_DATA_SOURCES: ExternalDataSourceConfig[] = [
    {
        id: "hamburg-ogc-api",
        type: "ogc-api",
        title: "Hamburg OGC API",
        url: "https://api.hamburg.de/datasets/v1",
    },
    {
        id: "hamburg-sensorthings",
        type: "sensorthings",
        title: "Hamburg SensorThings",
        url: "https://iot.hamburg.de",
    },
];

const SOURCE_TYPES: ExternalDataSourceType[] = ["ogc-api", "sensorthings"];

function isExternalDataSourceConfig(value: unknown): value is ExternalDataSourceConfig {
    if (typeof value !== "object" || value === null) return false;
    const candidate = value as Record<string, unknown>;
    return typeof candidate.id === "string" && candidate.id !== "" &&
        typeof candidate.title === "string" && candidate.title !== "" &&
        typeof candidate.url === "string" && /^https?:\/\//i.test(candidate.url) &&
        SOURCE_TYPES.includes(candidate.type as ExternalDataSourceType);
}

/**
 * Parses `VITE_EXTERNAL_DATA_SOURCES` (a JSON array of source configs).
 * Unset keeps the defaults, an empty array disables external sources, and
 * invalid JSON or entries are ignored with a console error.
 */
export function parseExternalDataSources(raw: unknown): ExternalDataSourceConfig[] {
    if (typeof raw !== "string" || raw.trim() === "") {
        return DEFAULT_EXTERNAL_DATA_SOURCES;
    }
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            throw new Error("Expected a JSON array");
        }
        const valid = parsed.filter(isExternalDataSourceConfig);
        if (valid.length !== parsed.length) {
            console.error("[TOSCA] Ignoring invalid entries in VITE_EXTERNAL_DATA_SOURCES");
        }
        return valid;
    } catch (error) {
        console.error("[TOSCA] Could not parse VITE_EXTERNAL_DATA_SOURCES; using defaults", error);
        return DEFAULT_EXTERNAL_DATA_SOURCES;
    }
}

export function getExternalDataSources(): ExternalDataSourceConfig[] {
    return parseExternalDataSources(import.meta.env.VITE_EXTERNAL_DATA_SOURCES);
}

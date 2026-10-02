export type ExternalDataSourceType = "ogc-api" | "sensorthings";

/**
 * A public (unauthenticated) third-party data service listed next to the
 * Django catalog in the datastore sidebar. Configured through
 * `VITE_EXTERNAL_DATA_SOURCES`; nothing is listed when it is unset.
 *
 * `url` is either an OGC API landing page / multi-API catalog, or the root of
 * a SensorThings service (with or without the `/v1.x` version segment).
 * `mqttUrl` (SensorThings only) is the MQTT-over-WebSocket endpoint used for
 * live observation updates, e.g. `wss://iot.example.org/mqtt`. Without it,
 * values are only loaded on request.
 */
export interface ExternalDataSourceConfig {
    id: string;
    type: ExternalDataSourceType;
    title: string;
    url: string;
    mqttUrl?: string;
}

const SOURCE_TYPES: ExternalDataSourceType[] = ["ogc-api", "sensorthings"];

function isExternalDataSourceConfig(value: unknown): value is ExternalDataSourceConfig {
    if (typeof value !== "object" || value === null) return false;
    const candidate = value as Record<string, unknown>;
    return typeof candidate.id === "string" && candidate.id !== "" &&
        typeof candidate.title === "string" && candidate.title !== "" &&
        typeof candidate.url === "string" && /^https?:\/\//i.test(candidate.url) &&
        SOURCE_TYPES.includes(candidate.type as ExternalDataSourceType) &&
        (candidate.mqttUrl === undefined ||
            (typeof candidate.mqttUrl === "string" && /^wss?:\/\//i.test(candidate.mqttUrl)));
}

/**
 * Parses `VITE_EXTERNAL_DATA_SOURCES` (a JSON array of source configs).
 * Unset or empty means no external sources; invalid JSON or entries are
 * ignored with a console error.
 */
export function parseExternalDataSources(raw: unknown): ExternalDataSourceConfig[] {
    if (typeof raw !== "string" || raw.trim() === "") {
        return [];
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
        console.error("[TOSCA] Could not parse VITE_EXTERNAL_DATA_SOURCES", error);
        return [];
    }
}

export function getExternalDataSources(): ExternalDataSourceConfig[] {
    return parseExternalDataSources(import.meta.env.VITE_EXTERNAL_DATA_SOURCES);
}

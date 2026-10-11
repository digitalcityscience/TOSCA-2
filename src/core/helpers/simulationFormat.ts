import type { SimulationKpiChange, SimulationRunDetail, SimulationTime } from "@store/geosimulation";

export interface SimulationKpiRow {
    key: string;
    label: string;
    value: string;
    unit: string;
}

const UNIT_SUFFIXES = ["_min", "_s", "_km", "_m", "_kmh", "_percent"];
/** Display unit per metric-name suffix (longest suffixes first). */
const METRIC_UNITS: Array<[string, string]> = [
    ["_percent", "%"],
    ["_kmh", "km/h"],
    ["_min", "min"],
    ["_km", "km"],
    ["_s", "s"],
    ["_m", "m"],
];

export interface SimulationKpiChangeRow {
    key: string;
    label: string;
    unit: string;
    baseline: string;
    candidate: string;
    /** Signed change, e.g. `+2.77`. */
    delta: string;
    /** Signed percentage, e.g. `+4.7 %`, or empty when the baseline is 0. */
    percent: string;
    direction: "up" | "down" | "none";
}

/** `mean_trip_time_min` → `Mean trip time` (the unit is shown separately). */
export function humanizeMetric(key: string): string {
    const withoutUnit = UNIT_SUFFIXES.reduce(
        (name, suffix) => (name.endsWith(suffix) ? name.slice(0, -suffix.length) : name),
        key
    );
    const words = withoutUnit.replaceAll("_", " ").trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
}

export function formatNumber(value: number, locale: string): string {
    const digits = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2;
    return new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value);
}

/**
 * Headline figures: `kpis` values with units from the `kpis` table output
 * (`metric, value, unit`) when the run has one.
 */
export function simulationKpiRows(run: Pick<SimulationRunDetail, "kpis" | "outputs">, locale: string): SimulationKpiRow[] {
    const units = new Map<string, string>();
    const table = run.outputs.find((output) => output.kind === "table" && output.role === "kpis");
    if (table?.kind === "table") {
        const metric = table.data.columns.indexOf("metric");
        const unit = table.data.columns.indexOf("unit");
        if (metric >= 0 && unit >= 0) {
            table.data.rows.forEach((row) => units.set(String(row[metric]), String(row[unit] ?? "")));
        }
    }
    return Object.entries(run.kpis).map(([key, value]) => {
        const unit = units.get(key) ?? "";
        return {
            key,
            label: humanizeMetric(key),
            value: formatNumber(value, locale),
            unit: unit === "count" ? "" : unit,
        };
    });
}

/** Unit implied by a metric name (`mean_trip_time_min` → `min`), or empty. */
export function unitForMetric(metric: string): string {
    return METRIC_UNITS.find(([suffix]) => metric.endsWith(suffix))?.[1] ?? "";
}

function formatSigned(value: number, locale: string): string {
    const text = formatNumber(Math.abs(value), locale);
    if (text === formatNumber(0, locale)) return text;
    return `${value > 0 ? "+" : "−"}${text}`;
}

/** KPI changes of a comparison as display rows, in the order the backend sends them. */
export function simulationKpiChangeRows(changes: SimulationKpiChange[], locale: string): SimulationKpiChangeRow[] {
    return changes.map((change) => {
        const delta = formatSigned(change.delta, locale);
        const unchanged = delta === formatNumber(0, locale);
        return {
            key: change.metric,
            label: humanizeMetric(change.metric),
            unit: unitForMetric(change.metric),
            baseline: formatNumber(change.baseline, locale),
            candidate: formatNumber(change.candidate, locale),
            delta,
            percent: change.delta_percent === null || unchanged
                ? ""
                : `${formatSigned(change.delta_percent, locale)} %`,
            direction: unchanged ? "none" : change.delta > 0 ? "up" : "down",
        };
    });
}

/** `11:00 – 14:14 (Europe/Berlin), 8 Sept 2026` in the run's own timezone. */
export function formatSimulatedTime(time: SimulationTime, locale: string): string {
    if (time.start === null || time.end === null) return "";
    const zone = { timeZone: time.timezone };
    const clock = new Intl.DateTimeFormat(locale, { ...zone, hour: "2-digit", minute: "2-digit" });
    const day = new Intl.DateTimeFormat(locale, { ...zone, dateStyle: "medium" });
    const start = new Date(time.start);
    const end = new Date(time.end);
    return `${clock.format(start)} – ${clock.format(end)}, ${day.format(start)} (${time.timezone})`;
}

/** Readable parameter values: numbers and text as is, objects as compact JSON. */
export function formatParameter(value: unknown, locale: string): string {
    if (value === null || value === undefined) return "—";
    if (typeof value === "number") return new Intl.NumberFormat(locale).format(value);
    if (typeof value === "boolean") return value ? "✓" : "✗";
    if (typeof value === "string") return value;
    return JSON.stringify(value);
}

/** Wall-clock time of a replay moment (seconds since `start`) in the run's timezone. */
export function formatReplayClock(start: string | null, seconds: number, timezone: string, locale: string): string {
    if (start === null) return "";
    const moment = new Date(Date.parse(start) + seconds * 1000);
    return new Intl.DateTimeFormat(locale, {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    }).format(moment);
}

/** Replay length as `3 h 14 min`. */
export function formatDuration(seconds: number): string {
    const minutes = Math.round(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return hours > 0 ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
}

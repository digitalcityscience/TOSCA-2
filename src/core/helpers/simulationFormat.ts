import type { SimulationRunDetail, SimulationTime } from "@store/geosimulation";

export interface SimulationKpiRow {
    key: string;
    label: string;
    value: string;
    unit: string;
}

const UNIT_SUFFIXES = ["_min", "_s", "_km", "_m", "_kmh", "_percent"];

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

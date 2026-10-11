import { resolveSimulationLabel, type SimulationLegend } from "@store/geosimulation";

export type SimulationLegendMark = "circle" | "line" | "fill" | "gradient";

export interface SimulationLegendRow {
    key: string;
    label: string;
    mark: SimulationLegendMark;
    color: string;
    /** Circle radius or line width in px (proportional legends). */
    size?: number;
}

const FALLBACK_COLOR = "#64748b";

function markForGeometry(geometry: string): SimulationLegendMark {
    const base = geometry.replace(/^Multi/, "");
    if (base === "Point") return "circle";
    if (base === "LineString") return "line";
    return "fill";
}

/** Flatten a simulation legend into display rows, labels in the UI language. */
export function simulationLegendRows(legend: SimulationLegend, locale: string): SimulationLegendRow[] {
    if (legend.type === "heatmap") {
        const colors = legend.colors ?? [];
        return [{
            key: "gradient",
            label: legend.items.map((item) => resolveSimulationLabel(item.label, locale)).join(" → "),
            mark: "gradient",
            color: colors.length > 1 ? `linear-gradient(90deg, ${colors.join(", ")})` : (colors[0] ?? FALLBACK_COLOR),
        }];
    }
    const mark = markForGeometry(legend.geometry);
    return legend.items.map((item, index) => ({
        key: `${index}`,
        label: resolveSimulationLabel(item.label, locale, String(item.value ?? "")),
        mark,
        color: item.color ?? legend.color ?? FALLBACK_COLOR,
        ...(legend.type === "proportional" && item.size !== undefined ? { size: item.size } : {}),
    }));
}

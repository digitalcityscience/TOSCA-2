import type { LegendSpec } from "../fifteenMinute/types";
import { BUILDING_SCALES, STREET_SCALES, localText, NO_DATA_COLOR, styleName, type WalkScale } from "./metrics";

export function walkLegend(scale: WalkScale): LegendSpec {
    const note = scale.direction === "higher-lower-concentration"
        ? localText("Higher values mean lower modelled recorded-crash concentration.", "Höhere Werte bedeuten eine geringere modellierte Konzentration erfasster Unfälle.")
        : scale.render === "positive-count-overlay"
            ? localText("The grey network has no assigned record in the selected years.", "Das graue Netz hat in den ausgewählten Jahren keinen zugeordneten Eintrag.")
            : undefined;
    return {
        styleName: styleName(scale.field), title: localText(`${scale.label.en} · ${scale.unit}`, `${scale.label.de} · ${scale.unit}`), kind: "classes",
        items: scale.values.map((value, i) => ({
            color: scale.colors[i], ...(typeof value === "number" ? { value } : {}),
            label: scale.labels?.[i] ?? localText(i < scale.values.length - 1
                ? `${value} – < ${scale.values[i + 1]}` : scale.max === undefined ? `≥ ${value}` : `${value} – ${scale.max}`),
        })),
        noData: { color: NO_DATA_COLOR, label: localText("No data / unknown / invalid", "Keine Daten / unbekannt / ungültig") },
        ...(note === undefined ? {} : { note }),
    };
}

export function walkLegendFor(field: string | undefined): LegendSpec | undefined {
    const scale = [...STREET_SCALES, ...BUILDING_SCALES].find((item) => item.field === field);
    return scale === undefined ? undefined : walkLegend(scale);
}

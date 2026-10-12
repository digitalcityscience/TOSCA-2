import metadata from "./metadata.json";
import type { Localized, MetricOption } from "../../types";
import { CAVEATS } from "../../metrics";

export type WalkMetric = keyof typeof metadata;
export interface WalkScale {
    field: WalkMetric;
    label: Localized;
    unit: string;
    /** Lower inclusive class bounds, or exact categorical codes. */
    values: Array<number | string>;
    colors: string[];
    labels?: Localized[];
    max?: number;
    integer?: boolean;
    /** Exact-count data are zero-heavy: show a neutral network, then only positive records. */
    render?: "positive-count-overlay";
    direction: "higher-comfort" | "higher-lower-concentration" | "higher-steeper" | "higher-more-crashes" | "categorical" | "coverage";
}

export const NO_DATA_COLOR = "#64748b";
export const localText = (en: string, de = en): Localized & Record<string, string> => ({ en, de });
export const styleName = (field: string): string => `frontend:walkability:${field}`;
const comfortColors = ["#ad472b", "#d88a39", "#c5bd83", "#42978b", "#00695c"];
const safetyColors = ["#922b57", "#ce6580", "#c9b4cf", "#688cbd", "#244c83"];
const score = (field: WalkMetric, en: string, de: string, colors = comfortColors): WalkScale => ({
    field, label: localText(en, de), unit: "points / Punkte (0–100)", values: [0, 20, 40, 60, 80], colors, max: 100,
    direction: field.startsWith("safety_") ? "higher-lower-concentration" : "higher-comfort",
});

export const STREET_SCALES: WalkScale[] = [
    score("comfort_score", "Walking comfort", "Gehkomfort"),
    {
        field: "has_sidewalk", label: localText("Sidewalk classification", "Gehweg-Klassifikation"), unit: "OSM",
        values: ["not_applicable", "separate", "yes", "no"], colors: ["#006d77", "#6654a2", "#287ab5", "#bb5933"], direction: "categorical",
        labels: [localText("Pedestrian way itself", "Eigenständiger Fußweg"), localText("Sidewalk mapped separately", "Separat kartierter Gehweg"), localText("Sidewalk indicated", "Gehweg angegeben"), localText("No sidewalk tagged", "Kein Gehweg laut Tag")],
    },
    {
        field: "slope_dem_abs_mean_pct", label: localText("Mean absolute street grade", "Mittlere absolute Steigung"), unit: "%",
        values: [0, 3, 6, 10, 15], colors: ["#a68f24", "#d7a62d", "#db7436", "#c84b3c", "#7b1e3d"], direction: "higher-steeper",
    },
    score("comfort_shade", "Tree shade potential (proxy)", "Schattenpotenzial (Proxy)", ["#9c7a3e", "#78a06a", "#438f78", "#167b7b", "#07596c"]),
    score("safety_index", "Recorded-crash concentration index", "Index der erfassten Unfallkonzentration", safetyColors),
    {
        field: "n_accidents_vru_5y", label: localText("Recorded crashes involving people walking or cycling", "Erfasste Unfälle mit Fuß- oder Radverkehr"),
        unit: "records / Einträge (2019, 2022–2025)", values: [1, 2, 3], colors: ["#e4b43c", "#df7d32", "#b84035"],
        labels: [localText("1 recorded crash", "1 erfasster Unfall"), localText("2 recorded crashes", "2 erfasste Unfälle"), localText("3 or more recorded crashes", "3 oder mehr erfasste Unfälle")],
        integer: true, direction: "higher-more-crashes", render: "positive-count-overlay",
    },
    ...(["ped", "bike"] as const).map((mode): WalkScale => ({
        field: `n_accidents_${mode}_5y`, label: mode === "ped" ? localText("Pedestrian accidents", "Fußgängerunfälle") : localText("Bicycle accidents", "Radunfälle"),
        unit: "records / Einträge (2019, 2022–2025)", values: [1, 2, 3], colors: ["#e4b43c", "#df7d32", "#b84035"],
        labels: [localText("1 recorded crash", "1 erfasster Unfall"), localText("2 recorded crashes", "2 erfasste Unfälle"), localText("3 or more recorded crashes", "3 oder mehr erfasste Unfälle")],
        integer: true, direction: "higher-more-crashes", render: "positive-count-overlay",
    })),
    {
        field: "accident_rate_smoothed", label: localText("Smoothed accident concentration", "Geglättete Unfallkonzentration"),
        unit: "accidents/km · 5 selected years / Unfälle/km · 5 ausgewählte Jahre", values: [0, 4, 8, 16, 32],
        colors: ["#a477a8", "#92588e", "#7d3c7b", "#642563", "#451344"], direction: "higher-more-crashes",
    },
    {
        field: "comfort_class", label: localText("Walking comfort class", "Gehkomfort-Klasse"), unit: "class / Klasse",
        values: ["very_low", "low", "moderate", "good", "very_good"], colors: comfortColors, direction: "categorical",
        labels: [localText("Very low", "Sehr niedrig"), localText("Low", "Niedrig"), localText("Moderate", "Mittel"), localText("Good", "Gut"), localText("Very good", "Sehr gut")],
    },
    score("comfort_slope", "Slope comfort", "Steigungskomfort"),
    score("comfort_surface", "Surface comfort", "Oberflächenkomfort"),
    score("comfort_lighting", "Lighting comfort", "Beleuchtungskomfort"),
    score("comfort_crossing", "Crossing comfort", "Querungskomfort"),
    score("comfort_street", "Street-environment comfort", "Straßenumfeldkomfort"),
];

export const BUILDING_SCALES: WalkScale[] = [
    score("safety_index_400m", "Safety index within 400 m walking distance", "Sicherheitsindex in 400 m Gehentfernung", safetyColors),
    score("comfort_mean_400m", "Mean comfort within 400 m walking distance", "Mittlerer Komfort in 400 m Gehentfernung"),
    {
        field: "comfort_scored_share_400m", label: localText("Share of reachable streets with comfort data", "Anteil erreichbarer Wege mit Komfortdaten"),
        unit: "share / Anteil (0–1)", values: [0, 0.2, 0.4, 0.6, 0.8], max: 1,
        colors: ["#f2f0f7", "#cbc9e2", "#9e9ac8", "#756bb1", "#54278f"], direction: "coverage",
    },
    {
        field: "safety_covered_len_400m_m", label: localText("Street length used for the safety index", "Weglänge für den Sicherheitsindex"),
        unit: "m", values: [0, 500, 1000, 2000, 4000],
        colors: ["#ffffd4", "#fed98e", "#fe9929", "#d95f0e", "#993404"], direction: "coverage",
    },
];

/** Short, task-focused text for the map. Full source definitions remain in the implementation document. */
export function plainMetricDescription(field: WalkMetric): Localized & Record<string, string> {
    const text: Partial<Record<WalkMetric, Localized & Record<string, string>>> = {
        comfort_score: localText("One overall score based on sidewalks, slope, surface, lighting, shade and crossings.", "Ein Gesamtwert aus Gehwegen, Steigung, Oberfläche, Beleuchtung, Schatten und Querungen."),
        has_sidewalk: localText("Shows what OpenStreetMap says about the sidewalk on this street.", "Zeigt, was OpenStreetMap über den Gehweg an dieser Straße sagt."),
        slope_dem_abs_mean_pct: localText("Shows how steep the street is on average. A larger percent means a steeper walk.", "Zeigt die durchschnittliche Steigung. Ein größerer Prozentwert bedeutet einen steileren Weg."),
        comfort_shade: localText("Shows likely shade from nearby trees and land use. It is not measured shade.", "Zeigt wahrscheinlichen Schatten aus nahen Bäumen und Landnutzung. Es ist kein gemessener Schatten."),
        safety_index: localText("Shows recorded crashes after the model adjusts for very short street sections.", "Zeigt erfasste Unfälle, nachdem das Modell sehr kurze Straßenabschnitte ausgleicht."),
        n_accidents_ped_5y: localText("Number of recorded pedestrian crashes in the selected five years.", "Anzahl erfasster Fußgängerunfälle in den ausgewählten fünf Jahren."),
        n_accidents_bike_5y: localText("Number of recorded bicycle crashes in the selected five years.", "Anzahl erfasster Radunfälle in den ausgewählten fünf Jahren."),
        n_accidents_vru_5y: localText("Number of recorded crashes involving a person walking or cycling. A crash involving both is counted once.", "Anzahl erfasster Unfälle mit Fuß- oder Radverkehr. Ein Unfall mit beiden wird einmal gezählt."),
        accident_rate_smoothed: localText("Recorded crashes per kilometre after the model smooths short sections.", "Erfasste Unfälle pro Kilometer, nachdem das Modell kurze Abschnitte ausgleicht."),
        comfort_scored_share_400m: localText("Share of reachable walking-network length with a comfort score. This measures data coverage, not comfort.", "Anteil der erreichbaren Weglänge mit Komfortwert. Dies zeigt Datenabdeckung, nicht Gehkomfort."),
        safety_covered_len_400m_m: localText("Total scored street length within the 400 m walking catchment. This measures the network used, not safety or walking distance.", "Gesamte bewertete Weglänge im 400-m-Einzugsbereich. Dies zeigt den Umfang des verwendeten Netzes, nicht Sicherheit oder Gehentfernung."),
        safety_index_400m: localText("Length-weighted recorded-crash concentration index for streets reachable within a 400-metre walk. Higher values mean lower modelled crash concentration.", "Längengewichteter Unfallkonzentrationsindex der in 400 Metern zu Fuß erreichbaren Straßen. Höhere Werte bedeuten eine geringere modellierte Unfallkonzentration."),
        comfort_mean_400m: localText("Length-weighted mean walking comfort of streets reachable within a 400-metre walk. Higher values mean greater comfort.", "Längengewichteter mittlerer Gehkomfort der in 400 Metern zu Fuß erreichbaren Straßen. Höhere Werte bedeuten mehr Komfort."),
    };
    return text[field] ?? localText(`Shows the ${field.replaceAll("_", " ")} value for this street.`, `Zeigt den Wert ${field.replaceAll("_", " ")} für diese Straße.`);
}

export function metricOptions(scales: WalkScale[]): MetricOption[] {
    return scales.map((scale) => ({
        key: scale.field, attribute: scale.field, label: scale.label, unit: localText(scale.unit),
        styleName: styleName(scale.field), styleSource: "frontend",
        nullMeaning: localText(metadata[scale.field].null_semantics),
        caveats: [CAVEATS.modelled, plainMetricDescription(scale.field)],
    }));
}

export { metadata };

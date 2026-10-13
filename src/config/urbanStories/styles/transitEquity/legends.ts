import type { Localized } from "../../types";
import {
    AGREEMENT_COLORS,
    COVERAGE_COLORS,
    DEPARTURE_CLASSES,
    DEPARTURE_INCOMPLETE_COLOR,
    DEPARTURE_ZERO_COLOR,
    FAMILY_COLORS,
    MATCH_COLOR,
    NO_DATA_AREA_COLOR,
    NO_DATA_COLOR,
    NO_MATCH_COLOR,
    OTHER_BUILDING_COLOR,
    OUTSIDE_SHARE_STOPS,
    WALK_THRESHOLD_MIN,
    type BuildingView,
    type LegendRow,
} from "./constants";

/**
 * Legends are derived from the same constants as the expressions. Classed legends list every class; the
 * continuous ones (outside share, walking time) draw a gradient with labelled ticks.
 */
export interface EquityLegend {
    id: string;
    title: Localized;
    kind: "classes" | "gradient";
    rows: LegendRow[];
    /** Gradient stops, low to high, `position` 0–1 along the bar. */
    gradient?: { position: number; color: string; label: Localized }[];
    /** Rows for "no value" states, drawn below the classes or the gradient. */
    special: LegendRow[];
    note: Localized;
}

const pct = (value: number): string => `${Math.round(value * 100)} %`;

const OTHER_ROW: LegendRow = {
    color: OTHER_BUILDING_COLOR,
    label: { en: "Other buildings (not housing)", de: "Andere Gebäude (kein Wohnen)" },
    detail: { en: "Not part of the residential statistic", de: "Nicht Teil der Wohngebäude-Statistik" },
};

export function adminOutsideLegend(): EquityLegend {
    const last = OUTSIDE_SHARE_STOPS[OUTSIDE_SHARE_STOPS.length - 1].value;
    return {
        id: "admin-outside",
        title: { en: "Housing buildings outside official catchments", de: "Wohngebäude außerhalb amtlicher Einzugsbereiche" },
        kind: "gradient",
        rows: [],
        gradient: OUTSIDE_SHARE_STOPS.map((stop) => ({
            position: stop.value / last,
            color: stop.color,
            label: { en: stop.value === last ? `≥ ${pct(stop.value)}` : pct(stop.value), de: stop.value === last ? `≥ ${pct(stop.value)}` : pct(stop.value) },
        })),
        special: [{ color: NO_DATA_AREA_COLOR, label: { en: "No value (no housing buildings)", de: "Kein Wert (keine Wohngebäude)" } }],
        note: {
            en: "Share of an area's housing buildings (ALKIS 1000/1010/1020) whose location lies outside every official HVV catchment. Darker = more buildings outside. A share of buildings, not of people.",
            de: "Anteil der Wohngebäude (ALKIS 1000/1010/1020) eines Gebiets, die außerhalb aller amtlichen HVV-Einzugsbereiche liegen. Dunkler = mehr Gebäude außerhalb. Ein Anteil an Gebäuden, nicht an Menschen.",
        },
    };
}

function coverageLegend(): EquityLegend {
    return {
        id: "coverage",
        title: BUILDING_TITLES.coverage,
        kind: "classes",
        rows: [
            { color: COVERAGE_COLORS.inside, label: { en: "Inside an official HVV catchment", de: "Im amtlichen HVV-Einzugsbereich" } },
            { color: COVERAGE_COLORS.outside, label: { en: "Outside every official catchment", de: "Außerhalb aller Einzugsbereiche" } },
        ],
        special: [OTHER_ROW],
        note: {
            en: "A building counts as inside when its label point lies in a bus (480 m), rail (720 m) or ferry catchment published by the city. Coverage is a distance rule, not a measure of service.",
            de: "Ein Gebäude liegt innerhalb, wenn sein Bezugspunkt in einem von der Stadt veröffentlichten Bus- (480 m), Bahn- (720 m) oder Fähr-Einzugsbereich liegt. Abdeckung ist eine Distanzregel, kein Maß für das Angebot.",
        },
    };
}

function agreementLegend(): EquityLegend {
    return {
        id: "agreement",
        title: BUILDING_TITLES.agreement,
        kind: "classes",
        rows: [
            { color: AGREEMENT_COLORS.both, label: { en: "Covered by both definitions", de: "Von beiden Definitionen abgedeckt" } },
            { color: AGREEMENT_COLORS.officialOnly, label: { en: "Official coverage only", de: "Nur amtlicher Einzugsbereich" }, detail: { en: `Inside a catchment, walk > ${WALK_THRESHOLD_MIN} min`, de: `Im Einzugsbereich, Fußweg > ${WALK_THRESHOLD_MIN} Min.` } },
            { color: AGREEMENT_COLORS.walkingOnly, label: { en: "Walking access only", de: "Nur Fußweg-Erreichbarkeit" }, detail: { en: `Outside every catchment, walk ≤ ${WALK_THRESHOLD_MIN} min`, de: `Außerhalb aller Einzugsbereiche, Fußweg ≤ ${WALK_THRESHOLD_MIN} Min.` } },
            { color: AGREEMENT_COLORS.neither, label: { en: "Neither", de: "Keine von beiden" } },
        ],
        special: [
            { color: NO_DATA_COLOR, label: { en: "No walking origin (not computable)", de: "Kein Gehnetz-Anschluss (nicht berechenbar)" } },
            OTHER_ROW,
        ],
        note: {
            en: `Walking access = modelled walking time to the nearest stop of any mode is at most ${WALK_THRESHOLD_MIN} minutes (the walking time of the 480 m bus radius). Neither definition is the truth: they use different networks, dates and assumptions.`,
            de: `Fußweg-Erreichbarkeit = modellierte Gehzeit zur nächsten Haltestelle jeder Art höchstens ${WALK_THRESHOLD_MIN} Minuten (die Gehzeit des 480-m-Bus-Radius). Keine Definition ist die Wahrheit: Sie nutzen verschiedene Netze, Stände und Annahmen.`,
        },
    };
}

function departureRows(): LegendRow[] {
    const label = (min: number, max: number | null): Localized => (
        max === null
            ? { en: `${min.toLocaleString("en")} or more`, de: `${min.toLocaleString("de")} oder mehr` }
            : { en: `${min.toLocaleString("en")}–${max.toLocaleString("en")}`, de: `${min.toLocaleString("de")}–${max.toLocaleString("de")}` }
    );
    return [
        { color: DEPARTURE_ZERO_COLOR, label: { en: "0: no departures within reach", de: "0: keine Abfahrten in Reichweite" }, detail: { en: "A real value, not missing data", de: "Ein echter Wert, keine fehlenden Daten" } },
        ...DEPARTURE_CLASSES.map((item) => ({ color: item.color, label: label(item.min, item.max) })),
    ];
}

function departuresLegend(): EquityLegend {
    return {
        id: "departures",
        title: BUILDING_TITLES.departures,
        kind: "classes",
        rows: departureRows(),
        special: [
            { color: DEPARTURE_INCOMPLETE_COLOR, label: { en: "Incomplete departure data (lower bound)", de: "Unvollständige Abfahrtsdaten (Untergrenze)" } },
            OTHER_ROW,
        ],
        note: {
            en: "Official daily departures summed over the distinct stops within reach of the building. The source does not state a reference period and the figure is not real time. Classes are used because the values are heavily skewed and 0 is its own state.",
            de: "Amtliche tägliche Abfahrten, summiert über die Haltestellen in Reichweite des Gebäudes. Die Quelle nennt keinen Bezugszeitraum, die Zahl ist keine Echtzeit. Klassen, weil die Werte stark schief verteilt sind und 0 ein eigener Zustand ist.",
        },
    };
}

function criteriaLegend(): EquityLegend {
    return {
        id: "criteria",
        title: BUILDING_TITLES.criteria,
        kind: "classes",
        rows: [
            { color: MATCH_COLOR, label: { en: "Matches all active criteria", de: "Erfüllt alle aktiven Kriterien" } },
            { color: NO_MATCH_COLOR, label: { en: "Housing building, does not match", de: "Wohngebäude, erfüllt sie nicht" } },
        ],
        special: [OTHER_ROW],
        note: {
            en: "Criteria are combined with AND. The thresholds are yours, not a standard. Counts refer to housing buildings.",
            de: "Kriterien werden mit UND verknüpft. Die Schwellen sind Ihre eigenen, kein Standard. Anzahlen beziehen sich auf Wohngebäude.",
        },
    };
}

const BUILDING_TITLES: Record<BuildingView, Localized> = {
    coverage: { en: "Inside an official catchment?", de: "Im amtlichen Einzugsbereich?" },
    agreement: { en: "Official catchment vs walking access", de: "Einzugsbereich und Fußweg-Erreichbarkeit" },
    departures: { en: "Daily departures within reach", de: "Tägliche Abfahrten in Reichweite" },
    criteria: { en: "Buildings matching your criteria", de: "Gebäude nach Ihren Kriterien" },
};

export function buildingLegend(view: BuildingView): EquityLegend {
    switch (view) {
        case "coverage": return coverageLegend();
        case "agreement": return agreementLegend();
        case "departures": return departuresLegend();
        case "criteria": return criteriaLegend();
    }
}

/** Stop areas and catchment outlines: nominal transport family; size encodes departures. */
export function stopsLegend(): EquityLegend {
    return {
        id: "stops",
        title: { en: "Official stop areas", de: "Amtliche Haltestellenbereiche" },
        kind: "classes",
        rows: [
            { color: FAMILY_COLORS.bus, label: { en: "Bus", de: "Bus" } },
            { color: FAMILY_COLORS.rail, label: { en: "Rail (U, S, regional, long distance)", de: "Bahn (U, S, Regional, Fern)" } },
            { color: FAMILY_COLORS.ferry, label: { en: "Ferry", de: "Fähre" } },
        ],
        special: [],
        note: {
            en: "Circle area ∝ official daily departures of the stop area (period not stated; not real time). Numbers inside are the distinct lines. Zoomed out, stop areas are grouped into clusters sized by their summed departures; the number is then the count of stop areas. Outlines of the same colours are the official catchments.",
            de: "Kreisfläche ∝ amtliche tägliche Abfahrten des Haltestellenbereichs (Zeitraum nicht angegeben; keine Echtzeit). Die Zahl im Kreis ist die Linienzahl. Beim Auszoomen werden Haltestellenbereiche zu Clustern, deren Größe die Summe der Abfahrten zeigt; die Zahl ist dann die Anzahl der Haltestellenbereiche. Umrisse derselben Farben sind die amtlichen Einzugsbereiche.",
        },
    };
}

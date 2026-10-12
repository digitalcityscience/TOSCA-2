import type { Localized } from "../../types";
import {
    AREA_CLASSES,
    AREA_CLASS_INFO,
    FEATURE_GROUPS,
    MINUTE_COLORS,
    MINUTE_LIMITS,
    MISSING_COLOR,
    NO_ORIGIN_COLOR,
    POI_COLOR,
    ZERO_SHARE_COLOR,
    shareScaleOf,
    styleNameOf,
    type AccessMeasure,
    type AdminMeasure,
    type AreaStyle,
    type FeatureStyle,
    type ShareScale,
} from "./constants";
import { measureText } from "./measures";

/**
 * Legends are derived from the same constants as the expressions, never typed a second time. The tests evaluate each
 * expression at a value inside every legend class and compare the colour.
 */

export type LegendShape = "fill" | "outline" | "dashed" | "icon" | "dot";

export interface GreenLegendItem {
    color: string;
    label: Localized;
    shape?: LegendShape;
    /** Upper limit (minutes) or lower limit (share) the colour stands for; absent for unbounded or special rows. */
    value?: number;
}

export interface GreenLegend {
    /** Same string as the local style name the legend belongs to. */
    styleName: string;
    title: Localized;
    items: GreenLegendItem[];
    /** Rows for buildings or areas without a value, when the style draws them. */
    noData: GreenLegendItem[];
    note?: Localized;
}

const text = (en: string, de: string): Localized => ({ en, de });

const format = (value: number, digits: number, locale: "en" | "de"): string => (
    value.toLocaleString(locale === "de" ? "de-DE" : "en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })
);

// --- walking minutes ---------------------------------------------------------------------------------------

export function minuteItems(): GreenLegendItem[] {
    const [a, b, c, d] = MINUTE_LIMITS;
    const labels = [
        text(`up to ${a} min`, `bis ${a} Min.`),
        text(`${a} – ${b} min`, `${a} – ${b} Min.`),
        text(`${b} – ${c} min`, `${b} – ${c} Min.`),
        text(`${c} – ${d} min`, `${c} – ${d} Min.`),
        text(`over ${d} min`, `über ${d} Min.`),
    ];
    return MINUTE_COLORS.map((color, index) => ({ color, label: labels[index], ...(index < MINUTE_LIMITS.length ? { value: MINUTE_LIMITS[index] } : {}) }));
}

// --- shares ---------------------------------------------------------------------------------------------------

export function shareItems(scale: ShareScale): GreenLegendItem[] {
    const percent = (value: number, locale: "en" | "de"): string => `${format(value * 100, value * 100 < 10 && value * 100 % 1 !== 0 ? 1 : 0, locale)} %`;
    const last = scale.colors.length - 1;
    const rows: GreenLegendItem[] = [{ color: ZERO_SHARE_COLOR, value: 0, label: text("0 % (none in the Stadtteil)", "0 % (keine im Stadtteil)") }];
    scale.colors.forEach((color, index) => {
        const lower = index === 0 ? undefined : scale.limits[index - 1];
        const upper = index === last ? undefined : scale.limits[index];
        const label = (locale: "en" | "de"): string => {
            if (lower === undefined) return `> 0 – ${percent(upper as number, locale)}`;
            if (upper === undefined) return `≥ ${percent(lower, locale)}`;
            return `${percent(lower, locale)} – ${percent(upper, locale)}`;
        };
        rows.push({ color, ...(lower === undefined ? {} : { value: lower }), label: text(label("en"), label("de")) });
    });
    return rows;
}

// --- buildings and Stadtteile ----------------------------------------------------------------------------------

const NO_ORIGIN = text("No value: the building has no walking origin (not computable)", "Kein Wert: Gebäude ohne Wegeanschluss (nicht berechenbar)");
const MISSING = text("No value", "Kein Wert");
const FEWER_THAN_FIVE = text("No value (fewer than 5 buildings)", "Kein Wert (weniger als 5 Gebäude)");

export function buildingLegend(measure: AccessMeasure): GreenLegend {
    const info = measureText(measure);
    return {
        styleName: styleNameOf("building", measure),
        title: text(`${info.label.en} (minutes)`, `${info.label.de} (Minuten)`),
        items: minuteItems(),
        noData: [{ color: NO_ORIGIN_COLOR, label: NO_ORIGIN }, { color: MISSING_COLOR, label: MISSING }],
        note: info.caution,
    };
}

export function adminLegend(measure: AdminMeasure): GreenLegend {
    const info = measureText(measure);
    const styleName = styleNameOf("admin", measure);
    if (measure === "park" || measure === "playground") {
        return {
            styleName,
            title: text(`${info.label.en}: median of the buildings (minutes)`, `${info.label.de}: Median der Gebäude (Minuten)`),
            items: minuteItems(),
            noData: [{ color: MISSING_COLOR, label: FEWER_THAN_FIVE }],
            note: info.adminMeaning,
        };
    }
    return {
        styleName,
        title: info.label,
        items: shareItems(shareScaleOf(measure) as ShareScale),
        noData: [{ color: MISSING_COLOR, label: FEWER_THAN_FIVE }],
        note: info.caution,
    };
}

// --- official green areas -----------------------------------------------------------------------------------

const classRow = (id: typeof AREA_CLASSES[number], shape: LegendShape = "fill"): GreenLegendItem => ({
    color: AREA_CLASS_INFO[id].color, label: AREA_CLASS_INFO[id].label, shape,
});

const PLAYGROUND_ICON_ROW: GreenLegendItem = { color: AREA_CLASS_INFO.playground.ink, label: text("Playground symbol", "Spielplatzsymbol"), shape: "icon" };

export function areaLegend(style: AreaStyle): GreenLegend | undefined {
    const styleName = styleNameOf("areas", style);
    switch (style) {
        case "classes":
            return {
                styleName,
                title: text("Official green areas by class", "Amtliche Grünflächen nach Klasse"),
                items: [...AREA_CLASSES.map((id) => classRow(id)), PLAYGROUND_ICON_ROW],
                noData: [],
                note: text(
                    "Digitaler Grünplan, class derived from the official category. A green polygon is not automatically a freely usable park.",
                    "Digitaler Grünplan, Klasse aus der amtlichen Kategorie abgeleitet. Eine grüne Fläche ist nicht automatisch ein frei nutzbarer Park."
                )
            };
        case "focus-park":
            return {
                styleName,
                title: text("Official green areas", "Amtliche Grünflächen"),
                items: [
                    { color: AREA_CLASS_INFO.recreational_park.color, label: text("The park in focus", "Der Park im Fokus"), shape: "fill" },
                    { color: "#9aa59d", label: text("Other official green areas (faded)", "Andere amtliche Grünflächen (abgeblendet)"), shape: "fill" },
                ],
                noData: [],
            };
        case "parks-only":
            return { styleName, title: text("Official green areas", "Amtliche Grünflächen"), items: [classRow("recreational_park")], noData: [] };
        case "playgrounds-only":
            return { styleName, title: text("Official green areas", "Amtliche Grünflächen"), items: [classRow("playground"), PLAYGROUND_ICON_ROW], noData: [] };
        case "access-both":
            return {
                styleName,
                title: text("Destinations", "Ziele"),
                items: [
                    { color: AREA_CLASS_INFO.recreational_park.ink, label: text("Official park (outlined)", "Offizieller Park (umrandet)"), shape: "outline" },
                    classRow("playground"),
                    PLAYGROUND_ICON_ROW,
                ],
                noData: [],
            };
        default:
            return undefined;
    }
}

// --- detailed objects and the OSM comparison ------------------------------------------------------------------------

export function featureLegend(style: FeatureStyle): GreenLegend | undefined {
    if (style === "none") return undefined;
    if (style === "play") {
        return {
            styleName: styleNameOf("feature-polygon", style),
            title: text("Mapped sports and play surfaces", "Kartierte Sport- und Spielflächen"),
            items: [{ color: FEATURE_GROUPS[1].color, label: text("Sports and play surface (Feinkartierung)", "Sport- und Spielfläche (Feinkartierung)"), shape: "fill" }],
            noData: [],
            note: text(
                "A mapped surface inside a green area. It is not an official playground polygon and says nothing about equipment or use.",
                "Eine kartierte Fläche innerhalb einer Grünfläche. Sie ist kein offizielles Spielplatzpolygon und sagt nichts über Ausstattung oder Nutzung."
            ),
        };
    }
    return {
        styleName: styleNameOf("feature-polygon", style),
        title: text("Detailed green objects (Feinkartierung Grün)", "Detaillierte Grünobjekte (Feinkartierung Grün)"),
        items: FEATURE_GROUPS.map((group) => ({ color: group.color, label: group.label, shape: "fill" as const })),
        noData: [],
        note: text(
            "Official level-0 categories. Mapped objects, not verified facilities, public entrances or routes. Some objects are mapped more than once.",
            "Amtliche Kategorien der Ebene 0. Kartierte Objekte, keine geprüften Einrichtungen, öffentlichen Eingänge oder Wege. Einige Objekte sind mehrfach erfasst."
        ),
    };
}

export const POI_LEGEND_ITEM: GreenLegendItem = {
    color: POI_COLOR,
    label: text("Parks from OpenStreetMap / ALKIS (a different source, not merged with the official areas)", "Parks aus OpenStreetMap / ALKIS (andere Quelle, nicht mit den amtlichen Flächen verschmolzen)"),
    shape: "dashed",
};

import type { Localized } from "../../types";
import {
    ACCESS_SCALE,
    CATEGORY_LABELS,
    COMFORT_SCALE,
    GREEN_SCALE,
    NONE_COLOR,
    NO_DATA_COLOR,
    PARK_MINUTE_LIMITS,
    RAMPS,
    SAFETY_SCALE,
    SHARE_SCALE,
    categoryOfMeasure,
    styleNameOf,
    type ClassScale,
    type MeasureId,
} from "./constants";
import { measureInfo } from "./measures";
import type { LegendItem, LegendSpec } from "./types";

/**
 * Legends are derived from the same constants as the expressions, never typed a second time. The tests evaluate
 * each expression at a value inside every legend class and compare the colour.
 */

const format = (value: number, digits: number, locale: "en" | "de"): string => (
    value.toLocaleString(locale === "de" ? "de-DE" : "en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })
);

const text = (en: string, de: string): Localized => ({ en, de });

/**
 * Class rows of a lower-inclusive scale. With `ceiling` the first class starts at 0 and the last ends at the ceiling;
 * without it they read "< limit" and "≥ limit". A `zero` row is a real zero with a class of its own, so the first
 * remaining class then starts above 0.
 */
function scaleItems(scale: ClassScale, options: { percent?: boolean; zero?: Localized; zeroColor?: string; ceiling?: number } = {}): LegendItem[] {
    const { percent = false, ceiling } = options;
    const factor = percent ? 100 : 1;
    const suffix = percent ? " %" : "";
    const num = (value: number, locale: "en" | "de"): string => `${format(value * factor, scale.digits, locale)}${suffix}`;
    const hasZero = options.zero !== undefined && options.zeroColor !== undefined;
    const items: LegendItem[] = [];
    if (options.zero !== undefined && options.zeroColor !== undefined) items.push({ color: options.zeroColor, value: 0, label: options.zero });
    const last = scale.colors.length - 1;
    scale.colors.forEach((color, index) => {
        const lower = index === 0 ? undefined : scale.limits[index - 1];
        const upper = index === last ? undefined : scale.limits[index];
        const label = (locale: "en" | "de"): string => {
            if (lower === undefined && upper !== undefined) {
                if (hasZero) return `> 0 – ${num(upper, locale)}`;
                return ceiling === undefined ? `< ${num(upper, locale)}` : `0 – ${num(upper, locale)}`;
            }
            if (lower !== undefined && upper === undefined) return ceiling === undefined ? `≥ ${num(lower, locale)}` : `${num(lower, locale)} – ${num(ceiling, locale)}`;
            return `${num(lower ?? 0, locale)} – ${num(upper ?? 0, locale)}`;
        };
        items.push({ color, ...(lower === undefined ? {} : { value: lower }), label: text(label("en"), label("de")) });
    });
    return items;
}

const noValue = (en: string, de: string): LegendItem => ({ color: NO_DATA_COLOR, label: text(en, de) });

const NO_VALUE_BUILDING = noValue("No value (no walking origin or not computable)", "Kein Wert (kein Wegeanschluss oder nicht berechenbar)");
const NO_VALUE_AREA = noValue("No value (fewer than 5 buildings)", "Kein Wert (weniger als 5 Gebäude)");

const LOW_CONFIDENCE_NOTE = text(
    "A magenta outline marks buildings with low data confidence (poor network connection).",
    "Eine magentafarbene Umrandung kennzeichnet Gebäude mit geringer Datenverlässlichkeit (schlechter Netzanschluss)."
);

function minuteItems(): LegendItem[] {
    return [
        { color: RAMPS.minutes[0], value: 5, label: text("up to 5 min", "bis 5 Min.") },
        { color: RAMPS.minutes[1], value: 10, label: text("5 – 10 min", "5 – 10 Min.") },
        { color: RAMPS.minutes[2], value: 15, label: text("10 – 15 min", "10 – 15 Min.") },
        { color: NONE_COLOR, value: 0, label: text("none within 15 min", "keines in 15 Min.") },
    ];
}

function parkMinuteItems(): LegendItem[] {
    const [a, b, c, d] = PARK_MINUTE_LIMITS;
    const labels = [
        text(`up to ${a} min`, `bis ${a} Min.`),
        text(`${a} – ${b} min`, `${a} – ${b} Min.`),
        text(`${b} – ${c} min`, `${b} – ${c} Min.`),
        text(`${c} – ${d} min`, `${c} – ${d} Min.`),
        text(`over ${d} min`, `über ${d} Min.`),
    ];
    return RAMPS.greenMinutes.map((color, index) => ({ color, label: labels[index] }));
}

export function legendFor(level: "building" | "admin", measure: MeasureId): LegendSpec {
    const info = measureInfo(measure);
    const styleName = styleNameOf(level, measure);
    const area = level === "admin";
    const category = categoryOfMeasure(measure);
    if (category !== undefined) {
        return area
            ? {
                styleName,
                title: text(`${CATEGORY_LABELS[category].en}: share of buildings reaching it within 15 min`, `${CATEGORY_LABELS[category].de}: Anteil der Gebäude mit Zugang in 15 Min.`),
                kind: "classes",
                items: scaleItems(SHARE_SCALE, { percent: true, zero: text("0 % (no building reaches it)", "0 % (kein Gebäude erreicht es)"), zeroColor: NONE_COLOR, ceiling: 1 }),
                noData: NO_VALUE_AREA,
                note: info.adminMeaning,
            }
            : {
                styleName,
                title: text(`${CATEGORY_LABELS[category].en}: walking minutes to the nearest place`, `${CATEGORY_LABELS[category].de}: Gehminuten zum nächsten Ziel`),
                kind: "classes",
                items: minuteItems(),
                noData: NO_VALUE_BUILDING,
                note: info.caution,
            };
    }
    switch (measure) {
        case "access":
            return {
                styleName,
                title: text(area ? "Overall accessibility, Stadtteil mean (0–100)" : "Overall accessibility (0–100)", area ? "Gesamterreichbarkeit, Mittel je Stadtteil (0–100)" : "Gesamterreichbarkeit (0–100)"),
                kind: "classes",
                items: scaleItems(ACCESS_SCALE, { ceiling: 100 }),
                noData: area ? NO_VALUE_AREA : NO_VALUE_BUILDING,
                note: area ? info.adminMeaning : LOW_CONFIDENCE_NOTE,
            };
        case "comfort":
            return {
                styleName,
                title: text(area ? "Walking comfort, Stadtteil mean (0–100)" : "Walking comfort within 400 m (0–100)", area ? "Gehkomfort, Mittel je Stadtteil (0–100)" : "Gehkomfort in 400 m (0–100)"),
                kind: "classes",
                items: scaleItems(COMFORT_SCALE),
                noData: area ? NO_VALUE_AREA : NO_VALUE_BUILDING,
                note: text("Higher = more comfortable. Classes follow where the values lie (most buildings score 73–87).", "Höher = komfortabler. Die Klassen folgen der Verteilung der Werte (die meisten Gebäude liegen bei 73–87)."),
            };
        case "safety":
            return {
                styleName,
                title: text(area ? "Safety index, Stadtteil mean (0–100)" : "Safety index within 400 m (0–100)", area ? "Sicherheitsindex, Mittel je Stadtteil (0–100)" : "Sicherheitsindex in 400 m (0–100)"),
                kind: "classes",
                items: scaleItems(SAFETY_SCALE),
                noData: area ? NO_VALUE_AREA : NO_VALUE_BUILDING,
                note: text("Higher = lower recorded-crash concentration. Classes follow where the values lie (most buildings score 28–40).", "Höher = geringere Konzentration erfasster Unfälle. Die Klassen folgen der Verteilung der Werte (die meisten Gebäude liegen bei 28–40)."),
            };
        case "green":
            return {
                styleName,
                title: text(area ? "Large green space, Stadtteil mean (0–100)" : "Large green space within reach (0–100)", area ? "Große Grünfläche, Mittel je Stadtteil (0–100)" : "Große Grünfläche in Reichweite (0–100)"),
                kind: "classes",
                items: area
                    ? scaleItems(GREEN_SCALE, { ceiling: 100 })
                    : scaleItems(GREEN_SCALE, { ceiling: 100, zero: text("0 (none within 15 min)", "0 (keine in 15 Min.)"), zeroColor: NONE_COLOR }),
                noData: area ? NO_VALUE_AREA : NO_VALUE_BUILDING,
                note: info.caution,
            };
        default:
            return {
                styleName,
                title: text(area ? "Official park: median walking minutes" : "Official park: walking minutes", area ? "Offizieller Park: Median der Gehminuten" : "Offizieller Park: Gehminuten"),
                kind: "classes",
                items: parkMinuteItems(),
                noData: area ? NO_VALUE_AREA : NO_VALUE_BUILDING,
                note: info.caution,
            };
    }
}

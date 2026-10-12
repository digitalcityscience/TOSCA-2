import { ADMIN_METRIC_SCALES, ADMIN_NO_DATA_ITEM } from "./administrativeContext";
import { NO_DATA_LEGEND_ITEM, scoreLegendItems } from "./buildingAccessibility";
import { CATEGORY_DESCRIPTIONS, CATEGORY_FIELDS, CATEGORY_UNKNOWN_LEGEND_ITEM, categoryLegendItems } from "./categoryAccessibility";
import { POI_STYLES } from "./poiStyles";
import { FIFTEEN_MINUTE_CATEGORY_IDS, FRONTEND_STYLE_PREFIX, type AdministrativeMetric, type FifteenMinuteCategoryId, type LegendSpec } from "./types";

/**
 * Legends are derived from the same constants as the expressions, never typed a second time.
 * `legends.test.ts` evaluates each expression at every legend value and compares the colours.
 */
export const STYLE_NAMES = {
    overall: `${FRONTEND_STYLE_PREFIX}building:overall`,
    category: (id: FifteenMinuteCategoryId): string => `${FRONTEND_STYLE_PREFIX}building:category:${id}`,
    admin: (metric: AdministrativeMetric): string => `${FRONTEND_STYLE_PREFIX}admin:${metric}`,
    poi: (id: FifteenMinuteCategoryId): string => `${FRONTEND_STYLE_PREFIX}poi:${id}`,
} as const;

export function overallLegend(): LegendSpec {
    return {
        styleName: STYLE_NAMES.overall,
        title: { en: "Categories reached within 15 minutes (0–9)", de: "Erreichte Kategorien in 15 Minuten (0–9)" },
        kind: "ramp",
        rampEnds: {
            low: { en: "0 = none of the nine within 15 min", de: "0 = keine der neun in 15 Min." },
            high: { en: "9 = all nine within 15 min", de: "9 = alle neun in 15 Min." },
        },
        items: scoreLegendItems(),
        noData: NO_DATA_LEGEND_ITEM,
        note: {
            en: "Colour = how many of the nine categories (listed below) have at least one place within a 15-minute walk of the building. A count from 0 to 9, not a percentage.",
            de: "Farbe = wie viele der neun Kategorien (siehe unten) mindestens ein Ziel in 15 Minuten zu Fuß vom Gebäude haben. Eine Anzahl von 0 bis 9, kein Prozentwert.",
        },
        categoriesTitle: { en: "The nine categories that are counted", de: "Die neun gezählten Kategorien" },
        categories: FIFTEEN_MINUTE_CATEGORY_IDS.map((id) => ({
            label: CATEGORY_FIELDS[id].label,
            description: CATEGORY_DESCRIPTIONS[id],
        })),
    };
}

export function categoryLegend(id: FifteenMinuteCategoryId): LegendSpec {
    return {
        styleName: STYLE_NAMES.category(id),
        title: {
            en: `${CATEGORY_FIELDS[id].label.en}: reachable within 15 minutes?`,
            de: `${CATEGORY_FIELDS[id].label.de}: in 15 Minuten erreichbar?`,
        },
        kind: "classes",
        items: categoryLegendItems(id),
        noData: CATEGORY_UNKNOWN_LEGEND_ITEM,
        note: {
            en: `Reachable = at least one place within a 15-minute walk. ${CATEGORY_FIELDS[id].label.en} includes: ${CATEGORY_DESCRIPTIONS[id].en}.`,
            de: `Erreichbar = mindestens ein Ziel in 15 Minuten zu Fuß. ${CATEGORY_FIELDS[id].label.de} umfasst: ${CATEGORY_DESCRIPTIONS[id].de}.`,
        },
    };
}

export function adminLegend(metric: AdministrativeMetric): LegendSpec {
    const scale = ADMIN_METRIC_SCALES[metric];
    return {
        styleName: STYLE_NAMES.admin(metric),
        title: scale.label,
        kind: "gradient",
        items: scale.stops.map((stop) => ({
            value: stop.value,
            color: stop.color,
            label: { en: String(stop.value), de: String(stop.value).replace(".", ",") },
        })),
        noData: ADMIN_NO_DATA_ITEM,
        note: scale.note,
    };
}

export function poiLegendColor(id: FifteenMinuteCategoryId): string {
    return POI_STYLES[id].color;
}

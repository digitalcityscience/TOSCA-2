import type { Localized } from "../../types";
import {
    CATEGORY_DESCRIPTIONS,
    CATEGORY_LABELS,
    FIELDS,
    ADMIN_FIELDS,
    categoryOfMeasure,
    shareField,
    walkMinField,
    type MeasureId,
} from "./constants";

/**
 * Names and plain-language meaning of every measure the map can show, from the R17 export metadata. The unit and the
 * reading direction are part of the text, because "higher" is better for four of the measures and worse for none,
 * but means "lower recorded-crash concentration" for the safety index.
 */
export interface MeasureInfo {
    id: MeasureId;
    /** Short name used on buttons and in the panel. */
    label: Localized;
    /** What the building value is. */
    meaning: Localized;
    /** Unit and range of the building value. */
    unit: Localized;
    /** How to read a larger number. */
    direction: Localized;
    /** Building field the colour is read from. */
    field: string;
    /** Stadtteil summary field of the same measure. */
    adminField: string;
    /** What the Stadtteil value is. */
    adminMeaning: Localized;
    /** Limitations the reader needs next to the map. */
    caution: Localized;
}

const SURROUNDING: Localized = {
    en: "It describes the street network around the building (within 400 m of walking), not the route to any particular destination. Modelled, not measured.",
    de: "Er beschreibt das Wegenetz rund um das Gebäude (bis 400 m Gehentfernung), nicht den Weg zu einem bestimmten Ziel. Modelliert, nicht gemessen.",
};

export function measureInfo(measure: MeasureId): MeasureInfo {
    const category = categoryOfMeasure(measure);
    if (category !== undefined) {
        const label = CATEGORY_LABELS[category];
        return {
            id: measure,
            label,
            meaning: {
                en: `Walking minutes from the building to the nearest ${label.en.toLowerCase()} place (${CATEGORY_DESCRIPTIONS[category].en}).`,
                de: `Gehminuten vom Gebäude zum nächsten Ziel der Kategorie ${label.de} (${CATEGORY_DESCRIPTIONS[category].de}).`,
            },
            unit: { en: "minutes, up to 15; orange = none within 15 min", de: "Minuten, bis 15; orange = keines in 15 Min." },
            direction: { en: "Fewer minutes = closer.", de: "Weniger Minuten = näher." },
            field: walkMinField(category),
            adminField: shareField(category),
            adminMeaning: {
                en: "Share of the Stadtteil's residential buildings with at least one place of this category within a 15-minute walk.",
                de: "Anteil der Wohngebäude des Stadtteils mit mindestens einem Ziel dieser Kategorie in 15 Minuten zu Fuß.",
            },
            caution: category === "health"
                ? {
                    en: "Health is a broad set of healthcare places. It does not show emergency care, available appointments or capacity.",
                    de: "Gesundheit ist eine breite Auswahl an Gesundheitsorten. Sie zeigt weder Notfallversorgung noch freie Termine noch Kapazität.",
                }
                : {
                    en: "Reachability of at least one place, not how many there are or how good they are.",
                    de: "Erreichbarkeit mindestens eines Ziels, nicht wie viele es gibt oder wie gut sie sind.",
                },
        };
    }
    switch (measure) {
        case "access":
            return {
                id: measure,
                label: { en: "Overall accessibility", de: "Gesamterreichbarkeit" },
                meaning: {
                    en: "Time-weighted score of the nine everyday categories: each category counts 100 up to 5 minutes of walking, falling linearly to 0 at 15 minutes; the nine are averaged with equal weight.",
                    de: "Zeitgewichteter Wert der neun Alltagskategorien: Jede Kategorie zählt 100 bis 5 Minuten Fußweg und fällt linear auf 0 bei 15 Minuten; die neun werden gleich gewichtet gemittelt.",
                },
                unit: { en: "points, 0–100", de: "Punkte, 0–100" },
                direction: { en: "Higher = more categories reachable, and sooner.", de: "Höher = mehr Kategorien erreichbar, und schneller." },
                field: FIELDS.decay,
                adminField: ADMIN_FIELDS.decayMean,
                adminMeaning: {
                    en: "Mean of the building score over the Stadtteil's residential buildings that have a score.",
                    de: "Mittelwert des Gebäudewerts über die Wohngebäude des Stadtteils mit Wert.",
                },
                caution: {
                    en: "Not the same as the count of categories reached (0–9). Building values are not weighted by residents.",
                    de: "Nicht dasselbe wie die Anzahl erreichter Kategorien (0–9). Gebäudewerte sind nicht nach Einwohnern gewichtet.",
                },
            };
        case "comfort":
            return {
                id: measure,
                label: { en: "Walking comfort", de: "Gehkomfort" },
                meaning: {
                    en: "Length-weighted mean comfort of the street network within 400 m of walking from the building. The street scores combine sidewalks, slope, surface, lighting, shade and crossings.",
                    de: "Längengewichteter mittlerer Komfort des Wegenetzes in 400 m Gehentfernung vom Gebäude. Die Straßenwerte verbinden Gehwege, Steigung, Oberfläche, Beleuchtung, Schatten und Querungen.",
                },
                unit: { en: "points, 0–100", de: "Punkte, 0–100" },
                direction: { en: "Higher = more comfortable.", de: "Höher = komfortabler." },
                field: FIELDS.comfort,
                adminField: ADMIN_FIELDS.comfortMean,
                adminMeaning: {
                    en: "Mean of the building values over the Stadtteil's residential buildings that have a value.",
                    de: "Mittelwert der Gebäudewerte über die Wohngebäude des Stadtteils mit Wert.",
                },
                caution: SURROUNDING,
            };
        case "safety":
            return {
                id: measure,
                label: { en: "Pedestrian safety", de: "Fußverkehrssicherheit" },
                meaning: {
                    en: "Length-weighted mean of a recorded-crash index (crashes involving people walking or cycling, 2019 and 2022–2025, smoothed) for streets within 400 m of walking from the building.",
                    de: "Längengewichteter Mittelwert eines Index erfasster Unfälle (mit Fuß- oder Radverkehr, 2019 und 2022–2025, geglättet) für Straßen in 400 m Gehentfernung vom Gebäude.",
                },
                unit: { en: "index points, 0–100", de: "Indexpunkte, 0–100" },
                direction: { en: "Higher = LOWER recorded-crash concentration.", de: "Höher = GERINGERE Konzentration erfasster Unfälle." },
                field: FIELDS.safety,
                adminField: ADMIN_FIELDS.safetyMean,
                adminMeaning: {
                    en: "Mean of the building values over the Stadtteil's residential buildings that have a value.",
                    de: "Mittelwert der Gebäudewerte über die Wohngebäude des Stadtteils mit Wert.",
                },
                caution: {
                    en: "Recorded crashes are not divided by how many people walk there, and are not personal risk. The index describes the surrounding streets, not one route. Modelled, not measured.",
                    de: "Erfasste Unfälle werden nicht durch die Zahl der Fußgänger geteilt und sind kein persönliches Risiko. Der Index beschreibt die umliegenden Straßen, nicht einen Weg. Modelliert, nicht gemessen.",
                },
            };
        case "green":
            return {
                id: measure,
                label: { en: "Large green space", de: "Große Grünfläche" },
                meaning: {
                    en: "Time-weighted score of the walk to the nearest large green space (park of at least 2,000 m², forest or cemetery of at least 10,000 m²): 100 up to 5 minutes, falling to 0 at 15 minutes.",
                    de: "Zeitgewichteter Wert des Wegs zur nächsten großen Grünfläche (Park ab 2.000 m², Wald oder Friedhof ab 10.000 m²): 100 bis 5 Minuten, fallend auf 0 bei 15 Minuten.",
                },
                unit: { en: "points, 0–100; orange = none within 15 min", de: "Punkte, 0–100; orange = keine in 15 Min." },
                direction: { en: "Higher = a large green space is closer.", de: "Höher = eine große Grünfläche ist näher." },
                field: FIELDS.green,
                adminField: ADMIN_FIELDS.greenMean,
                adminMeaning: {
                    en: "Mean of the building values over the Stadtteil's residential buildings that have a value.",
                    de: "Mittelwert der Gebäudewerte über die Wohngebäude des Stadtteils mit Wert.",
                },
                caution: {
                    en: "Shows how near a large green space is, not its quality, size of usable area or facilities.",
                    de: "Zeigt, wie nah eine große Grünfläche ist, nicht ihre Qualität, nutzbare Fläche oder Ausstattung.",
                },
            };
        default:
            return {
                id: measure,
                label: { en: "Official park", de: "Offizieller Park" },
                meaning: {
                    en: "Walking minutes to the nearest recreational park of the official Digitaler Grünplan. There is no 15-minute cut-off.",
                    de: "Gehminuten zum nächsten Erholungspark des amtlichen Digitalen Grünplans. Es gibt keine 15-Minuten-Grenze.",
                },
                unit: { en: "minutes", de: "Minuten" },
                direction: { en: "Fewer minutes = closer.", de: "Weniger Minuten = näher." },
                field: FIELDS.dgpPark,
                adminField: ADMIN_FIELDS.dgpMedian,
                adminMeaning: {
                    en: "Median walking minutes over the Stadtteil's residential buildings that have a value.",
                    de: "Median der Gehminuten über die Wohngebäude des Stadtteils mit Wert.",
                },
                caution: {
                    en: "Entrances are partly modelled. Shows distance to a park, not its quality or size.",
                    de: "Eingänge sind teilweise modelliert. Zeigt die Entfernung zu einem Park, nicht seine Qualität oder Größe.",
                },
            };
    }
}

/** A value of a measure as short text: points to one decimal, minutes with the unit, shares as percent. */
export function formatMeasureValue(measure: MeasureId, value: number, level: "building" | "admin", locale: string): string {
    const number = (digits: number): string => value.toLocaleString(locale === "de" ? "de-DE" : "en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    if (categoryOfMeasure(measure) !== undefined) return level === "admin" ? `${(value * 100).toLocaleString(locale === "de" ? "de-DE" : "en-US", { maximumFractionDigits: 0 })} %` : `${number(1)} min`;
    if (measure === "green-park") return `${number(1)} min`;
    return number(1);
}

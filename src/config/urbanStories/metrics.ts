import type { Localized, MetricOption } from "./types";

/** Caveat texts required by UST-01. Shared so the same rule always reads the same way. */
export const CAVEATS = {
    adminAggregate: {
        en: "Residential buildings, building-weighted, not population; NULL when fewer than 5 buildings.",
        de: "Wohngebäude, gebäudegewichtet, nicht bevölkerungsgewichtet; NULL bei weniger als 5 Gebäuden.",
    },
    legacyPtAssignment: {
        en: "Legacy assignment; not directly comparable with strict-id m15_*/cmf_* values (border buildings are assigned differently).",
        de: "Alte Zuordnung; nicht direkt vergleichbar mit m15_*/cmf_*-Werten nach strikter ID (Grenzgebäude werden anders zugeordnet).",
    },
    departuresLowerBound: {
        en: "Lower bound where pt_departures_complete = false; incomplete is not zero service.",
        de: "Untergrenze, wo pt_departures_complete = false; unvollständig heißt nicht kein Angebot.",
    },
    modelled: {
        en: "Modelled, not measured.",
        de: "Modelliert, nicht gemessen.",
    },
    coverageUnion: {
        en: "Union of official polygons; never summed.",
        de: "Vereinigung der amtlichen Flächen; nie aufsummiert.",
    },
    buildingsNotPeople: {
        en: "Counts and shares refer to buildings, not people.",
        de: "Anzahlen und Anteile beziehen sich auf Gebäude, nicht auf Personen.",
    },
} satisfies Record<string, Localized>;

export const UNITS = {
    points: { en: "points 0–100", de: "Punkte 0–100" },
    share: { en: "share 0–1", de: "Anteil 0–1" },
    minutes: { en: "minutes", de: "Minuten" },
    count: { en: "count", de: "Anzahl" },
    categories: { en: "count 0–9", de: "Anzahl 0–9" },
    class: { en: "class", de: "Klasse" },
    flag: { en: "yes/no", de: "ja/nein" },
} satisfies Record<string, Localized>;

export const NULL_BELOW_FIVE_BUILDINGS: Localized = {
    en: "Fewer than 5 valid buildings",
    de: "Weniger als 5 gültige Gebäude",
};

/** The nine 15-minute destination categories, in the order of the export columns. */
export const FIFTEEN_MINUTE_CATEGORIES = [
    { id: "food", label: { en: "Food", de: "Lebensmittel" } },
    { id: "health", label: { en: "Health", de: "Gesundheit" } },
    { id: "education", label: { en: "Education", de: "Bildung" } },
    { id: "restaurant", label: { en: "Restaurants", de: "Gastronomie" } },
    { id: "culture", label: { en: "Culture", de: "Kultur" } },
    { id: "bank_post", label: { en: "Bank & post", de: "Bank & Post" } },
    { id: "sport", label: { en: "Sport", de: "Sport" } },
    { id: "park", label: { en: "Parks", de: "Parks" } },
    { id: "stop_any", label: { en: "Public transport stops", de: "ÖPNV-Haltestellen" } },
] as const satisfies { id: string; label: Localized }[];

interface MetricDetails {
    unit?: Localized;
    nullMeaning?: Localized;
    caveats?: Localized[];
}

/** A metric whose visualisation is not yet a verified catalog style (`styleName: null`). */
export function metric(attribute: string, label: Localized, details: MetricDetails = {}): MetricOption {
    return {
        key: attribute,
        label,
        attribute,
        styleName: null,
        ...details,
        ...(details.caveats !== undefined ? { caveats: [...details.caveats] } : {}),
    };
}

/** An administrative aggregate. Always carries the building-weighted / NULL-below-5 caveat. */
export function adminMetric(attribute: string, label: Localized, details: MetricDetails = {}): MetricOption {
    return metric(attribute, label, {
        nullMeaning: NULL_BELOW_FIVE_BUILDINGS,
        ...details,
        caveats: [CAVEATS.adminAggregate, ...(details.caveats ?? [])],
    });
}

export function labelWith(prefix: Localized, suffix: Localized): Localized {
    return { en: `${prefix.en}: ${suffix.en}`, de: `${prefix.de}: ${suffix.de}` };
}

export function requiredAttributesOf(metrics: MetricOption[], extra: string[] = []): string[] {
    return [...new Set([...metrics.map((option) => option.attribute), ...extra])];
}

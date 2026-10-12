import type { Localized } from "../../types";
import { adminFieldOf, type AccessMeasure, type AdminMeasure } from "./constants";

/**
 * Names and plain-language meaning of every measure the map can show, from the R17 export metadata. Park and playground
 * walking times are two different destinations with the same unit and scale; they are never combined.
 */
export interface MeasureText {
    id: AdminMeasure;
    label: Localized;
    /** What the building value is (access measures) or the Stadtteil value (coverage measures). */
    meaning: Localized;
    unit: Localized;
    direction: Localized;
    /** What the Stadtteil value is. */
    adminMeaning: Localized;
    /** Limitations the reader needs next to the map. */
    caution: Localized;
    /** Stadtteil summary field. */
    adminField: string;
}

const MODELLED_ENTRANCE_PARK: Localized = {
    en: "Walking time is modelled to the park area, not to a verified entrance: only 130 of 951 parks have supported entrances, so times can be optimistic. It says nothing about the park's quality, size or opening hours.",
    de: "Die Gehzeit ist bis zur Parkfläche modelliert, nicht bis zu einem geprüften Eingang: Nur 130 von 951 Parks haben gestützte Eingänge, die Zeiten können daher zu optimistisch sein. Sie sagt nichts über Qualität, Größe oder Öffnungszeiten.",
};

const MODELLED_ENTRANCE_PLAYGROUND: Localized = {
    en: "Walking time is modelled to the playground area (all playground entrances are modelled), so times can be optimistic. It measures geographic access only, not equipment, condition, suitable age, capacity or availability.",
    de: "Die Gehzeit ist bis zur Spielplatzfläche modelliert (alle Spielplatz-Eingänge sind modelliert), die Zeiten können daher zu optimistisch sein. Sie misst nur die räumliche Erreichbarkeit, nicht Ausstattung, Zustand, Altersgruppe, Kapazität oder Verfügbarkeit.",
};

export function measureText(measure: AccessMeasure | AdminMeasure): MeasureText {
    const id = measure as AdminMeasure;
    switch (id) {
        case "park":
            return {
                id,
                label: { en: "Walk to the nearest park", de: "Weg zum nächsten Park" },
                meaning: {
                    en: "Modelled walking minutes from the building to the nearest official recreational park of the Digitaler Grünplan, over the pedestrian network (1.33 m/s, with slope).",
                    de: "Modellierte Gehminuten vom Gebäude zum nächsten offiziellen Park des Digitalen Grünplans über das Fußwegenetz (1,33 m/s, mit Steigung).",
                },
                unit: { en: "minutes, not capped at 15", de: "Minuten, nicht auf 15 begrenzt" },
                direction: { en: "Lighter = shorter walk, darker = longer walk.", de: "Heller = kürzerer Weg, dunkler = längerer Weg." },
                adminMeaning: {
                    en: "Median over the residential buildings of the Stadtteil with a computable time.",
                    de: "Median über die Wohngebäude des Stadtteils mit berechenbarer Zeit.",
                },
                caution: MODELLED_ENTRANCE_PARK,
                adminField: adminFieldOf(id),
            };
        case "playground":
            return {
                id,
                label: { en: "Walk to the nearest playground", de: "Weg zum nächsten Spielplatz" },
                meaning: {
                    en: "Modelled walking minutes from the building to the nearest official playground of the Digitaler Grünplan, over the pedestrian network (1.33 m/s, with slope).",
                    de: "Modellierte Gehminuten vom Gebäude zum nächsten offiziellen Spielplatz des Digitalen Grünplans über das Fußwegenetz (1,33 m/s, mit Steigung).",
                },
                unit: { en: "minutes, not capped at 15", de: "Minuten, nicht auf 15 begrenzt" },
                direction: { en: "Lighter = shorter walk, darker = longer walk. Same scale as the park map.", de: "Heller = kürzerer Weg, dunkler = längerer Weg. Gleiche Skala wie die Parkkarte." },
                adminMeaning: {
                    en: "Median over the residential buildings of the Stadtteil with a computable time.",
                    de: "Median über die Wohngebäude des Stadtteils mit berechenbarer Zeit.",
                },
                caution: MODELLED_ENTRANCE_PLAYGROUND,
                adminField: adminFieldOf(id),
            };
        case "coverage-recreational":
            return {
                id,
                label: { en: "Recreational park coverage", de: "Anteil Parkanlagen" },
                meaning: {
                    en: "Share of the Stadtteil's land area covered by official recreational parks. Overlapping polygons are counted once (union), never summed.",
                    de: "Anteil der Stadtteilfläche, der von offiziellen Parkanlagen bedeckt ist. Überlappende Flächen werden einmal gezählt (Vereinigung), nie summiert.",
                },
                unit: { en: "share of land area, 0–100 %", de: "Anteil der Landfläche, 0–100 %" },
                direction: { en: "Darker green = more of the land is park.", de: "Dunkleres Grün = mehr Fläche ist Park." },
                adminMeaning: { en: "Land coverage of the Stadtteil.", de: "Flächenanteil im Stadtteil." },
                caution: {
                    en: "Coverage is not access: a Stadtteil can contain much park area and still have uneven walking access.",
                    de: "Flächenanteil ist nicht Erreichbarkeit: Ein Stadtteil kann viel Parkfläche enthalten und trotzdem ungleiche Erreichbarkeit haben.",
                },
                adminField: adminFieldOf(id),
            };
        case "coverage-green":
            return {
                id,
                label: { en: "All official green areas", de: "Alle amtlichen Grünflächen" },
                meaning: {
                    en: "Share of the Stadtteil's land area covered by any official green area: parks, playgrounds, sports grounds, allotments, cemeteries, protective and other public green (union, overlaps counted once).",
                    de: "Anteil der Stadtteilfläche, der von irgendeiner amtlichen Grünfläche bedeckt ist: Parks, Spielplätze, Sportanlagen, Kleingärten, Friedhöfe, Schutzgrün und sonstiges öffentliches Grün (Vereinigung, Überlappungen einmal gezählt).",
                },
                unit: { en: "share of land area, 0–100 %", de: "Anteil der Landfläche, 0–100 %" },
                direction: { en: "Darker green = more of the land is official green area.", de: "Dunkleres Grün = mehr Fläche ist amtliche Grünfläche." },
                adminMeaning: { en: "Land coverage of the Stadtteil.", de: "Flächenanteil im Stadtteil." },
                caution: {
                    en: "Includes land that is not freely usable for recreation, such as allotments and cemeteries. Not accessibility.",
                    de: "Enthält Flächen, die nicht frei zur Erholung nutzbar sind, etwa Kleingärten und Friedhöfe. Keine Erreichbarkeit.",
                },
                adminField: adminFieldOf(id),
            };
        default:
            return {
                id: "large-green",
                label: { en: "Large green space within 15 min", de: "Große Grünfläche in 15 Min." },
                meaning: {
                    en: "Share of the Stadtteil's residential buildings with a large green space (OSM/ALKIS inventory: parks of at least 2,000 m², forest or cemetery of at least 10,000 m²) within a 15-minute walk.",
                    de: "Anteil der Wohngebäude des Stadtteils mit einer großen Grünfläche (OSM/ALKIS-Bestand: Parks ab 2.000 m², Wald oder Friedhof ab 10.000 m²) in 15 Minuten Fußweg.",
                },
                unit: { en: "share of buildings, 0–100 %", de: "Anteil der Gebäude, 0–100 %" },
                direction: { en: "Darker green = more buildings within reach.", de: "Dunkleres Grün = mehr Gebäude in Reichweite." },
                adminMeaning: { en: "Building-weighted share, not population-weighted.", de: "Gebäudegewichteter Anteil, nicht bevölkerungsgewichtet." },
                caution: {
                    en: "A different definition from the official park of the Digitaler Grünplan, and capped at 15 minutes. Almost every Stadtteil is at or near 100 %.",
                    de: "Eine andere Definition als der offizielle Park des Digitalen Grünplans, begrenzt auf 15 Minuten. Fast jeder Stadtteil liegt bei oder nahe 100 %.",
                },
                adminField: adminFieldOf("large-green"),
            };
    }
}

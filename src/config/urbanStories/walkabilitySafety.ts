import { entryLayerFields, URBAN_STORY_LAYERS } from "./layers";
import { CAVEATS, requiredAttributesOf } from "./metrics";
import { CHAPTER_CAMERAS } from "./overview";
import { STREET_SCALES, metricOptions } from "./styles/walkabilitySafety";
import type { UrbanStoryConfig } from "./types";

const segmentMetrics = metricOptions(STREET_SCALES);
const CITY_CENTRE_CRASH_CLUSTER = { center: [10.00384, 53.55517] as [number, number], zoom: 14.5 };

export const walkabilitySafetyStory: UrbanStoryConfig = {
    key: "walkability-safety",
    title: { en: "Street comfort & safety", de: "Gehkomfort und Sicherheit auf Straßen" },
    intro: {
        en: "Compare walking conditions and recorded crashes. Click a street to see the value behind its colour.",
        de: "Vergleichen Sie Gehbedingungen und erfasste Unfälle. Klicken Sie auf eine Straße, um den Wert hinter der Farbe zu sehen.",
    },
    caveats: [CAVEATS.modelled, {
        en: "Streets appear from zoom 9. For crash counts, grey is the background network and coloured lines have one or more records. Line width helps you see the map; it is not pavement width. Records are not personal risk.",
        de: "Straßen erscheinen ab Zoom 9. Bei Unfallzahlen ist Grau das Hintergrundnetz; farbige Linien haben einen oder mehrere Einträge. Die Linienbreite macht die Karte lesbar, sie zeigt nicht die echte Gehwegbreite. Einträge sind kein persönliches Risiko.",
    }],
    geostory: { id: null },
    overviewCamera: CHAPTER_CAMERAS.STREETS,
    explore: [
        {
            key: "street-segments", title: { en: "Streets: comfort and safety", de: "Straßen: Komfort und Sicherheit" }, group: "street",
            ...entryLayerFields(URBAN_STORY_LAYERS.mobility), styleSource: "frontend",
            minZoom: 9,
            metrics: segmentMetrics, defaultMetric: "comfort_score", requiredAttributes: requiredAttributesOf(segmentMetrics, ["in_hamburg"]),
            caveats: [CAVEATS.modelled], readiness: "published",
        },
    ],
    chapters: [
        {
            chapterKey: "walking-environment", title: { en: "Walking comfort across the network", de: "Gehkomfort im Wegenetz" },
            narrative: { en: "Each line is one part of the walking network. Red means less comfortable to walk; green-blue means more comfortable. Grey means no score. Zoom in or click a line for details.", de: "Jede Linie ist ein Abschnitt des Fußwegenetzes. Rot bedeutet weniger, Grün-Blau mehr Gehkomfort. Grau bedeutet: kein Wert. Zoomen Sie hinein oder klicken Sie auf eine Linie." },
            camera: CHAPTER_CAMERAS.STREETS, show: [{ entryKey: "street-segments", metricKey: "comfort_score" }],
            scene: { id: null, order: 1 }, relatedExploreEntries: ["street-segments"],
        },
        {
            chapterKey: "recorded-crashes", title: { en: "Where were crashes recorded?", de: "Wo wurden Unfälle erfasst?" },
            narrative: { en: "This is a count, not a score. Yellow means 1 recorded crash on a street section, orange means 2, and red means 3 or more. The grey network has no assigned record in 2019 and 2022–2025.", de: "Dies ist eine Anzahl, kein Wert. Gelb bedeutet 1 erfasster Unfall auf einem Straßenabschnitt, Orange 2 und Rot 3 oder mehr. Das graue Netz hat 2019 und 2022–2025 keinen zugeordneten Eintrag." },
            camera: CHAPTER_CAMERAS.STREETS, show: [{ entryKey: "street-segments", metricKey: "n_accidents_vru_5y" }],
            scene: { id: null, order: 2 }, relatedExploreEntries: ["street-segments"],
        },
        {
            chapterKey: "city-centre-records", title: { en: "A cluster in the city centre", de: "Eine Häufung in der Innenstadt" },
            narrative: { en: "The 1 km area around Hamburg-Altstadt has the largest total in this export: 341 recorded crashes involving people walking or cycling. This points to where records concentrate; it does not explain why they happened.", de: "Das 1-km-Gebiet um Hamburg-Altstadt hat in diesem Export die größte Summe: 341 erfasste Unfälle mit Fuß- oder Radverkehr. Das zeigt, wo sich Einträge häufen, nicht warum sie passiert sind." },
            camera: CITY_CENTRE_CRASH_CLUSTER, show: [{ entryKey: "street-segments", metricKey: "n_accidents_vru_5y" }],
            scene: { id: null, order: 3 }, relatedExploreEntries: ["street-segments"],
        },
        {
            chapterKey: "street-sidewalks", title: { en: "Where are sidewalks mapped?", de: "Wo sind Gehwege erfasst?" },
            narrative: { en: "Colours now show sidewalk categories from OpenStreetMap: pedestrian ways, separate sidewalks, indicated sidewalks and no sidewalk tagged. These are categories, not comfort scores.", de: "Die Farben zeigen nun Gehwegkategorien aus OpenStreetMap: eigenständige Fußwege, separat kartierte Gehwege, angegebene Gehwege und kein Gehweg laut Tag. Dies sind Kategorien, keine Komfortwerte." },
            camera: CHAPTER_CAMERAS.STREETS,
            show: [{ entryKey: "street-segments", metricKey: "has_sidewalk" }],
            scene: { id: null, order: 4 }, relatedExploreEntries: ["street-segments"],
        },
        {
            chapterKey: "street-grade", title: { en: "How steep is the walking network?", de: "Wie steil ist das Fußwegenetz?" },
            narrative: { en: "The map now shows mean absolute street grade in percent. Darker red means steeper terrain. Click a street for its slope value; this is separate from its crash count and overall comfort score.", de: "Die Karte zeigt nun die mittlere absolute Steigung in Prozent. Dunkleres Rot bedeutet steileres Gelände. Ein Klick zeigt den Steigungswert; dieser ist unabhängig von Unfallzahl und Gesamtkomfort." },
            camera: CHAPTER_CAMERAS.STREETS,
            show: [{ entryKey: "street-segments", metricKey: "slope_dem_abs_mean_pct" }],
            scene: { id: null, order: 5 }, relatedExploreEntries: ["street-segments"],
        },
    ],
};

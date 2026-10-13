import { entryLayerFields, URBAN_STORY_LAYERS } from "./layers";
import { CAVEATS, requiredAttributesOf } from "./metrics";
import { CHAPTER_CAMERAS } from "./overview";
import { BUILDING_SCALES, metricOptions } from "./styles/walkabilitySafety";
import type { UrbanStoryConfig } from "./types";

const buildingMetrics = metricOptions(BUILDING_SCALES);

export const buildingWalkingStory: UrbanStoryConfig = {
    key: "building-walking",
    title: { en: "Walking around your building", de: "Zu Fuß rund um Ihr Gebäude" },
    intro: {
        en: "Explore walking conditions within 400 m of each building. Click a building for its ALKIS identity, use and neighbourhood scores in the left panel.",
        de: "Erkunden Sie die Gehbedingungen im 400-m-Umfeld jedes Gebäudes. Ein Klick zeigt ALKIS-Kennung, Nutzung und Umfeldwerte im linken Bereich.",
    },
    caveats: [CAVEATS.modelled],
    geostory: { id: null },
    overviewCamera: CHAPTER_CAMERAS.BUILDINGS_3D,
    explore: [
        {
            key: "buildings-comfort-safety", title: { en: "Buildings: walking comfort and safety within 400 m", de: "Gebäude: Gehkomfort und Sicherheit im 400-m-Umfeld" }, group: "building",
            ...entryLayerFields(URBAN_STORY_LAYERS.buildings), styleSource: "frontend",
            metrics: buildingMetrics, defaultMetric: "safety_index_400m", requiredAttributes: requiredAttributesOf(buildingMetrics),
            caveats: [CAVEATS.modelled], readiness: "published",
        },
    ],
    chapters: [
        {
            chapterKey: "building-comfort",
            title: { en: "How comfortable is the walk from here?", de: "Wie angenehm geht es sich von hier aus?" },
            narrative: { en: "Building colours show average comfort along streets reachable within a 400-metre walk, weighted by street length. Click a building to inspect its details on the left.", de: "Die Gebäudefarben zeigen den längengewichteten Gehkomfort der in 400 Metern erreichbaren Straßen. Ein Klick zeigt die Gebäudedetails links." },
            camera: CHAPTER_CAMERAS.BUILDINGS_3D,
            show: [{ entryKey: "buildings-comfort-safety", metricKey: "comfort_mean_400m" }],
            scene: { id: null, order: 1 }, relatedExploreEntries: ["buildings-comfort-safety"],
        },
        {
            chapterKey: "building-safety",
            title: { en: "Recorded crashes around the building", de: "Erfasste Unfälle im Gebäudeumfeld" },
            narrative: { en: "This index summarises recorded-crash concentration on streets within a 400-metre walk. Higher values mean lower modelled concentration. It describes the surrounding streets, not the building itself or personal risk.", de: "Dieser Index fasst die Unfallkonzentration auf Straßen in 400 Metern Gehentfernung zusammen. Höhere Werte bedeuten eine geringere modellierte Konzentration. Er beschreibt die umliegenden Straßen, nicht das Gebäude selbst oder ein persönliches Risiko." },
            camera: CHAPTER_CAMERAS.BUILDINGS_3D,
            show: [{ entryKey: "buildings-comfort-safety", metricKey: "safety_index_400m" }],
            scene: { id: null, order: 2 }, relatedExploreEntries: ["buildings-comfort-safety"],
        },
        {
            chapterKey: "building-data-coverage", title: { en: "How much of the walking area has data?", de: "Wie vollständig sind die Komfortdaten?" },
            narrative: { en: "Purple shows the share of reachable street length with a comfort score, from 0 to 1. Darker purple means more complete coverage, not better walking conditions.", de: "Violett zeigt den Anteil der erreichbaren Weglänge mit Komfortwert von 0 bis 1. Dunkleres Violett bedeutet vollständigere Daten, nicht bessere Gehbedingungen." },
            camera: CHAPTER_CAMERAS.BUILDINGS_3D,
            show: [{ entryKey: "buildings-comfort-safety", metricKey: "comfort_scored_share_400m" }],
            scene: { id: null, order: 3 }, relatedExploreEntries: ["buildings-comfort-safety"],
        },
        {
            chapterKey: "building-network-length", title: { en: "How much street network informs the index?", de: "Wie viel Wegenetz geht in den Index ein?" },
            narrative: { en: "Orange shows the total street length used for the safety index, in metres. Several streets lie within one 400 m walking catchment, so their combined length can exceed 400 m. A larger total does not mean safer streets.", de: "Orange zeigt die gesamte Weglänge für den Sicherheitsindex in Metern. Mehrere Straßen liegen im selben 400-m-Einzugsbereich; zusammen können sie länger als 400 m sein. Eine größere Summe bedeutet nicht mehr Sicherheit." },
            camera: CHAPTER_CAMERAS.BUILDINGS_3D,
            show: [{ entryKey: "buildings-comfort-safety", metricKey: "safety_covered_len_400m_m" }],
            scene: { id: null, order: 4 }, relatedExploreEntries: ["buildings-comfort-safety"],
        },
        {
            chapterKey: "inspect-building", title: { en: "Read the details of one building", de: "Die Details eines Gebäudes lesen" },
            narrative: { en: "Colours return to mean walking comfort. Click a building to see its ALKIS identity, use, height and footprint area on the left, followed by both neighbourhood scores and data coverage. Height always represents the building height, not a score.", de: "Die Farben zeigen wieder den mittleren Gehkomfort. Ein Klick zeigt links ALKIS-Kennung, Nutzung, Höhe und Grundfläche sowie beide Umfeldwerte und die Datenabdeckung. Die Höhe zeigt stets die Gebäudehöhe, keinen Score." },
            camera: CHAPTER_CAMERAS.BUILDINGS_3D,
            show: [{ entryKey: "buildings-comfort-safety", metricKey: "comfort_mean_400m" }],
            scene: { id: null, order: 5 }, relatedExploreEntries: ["buildings-comfort-safety"],
        },
    ],
};

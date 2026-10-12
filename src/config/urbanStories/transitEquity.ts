import { entryLayerFields, URBAN_STORY_LAYERS, type UrbanStoryLayerId } from "./layers";
import { adminMetric, CAVEATS, metric, requiredAttributesOf, UNITS } from "./metrics";
import { CHAPTER_CAMERAS, HAMBURG_OVERVIEW_CAMERA } from "./overview";
import { withVerifiedStyles } from "./verifiedStyles";
import type { ExploreEntry, Localized, MetricOption, UrbanStoryConfig } from "./types";

const buildingMetrics: MetricOption[] = [
    metric("pt_access_class", { en: "Bus / rail access class", de: "Zugangsklasse Bus / Bahn" }, { unit: UNITS.class }),
    metric("pt_in_catchment_any", { en: "Inside an HVV catchment", de: "Im HVV-Einzugsbereich" }, { unit: UNITS.flag }),
    metric("walk_min_stop_any", { en: "Walk to nearest stop", de: "Fußweg zur nächsten Haltestelle" }, { unit: UNITS.minutes }),
    metric("pt_stop_n_total", { en: "Stops in reach", de: "Erreichbare Haltestellen" }, { unit: UNITS.count }),
    metric("pt_line_n_unique", { en: "Distinct lines in reach", de: "Erreichbare Linien" }, { unit: UNITS.count }),
    metric("pt_departures_daily_sum", { en: "Daily departures in reach", de: "Tägliche Abfahrten in Reichweite" }, {
        unit: UNITS.count,
        caveats: [CAVEATS.departuresLowerBound],
    }),
    metric("pt_departures_complete", { en: "Departure data complete", de: "Abfahrtsdaten vollständig" }, { unit: UNITS.flag }),
];

/** Metrics present on every admin level. On Stadtteile and units they use the legacy assignment. */
function sharedAdminPtMetrics(extraCaveats: Localized[]): MetricOption[] {
    const details = (unit: Localized) => ({ unit, caveats: extraCaveats });
    return [
        adminMetric("pt_in_catchment_share", { en: "Share of buildings in HVV catchment", de: "Anteil Gebäude im HVV-Einzugsbereich" }, details(UNITS.share)),
        adminMetric("pt_zero_service_building_share", { en: "Share of buildings without service", de: "Anteil Gebäude ohne Angebot" }, details(UNITS.share)),
        adminMetric("pt_departures_median", { en: "Median daily departures", de: "Median tägliche Abfahrten" }, {
            unit: UNITS.count,
            caveats: [...extraCaveats, CAVEATS.departuresLowerBound],
        }),
        adminMetric("pt_line_n_gini", { en: "Inequality of line access (Gini)", de: "Ungleichheit des Linienzugangs (Gini)" }, { caveats: extraCaveats }),
        adminMetric("ptr_resid_uncovered_share", { en: "Residential buildings outside catchment", de: "Wohngebäude außerhalb des Einzugsbereichs" }, details(UNITS.share)),
        adminMetric("ptr_resid_limited_service_share", { en: "Residential buildings with limited service", de: "Wohngebäude mit eingeschränktem Angebot" }, details(UNITS.share)),
    ];
}

function legacyAdminEntry(key: string, layerId: UrbanStoryLayerId, title: Localized): ExploreEntry {
    const legacy = [CAVEATS.legacyPtAssignment];
    const metrics = [
        ...sharedAdminPtMetrics(legacy),
        adminMetric("ptr_coverage_gap_flag", { en: "Review flag: coverage gap", de: "Prüfhinweis: Abdeckungslücke" }, { unit: UNITS.flag, caveats: legacy }),
        adminMetric("ptr_limited_service_flag", { en: "Review flag: limited service", de: "Prüfhinweis: eingeschränktes Angebot" }, { unit: UNITS.flag, caveats: legacy }),
        adminMetric("ptr_review_status", { en: "Review status", de: "Prüfstatus" }, { caveats: legacy }),
    ];
    return {
        key,
        title,
        group: "admin",
        ...entryLayerFields(URBAN_STORY_LAYERS[layerId]),
        metrics,
        defaultMetric: "pt_in_catchment_share",
        requiredAttributes: requiredAttributesOf(metrics),
        caveats: [CAVEATS.adminAggregate, CAVEATS.legacyPtAssignment],
        readiness: "published",
    };
}

// Bezirke are recomputed by strict id and have no review flags (no ptr_*_flag / ptr_review_*).
const bezirkeMetrics = sharedAdminPtMetrics([]);

export const transitEquityStory: UrbanStoryConfig = {
    key: "transit-equity",
    title: { en: "Public Transport Equity", de: "Gerechter Zugang zum ÖPNV" },
    intro: {
        en: "Who can walk to a bus or train, and how good is the service once they get there? "
            + "This story separates official HVV coverage from the number of lines and departures "
            + "actually within reach.",
        de: "Wer erreicht Bus oder Bahn zu Fuß, und wie gut ist das Angebot dort? "
            + "Diese Geschichte trennt die amtliche HVV-Abdeckung von der Zahl der Linien und Abfahrten, "
            + "die tatsächlich erreichbar sind.",
    },
    caveats: [
        {
            en: "Being inside a catchment is not the same as good service.",
            de: "Im Einzugsbereich zu liegen heißt nicht, gut angebunden zu sein.",
        },
        CAVEATS.buildingsNotPeople,
        CAVEATS.departuresLowerBound,
        CAVEATS.legacyPtAssignment,
        {
            en: "Statistical units have no names; popups show their id only.",
            de: "Statistische Gebiete haben keine Namen; Popups zeigen nur ihre Kennung.",
        },
    ],
    geostory: { id: null },
    overviewCamera: HAMBURG_OVERVIEW_CAMERA,
    explore: withVerifiedStyles([
        {
            key: "buildings-pt",
            title: { en: "Buildings: public transport access", de: "Gebäude: ÖPNV-Zugang" },
            group: "building",
            ...entryLayerFields(URBAN_STORY_LAYERS.buildings),
            metrics: buildingMetrics,
            defaultMetric: "pt_access_class",
            requiredAttributes: requiredAttributesOf(buildingMetrics),
            caveats: [CAVEATS.buildingsNotPeople],
            readiness: "published",
        },
        {
            key: "pt-stops",
            title: { en: "Public transport stops", de: "ÖPNV-Haltestellen" },
            group: "poi",
            ...entryLayerFields(URBAN_STORY_LAYERS.poiPtStops),
            metrics: [],
            requiredAttributes: ["category"],
            caveats: [{
                en: "No HVV catchment polygons are published; access comes from building values.",
                de: "HVV-Einzugsbereiche sind nicht als Flächen veröffentlicht; der Zugang ergibt sich aus Gebäudewerten.",
            }],
            readiness: "published",
        },
        legacyAdminEntry("stadtteile-pt", "stadtteile", { en: "Neighbourhoods: public transport", de: "Stadtteile: ÖPNV" }),
        legacyAdminEntry("units-pt", "statisticalUnits", { en: "Statistical units: public transport", de: "Statistische Gebiete: ÖPNV" }),
        {
            key: "bezirke-pt",
            title: { en: "Districts: public transport", de: "Bezirke: ÖPNV" },
            group: "admin",
            ...entryLayerFields(URBAN_STORY_LAYERS.bezirke),
            metrics: bezirkeMetrics,
            defaultMetric: "pt_in_catchment_share",
            requiredAttributes: requiredAttributesOf(bezirkeMetrics),
            caveats: [
                CAVEATS.adminAggregate,
                {
                    en: "Districts have no review flags.",
                    de: "Für Bezirke gibt es keine Prüfhinweise.",
                },
            ],
            readiness: "published",
        },
    ]),
    // DRAFT chapter texts (2026-10-11): descriptive only, pending editorial review. They explain how to read each
    // map and state no computed result. Only the statistical-unit catchment share has a verified style.
    chapters: [
        {
            chapterKey: "pt-overview",
            title: { en: "Public transport access at a glance", de: "ÖPNV-Zugang im Überblick" },
            narrative: {
                en: "The map starts with the district boundaries. Each district summarises, over its buildings, how many lie inside an "
                    + "official HVV catchment. Click a district to read the values. The next chapters look at smaller areas.",
                de: "Die Karte beginnt mit den Bezirksgrenzen. Jeder Bezirk fasst über seine Gebäude zusammen, wie viele in einem "
                    + "amtlichen HVV-Einzugsbereich liegen. Ein Klick auf einen Bezirk zeigt die Werte. Die nächsten Kapitel betrachten kleinere Gebiete.",
            },
            camera: CHAPTER_CAMERAS.CITY,
            show: [{ entryKey: "bezirke-pt" }],
            scene: { id: null, order: 1 },
            relatedExploreEntries: ["bezirke-pt", "stadtteile-pt", "units-pt"],
        },
        {
            chapterKey: "coverage-differences",
            title: { en: "Coverage differences between areas", de: "Abdeckungsunterschiede zwischen Gebieten" },
            narrative: {
                en: "Statistical units are coloured by the share of their buildings that lie inside an HVV catchment. "
                    + "Compare neighbouring units to see where coverage changes. Counts and shares refer to buildings, not to people.",
                de: "Statistische Gebiete sind nach dem Anteil ihrer Gebäude im HVV-Einzugsbereich eingefärbt. "
                    + "Vergleichen Sie benachbarte Gebiete, um zu sehen, wo sich die Abdeckung ändert. Anzahlen und Anteile beziehen sich auf Gebäude, nicht auf Personen.",
            },
            camera: CHAPTER_CAMERAS.DISTRICTS,
            show: [{ entryKey: "units-pt", metricKey: "pt_in_catchment_share" }],
            scene: { id: null, order: 2 },
            relatedExploreEntries: ["units-pt", "stadtteile-pt", "buildings-pt"],
        },
        {
            chapterKey: "access-to-stops",
            title: { en: "Access to stops", de: "Zugang zu Haltestellen" },
            narrative: {
                en: "Public transport stops are added on top of the catchment shares. A catchment is a coverage rule, not a measure of "
                    + "service: being near a stop does not say how many lines or departures it offers. "
                    + "No catchment polygons are published, so access is derived from building values.",
                de: "Die ÖPNV-Haltestellen liegen über den Einzugsanteilen. Ein Einzugsbereich ist eine Abdeckungsregel, kein Maß für das Angebot: "
                    + "Die Nähe zu einer Haltestelle sagt nichts über Linien oder Abfahrten. "
                    + "Es sind keine Einzugsbereiche als Flächen veröffentlicht; der Zugang ergibt sich aus Gebäudewerten.",
            },
            camera: CHAPTER_CAMERAS.NEIGHBOURHOODS,
            show: [
                { entryKey: "units-pt", metricKey: "pt_in_catchment_share" },
                { entryKey: "pt-stops" },
            ],
            scene: { id: null, order: 3 },
            relatedExploreEntries: ["pt-stops", "units-pt", "buildings-pt"],
        },
        {
            chapterKey: "potential-underserved",
            title: { en: "Where coverage may be lower", de: "Wo die Abdeckung geringer sein kann" },
            narrative: {
                en: "Units with a low catchment share are candidates for a closer look, not confirmed gaps. Click a unit to read its catchment share. The share "
                    + "of buildings without service and the review flags are separate attributes. Departure counts are lower bounds where the data is incomplete, "
                    + "and incomplete is not zero service. Units without a value can look like the lowest class.",
                de: "Gebiete mit geringem Einzugsanteil sind Kandidaten für einen genaueren Blick, keine bestätigten Lücken. Ein Klick zeigt den Einzugsanteil. Der Anteil "
                    + "von Gebäuden ohne Angebot und die Prüfhinweise sind eigene Attribute. Abfahrtszahlen sind Untergrenzen, wo die Daten unvollständig sind; "
                    + "unvollständig heißt nicht kein Angebot. Gebiete ohne Wert können wie die niedrigste Klasse aussehen.",
            },
            camera: CHAPTER_CAMERAS.DISTRICTS,
            show: [{ entryKey: "units-pt", metricKey: "pt_in_catchment_share" }],
            scene: { id: null, order: 4 },
            relatedExploreEntries: ["units-pt", "stadtteile-pt", "buildings-pt"],
        },
        {
            chapterKey: "pt-interpretation",
            title: { en: "Interpretation and limits", de: "Einordnung und Grenzen" },
            narrative: {
                en: "Catchment share describes coverage, not service quality or fairness. Neighbourhood and unit values use an older assignment "
                    + "of buildings to areas and are not directly comparable with the district values. "
                    + "Statistical units have no names; popups show their id. Combine this map with local knowledge before drawing conclusions.",
                de: "Der Einzugsanteil beschreibt die Abdeckung, nicht Angebotsqualität oder Gerechtigkeit. Werte für Stadtteile und Gebiete nutzen eine ältere "
                    + "Zuordnung der Gebäude und sind mit den Bezirkswerten nicht direkt vergleichbar. "
                    + "Statistische Gebiete haben keine Namen; Popups zeigen ihre Kennung. Verbinden Sie die Karte mit Ortskenntnis, bevor Sie Schlüsse ziehen.",
            },
            camera: CHAPTER_CAMERAS.DISTRICTS,
            show: [{ entryKey: "units-pt", metricKey: "pt_in_catchment_share" }],
            scene: { id: null, order: 5 },
            relatedExploreEntries: ["units-pt", "stadtteile-pt", "bezirke-pt"],
        },
    ],
};

/**
 * Test fixture: the catalog-styled Green Spaces story that shipped before the six-scene rebuild. The shared Urban Stories
 * infrastructure (catalog style verification, metric switching, readiness probes, Explore entries) still supports
 * catalog-styled entries, but no shipped story uses them any more, so its tests run against this fixture installed in
 * place of the shipped `green-spaces` config (see `useCatalogFixtureStory`).
 */
import { entryLayerFields, URBAN_STORY_LAYERS, type UrbanStoryLayerId } from "../layers";
import { adminMetric, CAVEATS, metric, requiredAttributesOf, UNITS } from "../metrics";
import { CHAPTER_CAMERAS, HAMBURG_OVERVIEW_CAMERA } from "../overview";
import { withVerifiedStyles } from "../verifiedStyles";
import type { ExploreEntry, Localized, MetricOption, UrbanStoryConfig } from "../types";

const UNBOUNDED_WALK_TIME: Localized = {
    en: "Unbounded walking time: medians and 90th percentiles may exceed 15 minutes.",
    de: "Unbegrenzte Gehzeit: Mediane und 90. Perzentile können über 15 Minuten liegen.",
};

const LARGE_GREEN: Localized = {
    en: "Refers to large green spaces only.",
    de: "Bezieht sich nur auf große Grünflächen.",
};

const DUPLICATE_FEATURES: Localized = {
    en: "Some features are mapped more than once (duplicate_group_size > 1).",
    de: "Einige Objekte sind mehrfach erfasst (duplicate_group_size > 1).",
};

const buildingMetrics: MetricOption[] = [
    metric("score_green", { en: "Green access score", de: "Grünflächen-Erreichbarkeit" }, { caveats: [LARGE_GREEN] }),
    metric("walk_min_dgp_park", { en: "Walk to nearest park", de: "Fußweg zum nächsten Park" }, { unit: UNITS.minutes }),
    metric("walk_min_dgp_playground", { en: "Walk to nearest playground", de: "Fußweg zum nächsten Spielplatz" }, { unit: UNITS.minutes }),
];

function adminEntry(key: string, layerId: UrbanStoryLayerId, title: Localized): ExploreEntry {
    const unbounded = { unit: UNITS.minutes, caveats: [UNBOUNDED_WALK_TIME] };
    const coverage = { unit: UNITS.share, caveats: [CAVEATS.coverageUnion] };
    const metrics = [
        adminMetric("grn_mean", { en: "Mean green access score", de: "Mittlere Grünflächen-Erreichbarkeit" }, { caveats: [LARGE_GREEN] }),
        adminMetric("grn_share_large_green_15min", { en: "Share with large green space in 15 min", de: "Anteil mit großer Grünfläche in 15 Min" }, { unit: UNITS.share, caveats: [LARGE_GREEN] }),
        adminMetric("dgp_park_median_min", { en: "Median walk to park", de: "Median Fußweg zum Park" }, unbounded),
        adminMetric("dgp_park_p90_min", { en: "Walk to park (90th percentile)", de: "Fußweg zum Park (90. Perzentil)" }, unbounded),
        adminMetric("dgp_playground_median_min", { en: "Median walk to playground", de: "Median Fußweg zum Spielplatz" }, unbounded),
        adminMetric("cov_dgp_green_share", { en: "Green coverage share", de: "Grünflächenanteil" }, coverage),
        adminMetric("cov_dgp_recreational_share", { en: "Recreational coverage share", de: "Erholungsflächenanteil" }, coverage),
    ];
    return {
        key,
        title,
        group: "admin",
        ...entryLayerFields(URBAN_STORY_LAYERS[layerId]),
        metrics,
        defaultMetric: "grn_mean",
        requiredAttributes: requiredAttributesOf(metrics),
        caveats: [CAVEATS.adminAggregate, CAVEATS.coverageUnion],
        readiness: "published",
    };
}

function greenFeatureEntry(key: string, layerId: UrbanStoryLayerId, title: Localized): ExploreEntry {
    return {
        key,
        title,
        group: "green",
        ...entryLayerFields(URBAN_STORY_LAYERS[layerId]),
        metrics: [],
        requiredAttributes: ["feature_group", "feature_type"],
        caveats: [DUPLICATE_FEATURES],
        readiness: "published",
    };
}

export const catalogFixtureStory: UrbanStoryConfig = {
    key: "green-spaces",
    title: { en: "Green Spaces", de: "Grünräume" },
    intro: {
        en: "Hamburg is a green city, but is that green within reach? This story moves from the official "
            + "green areas and smaller green features to the walking time from every building to the "
            + "nearest park and playground.",
        de: "Hamburg ist eine grüne Stadt, aber ist das Grün auch erreichbar? Diese Geschichte führt von den "
            + "amtlichen Grünflächen und kleineren Grünelementen zur Gehzeit von jedem Gebäude "
            + "zum nächsten Park und Spielplatz.",
    },
    caveats: [
        {
            en: "Green coverage is not the same as access.",
            de: "Grünflächenanteil ist nicht dasselbe wie Erreichbarkeit.",
        },
        CAVEATS.coverageUnion,
        CAVEATS.adminAggregate,
        {
            en: "Green features are shown from zoom level 14 because the layers are large.",
            de: "Grünelemente werden wegen der Datenmenge erst ab Zoomstufe 14 angezeigt.",
        },
    ],
    geostory: { id: null },
    overviewCamera: HAMBURG_OVERVIEW_CAMERA,
    explore: withVerifiedStyles([
        {
            key: "green-areas",
            title: { en: "Official green areas", de: "Amtliche Grünflächen" },
            group: "green",
            ...entryLayerFields(URBAN_STORY_LAYERS.greenAreas),
            metrics: [],
            requiredAttributes: ["area_class", "category_en"],
            readiness: "published",
        },
        greenFeatureEntry("green-features-point", "greenFeaturesPoint", { en: "Green features: points", de: "Grünelemente: Punkte" }),
        greenFeatureEntry("green-features-line", "greenFeaturesLine", { en: "Green features: lines", de: "Grünelemente: Linien" }),
        greenFeatureEntry("green-features-polygon", "greenFeaturesPolygon", { en: "Green features: areas", de: "Grünelemente: Flächen" }),
        {
            key: "park-pois",
            title: { en: "Parks as destinations", de: "Parks als Ziele" },
            group: "poi",
            ...entryLayerFields(URBAN_STORY_LAYERS.poiPark),
            metrics: [],
            requiredAttributes: ["category"],
            readiness: "published",
        },
        {
            key: "buildings-park-access",
            title: { en: "Buildings: park access", de: "Gebäude: Parkzugang" },
            group: "building",
            ...entryLayerFields(URBAN_STORY_LAYERS.buildings),
            metrics: buildingMetrics,
            defaultMetric: "score_green",
            requiredAttributes: requiredAttributesOf(buildingMetrics, ["dgp_park_status"]),
            caveats: [CAVEATS.buildingsNotPeople],
            readiness: "published",
        },
        adminEntry("stadtteile-green-access", "stadtteile", { en: "Neighbourhoods: green access", de: "Stadtteile: Grünzugang" }),
        adminEntry("units-green-access", "statisticalUnits", { en: "Statistical units: green access", de: "Statistische Gebiete: Grünzugang" }),
        adminEntry("bezirke-green-access", "bezirke", { en: "Districts: green access", de: "Bezirke: Grünzugang" }),
    ]),
    // DRAFT chapter texts (2026-10-11): descriptive only, pending editorial review. They explain how to read each
    // map and state no computed result. Green inventory (area) and green access (grn_mean) are different measures.
    chapters: [
        {
            chapterKey: "green-inventory",
            title: { en: "Hamburg's green-space inventory", de: "Hamburgs Grünflächenbestand" },
            narrative: {
                en: "These are the official green areas of Hamburg. The map answers where green space exists, not whether people can reach it. "
                    + "Click an area to see its class and category.",
                de: "Dies sind die amtlichen Grünflächen Hamburgs. Die Karte beantwortet, wo es Grünflächen gibt, nicht ob Menschen sie erreichen können. "
                    + "Ein Klick auf eine Fläche zeigt Klasse und Kategorie.",
            },
            camera: CHAPTER_CAMERAS.DISTRICTS,
            show: [{ entryKey: "green-areas" }],
            scene: { id: null, order: 1 },
            relatedExploreEntries: ["green-areas"],
        },
        {
            chapterKey: "green-distribution",
            title: { en: "Where green areas are", de: "Wo die Grünflächen liegen" },
            narrative: {
                en: "Zoomed in, smaller green features appear next to the official areas. Features are drawn from zoom level 14 because the layer is large. "
                    + "Some features are mapped more than once, so do not count or add them up from this map.",
                de: "Beim Hineinzoomen erscheinen kleinere Grünelemente neben den amtlichen Flächen. Elemente werden wegen der Datenmenge ab Zoomstufe 14 gezeichnet. "
                    + "Einige Objekte sind mehrfach erfasst; zählen oder summieren Sie sie daher nicht anhand dieser Karte.",
            },
            camera: CHAPTER_CAMERAS.GREEN_DETAIL,
            show: [{ entryKey: "green-areas" }, { entryKey: "green-features-polygon" }],
            scene: { id: null, order: 2 },
            relatedExploreEntries: ["green-features-polygon", "green-features-line", "green-features-point", "green-areas"],
        },
        {
            chapterKey: "green-access",
            title: { en: "Is green space within reach?", de: "Ist Grün in Reichweite?" },
            narrative: {
                en: "Neighbourhoods are coloured by the mean green access score of their buildings, which measures walking access to large green spaces. "
                    + "This is a different measure from the area of green space: a neighbourhood can contain a lot of green and still have uneven access. "
                    + "Neighbourhoods without a value can look like the lowest class.",
                de: "Stadtteile sind nach dem mittleren Grünzugangs-Score ihrer Gebäude eingefärbt, der den Fußweg zu großen Grünflächen misst. "
                    + "Das ist ein anderes Maß als die Fläche an Grün: Ein Stadtteil kann viel Grün enthalten und dennoch ungleichen Zugang haben. "
                    + "Stadtteile ohne Wert können wie die niedrigste Klasse aussehen.",
            },
            camera: CHAPTER_CAMERAS.DISTRICTS,
            show: [{ entryKey: "stadtteile-green-access", metricKey: "grn_mean" }],
            scene: { id: null, order: 3 },
            relatedExploreEntries: ["stadtteile-green-access", "buildings-park-access", "park-pois"],
        },
        {
            chapterKey: "neighbourhood-differences",
            title: { en: "Differences between neighbourhoods", de: "Unterschiede zwischen Stadtteilen" },
            narrative: {
                en: "Parks are added as destinations on top of the neighbourhood scores. Compare the colours with where parks lie. Walking times to the nearest park and playground are also part of the neighbourhood data, "
                    + "but have no map style yet. They are not capped at 15 minutes and are modelled on the street network.",
                de: "Parks liegen als Ziele über den Stadtteil-Scores. Vergleichen Sie die Farben mit der Lage der Parks. Gehzeiten zum nächsten Park und Spielplatz gehören ebenfalls zu den Stadtteildaten, "
                    + "haben aber noch keine Kartenfarbgebung. Sie sind nicht auf 15 Minuten begrenzt und auf dem Straßennetz modelliert.",
            },
            camera: CHAPTER_CAMERAS.NEIGHBOURHOODS,
            show: [
                { entryKey: "stadtteile-green-access", metricKey: "grn_mean" },
                { entryKey: "park-pois" },
            ],
            scene: { id: null, order: 4 },
            relatedExploreEntries: ["stadtteile-green-access", "units-green-access", "bezirke-green-access", "park-pois"],
        },
        {
            chapterKey: "green-interpretation",
            title: { en: "Interpretation and limits", de: "Einordnung und Grenzen" },
            narrative: {
                en: "Green coverage and green access answer different questions, and neither says how good a green space is. Coverage values are unions "
                    + "of official polygons and are never summed. Neighbourhood values are building-weighted, not population-weighted, and are empty "
                    + "where fewer than 5 buildings contribute.",
                de: "Grünflächenanteil und Grünzugang beantworten unterschiedliche Fragen, und keines sagt etwas über die Qualität einer Grünfläche. "
                    + "Anteilswerte sind Vereinigungen amtlicher Flächen und werden nie aufsummiert. Stadtteilwerte sind gebäudegewichtet, nicht "
                    + "bevölkerungsgewichtet, und fehlen, wenn weniger als 5 Gebäude beitragen.",
            },
            camera: CHAPTER_CAMERAS.DISTRICTS,
            show: [{ entryKey: "stadtteile-green-access", metricKey: "grn_mean" }],
            scene: { id: null, order: 5 },
            relatedExploreEntries: ["stadtteile-green-access", "units-green-access", "bezirke-green-access"],
        },
    ],
};

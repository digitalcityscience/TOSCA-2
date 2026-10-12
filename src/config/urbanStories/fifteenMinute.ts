import { entryLayerFields, URBAN_STORY_LAYERS, type UrbanStoryLayerId } from "./layers";
import { CAVEATS, FIFTEEN_MINUTE_CATEGORIES, labelWith, UNITS } from "./metrics";
import { HAFENCITY_CENTER } from "./overview";
import {
    ADMIN_METRIC_SCALES,
    ADMIN_NAME_FIELD,
    BUILDING_HEIGHT_FIELD,
    BUILDING_MIN_ZOOM,
    BUILDING_SCORE_FIELD,
    CATEGORY_FIELDS,
    STYLE_NAMES,
    type AdministrativeLevel,
    type AdministrativeMetric,
    type FifteenMinuteCategoryId,
} from "./styles/fifteenMinute";
import type { ExploreEntry, Localized, MetricOption, OverviewCamera, UrbanStoryConfig } from "./types";

/** The story opens in HafenCity: tilted street-level view for the building chapters, a city view for the areas. */
const HAFENCITY_BUILDINGS: OverviewCamera = { center: [...HAFENCITY_CENTER], zoom: 16, pitch: 55 };
const HAFENCITY_AREAS: OverviewCamera = { center: [...HAFENCITY_CENTER], zoom: 10.5 };

/**
 * 15-Minute City: a building-centric story whose thematic styling is owned by the frontend
 * (`./styles/fifteenMinute`). It supersedes the earlier generic chapters that only switched
 * between catalog styles and administrative choropleths.
 *
 * Every metric below carries a LOCAL style name (`frontend:15min:...`), never a catalog style, and
 * every entry is `styleSource: "frontend"`, so the story neither fetches nor applies a GeoServer style.
 */

function localMetric(
    key: string,
    attribute: string,
    label: Localized,
    styleName: string,
    details: Pick<MetricOption, "unit" | "nullMeaning" | "caveats"> = {}
): MetricOption {
    return { key, attribute, label, styleName, ...details };
}

/** Metric key of a category in the building entry. */
export function categoryMetricKey(id: FifteenMinuteCategoryId): string {
    return `access_${id}`;
}

const buildingMetrics: MetricOption[] = [
    localMetric(
        BUILDING_SCORE_FIELD,
        BUILDING_SCORE_FIELD,
        { en: "Categories reached (0–9)", de: "Erreichte Kategorien (0–9)" },
        STYLE_NAMES.overall,
        {
            unit: UNITS.categories,
            nullMeaning: { en: "Not computable (no network origin)", de: "Nicht berechenbar (kein Netzanschluss)" },
            caveats: [{
                en: "A count of destination categories within 15 minutes, not a percentage.",
                de: "Anzahl der Zielkategorien innerhalb von 15 Minuten, kein Prozentwert.",
            }],
        }
    ),
    ...FIFTEEN_MINUTE_CATEGORIES.map((category) => localMetric(
        categoryMetricKey(category.id),
        CATEGORY_FIELDS[category.id].accessField,
        labelWith({ en: "Reachable", de: "Erreichbar" }, category.label),
        STYLE_NAMES.category(category.id),
        {
            unit: UNITS.count,
            nullMeaning: { en: "Unknown (not computable)", de: "Unbekannt (nicht berechenbar)" },
        }
    )),
];

function requiredOf(metrics: MetricOption[], extra: string[] = []): string[] {
    return [...new Set([...metrics.map((option) => option.attribute), ...extra])];
}

function adminMetrics(): MetricOption[] {
    return (Object.keys(ADMIN_METRIC_SCALES) as AdministrativeMetric[]).map((metric) => localMetric(
        metric,
        metric,
        ADMIN_METRIC_SCALES[metric].label,
        STYLE_NAMES.admin(metric),
        {
            unit: ADMIN_METRIC_SCALES[metric].unit,
            nullMeaning: { en: "Fewer than 5 valid buildings", de: "Weniger als 5 gültige Gebäude" },
            caveats: [CAVEATS.adminAggregate, ADMIN_METRIC_SCALES[metric].note],
        }
    ));
}

function adminEntry(key: string, layerId: UrbanStoryLayerId, level: AdministrativeLevel, title: Localized): ExploreEntry {
    const metrics = adminMetrics();
    return {
        key,
        title,
        group: "admin",
        ...entryLayerFields(URBAN_STORY_LAYERS[layerId]),
        metrics,
        defaultMetric: "m15_categories_mean",
        requiredAttributes: requiredOf(metrics, ["m15_n", ADMIN_NAME_FIELD[level]]),
        caveats: [CAVEATS.adminAggregate],
        readiness: "published",
        styleSource: "frontend",
    };
}

const POI_LAYER_BY_CATEGORY = {
    food: "poiFood",
    health: "poiHealth",
    education: "poiEducation",
    restaurant: "poiRestaurant",
    culture: "poiCulture",
    bank_post: "poiBankPost",
    sport: "poiSport",
    park: "poiPark",
    stop_any: "poiPtStops",
} as const satisfies Record<FifteenMinuteCategoryId, UrbanStoryLayerId>;

const poiEntries: ExploreEntry[] = FIFTEEN_MINUTE_CATEGORIES.map((category) => ({
    key: CATEGORY_FIELDS[category.id].poiEntryKey,
    title: labelWith({ en: "Destinations", de: "Ziele" }, category.label),
    group: "poi",
    ...entryLayerFields(URBAN_STORY_LAYERS[POI_LAYER_BY_CATEGORY[category.id]]),
    metrics: [],
    requiredAttributes: ["category"],
    readiness: "published",
    styleSource: "frontend",
}));

export const fifteenMinuteStory: UrbanStoryConfig = {
    key: "fifteen-minute",
    title: { en: "15-Minute City", de: "15-Minuten-Stadt" },
    intro: {
        en: "Can you live within 15 minutes in Hamburg? Every ALKIS building is scored for how many of nine everyday "
            + "destination categories it reaches on foot within 15 minutes. Start with single buildings, then explore "
            + "categories, inspect a building and look at where everyday needs are missing.",
        de: "Kann man in Hamburg innerhalb von 15 Minuten leben? Jedes ALKIS-Gebäude wird danach bewertet, wie viele von "
            + "neun Zielkategorien des täglichen Bedarfs es in 15 Minuten zu Fuß erreicht. Beginnen Sie bei einzelnen "
            + "Gebäuden, erkunden Sie Kategorien, prüfen Sie ein Gebäude und sehen Sie, wo Alltagsbedarfe fehlen.",
    },
    caveats: [
        {
            en: "\"Categories reached\" is a count from 0 to 9, not a percentage.",
            de: "„Erreichte Kategorien“ ist eine Anzahl von 0 bis 9, kein Prozentwert.",
        },
        CAVEATS.buildingsNotPeople,
        CAVEATS.adminAggregate,
        {
            en: "Walking times are modelled on the street network, not measured.",
            de: "Gehzeiten sind auf dem Straßennetz modelliert, nicht gemessen.",
        },
    ],
    geostory: { id: null },
    overviewCamera: { center: [...HAFENCITY_CENTER], zoom: 12 },
    explore: [
        {
            key: "buildings-15min",
            title: { en: "Buildings: 15-minute access", de: "Gebäude: 15-Minuten-Erreichbarkeit" },
            group: "building",
            ...entryLayerFields(URBAN_STORY_LAYERS.buildings),
            // The story's own zoom floor (the layer's shared floor for the other stories is 14).
            minZoom: BUILDING_MIN_ZOOM,
            metrics: buildingMetrics,
            defaultMetric: BUILDING_SCORE_FIELD,
            requiredAttributes: requiredOf(buildingMetrics, [BUILDING_HEIGHT_FIELD]),
            caveats: [CAVEATS.buildingsNotPeople],
            readiness: "published",
            styleSource: "frontend",
        },
        adminEntry("stadtteile-15min", "stadtteile", "stadtteile", { en: "Neighbourhoods: 15-minute access", de: "Stadtteile: 15-Minuten-Erreichbarkeit" }),
        adminEntry("bezirke-15min", "bezirke", "bezirke", { en: "Districts: 15-minute access", de: "Bezirke: 15-Minuten-Erreichbarkeit" }),
        ...poiEntries,
    ],
    // DRAFT chapter texts (2026-10-11, rework): descriptive only, pending editorial review. They explain how to
    // read each map and state no computed result. Cameras open on HafenCity (see `overview.ts`).
    chapters: [
        {
            chapterKey: "building-accessibility",
            title: { en: "Building by building", de: "Gebäude für Gebäude" },
            narrative: {
                en: "Can you live within 15 minutes in Hamburg? Each building is coloured by how many of the nine everyday "
                    + "destination categories it reaches within a 15-minute walk (0 to 9; a count, not a percentage). Buildings "
                    + "appear from zoom level 8 and stand up as 3D volumes from zoom 12 (zoom in slowly: tiles are large). Grey buildings have no score. Click a building to read its value.",
                de: "Kann man in Hamburg innerhalb von 15 Minuten leben? Jedes Gebäude ist danach eingefärbt, wie viele der "
                    + "neun Zielkategorien des täglichen Bedarfs es in 15 Minuten zu Fuß erreicht (0 bis 9; eine Anzahl, kein "
                    + "Prozentwert). Gebäude erscheinen ab Zoomstufe 8 und werden ab Zoomstufe 12 dreidimensional (langsam zoomen: die Kacheln sind groß). Graue Gebäude haben keinen Score. Ein Klick zeigt den Wert.",
            },
            camera: HAFENCITY_BUILDINGS,
            show: [{ entryKey: "buildings-15min" }],
            scene: { id: null, order: 1 },
            relatedExploreEntries: ["buildings-15min"],
            interaction: "overall",
        },
        {
            chapterKey: "everyday-needs",
            title: { en: "Explore the nine everyday needs", de: "Die neun Alltagsbedarfe erkunden" },
            narrative: {
                en: "Pick a category to see which buildings can reach it within 15 minutes and which cannot. Green buildings "
                    + "have at least one place of that category within reach, orange buildings have none, grey buildings are "
                    + "unknown. The matching destinations are shown as points (parks as areas). The map stays where you are.",
                de: "Wählen Sie eine Kategorie, um zu sehen, welche Gebäude sie in 15 Minuten erreichen und welche nicht. Grüne "
                    + "Gebäude haben mindestens ein Ziel dieser Kategorie in Reichweite, orange Gebäude keines, graue sind "
                    + "unbekannt. Die zugehörigen Ziele erscheinen als Punkte (Parks als Flächen). Die Karte bleibt, wo Sie sind.",
            },
            camera: HAFENCITY_BUILDINGS,
            show: [{ entryKey: "buildings-15min" }],
            scene: { id: null, order: 2 },
            relatedExploreEntries: ["buildings-15min", ...poiEntries.map((entry) => entry.key)],
            interaction: "category",
        },
        {
            chapterKey: "inspect-building",
            title: { en: "Inspect a building", de: "Ein Gebäude prüfen" },
            narrative: {
                en: "Click a building to select it. Its 15-minute profile appears below: the overall count and, for each of the "
                    + "nine categories, whether it is reachable, not reachable or unknown. The selection stays highlighted until "
                    + "you clear it.",
                de: "Klicken Sie ein Gebäude an, um es auszuwählen. Darunter erscheint sein 15-Minuten-Profil: die Gesamtanzahl und "
                    + "für jede der neun Kategorien, ob sie erreichbar, nicht erreichbar oder unbekannt ist. Die Auswahl bleibt "
                    + "hervorgehoben, bis Sie sie aufheben.",
            },
            camera: HAFENCITY_BUILDINGS,
            show: [{ entryKey: "buildings-15min" }],
            scene: { id: null, order: 3 },
            relatedExploreEntries: ["buildings-15min"],
            interaction: "building",
        },
        {
            chapterKey: "buildings-to-neighbourhoods",
            title: { en: "From buildings to neighbourhoods", de: "Von Gebäuden zu Stadtteilen" },
            narrative: {
                en: "Neighbourhood and district colours summarise the buildings inside them (residential buildings with a score; "
                    + "empty where fewer than 5 contribute). The mean of the 0–9 count and the mean of the 0–100 decay-weighted score "
                    + "are different measures: choose one. Zoom in past level 12 and the area colours give way to the individual buildings.",
                de: "Die Farben von Stadtteilen und Bezirken fassen die Gebäude darin zusammen (Wohngebäude mit Score; leer, wo weniger "
                    + "als 5 beitragen). Das Mittel der 0–9-Anzahl und das Mittel des distanzgewichteten 0–100-Scores sind verschiedene "
                    + "Maße: wählen Sie eines. Beim Hineinzoomen über Stufe 12 weichen die Flächenfarben den einzelnen Gebäuden.",
            },
            camera: HAFENCITY_AREAS,
            // The building layer stays on the map through the interaction store (neighbourhoods mode keeps it visible, and
            // it draws from zoom 8), so the chapter itself stages the area layer, which is light.
            show: [{ entryKey: "stadtteile-15min" }],
            scene: { id: null, order: 4 },
            relatedExploreEntries: ["stadtteile-15min", "bezirke-15min", "buildings-15min"],
            interaction: "neighbourhoods",
        },
        {
            chapterKey: "where-needs-are-missing",
            title: { en: "Where are everyday needs missing?", de: "Wo fehlen Alltagsbedarfe?" },
            narrative: {
                en: "Show only buildings that reach few categories: set the highest count to include. Optionally pick a category and keep "
                    + "only buildings without access to it. The starting threshold is an illustrative value you can change; it is not a "
                    + "standard. Click buildings to inspect them and pan freely. The map does not rank or label any area.",
                de: "Zeigen Sie nur Gebäude, die wenige Kategorien erreichen: Legen Sie die höchste einzuschließende Anzahl fest. Optional "
                    + "wählen Sie eine Kategorie und behalten nur Gebäude ohne Zugang dazu. Der Startwert ist ein veranschaulichender Wert, "
                    + "den Sie ändern können; er ist kein Standard. Klicken Sie Gebäude an und bewegen Sie die Karte frei. Die Karte "
                    + "bewertet oder benennt keine Gebiete.",
            },
            camera: HAFENCITY_BUILDINGS,
            show: [{ entryKey: "buildings-15min" }],
            scene: { id: null, order: 5 },
            relatedExploreEntries: ["buildings-15min", ...poiEntries.map((entry) => entry.key)],
            interaction: "gaps",
        },
    ],
};

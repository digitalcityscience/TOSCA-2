import { entryLayerFields, URBAN_STORY_LAYERS } from "./layers";
import { CAVEATS, UNITS } from "./metrics";
import {
    CITY_CAMERA,
    COMFORT_CAMERA,
    COMPARE_CAMERA,
    EXPLORE_CAMERA,
    SAFETY_CAMERA,
    WEAKEST_CAMERA,
} from "./fifteenMinuteLocations";
import {
    ADMIN_FIELDS,
    ALL_MEASURES,
    BUILDING_MIN_ZOOM,
    CATEGORY_IDS,
    ENTRY_BUILDINGS,
    ENTRY_STADTTEILE,
    FIELDS,
    categoryMeasure,
    countField,
    measureInfo,
    styleNameOf,
    walkMinField,
    categoryOfMeasure,
    type MeasureId,
} from "./styles/fifteenMinute";
import type { ExploreEntry, Localized, MetricOption, StoryChapter, UrbanStoryConfig } from "./types";

/**
 * Beyond the 15-Minute City: one connected GeoStory in six scenes. The chapter texts are static explanations of the
 * question each scene asks and how to read its map; every number, example and comparison is read from the data at
 * runtime by `store/urbanStories.fifteenMinute.ts`. Styling is owned by the frontend (`./styles/fifteenMinute`);
 * no GeoServer style is read or applied.
 */

export const FIFTEEN_MINUTE_STORY_KEY = "fifteen-minute" as const;

/** Metric key of a measure in both entries. */
export const metricKeyOf = (measure: MeasureId): string => measure;

function metricOf(measure: MeasureId, level: "building" | "admin"): MetricOption {
    const info = measureInfo(measure);
    const unit: Localized = level === "admin" && categoryOfMeasure(measure) !== undefined ? UNITS.share : info.unit;
    return {
        key: metricKeyOf(measure),
        attribute: level === "building" ? info.field : info.adminField,
        label: info.label,
        styleName: styleNameOf(level, measure),
        unit,
        nullMeaning: level === "building"
            ? { en: "Not computable (no walking origin)", de: "Nicht berechenbar (kein Wegeanschluss)" }
            : { en: "Fewer than 5 valid buildings", de: "Weniger als 5 gültige Gebäude" },
        caveats: [
            ...(level === "admin" ? [CAVEATS.adminAggregate] : []),
            ...(measure === "comfort" || measure === "safety" ? [CAVEATS.modelled] : []),
            level === "building" ? info.caution : info.adminMeaning,
        ],
    };
}

const buildingMetrics = ALL_MEASURES.map((measure) => metricOf(measure, "building"));
const adminMetrics = ALL_MEASURES.map((measure) => metricOf(measure, "admin"));

const BUILDING_ATTRIBUTES = [
    FIELDS.id, FIELDS.residential, FIELDS.originQuality, FIELDS.confidence, FIELDS.count, FIELDS.decay,
    FIELDS.comfort, FIELDS.comfortConfidence, FIELDS.comfortShare, FIELDS.comfortReason,
    FIELDS.safety, FIELDS.safetyLength, FIELDS.safetyReason, FIELDS.green, FIELDS.dgpPark, FIELDS.dgpParkStatus,
    FIELDS.height, FIELDS.stadtteil,
    ...CATEGORY_IDS.flatMap((id) => [walkMinField(id), countField(id)]),
];

const ADMIN_ATTRIBUTES = [
    ADMIN_FIELDS.id, ADMIN_FIELDS.name, ADMIN_FIELDS.n,
    ...adminMetrics.map((metric) => metric.attribute),
];

const unique = (values: string[]): string[] => [...new Set(values)];

const shown = (entryKey: string, measure: MeasureId) => ({ entryKey, metricKey: metricKeyOf(measure) });
const bothShown = (measure: MeasureId) => [shown(ENTRY_STADTTEILE, measure), shown(ENTRY_BUILDINGS, measure)];

const related = [ENTRY_STADTTEILE, ENTRY_BUILDINGS];

const chapters: StoryChapter[] = [
    {
        chapterKey: "passes-the-test",
        title: { en: "Hamburg passes the 15-minute test. So what?", de: "Hamburg besteht den 15-Minuten-Test. Und nun?" },
        narrative: {
            en: "Much of Hamburg scores well on 15-minute accessibility. Each Stadtteil is coloured by the mean overall score of its "
                + "residential buildings (0–100): how many of nine everyday categories they reach on foot, and how soon. Hover a "
                + "Stadtteil for its value, click it for details. A high score says destinations are near. It does not say which "
                + "destinations they are, how comfortable the walk is or how safe the streets are.",
            de: "Ein großer Teil Hamburgs schneidet bei der 15-Minuten-Erreichbarkeit gut ab. Jeder Stadtteil ist nach dem mittleren "
                + "Gesamtwert seiner Wohngebäude (0–100) eingefärbt: wie viele von neun Alltagskategorien sie zu Fuß erreichen, und "
                + "wie schnell. Überfahren zeigt den Wert, ein Klick die Details. Ein hoher Wert sagt, dass Ziele nah sind. Er sagt "
                + "nicht, welche Ziele das sind, wie angenehm der Weg ist oder wie sicher die Straßen sind.",
        },
        camera: CITY_CAMERA,
        show: bothShown("access"),
        scene: { id: null, order: 1 },
        relatedExploreEntries: related,
    },
    {
        chapterKey: "same-score-different-neighbourhood",
        title: { en: "Same score, different neighbourhood", de: "Gleicher Wert, anderer Stadtteil" },
        narrative: {
            en: "Wilhelmsburg and Langenbek reach almost the same overall score. Their buildings look alike on this map. The chart "
                + "shows what the score is made of: for each of the nine categories, the share of residential buildings with at "
                + "least one place within a 15-minute walk. Fly to either place to see its buildings.",
            de: "Wilhelmsburg und Langenbek erreichen fast denselben Gesamtwert. Ihre Gebäude sehen auf dieser Karte ähnlich aus. "
                + "Das Diagramm zeigt, woraus der Wert besteht: für jede der neun Kategorien der Anteil der Wohngebäude mit mindestens "
                + "einem Ziel in 15 Minuten zu Fuß. Fliegen Sie zu einem der Orte, um seine Gebäude zu sehen.",
        },
        camera: COMPARE_CAMERA,
        show: bothShown("access"),
        scene: { id: null, order: 2 },
        relatedExploreEntries: related,
    },
    {
        chapterKey: "the-weakest-link",
        title: { en: "The weakest link", de: "Das schwächste Glied" },
        narrative: {
            en: "A good total can hide a weak category. Choose a category: every building is now coloured by its walking time to the "
                + "nearest place of that kind. Orange buildings have none within 15 minutes. Langenbek is shown first; the "
                + "category with the lowest share there is selected. Switch categories and compare with Wilhelmsburg.",
            de: "Ein guter Gesamtwert kann eine schwache Kategorie verbergen. Wählen Sie eine Kategorie: Jedes Gebäude ist nun nach "
                + "der Gehzeit zum nächsten Ziel dieser Art eingefärbt. Orange Gebäude haben keines in 15 Minuten. Zuerst wird "
                + "Langenbek gezeigt; die dort am schwächsten erreichbare Kategorie ist gewählt. Wechseln Sie die Kategorie und "
                + "vergleichen Sie mit Wilhelmsburg.",
        },
        camera: WEAKEST_CAMERA,
        show: [shown(ENTRY_STADTTEILE, categoryMeasure("culture")), shown(ENTRY_BUILDINGS, categoryMeasure("culture"))],
        scene: { id: null, order: 3 },
        relatedExploreEntries: related,
    },
    {
        chapterKey: "accessible-but-comfortable",
        title: { en: "Accessible, but comfortable?", de: "Gut erreichbar, aber angenehm?" },
        narrative: {
            en: "Reaching destinations is one thing; the walk is another. Blankenese reaches most categories, yet the streets "
                + "around many of its buildings score lower for walking comfort. Switch between the two views of the same buildings. "
                + "Comfort describes the street network within 400 m of a building, not the route to a particular destination.",
            de: "Ziele zu erreichen ist eines, der Weg dorthin ein anderes. Blankenese erreicht die meisten Kategorien, doch die Straßen "
                + "um viele seiner Gebäude haben einen niedrigeren Gehkomfort. Wechseln Sie zwischen den beiden Ansichten derselben "
                + "Gebäude. Der Komfort beschreibt das Wegenetz im Umkreis von 400 m um ein Gebäude, nicht den Weg zu einem bestimmten Ziel.",
        },
        camera: COMFORT_CAMERA,
        show: bothShown("access"),
        scene: { id: null, order: 4 },
        relatedExploreEntries: related,
    },
    {
        chapterKey: "accessible-but-safe",
        title: { en: "Accessible, but safe?", de: "Gut erreichbar, aber sicher?" },
        narrative: {
            en: "Does a highly accessible neighbourhood have safer streets for walking? Ottensen and Hoheluft-West reach almost all nine "
                + "categories at a similar level, yet the recorded-crash index of the streets around their buildings differs. Switch "
                + "between the two views. The index summarises recorded crashes involving people walking or cycling near a building; "
                + "it is not a measure of personal risk.",
            de: "Hat ein sehr gut erreichbarer Stadtteil sicherere Straßen für Fußgänger? Ottensen und Hoheluft-West erreichen fast alle "
                + "neun Kategorien auf ähnlichem Niveau, doch der Index erfasster Unfälle der Straßen um ihre Gebäude unterscheidet "
                + "sich. Wechseln Sie zwischen den beiden Ansichten. Der Index fasst erfasste Unfälle mit Fuß- oder Radverkehr in der "
                + "Nähe eines Gebäudes zusammen; er misst kein persönliches Risiko.",
        },
        camera: SAFETY_CAMERA,
        show: bothShown("access"),
        scene: { id: null, order: 5 },
        relatedExploreEntries: related,
    },
    {
        chapterKey: "explore-beyond-the-score",
        title: { en: "Explore Hamburg beyond the score", de: "Hamburg jenseits des Wertes erkunden" },
        narrative: {
            en: "What changes when we look beyond the overall score? Pick a theme: overall accessibility, one everyday category, "
                + "walking comfort, pedestrian safety or green-space access. Pan and zoom freely, from the whole city to single "
                + "buildings; click a Stadtteil or building to read its value for the chosen theme. Your selection stays when you "
                + "change the theme.",
            de: "Was ändert sich, wenn wir über den Gesamtwert hinausschauen? Wählen Sie ein Thema: Gesamterreichbarkeit, eine "
                + "Alltagskategorie, Gehkomfort, Fußverkehrssicherheit oder Grünflächenzugang. Bewegen und zoomen Sie frei, von der "
                + "ganzen Stadt bis zu einzelnen Gebäuden; ein Klick auf Stadtteil oder Gebäude zeigt seinen Wert für das gewählte "
                + "Thema. Ihre Auswahl bleibt beim Themenwechsel erhalten.",
        },
        camera: EXPLORE_CAMERA,
        show: bothShown("access"),
        scene: { id: null, order: 6 },
        relatedExploreEntries: related,
    },
];

const stadtteileEntry: ExploreEntry = {
    key: ENTRY_STADTTEILE,
    title: { en: "Neighbourhoods: 15-minute access and beyond", de: "Stadtteile: 15-Minuten-Erreichbarkeit und mehr" },
    group: "admin",
    ...entryLayerFields(URBAN_STORY_LAYERS.stadtteile),
    metrics: adminMetrics,
    defaultMetric: metricKeyOf("access"),
    requiredAttributes: unique(ADMIN_ATTRIBUTES),
    caveats: [CAVEATS.adminAggregate],
    readiness: "published",
    styleSource: "frontend",
};

const buildingsEntry: ExploreEntry = {
    key: ENTRY_BUILDINGS,
    title: { en: "Buildings: access, comfort, safety and green space", de: "Gebäude: Erreichbarkeit, Komfort, Sicherheit und Grün" },
    group: "building",
    ...entryLayerFields(URBAN_STORY_LAYERS.buildings),
    // The story's own zoom floor: footprints from the neighbourhood scale, the Stadtteil summaries above.
    minZoom: BUILDING_MIN_ZOOM,
    metrics: buildingMetrics,
    defaultMetric: metricKeyOf("access"),
    requiredAttributes: unique([...buildingMetrics.map((metric) => metric.attribute), ...BUILDING_ATTRIBUTES]),
    caveats: [CAVEATS.buildingsNotPeople],
    readiness: "published",
    styleSource: "frontend",
};

export const fifteenMinuteStory: UrbanStoryConfig = {
    key: FIFTEEN_MINUTE_STORY_KEY,
    title: { en: "15-Minute City", de: "15-Minuten-Stadt" },
    intro: {
        en: "Beyond the 15-Minute City: Hamburg has access. But what kind of access? Six scenes follow one question from the whole "
            + "city to single buildings: what does a good 15-minute score leave out? Service mix, weakest category, walking "
            + "comfort, pedestrian safety and green-space access.",
        de: "Jenseits der 15-Minuten-Stadt: Hamburg hat Erreichbarkeit. Aber was für eine? Sechs Szenen folgen einer Frage von der "
            + "ganzen Stadt bis zu einzelnen Gebäuden: Was lässt ein guter 15-Minuten-Wert aus? Angebotsmix, schwächste Kategorie, "
            + "Gehkomfort, Fußverkehrssicherheit und Zugang zu Grünflächen.",
    },
    caveats: [
        {
            en: "The overall score is time-weighted (0–100). The count of categories reached (0–9) is a different measure and not a percentage.",
            de: "Der Gesamtwert ist zeitgewichtet (0–100). Die Anzahl erreichter Kategorien (0–9) ist ein anderes Maß und kein Prozentwert.",
        },
        CAVEATS.buildingsNotPeople,
        CAVEATS.adminAggregate,
        {
            en: "Walking times, comfort and the crash index are modelled on the street network, not measured. Comfort and safety describe the surroundings within 400 m, not one route.",
            de: "Gehzeiten, Komfort und Unfallindex sind auf dem Straßennetz modelliert, nicht gemessen. Komfort und Sicherheit beschreiben das Umfeld in 400 m, nicht einen Weg.",
        },
        {
            en: "Health is a broad set of healthcare places. It does not show emergency care, available appointments or capacity.",
            de: "Gesundheit ist eine breite Auswahl an Gesundheitsorten. Sie zeigt weder Notfallversorgung noch freie Termine noch Kapazität.",
        },
    ],
    geostory: { id: null },
    overviewCamera: CITY_CAMERA,
    explore: [buildingsEntry, stadtteileEntry],
    chapters,
};

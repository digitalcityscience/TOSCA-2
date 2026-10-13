import { entryLayerFields, URBAN_STORY_LAYERS } from "./layers";
import { CAVEATS, UNITS } from "./metrics";
import {
    CITY_CAMERA,
    COMPARE_CAMERA,
    DISTRICT_CAMERA,
    EXPLORE_CAMERA,
    PARK_CAMERA,
} from "./greenSpacesLocations";
import {
    ADMIN_FIELDS,
    ADMIN_MEASURES,
    AREA_FIELDS,
    AREA_MIN_ZOOM,
    BUILDING_FIELDS,
    BUILDING_MIN_ZOOM,
    ENTRY_AREAS,
    ENTRY_BUILDINGS,
    ENTRY_FEATURE_LINE,
    ENTRY_FEATURE_POINT,
    ENTRY_FEATURE_POLYGON,
    ENTRY_PARK_POIS,
    ENTRY_STADTTEILE,
    FEATURE_FIELDS,
    FEATURE_MIN_ZOOM,
    SCENE_KEYS,
    accessField,
    adminFieldOf,
    measureText,
    styleNameOf,
    type AccessMeasure,
    type AdminMeasure,
    type SceneKey,
} from "./styles/greenSpaces";
import type { ChapterLayer, ExploreEntry, Localized, MetricOption, StoryChapter, UrbanStoryConfig } from "./types";

/**
 * Green on the Map. Accessible in Real Life? Six connected scenes: the official green inventory, the inside of one park,
 * modelled walking access to parks, modelled walking access to children's playgrounds, the comparison of the two, and a
 * compact explorer. The chapter texts explain the question of each scene and how to read its map; every number, example
 * and comparison is read from the data at runtime by `store/urbanStories.greenSpaces.ts`. Styling is owned by the
 * frontend (`./styles/greenSpaces`); no GeoServer style is read or applied.
 */

export const GREEN_SPACES_STORY_KEY = "green-spaces" as const;

export { SCENE_KEYS, type SceneKey };

const NULL_NO_ORIGIN: Localized = { en: "Not computable (no walking origin)", de: "Nicht berechenbar (kein Wegeanschluss)" };
const NULL_BELOW_FIVE: Localized = { en: "Fewer than 5 valid buildings", de: "Weniger als 5 gültige Gebäude" };

const AREA_METRICS: MetricOption[] = [
    { key: "classes", label: { en: "Official classes", de: "Amtliche Klassen" }, attribute: AREA_FIELDS.class, styleName: styleNameOf("areas", "classes") },
    { key: "parks-only", label: { en: "Recreational parks", de: "Parkanlagen" }, attribute: AREA_FIELDS.class, styleName: styleNameOf("areas", "parks-only") },
    { key: "playgrounds-only", label: { en: "Playgrounds", de: "Spielplätze" }, attribute: AREA_FIELDS.class, styleName: styleNameOf("areas", "playgrounds-only") },
];

function buildingMetric(measure: AccessMeasure): MetricOption {
    const text = measureText(measure);
    return {
        key: measure,
        label: text.label,
        attribute: accessField(measure),
        styleName: styleNameOf("building", measure),
        unit: UNITS.minutes,
        nullMeaning: NULL_NO_ORIGIN,
        caveats: [text.caution],
    };
}

function adminMetric(measure: AdminMeasure): MetricOption {
    const text = measureText(measure);
    const access = measure === "park" || measure === "playground";
    return {
        key: measure,
        label: text.label,
        attribute: adminFieldOf(measure),
        styleName: styleNameOf("admin", measure),
        unit: access ? UNITS.minutes : UNITS.share,
        nullMeaning: access || measure === "large-green" ? NULL_BELOW_FIVE : undefined,
        caveats: [CAVEATS.adminAggregate, ...(measure.startsWith("coverage") ? [CAVEATS.coverageUnion] : []), text.caution],
    };
}

const buildingMetrics = (["park", "playground"] as const).map(buildingMetric);
const adminMetrics = ADMIN_MEASURES.map(adminMetric);

const unique = (values: string[]): string[] => [...new Set(values)];

const DUPLICATE_FEATURES: Localized = {
    en: "Some objects are mapped more than once (duplicate_group_size > 1). They are mapped objects, not verified facilities, public entrances or routes.",
    de: "Einige Objekte sind mehrfach erfasst (duplicate_group_size > 1). Es sind kartierte Objekte, keine geprüften Einrichtungen, öffentlichen Eingänge oder Wege.",
};

function featureEntry(key: string, layerId: "greenFeaturesPolygon" | "greenFeaturesLine" | "greenFeaturesPoint", title: Localized): ExploreEntry {
    const kind = key === ENTRY_FEATURE_POLYGON ? "feature-polygon" : key === ENTRY_FEATURE_LINE ? "feature-line" : "feature-point";
    return {
        key,
        title,
        group: "green",
        ...entryLayerFields(URBAN_STORY_LAYERS[layerId]),
        minZoom: FEATURE_MIN_ZOOM,
        metrics: [{ key: "all", label: title, attribute: FEATURE_FIELDS.group, styleName: styleNameOf(kind, "all") }],
        defaultMetric: "all",
        requiredAttributes: [FEATURE_FIELDS.group, FEATURE_FIELDS.type, FEATURE_FIELDS.code0, FEATURE_FIELDS.idnr],
        caveats: [DUPLICATE_FEATURES],
        readiness: "published",
        styleSource: "frontend",
    };
}

const entries: ExploreEntry[] = [
    {
        key: ENTRY_STADTTEILE,
        title: { en: "Neighbourhoods: park and playground access", de: "Stadtteile: Park- und Spielplatzzugang" },
        group: "admin",
        ...entryLayerFields(URBAN_STORY_LAYERS.stadtteile),
        metrics: adminMetrics,
        defaultMetric: "park",
        requiredAttributes: unique([ADMIN_FIELDS.id, ADMIN_FIELDS.name, ADMIN_FIELDS.bezirk, ADMIN_FIELDS.parkN, ADMIN_FIELDS.playgroundN, ADMIN_FIELDS.parkP90, ADMIN_FIELDS.playgroundP90, ...adminMetrics.map((metric) => metric.attribute)]),
        caveats: [CAVEATS.adminAggregate, CAVEATS.coverageUnion],
        readiness: "published",
        styleSource: "frontend",
    },
    {
        key: ENTRY_AREAS,
        title: { en: "Official green areas", de: "Amtliche Grünflächen" },
        group: "green",
        ...entryLayerFields(URBAN_STORY_LAYERS.greenAreas),
        // The areas are light enough for the whole-city view of scene 1.
        minZoom: AREA_MIN_ZOOM,
        metrics: AREA_METRICS,
        defaultMetric: "classes",
        requiredAttributes: unique([AREA_FIELDS.id, AREA_FIELDS.idnr, AREA_FIELDS.name, AREA_FIELDS.class, AREA_FIELDS.categoryEn, AREA_FIELDS.categoryDe, AREA_FIELDS.area]),
        caveats: [{
            en: "Official green areas are different land uses. A green polygon is not automatically a freely usable park.",
            de: "Amtliche Grünflächen sind unterschiedliche Nutzungen. Eine grüne Fläche ist nicht automatisch ein frei nutzbarer Park.",
        }],
        readiness: "published",
        styleSource: "frontend",
    },
    featureEntry(ENTRY_FEATURE_POLYGON, "greenFeaturesPolygon", { en: "Green features: areas", de: "Grünelemente: Flächen" }),
    featureEntry(ENTRY_FEATURE_LINE, "greenFeaturesLine", { en: "Green features: lines", de: "Grünelemente: Linien" }),
    featureEntry(ENTRY_FEATURE_POINT, "greenFeaturesPoint", { en: "Green features: points", de: "Grünelemente: Punkte" }),
    {
        key: ENTRY_PARK_POIS,
        title: { en: "Parks from OpenStreetMap / ALKIS (comparison)", de: "Parks aus OpenStreetMap / ALKIS (Vergleich)" },
        group: "poi",
        ...entryLayerFields(URBAN_STORY_LAYERS.poiPark),
        minZoom: 11,
        metrics: [{ key: "outline", label: { en: "Park outlines", de: "Parkumrisse" }, attribute: "category", styleName: styleNameOf("pois", "outline") }],
        defaultMetric: "outline",
        requiredAttributes: ["category", "name"],
        caveats: [{
            en: "A different source from the official green areas: the two are not matched or merged, and neither is the definitive truth.",
            de: "Eine andere Quelle als die amtlichen Grünflächen: Beide werden nicht abgeglichen oder verschmolzen, keine ist die endgültige Wahrheit.",
        }],
        readiness: "published",
        styleSource: "frontend",
    },
    {
        key: ENTRY_BUILDINGS,
        title: { en: "Buildings: walk to the nearest park and playground", de: "Gebäude: Weg zum nächsten Park und Spielplatz" },
        group: "building",
        ...entryLayerFields(URBAN_STORY_LAYERS.buildings),
        // The story's own zoom floor: footprints from the neighbourhood scale, the Stadtteil summaries above.
        minZoom: BUILDING_MIN_ZOOM,
        metrics: buildingMetrics,
        defaultMetric: "park",
        requiredAttributes: unique([
            ...buildingMetrics.map((metric) => metric.attribute),
            BUILDING_FIELDS.id, BUILDING_FIELDS.residential, BUILDING_FIELDS.parkStatus, BUILDING_FIELDS.playgroundStatus, BUILDING_FIELDS.height, BUILDING_FIELDS.stadtteil,
        ]),
        caveats: [CAVEATS.buildingsNotPeople],
        readiness: "published",
        styleSource: "frontend",
    },
];

/**
 * Every scene stages the same layers, in the order they must be drawn: the scene state then decides what each one shows
 * through a style swap (a hidden layer is a style, not a removed layer). This keeps the layer order stable, the camera
 * and the selection untouched, and no scene starts from an empty map.
 */
const stage = (): ChapterLayer[] => [
    { entryKey: ENTRY_STADTTEILE },
    { entryKey: ENTRY_AREAS },
    { entryKey: ENTRY_FEATURE_POLYGON },
    { entryKey: ENTRY_FEATURE_LINE },
    { entryKey: ENTRY_FEATURE_POINT },
    { entryKey: ENTRY_PARK_POIS },
    { entryKey: ENTRY_BUILDINGS },
];

const ALL_ENTRIES = [ENTRY_AREAS, ENTRY_STADTTEILE, ENTRY_BUILDINGS, ENTRY_FEATURE_POLYGON, ENTRY_FEATURE_LINE, ENTRY_FEATURE_POINT, ENTRY_PARK_POIS];

const chapters: StoryChapter[] = [
    {
        chapterKey: "what-counts-as-a-park",
        title: { en: "Hamburg is green. But what counts as a park?", de: "Hamburg ist grün. Aber was zählt als Park?" },
        narrative: {
            en: "Every colour on this map is an official green area of Hamburg's Digitaler Grünplan, classified by land use. Recreational parks and "
                + "playgrounds are only two of seven classes: allotments, cemeteries, sports grounds and protective green are green too, but they "
                + "are not places for everyday recreation. Hover or click an area to see what it is.",
            de: "Jede Farbe auf dieser Karte ist eine amtliche Grünfläche aus Hamburgs Digitalem Grünplan, nach Nutzung klassifiziert. Parks und "
                + "Spielplätze sind nur zwei von sieben Klassen: Kleingärten, Friedhöfe, Sportanlagen und Schutzgrün sind ebenfalls grün, aber keine "
                + "Orte für die alltägliche Erholung. Überfahren oder Anklicken einer Fläche zeigt, worum es sich handelt.",
        },
        camera: CITY_CAMERA,
        show: stage(),
        scene: { id: null, order: 1 },
        relatedExploreEntries: [ENTRY_AREAS, ENTRY_STADTTEILE],
    },
    {
        chapterKey: "inside-the-park",
        title: { en: "Inside the park", de: "Im Park" },
        narrative: {
            en: "An official park polygon is only the outline of a park. As you zoom in, the detailed Feinkartierung Grün shows what is mapped inside it: "
                + "paths, planting, lawns, water, fences and play surfaces. The objects belong to the park through its official number (dgp_idnr), not "
                + "because they happen to lie nearby. They are mapped objects; they do not show where the public can enter the park.",
            de: "Eine amtliche Parkfläche ist nur der Umriss eines Parks. Beim Hineinzoomen zeigt die detaillierte Feinkartierung Grün, was darin "
                + "kartiert ist: Wege, Bepflanzung, Rasen, Wasser, Zäune und Spielflächen. Die Objekte gehören über die amtliche Nummer (dgp_idnr) zum "
                + "Park, nicht weil sie zufällig daneben liegen. Es sind kartierte Objekte; sie zeigen nicht, wo die Öffentlichkeit den Park betreten kann.",
        },
        camera: PARK_CAMERA,
        show: stage(),
        scene: { id: null, order: 2 },
        relatedExploreEntries: [ENTRY_AREAS, ENTRY_FEATURE_POLYGON, ENTRY_FEATURE_LINE, ENTRY_FEATURE_POINT],
    },
    {
        chapterKey: "park-nearby-how-far",
        title: { en: "A park nearby, but how far on foot?", de: "Ein Park in der Nähe, aber wie weit zu Fuß?" },
        narrative: {
            en: "Nienstedten has a large park. Does every building reach it as easily as the map suggests? Stadtteile are coloured by the median modelled "
                + "walk from their residential buildings to the nearest official park; zoomed in, every building has its own time. Click a building to read "
                + "it. The time is modelled to the park area, not to a verified entrance.",
            de: "Nienstedten hat einen großen Park. Erreicht ihn jedes Gebäude so leicht, wie die Karte vermuten lässt? Stadtteile sind nach dem Median der "
                + "modellierten Gehzeit ihrer Wohngebäude zum nächsten offiziellen Park eingefärbt; beim Hineinzoomen hat jedes Gebäude seine eigene Zeit. "
                + "Ein Klick auf ein Gebäude zeigt sie. Die Zeit ist bis zur Parkfläche modelliert, nicht bis zu einem geprüften Eingang.",
        },
        camera: DISTRICT_CAMERA,
        show: stage(),
        scene: { id: null, order: 3 },
        relatedExploreEntries: [ENTRY_STADTTEILE, ENTRY_BUILDINGS, ENTRY_AREAS],
    },
    {
        chapterKey: "where-can-children-play",
        title: { en: "Where can children play?", de: "Wo können Kinder spielen?" },
        narrative: {
            en: "Playgrounds are a different destination from parks. Orange areas are official playgrounds of the Digitaler Grünplan; buildings are coloured "
                + "by the modelled walk to the nearest one, on the same scale as the park map. In Nienstedten, a building beside the Hirschpark playground and "
                + "one a few hundred metres away have very different times. The metric is geographic access only: not playground quality, equipment, "
                + "suitable age, capacity or availability.",
            de: "Spielplätze sind ein anderes Ziel als Parks. Orange Flächen sind offizielle Spielplätze des Digitalen Grünplans; Gebäude sind nach der "
                + "modellierten Gehzeit zum nächsten Spielplatz eingefärbt, auf derselben Skala wie die Parkkarte. In Nienstedten haben ein Gebäude neben dem "
                + "Spielplatz im Hirschpark und eines einige hundert Meter entfernt sehr unterschiedliche Zeiten. Die Kennzahl misst nur die räumliche "
                + "Erreichbarkeit: nicht Qualität, Ausstattung, Altersgruppe, Kapazität oder Verfügbarkeit.",
        },
        camera: DISTRICT_CAMERA,
        show: stage(),
        scene: { id: null, order: 4 },
        relatedExploreEntries: [ENTRY_STADTTEILE, ENTRY_BUILDINGS, ENTRY_AREAS],
    },
    {
        chapterKey: "park-vs-playground",
        title: { en: "Park access vs playground access", de: "Parkzugang und Spielplatzzugang im Vergleich" },
        narrative: {
            en: "Switch between the two maps: same place, same buildings, same colour scale. Compare the two buildings, and the neighbouring Stadtteile "
                + "Nienstedten and Othmarschen, whose park times are similar but whose playground times differ. The two measures are never combined into "
                + "one score. They describe two different destinations, not the needs of any household: there is no data on children or families here.",
            de: "Wechseln Sie zwischen den beiden Karten: derselbe Ort, dieselben Gebäude, dieselbe Farbskala. Vergleichen Sie die beiden Gebäude und die "
                + "Nachbarstadtteile Nienstedten und Othmarschen, deren Parkzeiten ähnlich sind, deren Spielplatzzeiten aber abweichen. Die beiden Maße "
                + "werden nie zu einem Wert verbunden. Sie beschreiben zwei verschiedene Ziele, nicht den Bedarf eines Haushalts: Daten zu Kindern oder "
                + "Familien gibt es hier nicht.",
        },
        camera: COMPARE_CAMERA,
        show: stage(),
        scene: { id: null, order: 5 },
        relatedExploreEntries: [ENTRY_STADTTEILE, ENTRY_BUILDINGS, ENTRY_AREAS],
    },
    {
        chapterKey: "explore-green-hamburg",
        title: { en: "Explore green Hamburg", de: "Das grüne Hamburg erkunden" },
        narrative: {
            en: "Choose a theme and explore freely, from the whole city to single buildings. Click a green area, a Stadtteil or a building to read its "
                + "published values. Park and playground walking times always stay separate.",
            de: "Wählen Sie ein Thema und erkunden Sie frei, von der ganzen Stadt bis zu einzelnen Gebäuden. Ein Klick auf eine Grünfläche, einen "
                + "Stadtteil oder ein Gebäude zeigt die veröffentlichten Werte. Gehzeiten zu Park und Spielplatz bleiben immer getrennt.",
        },
        camera: EXPLORE_CAMERA,
        show: stage(),
        scene: { id: null, order: 6 },
        relatedExploreEntries: ALL_ENTRIES,
    },
];

export const greenSpacesStory: UrbanStoryConfig = {
    key: GREEN_SPACES_STORY_KEY,
    title: { en: "Green Spaces", de: "Grünräume" },
    intro: {
        en: "Green on the Map. Accessible in Real Life? Where are Hamburg's parks and playgrounds, and how easily can residents reach them? "
            + "Six scenes move from the official green inventory, through one park and one neighbourhood, to modelled walking access to parks "
            + "and to children's playgrounds.",
        de: "Grün auf der Karte. Auch im echten Leben erreichbar? Wo liegen Hamburgs Parks und Spielplätze, und wie leicht erreichen Bewohner sie? "
            + "Sechs Szenen führen vom amtlichen Grünbestand über einen Park und ein Quartier zur modellierten Gehzeit zu Parks und zu "
            + "Kinderspielplätzen.",
    },
    caveats: [
        {
            en: "Green area on the map is not the same as access to it, and not every green polygon is a public recreational park.",
            de: "Grünfläche auf der Karte ist nicht dasselbe wie Zugang dazu, und nicht jede grüne Fläche ist ein öffentlicher Erholungspark.",
        },
        {
            en: "Walking times are modelled, not measured, and are not capped at 15 minutes. They end at the destination area, not at a verified entrance: only 130 of 951 parks have supported entrances, so times can be optimistic.",
            de: "Gehzeiten sind modelliert, nicht gemessen, und nicht auf 15 Minuten begrenzt. Sie enden an der Zielfläche, nicht an einem geprüften Eingang: Nur 130 von 951 Parks haben gestützte Eingänge, die Zeiten können daher zu optimistisch sein.",
        },
        {
            en: "Park and playground walking times are two different destinations and are never combined.",
            de: "Gehzeiten zu Park und Spielplatz sind zwei verschiedene Ziele und werden nie verbunden.",
        },
        CAVEATS.coverageUnion,
        CAVEATS.buildingsNotPeople,
    ],
    geostory: { id: null },
    overviewCamera: CITY_CAMERA,
    explore: entries,
    chapters,
};

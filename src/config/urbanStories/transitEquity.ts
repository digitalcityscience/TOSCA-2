import { entryLayerFields, URBAN_STORY_LAYERS } from "./layers";
import { CAVEATS, UNITS } from "./metrics";
import { AGREEMENT_CAMERA, COMPARE_CAMERA, CITY_CAMERA, EXPLORE_CAMERA, LANGENHORN_CAMERA, SERVICE_CAMERA } from "./transitEquityLocations";
import {
    ADMIN_OUTSIDE_SHARE,
    BUILDING_MIN_ZOOM,
    ENTRY_BUILDINGS,
    ENTRY_STADTTEILE,
    ENTRY_UNITS,
    FIELDS,
    STYLE_NAMES,
    type BuildingView,
} from "./styles/transitEquity";
import type { ExploreEntry, Localized, MetricOption, StoryChapter, UrbanStoryConfig } from "./types";

/**
 * Public Transport Equity: one connected GeoStory in six scenes. Chapter texts here are static explanations of the
 * question each scene asks and how to read its map; every number, example and comparison is read from the data at
 * runtime by `store/urbanStories.transitEquity.ts`. Styling is owned by the frontend (`./styles/transitEquity`).
 */

export const EQUITY_STORY_KEY = "transit-equity" as const;

/** Metric keys of the building entry; one per view of the building layer. */
export const BUILDING_VIEW_METRIC: Record<BuildingView, string> = {
    coverage: "view-coverage",
    agreement: "view-agreement",
    departures: "view-departures",
    criteria: "view-criteria",
};

function viewMetric(view: BuildingView, attribute: string, label: Localized, unit: Localized, caveats: Localized[] = []): MetricOption {
    return { key: BUILDING_VIEW_METRIC[view], attribute, label, styleName: STYLE_NAMES[view], unit, ...(caveats.length === 0 ? {} : { caveats }) };
}

const buildingMetrics: MetricOption[] = [
    viewMetric("coverage", FIELDS.inCatchment, { en: "Inside an official catchment?", de: "Im amtlichen Einzugsbereich?" }, UNITS.flag),
    viewMetric("agreement", FIELDS.walkMin, { en: "Official catchment vs walking access", de: "Einzugsbereich und Fußweg-Erreichbarkeit" }, UNITS.class),
    viewMetric("departures", FIELDS.departures, { en: "Daily departures within reach", de: "Tägliche Abfahrten in Reichweite" }, { en: "departures per day", de: "Abfahrten pro Tag" }, [CAVEATS.departuresLowerBound]),
    viewMetric("criteria", FIELDS.lines, { en: "Buildings matching your criteria", de: "Gebäude nach Ihren Kriterien" }, UNITS.flag),
];

const BUILDING_ATTRIBUTES = [
    FIELDS.function, FIELDS.districtMatch, FIELDS.inCatchment, FIELDS.walkMin, FIELDS.originQuality,
    FIELDS.departures, FIELDS.departuresComplete, FIELDS.lines, FIELDS.height,
];

const OUTSIDE_SHARE_METRIC: MetricOption = {
    key: "outside-share",
    attribute: ADMIN_OUTSIDE_SHARE,
    label: { en: "Housing buildings outside official catchments", de: "Wohngebäude außerhalb amtlicher Einzugsbereiche" },
    styleName: STYLE_NAMES.adminOutside,
    unit: UNITS.share,
    nullMeaning: { en: "No housing buildings", de: "Keine Wohngebäude" },
    caveats: [CAVEATS.adminAggregate, CAVEATS.legacyPtAssignment],
};

function adminEntry(key: string, layer: "stadtteile" | "statisticalUnits", title: Localized): ExploreEntry {
    return {
        key,
        title,
        group: "admin",
        ...entryLayerFields(URBAN_STORY_LAYERS[layer]),
        metrics: [OUTSIDE_SHARE_METRIC],
        defaultMetric: OUTSIDE_SHARE_METRIC.key,
        requiredAttributes: [ADMIN_OUTSIDE_SHARE],
        caveats: [CAVEATS.adminAggregate, CAVEATS.legacyPtAssignment],
        readiness: "published",
        styleSource: "frontend",
    };
}

const STADTTEILE_SHOWN = { entryKey: ENTRY_STADTTEILE, metricKey: OUTSIDE_SHARE_METRIC.key };
const buildingsShown = (view: BuildingView) => ({ entryKey: ENTRY_BUILDINGS, metricKey: BUILDING_VIEW_METRIC[view] });

const related = [ENTRY_STADTTEILE, ENTRY_BUILDINGS, ENTRY_UNITS];

const chapters: StoryChapter[] = [
    {
        chapterKey: "who-is-covered",
        title: { en: "Who is covered?", de: "Wer ist abgedeckt?" },
        narrative: {
            en: "How many Hamburg homes are within reach of public transport? The city publishes a walking catchment around every stop: "
                + "480 m for buses, 720 m for rail. Each Stadtteil is coloured by the share of its housing buildings that lie outside all "
                + "catchments. Hover a Stadtteil to see its share; click it for details. Inside a catchment only means a stop is close, "
                + "not that service is frequent.",
            de: "Wie viele Hamburger Wohnungen sind vom ÖPNV aus erreichbar? Die Stadt veröffentlicht um jede Haltestelle einen Einzugsbereich "
                + "zu Fuß: 480 m für Busse, 720 m für Bahnen. Jeder Stadtteil ist nach dem Anteil seiner Wohngebäude eingefärbt, die außerhalb "
                + "aller Einzugsbereiche liegen. Überfahren zeigt den Anteil, ein Klick die Details. Im Einzugsbereich zu liegen heißt nur, "
                + "dass eine Haltestelle nah ist, nicht, dass oft etwas fährt.",
        },
        camera: CITY_CAMERA,
        show: [STADTTEILE_SHOWN, buildingsShown("coverage")],
        scene: { id: null, order: 1 },
        relatedExploreEntries: related,
    },
    {
        chapterKey: "where-are-the-gaps",
        title: { en: "Where are the gaps?", de: "Wo sind die Lücken?" },
        narrative: {
            en: "The city-wide share hides local gaps. The map now zooms into a Stadtteil with many housing buildings outside the "
                + "catchments. Zoom in to see buildings as 3D shapes, the catchment outlines (from zoom 14) and nearby stops as points. "
                + "Click a housing building to see whether it is covered.",
            de: "Der Anteil für die ganze Stadt verbirgt lokale Lücken. Die Karte zoomt nun in einen Stadtteil mit vielen Wohngebäuden "
                + "außerhalb der Einzugsbereiche. Beim Hineinzoomen erscheinen Gebäude als 3D-Körper, die Einzugsbereiche (ab Zoomstufe 14) "
                + "und nahe Haltestellen als Punkte. Ein Klick auf ein Wohngebäude zeigt, ob es abgedeckt ist.",
        },
        camera: LANGENHORN_CAMERA,
        show: [STADTTEILE_SHOWN, buildingsShown("coverage")],
        scene: { id: null, order: 2 },
        relatedExploreEntries: related,
    },
    {
        chapterKey: "stop-is-not-service",
        title: { en: "A stop is not the same as good service", de: "Eine Haltestelle ist noch kein gutes Angebot" },
        narrative: {
            en: "A stop nearby does not tell you how much service it offers. Buildings are now coloured by the daily departures of the "
                + "stops within their reach. Stop circles grow with departures and show the number of lines. Compare two buildings that "
                + "are both inside a catchment. The figures have no stated date and are not live.",
            de: "Eine Haltestelle in der Nähe sagt noch nicht, wie viel Verkehr dort fährt. Gebäude sind jetzt nach den täglichen Abfahrten "
                + "der Haltestellen in ihrer Reichweite eingefärbt. Haltestellenkreise wachsen mit den Abfahrten und zeigen die Zahl der "
                + "Linien. Vergleichen Sie zwei Gebäude, die beide im Einzugsbereich liegen. Die Zahlen haben kein angegebenes Datum und "
                + "sind nicht live.",
        },
        camera: SERVICE_CAMERA,
        show: [STADTTEILE_SHOWN, buildingsShown("departures")],
        scene: { id: null, order: 3 },
        relatedExploreEntries: related,
    },
    {
        chapterKey: "coverage-vs-walking",
        title: { en: "Official coverage vs walking access", de: "Amtlicher Einzugsbereich und Fußweg" },
        narrative: {
            en: "Do the official catchments and walking times agree? The official catchment uses fixed distances on a 2020 network. "
                + "The walking time is modelled on today's streets, including slopes. Each building falls into one of four classes: "
                + "both say near, both say far, or only one says near. Neither method is the truth; they use different rules and data.",
            de: "Stimmen die amtlichen Einzugsbereiche und die Gehzeiten überein? Der Einzugsbereich nutzt feste Distanzen auf einem Netz "
                + "von 2020. Die Gehzeit ist auf den heutigen Straßen modelliert, inklusive Steigung. Jedes Gebäude fällt in eine von vier "
                + "Klassen: beide sagen nah, beide sagen fern, oder nur eines sagt nah. Keines von beiden ist die Wahrheit; sie nutzen "
                + "unterschiedliche Regeln und Daten.",
        },
        camera: AGREEMENT_CAMERA,
        show: [STADTTEILE_SHOWN, buildingsShown("agreement")],
        scene: { id: null, order: 4 },
        relatedExploreEntries: related,
    },
    {
        chapterKey: "averages-hide-differences",
        title: { en: "Averages hide differences", de: "Durchschnitte verbergen Unterschiede" },
        narrative: {
            en: "Can a Stadtteil look fine on average while many of its buildings are poorly served? Two neighbouring Stadtteile with a "
                + "similar average are compared building by building, by daily departures within reach. This shows differences in service "
                + "across space; it says nothing about the people who live there.",
            de: "Kann ein Stadtteil im Durchschnitt gut aussehen, obwohl viele seiner Gebäude schlecht bedient sind? Zwei benachbarte "
                + "Stadtteile mit ähnlichem Durchschnitt werden Gebäude für Gebäude nach täglichen Abfahrten in Reichweite verglichen. "
                + "Das zeigt Unterschiede im Angebot im Raum; über die Menschen, die dort wohnen, sagt es nichts.",
        },
        camera: COMPARE_CAMERA,
        // Only the buildings: at this scale the area colours would hide the footprints' departure colours.
        show: [buildingsShown("departures")],
        scene: { id: null, order: 5 },
        relatedExploreEntries: related,
    },
    {
        chapterKey: "explore-the-gaps",
        title: { en: "Explore the gaps", de: "Die Lücken erkunden" },
        narrative: {
            en: "Which places deserve a closer look? Define poor access yourself: pick a Stadtteil, choose whether buildings must lie "
                + "outside the catchments, and set a minimum walking time and a maximum number of departures or lines. Matching housing "
                + "buildings are highlighted. Click an area, building or stop to inspect it. The thresholds are your choice, not an official standard.",
            de: "Welche Orte verdienen einen genaueren Blick? Legen Sie selbst fest, was schlechter Zugang heißt: Wählen Sie einen "
                + "Stadtteil, ob Gebäude außerhalb der Einzugsbereiche liegen müssen, eine Mindest-Gehzeit und höchstens so viele Abfahrten "
                + "oder Linien. Passende Wohngebäude werden hervorgehoben. Ein Klick auf Gebiet, Gebäude oder Haltestelle zeigt Details. "
                + "Die Schwellen wählen Sie selbst; sie sind kein offizieller Standard.",
        },
        camera: EXPLORE_CAMERA,
        show: [STADTTEILE_SHOWN, { entryKey: ENTRY_UNITS, metricKey: OUTSIDE_SHARE_METRIC.key }, buildingsShown("criteria")],
        scene: { id: null, order: 6 },
        relatedExploreEntries: related,
    },
];

export const transitEquityStory: UrbanStoryConfig = {
    key: EQUITY_STORY_KEY,
    title: { en: "Public Transport Equity", de: "Gerechter Zugang zum ÖPNV" },
    intro: {
        en: "Can everyone in Hamburg reach public transport from home? Six scenes follow this question from the whole city down to single "
            + "buildings: who lives inside the official HVV catchments, where the gaps are, how much service a nearby stop really offers, "
            + "how the official map compares with walking times, and what averages hide.",
        de: "Kann jeder in Hamburg den ÖPNV von zu Hause aus erreichen? Sechs Szenen gehen dieser Frage nach, von der ganzen Stadt bis zu "
            + "einzelnen Gebäuden: Wer liegt in den amtlichen HVV-Einzugsbereichen, wo sind die Lücken, wie viel Angebot hat eine nahe "
            + "Haltestelle wirklich, wie passen die amtliche Karte und die Gehzeiten zusammen, und was verbergen Durchschnitte?",
    },
    caveats: [
        {
            en: "A stop within walking distance is not the same as good service: it says nothing about how often vehicles run.",
            de: "Eine Haltestelle in Gehnähe ist noch kein gutes Angebot: Sie sagt nichts darüber, wie oft Fahrzeuge fahren.",
        },
        CAVEATS.buildingsNotPeople,
        {
            en: "Departures are per day. The source gives no date or season, and the figures are not live. Where data is incomplete, they are minimums.",
            de: "Abfahrten gelten pro Tag. Die Quelle nennt weder Datum noch Saison, und die Zahlen sind nicht live. Bei unvollständigen Daten sind es Mindestwerte.",
        },
        {
            en: "The official catchments rest on a 2020 walking network and 2021 addresses. Walking times are modelled on today's streets. Neither comes from a field survey.",
            de: "Die amtlichen Einzugsbereiche beruhen auf einem Gehnetz von 2020 und Adressen von 2021. Gehzeiten sind auf den heutigen Straßen modelliert. Beides stammt nicht aus einer Vor-Ort-Erhebung.",
        },
        CAVEATS.legacyPtAssignment,
    ],
    geostory: { id: null },
    overviewCamera: CITY_CAMERA,
    explore: [
        {
            key: ENTRY_BUILDINGS,
            title: { en: "Buildings: public transport access", de: "Gebäude: ÖPNV-Zugang" },
            group: "building",
            ...entryLayerFields(URBAN_STORY_LAYERS.buildings),
            // The story's own zoom floor: footprints from the neighbourhood scale, the Stadtteil choropleth above.
            minZoom: BUILDING_MIN_ZOOM,
            metrics: buildingMetrics,
            defaultMetric: BUILDING_VIEW_METRIC.coverage,
            requiredAttributes: [...new Set([...buildingMetrics.map((option) => option.attribute), ...BUILDING_ATTRIBUTES])],
            caveats: [CAVEATS.buildingsNotPeople],
            readiness: "published",
            styleSource: "frontend",
        },
        adminEntry(ENTRY_STADTTEILE, "stadtteile", { en: "Neighbourhoods: housing outside catchments", de: "Stadtteile: Wohnen außerhalb der Einzugsbereiche" }),
        adminEntry(ENTRY_UNITS, "statisticalUnits", { en: "Statistical areas: housing outside catchments", de: "Statistische Gebiete: Wohnen außerhalb der Einzugsbereiche" }),
    ],
    chapters,
};

import type { Localized } from "./types";

/**
 * Panel texts of Public Transport Equity. Static labels and explanations only; every number is interpolated from
 * data at runtime by the panel. English and German; other locales read English (like the story texts).
 */

const t = (en: string, de: string): Localized => ({ en, de });

export const EQUITY_TEXT = {
    loading: t("Reading the data…", "Daten werden gelesen …"),
    dataError: t("The data could not be read. The map still works; the numbers are unavailable.", "Die Daten konnten nicht gelesen werden. Die Karte funktioniert weiter; die Zahlen fehlen."),
    housing: t("housing buildings", "Wohngebäude"),
    buildingsNotPeople: t("Buildings, not people.", "Gebäude, nicht Menschen."),
    legendTitle: t("Legend", "Legende"),
    onMap: t("On the map", "Auf der Karte"),
    zoomHint: t(
        "Zoom out for areas, in for building footprints (from zoom 11) and 3D volumes (from zoom 15). The same colours apply at every zoom.",
        "Herauszoomen zeigt Gebiete, Hineinzoomen Gebäudegrundrisse (ab Zoom 11) und 3D-Volumen (ab Zoom 15). Die Farben gelten auf jeder Stufe."
    ),

    // scene 1
    coverageTitle: t("Hamburg-wide", "Ganz Hamburg"),
    coverageDefinition: t(
        "What “official HVV catchment” means: for every stop entrance and platform access, the city publishes the area within walking distance, 480 m for buses and 720 m for rail. It is based on a 2020 walking network and 2021 addresses. A building counts as inside if its reference point lies in such an area. This is a distance rule only; it does not show how often vehicles run.",
        "Was „amtlicher HVV-Einzugsbereich“ heißt: Für jeden Haltestelleneingang und Bahnsteigzugang veröffentlicht die Stadt den Bereich in Gehdistanz, 480 m für Busse und 720 m für Bahnen. Grundlage sind ein Gehnetz von 2020 und Adressen von 2021. Ein Gebäude liegt innerhalb, wenn sein Bezugspunkt in einem solchen Bereich liegt. Das ist nur eine Distanzregel; wie oft Fahrzeuge fahren, zeigt sie nicht."
    ),
    distributionTitle: t("How coverage is spread over the Stadtteile", "Verteilung der Abdeckung über die Stadtteile"),
    distributionCaption: t("Number of Stadtteile by share of housing buildings outside every catchment", "Anzahl der Stadtteile nach Anteil der Wohngebäude außerhalb aller Einzugsbereiche"),
    noHousing: t("without housing buildings (no value)", "ohne Wohngebäude (kein Wert)"),
    clickHint: t("Hover a Stadtteil for its rate; click it to inspect.", "Stadtteil überfahren für die Quote, anklicken zum Prüfen."),
    nextHint: t("Next: a Stadtteil where the citywide average hides a large gap.", "Weiter: ein Stadtteil, in dem der Stadtdurchschnitt eine große Lücke verbirgt."),

    // scene 2
    gapTitle: t("Selected Stadtteil", "Gewählter Stadtteil"),
    gapPattern: t("The pattern", "Das Muster"),
    gapSelect: t("Select a housing building on the map to read its status.", "Wählen Sie ein Wohngebäude auf der Karte, um seinen Status zu lesen."),
    gapExampleButton: t("Show an example building", "Beispielgebäude zeigen"),

    // scene 3
    serviceIntro: t(
        "A stop being close is about distance. Service is about how much actually runs. A building can lie inside a catchment and still get only one line a few dozen times a day. Both buildings below are inside an official catchment.",
        "Eine nahe Haltestelle betrifft die Distanz. Das Angebot betrifft, wie viel tatsächlich fährt. Ein Gebäude kann im Einzugsbereich liegen und trotzdem nur eine Linie wenige Dutzend Mal am Tag haben. Beide Gebäude unten liegen in einem amtlichen Einzugsbereich."
    ),
    serviceBasis: t(
        "About the numbers: the official data gives departures per day for each stop area, without a stated reference period (date, weekday or season). They are not real time and not live.",
        "Zu den Zahlen: Die amtlichen Daten geben Abfahrten pro Tag je Haltestellenbereich an, ohne Datum, Wochentag oder Saison. Es sind keine Live-Daten."
    ),
    higherService: t("Higher service", "Höheres Angebot"),
    lowerService: t("Lower service", "Geringeres Angebot"),
    showOnMap: t("Show on map", "Auf der Karte zeigen"),
    stopCard: t("Selected stop area", "Gewählter Haltestellenbereich"),
    stopHint: t("Click a stop circle to read its departures and lines.", "Klicken Sie einen Haltestellenkreis, um Abfahrten und Linien zu lesen."),
    ridersTitle: t("Show transport network", "Verkehrsnetz anzeigen"),
    ridersExplain: t(
        "Optional background from HamburgRiders: the lines and stops of the published HVV timetable. It is only for orientation. The service figures above come from the official stop-area data, not from this timetable.",
        "Optionaler Hintergrund von HamburgRiders: Linien und Haltestellen des veröffentlichten HVV-Fahrplans. Er dient nur der Orientierung. Die Angebotszahlen oben stammen aus den amtlichen Haltestellendaten, nicht aus diesem Fahrplan."
    ),
    ridersDate: t("Timetable (GTFS) service date", "Fahrplan (GTFS), Betriebstag"),
    ridersLoading: t("Loading the timetable…", "Fahrplan wird geladen …"),
    ridersError: t("The timetable could not be loaded.", "Der Fahrplan konnte nicht geladen werden."),
    ridersNoVehicles: t("No vehicles are animated here: animated trips would show a historical timetable day, not current service frequency.", "Hier werden keine Fahrzeuge animiert: animierte Fahrten zeigen einen historischen Fahrplantag, nicht die aktuelle Taktung."),

    // scene 4
    agreementIntro: t(
        "Two ways to answer “is this building near a stop?”. Official catchment: a fixed distance (480 m bus, 720 m rail) on a 2020 network. Walking access: the modelled walking time to the nearest stop of any kind, on today’s streets and including slopes.",
        "Zwei Antworten auf „Liegt dieses Gebäude nah an einer Haltestelle?“. Amtlicher Einzugsbereich: eine feste Distanz (480 m Bus, 720 m Bahn) auf einem Netz von 2020. Fußweg-Erreichbarkeit: die modellierte Gehzeit zur nächsten Haltestelle jeder Art, auf den heutigen Straßen und mit Steigung."
    ),
    agreementThreshold: t(
        "Threshold used: walking access means at most 6 minutes. That is the time for 480 m (the bus radius) at 1.33 m/s on flat ground. The 720 m rail radius equals 9 minutes, so no single threshold fits both exactly.",
        "Verwendete Schwelle: Fußweg-Erreichbarkeit heißt höchstens 6 Minuten. So lange dauern 480 m (der Busradius) bei 1,33 m/s auf ebenem Boden. Der 720-m-Bahnradius entspricht 9 Minuten, daher passt keine einzelne Schwelle genau auf beide."
    ),
    agreementCitywide: t("Hamburg-wide, housing buildings with a walking connection", "Ganz Hamburg, Wohngebäude mit Gehnetz-Anschluss"),
    agreementLocal: t("In the selected Stadtteil", "Im gewählten Stadtteil"),
    agreementExamples: t("Examples where the definitions disagree", "Beispiele, in denen die Definitionen abweichen"),
    officialOnlyExample: t("Official coverage only", "Nur amtlicher Einzugsbereich"),
    walkingOnlyExample: t("Walking access only", "Nur Fußweg-Erreichbarkeit"),
    neitherTruth: t("Neither definition is the absolute truth: they use different networks, dates and assumptions.", "Keine Definition ist die absolute Wahrheit: Sie nutzen verschiedene Netze, Stände und Annahmen."),

    // scene 5
    compareIntro: t(
        "Two neighbouring Stadtteile with a similar typical value (the median of their housing buildings). The bars show every housing building by its daily departures within reach.",
        "Zwei benachbarte Stadtteile mit ähnlichem typischem Wert (dem Median ihrer Wohngebäude). Die Balken zeigen jedes Wohngebäude nach seinen täglichen Abfahrten in Reichweite."
    ),
    median: t("Median departures per day", "Median der Abfahrten pro Tag"),
    tenth: t("Weakest tenth up to", "Schwächstes Zehntel bis"),
    ninetieth: t("Best tenth from", "Beste zehn Prozent ab"),
    withoutService: t("without any departure in reach", "ohne Abfahrt in Reichweite"),
    outsideCatchment: t("outside every catchment", "außerhalb aller Einzugsbereiche"),
    bandsTitle: t("Housing buildings by daily departures within reach", "Wohngebäude nach täglichen Abfahrten in Reichweite"),
    focusOn: t("Zoom to", "Zoomen auf"),
    compareNote: t(
        "Both Stadtteile are compared on the same basis: housing buildings with complete departure data. The comparison is about differences in service across space, not about who lives there.",
        "Beide Stadtteile werden auf derselben Grundlage verglichen: Wohngebäude mit vollständigen Abfahrtsdaten. Es geht um Unterschiede im Angebot im Raum, nicht darum, wer dort wohnt."
    ),

    // scene 6
    criteriaTitle: t("Your definition of poor access", "Ihre Definition von schlechtem Zugang"),
    areaLabel: t("Stadtteil", "Stadtteil"),
    allHamburg: t("All of Hamburg", "Ganz Hamburg"),
    coverageLabel: t("Official coverage", "Amtliche Abdeckung"),
    coverageAny: t("Any", "Beliebig"),
    coverageInside: t("Inside a catchment", "Im Einzugsbereich"),
    coverageOutside: t("Outside every catchment", "Außerhalb aller Einzugsbereiche"),
    walkLabel: t("Walk to the nearest stop is more than", "Fußweg zur nächsten Haltestelle ist länger als"),
    departuresLabel: t("Daily departures in reach are at most", "Tägliche Abfahrten in Reichweite höchstens"),
    linesLabel: t("Distinct lines in reach are at most", "Erreichbare Linien höchstens"),
    off: t("Off", "Aus"),
    reset: t("Reset", "Zurücksetzen"),
    matches: t("match your criteria", "erfüllen Ihre Kriterien"),
    of: t("of", "von"),
    inArea: t("in", "in"),
    walkNote: t("Includes buildings with no stop within 15 minutes; buildings without a walking connection never match.", "Schließt Gebäude ohne Haltestelle in 15 Minuten ein; Gebäude ohne Gehnetz-Anschluss erfüllen das Kriterium nie."),
    departuresNote: t("Buildings with incomplete departure data (lower bounds) are not counted as matching.", "Gebäude mit unvollständigen Abfahrtsdaten (Untergrenzen) zählen nicht als passend."),
    selectedFeature: t("Selected", "Auswahl"),
    exploreHint: t("Click a Stadtteil or statistical area, a building or a stop to inspect it.", "Klicken Sie einen Stadtteil oder ein statistisches Gebiet, ein Gebäude oder eine Haltestelle zum Prüfen an."),
    clear: t("Clear selection", "Auswahl aufheben"),
    exploreScale: t(
        "The area colours always show the share of housing outside every catchment. Your criteria apply to the buildings: zoom in (from about zoom 11) to see the matching ones.",
        "Die Gebietsfarben zeigen immer den Anteil der Wohngebäude außerhalb aller Einzugsbereiche. Ihre Kriterien gelten für die Gebäude: Zoomen Sie hinein (ab etwa Zoomstufe 11), um die passenden zu sehen."
    ),

    // building card
    building: t("Building", "Gebäude"),
    notHousing: t("Not a housing building: it is shown for context and is not part of the statistics.", "Kein Wohngebäude: Es dient dem Kontext und gehört nicht zur Statistik."),
    officialStatus: t("Official catchment", "Amtlicher Einzugsbereich"),
    inside: t("inside", "innerhalb"),
    outside: t("outside every catchment", "außerhalb aller Einzugsbereiche"),
    walkTime: t("Modelled walk to the nearest stop", "Modellierter Fußweg zur nächsten Haltestelle"),
    walkNone: t("no stop within 15 minutes", "keine Haltestelle in 15 Minuten"),
    walkNoOrigin: t("not computable (no walking connection)", "nicht berechenbar (kein Gehnetz-Anschluss)"),
    minutes: t("min", "Min."),
    departuresPerDay: t("Departures per day in reach", "Abfahrten pro Tag in Reichweite"),
    departuresIncomplete: t("at least (incomplete data)", "mindestens (unvollständige Daten)"),
    linesInReach: t("Distinct lines in reach", "Erreichbare Linien"),
    stopsInReach: t("Stops in reach", "Erreichbare Haltestellen"),
    classLabel: t("Class", "Klasse"),
    heightLabel: t("Height", "Höhe"),
    heightMissing: t("not available (drawn flat)", "nicht verfügbar (flach gezeichnet)"),

    // area card
    areaOutside: t("outside every catchment", "außerhalb aller Einzugsbereiche"),
    areaNoValue: t("no value (no housing buildings)", "kein Wert (keine Wohngebäude)"),
    vsHamburg: t("Hamburg", "Hamburg"),
    pointsAbove: t("percentage points above", "Prozentpunkte über"),
    pointsBelow: t("percentage points below", "Prozentpunkte unter"),
    unitHint: t("Statistical areas have no names; only their id is shown.", "Statistische Gebiete haben keine Namen; es wird nur ihre Kennung gezeigt."),

    // stop card
    lines: t("Lines", "Linien"),
    lineCount: t("Number of lines", "Anzahl der Linien"),
    stopDepartures: t("Official departures per day", "Amtliche Abfahrten pro Tag"),
    stopType: t("Type", "Art"),
} satisfies Record<string, Localized>;

export type EquityTextKey = keyof typeof EQUITY_TEXT;

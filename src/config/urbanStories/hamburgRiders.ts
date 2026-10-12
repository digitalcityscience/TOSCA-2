import { RIDERS_CAMERA } from "@helpers/hamburgRiders/ridersConfig";
import type { UrbanStoryConfig } from "./types";

/** Consumer id under which the standalone story claims HamburgRiders capabilities. */
export const HAMBURG_RIDERS_STORY_CONSUMER = "story:hamburg-riders";

/**
 * HamburgRiders as a story of its own: an interactive transport experience, not a chaptered narrative and not a
 * catalog dataset. There are no Explore entries or chapters; the story panel (`HamburgRidersStoryPanel`) and the
 * Riders controls on the map are the whole experience, and the module in `hamburgRiders/` does the rendering.
 */
export const hamburgRidersStory: UrbanStoryConfig = {
    key: "hamburg-riders",
    title: { en: "HamburgRiders", de: "HamburgRiders" },
    intro: {
        en: "Hamburg's public transport as a scheduled-service animation on a dark map: S-Bahn, U-Bahn, regional trains and "
            + "buses are drawn as a glowing network of stops, with vehicles moving along their timetables. Use the panel on "
            + "the right to choose lines and the timeline at the bottom to play, pause or jump to a time of day.",
        de: "Der Hamburger Nahverkehr als Fahrplan-Animation auf einer dunklen Karte: S-Bahn, U-Bahn, Regionalzüge und Busse "
            + "erscheinen als leuchtendes Netz aus Haltestellen, die Fahrzeuge bewegen sich nach Fahrplan. Wählen Sie im "
            + "Panel rechts Linien aus und steuern Sie unten mit der Zeitleiste Wiedergabe, Pause und Tageszeit.",
    },
    caveats: [
        {
            en: "This is a sample for demonstration. It is built from the published HVV timetable (GTFS) of one single day, not from live data.",
            de: "Dies ist ein Beispiel zur Demonstration. Es basiert auf dem veröffentlichten HVV-Fahrplan (GTFS) eines einzigen Tages, nicht auf Live-Daten.",
        },
        {
            en: "Vehicles follow the published HVV timetable of one service date. They are not live positions and do not show delays.",
            de: "Die Fahrzeuge folgen dem veröffentlichten HVV-Fahrplan eines Betriebstags. Es sind keine Live-Positionen und keine Verspätungen.",
        },
        {
            en: "Positions between two stops are interpolated in a straight line, not along the track or street.",
            de: "Positionen zwischen zwei Haltestellen sind geradlinig interpoliert, nicht entlang von Gleis oder Straße.",
        },
    ],
    geostory: { id: null },
    overviewCamera: { center: [...RIDERS_CAMERA.center], zoom: RIDERS_CAMERA.zoom },
    explore: [],
    chapters: [],
};

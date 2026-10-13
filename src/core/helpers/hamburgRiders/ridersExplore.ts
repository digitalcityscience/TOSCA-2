/**
 * "Explore Data" of the HamburgRiders story: the layers the module draws, offered one by one as map data, the way
 * the other Urban Stories offer their catalog datasets. Adding one claims it for the Explore consumer only
 * (no dark basemap, no controls) and it stays on the map until removed, even after the story is closed.
 */
import type { Localized } from "../../../config/urbanStories/types";
import { RIDERS_MODES, type RidersMode } from "./ridersConfig";
import type { RidersClaim } from "./ridersState";

export const RIDERS_EXPLORE_CONSUMER = "explore:hamburg-riders";

export type RidersExploreKind = "network" | "stops" | "vehicles";

export interface RidersExploreEntry {
    key: string;
    kind: RidersExploreKind;
    /** Modes the entry covers. */
    modes: RidersMode[];
    title: Localized;
    description: Localized;
}

const MODE_TITLES: Record<RidersMode, Localized> = {
    "s-bahn": { en: "S-Bahn", de: "S-Bahn" },
    "u-bahn": { en: "U-Bahn", de: "U-Bahn" },
    bus: { en: "Bus", de: "Bus" },
    regional: { en: "Regional", de: "Regional" },
};

export const RIDERS_EXPLORE_ENTRIES: readonly RidersExploreEntry[] = [
    ...RIDERS_MODES.map((mode): RidersExploreEntry => ({
        key: `network-${mode}`,
        kind: "network",
        modes: [mode],
        title: { en: `${MODE_TITLES[mode].en} network density`, de: `${MODE_TITLES[mode].de}-Netzdichte` },
        description: { en: "Heatmap of stop density from the HVV timetable.", de: "Heatmap der Haltestellendichte aus dem HVV-Fahrplan." },
    })),
    {
        key: "stops",
        kind: "stops",
        modes: [...RIDERS_MODES],
        title: { en: "GTFS stops", de: "GTFS-Haltestellen" },
        description: { en: "Stop markers of all modes (from zoom 10).", de: "Haltestellen aller Verkehrsmittel (ab Zoomstufe 10)." },
    },
    ...RIDERS_MODES.map((mode): RidersExploreEntry => ({
        key: `vehicles-${mode}`,
        kind: "vehicles",
        modes: [mode],
        title: { en: `${MODE_TITLES[mode].en} vehicles`, de: `${MODE_TITLES[mode].de}-Fahrzeuge` },
        description: { en: "Scheduled vehicle positions with the timeline (not live).", de: "Fahrplanmäßige Fahrzeugpositionen mit Zeitleiste (nicht live)." },
    })),
];

/** Whether the claim already holds everything the entry stands for. */
export function isExploreEntryAdded(claim: RidersClaim | undefined, entry: RidersExploreEntry): boolean {
    if (claim === undefined) return false;
    const held = entry.kind === "network" ? claim.network : entry.kind === "stops" ? claim.stops : claim.vehicleModes;
    return entry.modes.every((mode) => held.includes(mode));
}

export function withExploreEntry(claim: RidersClaim, entry: RidersExploreEntry, add: boolean): RidersClaim {
    const change = (list: RidersMode[]): RidersMode[] => (
        add ? [...new Set([...list, ...entry.modes])] : list.filter((mode) => !entry.modes.includes(mode))
    );
    if (entry.kind === "network") return { ...claim, network: change(claim.network) };
    if (entry.kind === "stops") return { ...claim, stops: change(claim.stops) };
    return { ...claim, vehicleModes: change(claim.vehicleModes) };
}

/**
 * Pure state model of the HamburgRiders module (no Vue, no map).
 *
 * Several consumers (the standalone story, other Urban Stories) can ask for Riders capabilities at the same time.
 * Each consumer owns a *claim*; the effective state is the union of all claims. A consumer that releases its claim
 * only withdraws what it asked for, never what another consumer asked for. Direct user actions (Riders panel, TOSCA
 * layer list) are layered on top: "shown" additions and "hidden" overrides that win over the claims until the module
 * is deactivated.
 */
import { RIDERS_MODES, type RidersMode } from "./ridersConfig";

export interface RidersClaim {
    /** Heatmap of the network density, per mode. */
    network: RidersMode[];
    /** GTFS stop markers, per mode. */
    stops: RidersMode[];
    /** All lines of a mode. */
    vehicleModes: RidersMode[];
    /** Individual groups by key (`u-bahn|U3`, `bus|MetroBus`). */
    vehicleGroups: string[];
    /** Show the timeline even when no vehicle is requested. */
    timeline: boolean;
    basemap?: "dark";
    /** Open the Riders control panel. */
    controls: boolean;
}

export interface RidersUserLayer {
    network: RidersMode[];
    stops: RidersMode[];
    vehicleGroups: string[];
}

export interface RidersUserState {
    shown: RidersUserLayer;
    hidden: RidersUserLayer;
}

export interface RidersEffective {
    network: RidersMode[];
    stops: RidersMode[];
    vehicleGroups: string[];
    vehicleModes: RidersMode[];
    timeline: boolean;
    darkBasemap: boolean;
    controls: boolean;
}

export const DEFAULT_CONSUMER = "default";

export function emptyClaim(): RidersClaim {
    return { network: [], stops: [], vehicleModes: [], vehicleGroups: [], timeline: false, controls: false };
}

export function emptyUserState(): RidersUserState {
    return {
        shown: { network: [], stops: [], vehicleGroups: [] },
        hidden: { network: [], stops: [], vehicleGroups: [] },
    };
}

/** Plain copy that also works on Vue reactive proxies (which `structuredClone` rejects). */
export function cloneUserState(state: RidersUserState): RidersUserState {
    const layer = (source: RidersUserLayer): RidersUserLayer => ({
        network: [...source.network],
        stops: [...source.stops],
        vehicleGroups: [...source.vehicleGroups],
    });
    return { shown: layer(state.shown), hidden: layer(state.hidden) };
}

export function addUnique<T>(list: readonly T[], ...items: T[]): T[] {
    const next = [...list];
    for (const item of items) if (!next.includes(item)) next.push(item);
    return next;
}

export function removeAll<T>(list: readonly T[], ...items: T[]): T[] {
    return list.filter((entry) => !items.includes(entry));
}

/** The claim a story gets when it opens HamburgRiders as an experience of its own (the original defaults). */
export function standaloneClaim(): RidersClaim {
    return {
        network: [...RIDERS_MODES],
        stops: [...RIDERS_MODES],
        vehicleModes: ["s-bahn", "u-bahn"],
        vehicleGroups: [],
        timeline: true,
        controls: true,
    };
}

/** Lookups that need the loaded timetable; both answer "nothing" until it is there. */
export interface RidersGroupLookup {
    groupKeysOfMode: (mode: RidersMode) => readonly string[];
    /** Turns a caller's route reference (`U3`, `u-bahn|U3`, `MetroBus`) into a group key. */
    resolveGroup: (reference: string) => string | undefined;
}

export function computeEffective(
    claims: Readonly<Record<string, RidersClaim>>,
    user: RidersUserState,
    { groupKeysOfMode, resolveGroup }: RidersGroupLookup
): RidersEffective {
    const network = new Set<RidersMode>(user.shown.network);
    const stops = new Set<RidersMode>(user.shown.stops);
    const vehicleModes = new Set<RidersMode>();
    const vehicleGroups = new Set<string>(user.shown.vehicleGroups);
    let timeline = false;
    let darkBasemap = false;
    let controls = false;

    for (const claim of Object.values(claims)) {
        claim.network.forEach((mode) => network.add(mode));
        claim.stops.forEach((mode) => stops.add(mode));
        claim.vehicleModes.forEach((mode) => groupKeysOfMode(mode).forEach((key) => vehicleGroups.add(key)));
        claim.vehicleGroups.forEach((reference) => {
            const key = resolveGroup(reference);
            if (key !== undefined) vehicleGroups.add(key);
        });
        timeline ||= claim.timeline;
        darkBasemap ||= claim.basemap === "dark";
        controls ||= claim.controls;
    }
    user.hidden.network.forEach((mode) => network.delete(mode));
    user.hidden.stops.forEach((mode) => stops.delete(mode));
    user.hidden.vehicleGroups.forEach((key) => vehicleGroups.delete(key));

    for (const mode of RIDERS_MODES) {
        if (groupKeysOfMode(mode).some((key) => vehicleGroups.has(key))) vehicleModes.add(mode);
    }
    return {
        network: RIDERS_MODES.filter((mode) => network.has(mode)),
        stops: RIDERS_MODES.filter((mode) => stops.has(mode)),
        vehicleGroups: [...vehicleGroups],
        vehicleModes: RIDERS_MODES.filter((mode) => vehicleModes.has(mode)),
        // Moving vehicles need a clock, so any visible vehicle brings the timeline with it.
        timeline: timeline || vehicleGroups.size > 0,
        darkBasemap,
        controls,
    };
}

export function sameEffective(a: RidersEffective, b: RidersEffective): boolean {
    const same = (x: readonly unknown[], y: readonly unknown[]): boolean => x.length === y.length && x.every((item, index) => item === y[index]);
    return same(a.network, b.network) && same(a.stops, b.stops) && same([...a.vehicleGroups].sort(), [...b.vehicleGroups].sort())
        && a.timeline === b.timeline && a.darkBasemap === b.darkBasemap && a.controls === b.controls;
}

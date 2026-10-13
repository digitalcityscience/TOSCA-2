/**
 * Public API of the HamburgRiders module. Other Urban Stories use only these functions: they never touch the
 * Riders panel, the map layers or the store directly.
 *
 * Every call belongs to a *consumer* (`options.consumer`, default `"default"`). Each consumer's requests are
 * remembered separately and the module shows the union, so one story closing its Riders overlay never removes
 * what another story still wants. `deactivateHamburgRiders()` and the `hide*` functions only withdraw the calling
 * consumer's own requests.
 *
 * @example
 * ```ts
 * activateHamburgRiders({ consumer: "transit-equity", modes: ["u-bahn"], timeline: true });
 * showRoute("U3", { consumer: "transit-equity" });
 * setRidersTime("08:30");
 * // chapter change
 * deactivateHamburgRiders("transit-equity");
 * ```
 */
import {
    DEFAULT_CONSUMER,
    useHamburgRidersStore,
    type RidersRequest,
    type RidersStatus,
} from "@store/hamburgRiders";
import { RIDERS_MODES, type RidersMode } from "./ridersConfig";
import { resolveGroupKey } from "./ridersData";
import { addUnique, removeAll } from "./ridersState";

export type { RidersMode, RidersRequest, RidersStatus };
export { DEFAULT_CONSUMER, RIDERS_MODES };

export interface RidersCallOptions {
    /** Who is asking. Defaults to `"default"`. */
    consumer?: string;
}

export interface ShowModeOptions extends RidersCallOptions {
    /** Density heatmap of the mode. Default true. */
    network?: boolean;
    /** Stop markers of the mode. Default true. */
    stops?: boolean;
    /** Vehicles of every line of the mode. Default true. */
    vehicles?: boolean;
}

function consumerOf(options?: RidersCallOptions): string {
    return options?.consumer ?? DEFAULT_CONSUMER;
}

/** Registers the consumer and its request. Calling it again replaces that consumer's earlier request. */
export function activateHamburgRiders(options: RidersRequest & RidersCallOptions = {}): void {
    const { consumer, ...request } = options;
    useHamburgRidersStore().activate(consumer ?? DEFAULT_CONSUMER, request);
}

/** Withdraws the consumer's request. Layers, panel, timeline and basemap go when the last consumer leaves. */
export function deactivateHamburgRiders(consumer: string = DEFAULT_CONSUMER): void {
    useHamburgRidersStore().release(consumer);
}

export function showTransportMode(mode: RidersMode, options: ShowModeOptions = {}): void {
    useHamburgRidersStore().updateClaim(consumerOf(options), (claim) => ({
        ...claim,
        network: options.network === false ? claim.network : addUnique(claim.network, mode),
        stops: options.stops === false ? claim.stops : addUnique(claim.stops, mode),
        vehicleModes: options.vehicles === false ? claim.vehicleModes : addUnique(claim.vehicleModes, mode),
    }));
}

/** Withdraws the mode's network, stops and vehicles (including its individual lines) from this consumer's request. */
export function hideTransportMode(mode: RidersMode, options: RidersCallOptions = {}): void {
    const store = useHamburgRidersStore();
    const dataset = store.dataset;
    store.updateClaim(consumerOf(options), (claim) => ({
        ...claim,
        network: removeAll(claim.network, mode),
        stops: removeAll(claim.stops, mode),
        vehicleModes: removeAll(claim.vehicleModes, mode),
        vehicleGroups: claim.vehicleGroups.filter((reference) => {
            const key = dataset === undefined ? reference : resolveGroupKey(dataset, reference) ?? reference;
            return !key.startsWith(`${mode}|`);
        }),
    }));
}

/**
 * Shows the vehicles of one line (`"U3"`, or `"u-bahn|U3"`) or bus type (`"MetroBus"`).
 * Returns the group key when it is known already; before the timetable has loaded the reference is kept and
 * resolved as soon as it is available (unknown references then show nothing).
 */
export function showRoute(reference: string, options: RidersCallOptions & { mode?: RidersMode } = {}): string | undefined {
    const store = useHamburgRidersStore();
    const key = store.dataset === undefined ? undefined : resolveGroupKey(store.dataset, reference, options.mode);
    if (store.dataset !== undefined && key === undefined) return undefined;
    const stored = key ?? (options.mode === undefined ? reference : `${options.mode}|${reference}`);
    store.updateClaim(consumerOf(options), (claim) => ({ ...claim, vehicleGroups: addUnique(claim.vehicleGroups, stored) }));
    return key;
}

export function hideRoute(reference: string, options: RidersCallOptions & { mode?: RidersMode } = {}): void {
    const store = useHamburgRidersStore();
    const dataset = store.dataset;
    const target = dataset === undefined ? reference : resolveGroupKey(dataset, reference, options.mode) ?? reference;
    store.updateClaim(consumerOf(options), (claim) => ({
        ...claim,
        vehicleGroups: claim.vehicleGroups.filter((entry) => {
            const resolved = dataset === undefined ? entry : resolveGroupKey(dataset, entry, options.mode) ?? entry;
            return resolved !== target;
        }),
    }));
}

/** Stop markers for the given modes (all modes when omitted). */
export function showStops(modes: RidersMode[] = [...RIDERS_MODES], options: RidersCallOptions = {}): void {
    useHamburgRidersStore().updateClaim(consumerOf(options), (claim) => ({ ...claim, stops: addUnique(claim.stops, ...modes) }));
}

export function hideStops(modes: RidersMode[] = [...RIDERS_MODES], options: RidersCallOptions = {}): void {
    useHamburgRidersStore().updateClaim(consumerOf(options), (claim) => ({ ...claim, stops: removeAll(claim.stops, ...modes) }));
}

/** Shows the timeline (and keeps the clock running) even when no vehicle is selected. */
export function enableTimeline(options: RidersCallOptions = {}): void {
    useHamburgRidersStore().updateClaim(consumerOf(options), (claim) => ({ ...claim, timeline: true }));
}

export function disableTimeline(options: RidersCallOptions = {}): void {
    useHamburgRidersStore().updateClaim(consumerOf(options), (claim) => ({ ...claim, timeline: false }));
}

/** Jumps the shared service clock. Accepts seconds since midnight or `HH:MM` (up to 29:00). False if invalid. */
export function setRidersTime(time: number | string): boolean {
    return useHamburgRidersStore().setTime(time);
}

export function playRiders(): void {
    useHamburgRidersStore().setPlaying(true);
}

export function pauseRiders(): void {
    useHamburgRidersStore().setPlaying(false);
}

export function openRidersControls(): void {
    useHamburgRidersStore().openControls();
}

export function closeRidersControls(): void {
    useHamburgRidersStore().closeControls();
}

/** Snapshot of what is shown and why; safe to call at any time. */
export function getRidersState(): RidersStatus {
    return useHamburgRidersStore().snapshot();
}

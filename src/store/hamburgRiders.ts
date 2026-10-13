import { acceptHMRUpdate, defineStore } from "pinia";
import { computed, ref, shallowRef, watch } from "vue";
import type { Map as MapLibreMap } from "maplibre-gl";
import { RidersDarkBasemap } from "@helpers/hamburgRiders/ridersBasemap";
import {
    DEFAULT_SPEED,
    DEFAULT_START,
    RIDERS_MODES,
    type RidersMode,
} from "@helpers/hamburgRiders/ridersConfig";
import { loadRidersDataset, resolveGroupKey, type RidersDataset } from "@helpers/hamburgRiders/ridersData";
import {
    networkLayerId,
    RIDERS_LAYER_IDS,
    STOPS_LAYER_ID,
    VEHICLES_LAYER_ID,
} from "@helpers/hamburgRiders/ridersLayers";
import { RidersMapAdapter, type RidersMapStore } from "@helpers/hamburgRiders/ridersMapAdapter";
import {
    addUnique,
    cloneUserState,
    computeEffective,
    DEFAULT_CONSUMER,
    emptyClaim,
    emptyUserState,
    removeAll,
    type RidersClaim,
    type RidersEffective,
    type RidersUserState,
} from "@helpers/hamburgRiders/ridersState";
import {
    clampTime,
    computeVehicleFrame,
    parseRidersTime,
    RidersClock,
    type VehicleFrame,
} from "@helpers/hamburgRiders/ridersVehicles";
import { reportDeveloperError } from "@helpers/userFacingError";
import { useMapStore } from "./map";

export { DEFAULT_CONSUMER };

/** What a consumer can ask for. Everything is optional; an empty request claims nothing but registers the consumer. */
export interface RidersRequest {
    /** Shorthand: network, stops and vehicles of these modes. */
    modes?: RidersMode[];
    /** Density heatmap of the network (`true` = all modes). */
    network?: boolean | RidersMode[];
    /** GTFS stop markers (`true` = all modes). */
    stops?: boolean | RidersMode[];
    /** Vehicles of every line of these modes (`true` = all modes). */
    vehicles?: boolean | RidersMode[];
    /** Individual lines (`U3`, `u-bahn|U3`) or bus types (`MetroBus`). */
    routes?: string[];
    /** Show the timeline even without vehicles. */
    timeline?: boolean;
    /** Use the dark basemap of the original application while this consumer is active. */
    basemap?: "dark";
    /** Open the Riders control panel. */
    controls?: boolean;
    /** Service time to jump to, seconds or `HH:MM`. */
    time?: number | string;
}

export interface RidersStatus {
    active: boolean;
    consumers: string[];
    loading: "idle" | "loading" | "ready" | "error";
    error?: string;
    effective: RidersEffective;
    time: number;
    playing: boolean;
    speed: number;
    serviceDate?: string;
}

/** Collaborators that touch the browser; replaceable in tests. */
export interface RidersDeps {
    loadDataset: () => Promise<RidersDataset>;
    createAdapter: (map: MapLibreMap, mapStore: RidersMapStore, dataset: RidersDataset) => RidersMapAdapter;
    createBasemap: (map: MapLibreMap) => RidersDarkBasemap;
    createClock: (onFrame: (time: number) => void) => RidersClock;
}

export const ridersDeps: RidersDeps = {
    loadDataset: async () => await loadRidersDataset(),
    createAdapter: (map, mapStore, dataset) => new RidersMapAdapter(map, mapStore, dataset),
    createBasemap: (map) => new RidersDarkBasemap(map),
    createClock: (onFrame) => new RidersClock(onFrame),
};

const VEHICLE_PUSH_INTERVAL_MS = 40;
const DEFAULT_VEHICLE_MODES: RidersMode[] = ["s-bahn", "u-bahn"];

function modesOf(value: boolean | RidersMode[] | undefined): RidersMode[] {
    if (value === true) return [...RIDERS_MODES];
    return Array.isArray(value) ? [...value] : [];
}

/**
 * HamburgRiders session state: who asked for what (claims), what the user toggled, the clock, and the
 * runtime that draws it on TOSCA's map. Layers and map state stay owned by `mapStore`; this store only adds and
 * removes its own namespaced layers and keeps TOSCA's layer panel and the Riders panel on one shared state.
 */
export const useHamburgRidersStore = defineStore("hamburgRiders", () => {
    const mapStore = useMapStore();

    const claims = ref<Record<string, RidersClaim>>({});
    const user = ref<RidersUserState>(emptyUserState());
    const dataset = shallowRef<RidersDataset>();
    const loadStatus = ref<RidersStatus["loading"]>("idle");
    const loadError = ref<string>();
    const controlsOpen = ref(false);
    const time = ref(DEFAULT_START);
    const playing = ref(false);
    const speed = ref(DEFAULT_SPEED);
    const stats = ref({ active: 0, cumulative: 0, total: 0 });

    let adapter: RidersMapAdapter | undefined;
    let basemap: RidersDarkBasemap | undefined;
    let clock: RidersClock | undefined;
    let visibleGroups = new Set<number>();
    /** Visibility last applied to each Riders layer; a different value in TOSCA's layer state is a user action. */
    const applied = new Map<string, boolean>();
    let lastPush = 0;
    let forceNextPush = true;
    let datasetRequested = false;
    let runtimeLive = false;
    let darkRequested = false;

    const consumers = computed(() => Object.keys(claims.value));
    const active = computed(() => consumers.value.length > 0);

    const effective = computed<RidersEffective>(() => computeEffective(claims.value, user.value, {
        groupKeysOfMode: (mode) => dataset.value?.modeGroups[mode].map((index) => dataset.value!.groups[index].key) ?? [],
        resolveGroup: (reference) => (dataset.value === undefined ? undefined : resolveGroupKey(dataset.value, reference)),
    }));

    const controlsWanted = computed(() => effective.value.controls);
    const controlsVisible = computed(() => controlsWanted.value && controlsOpen.value);

    // --- runtime ------------------------------------------------------------------------------------------

    function desiredVisibility(state: RidersEffective): Map<string, boolean> {
        const desired = new Map<string, boolean>();
        for (const mode of RIDERS_MODES) desired.set(networkLayerId(mode), state.network.includes(mode));
        desired.set(STOPS_LAYER_ID, state.stops.length > 0);
        desired.set(VEHICLES_LAYER_ID, state.vehicleGroups.length > 0);
        return desired;
    }

    function ensureDataset(): void {
        if (dataset.value !== undefined || datasetRequested) return;
        datasetRequested = true;
        loadStatus.value = "loading";
        loadError.value = undefined;
        ridersDeps.loadDataset().then((loaded) => {
            dataset.value = loaded;
            loadStatus.value = "ready";
        }).catch((error: unknown) => {
            datasetRequested = false;
            loadStatus.value = "error";
            loadError.value = error instanceof Error ? error.message : String(error);
            reportDeveloperError("Loading the HamburgRiders timetable", error);
        });
    }

    function pushFrame(timeNow: number, force: boolean): void {
        time.value = timeNow;
        const ds = dataset.value;
        if (ds === undefined || adapter === undefined) return;
        const now = performance.now();
        if (!force && now - lastPush < VEHICLE_PUSH_INTERVAL_MS) return;
        lastPush = now;
        const frame: VehicleFrame = computeVehicleFrame(ds, timeNow, visibleGroups);
        stats.value = { active: frame.active, cumulative: frame.cumulative, total: frame.total };
        adapter.setVehicles(frame);
    }

    function onFrame(timeNow: number): void {
        const force = forceNextPush;
        forceNextPush = false;
        pushFrame(timeNow, force);
    }

    function syncBasemap(map: MapLibreMap): void {
        // Only on change: repeated syncs must not restart a basemap fetch that is already running.
        if (effective.value.darkBasemap === darkRequested) return;
        darkRequested = effective.value.darkBasemap;
        if (darkRequested) {
            basemap ??= ridersDeps.createBasemap(map);
            void basemap.enable().catch((error: unknown) => {
                reportDeveloperError("Loading the HamburgRiders dark basemap", error);
            });
        } else {
            basemap?.disable();
        }
    }

    function syncClock(): void {
        const ds = dataset.value;
        if (ds === undefined) return;
        visibleGroups = new Set(effective.value.vehicleGroups.flatMap((key) => {
            const index = ds.groupIndex.get(key);
            return index === undefined ? [] : [index];
        }));
        if (effective.value.timeline) {
            if (clock === undefined) {
                clock = ridersDeps.createClock(onFrame);
                clock.time = time.value;
                clock.playing = playing.value;
                clock.speed = speed.value;
            }
            forceNextPush = true;
            clock.invalidate();
            clock.start();
        } else {
            clock?.stop();
            stats.value = { active: 0, cumulative: 0, total: 0 };
        }
    }

    function sync(): void {
        if (!active.value) {
            // Tear down once: teardown resets state the sync watcher depends on, so repeating it would loop.
            if (runtimeLive) teardown();
            return;
        }
        runtimeLive = true;
        ensureDataset();
        const map = mapStore.map as MapLibreMap | undefined;
        if (map === undefined) return;
        try {
            syncBasemap(map);
            const ds = dataset.value;
            if (ds === undefined) return;
            if (adapter === undefined) {
                adapter = ridersDeps.createAdapter(map, mapStore as unknown as RidersMapStore, ds);
                adapter.install();
            }
            const desired = desiredVisibility(effective.value);
            adapter.applyVisibility(effective.value);
            desired.forEach((visible, id) => applied.set(id, visible));
        } catch (error) {
            if (error instanceof Error && /not done loading/i.test(error.message)) {
                // Fresh map: the style document is not ready yet. `isStyleLoaded()` would also wait for tiles of
                // unrelated layers, so just try again when the map is idle.
                adapter = undefined;
                void map.once("idle", sync);
                return;
            }
            reportDeveloperError("Showing HamburgRiders on the map", error);
            return;
        }
        syncClock();
    }

    function teardown(): void {
        runtimeLive = false;
        darkRequested = false;
        clock?.stop();
        clock = undefined;
        adapter?.destroy();
        adapter = undefined;
        basemap?.disable();
        applied.clear();
        user.value = emptyUserState();
        controlsOpen.value = false;
        stats.value = { active: 0, cumulative: 0, total: 0 };
        time.value = DEFAULT_START;
        playing.value = false;
        speed.value = DEFAULT_SPEED;
        visibleGroups = new Set();
    }

    watch([effective, dataset, () => mapStore.map, active], sync, { flush: "post" });

    // A Riders layer toggled in TOSCA's layer panel is a user action on the shared state.
    watch(() => RIDERS_LAYER_IDS.map((id) => mapStore.layerUiState[id]?.visible), (visibleNow) => {
        if (adapter === undefined) return;
        RIDERS_LAYER_IDS.forEach((id, index) => {
            const visible = visibleNow[index];
            if (visible === undefined || applied.get(id) === undefined || applied.get(id) === visible) return;
            applied.set(id, visible);
            setCapabilityVisible(id, visible);
        });
    });

    // A layer deleted in the layer panel counts as hidden; a map reset by another feature ends Riders.
    watch(() => mapStore.layersOnMap.length, () => {
        if (adapter === undefined) return;
        if (!adapter.isInstalled) {
            deactivateAll();
            return;
        }
        adapter.removedLayerIds().forEach((id) => {
            applied.set(id, false);
            setCapabilityVisible(id, false);
        });
    });

    // --- user actions (panel and layer list) ----------------------------------------------------------------

    function allVehicleKeys(): string[] {
        return dataset.value?.groups.map((group) => group.key) ?? [];
    }

    function setCapabilityVisible(layerId: string, visible: boolean): void {
        const next = cloneUserState(user.value);
        const mode = RIDERS_MODES.find((candidate) => networkLayerId(candidate) === layerId);
        if (mode !== undefined) {
            next.hidden.network = visible ? removeAll(next.hidden.network, mode) : addUnique(next.hidden.network, mode);
            next.shown.network = visible ? addUnique(next.shown.network, mode) : removeAll(next.shown.network, mode);
        } else if (layerId === STOPS_LAYER_ID) {
            next.hidden.stops = visible ? [] : [...RIDERS_MODES];
            next.shown.stops = visible && effective.value.stops.length === 0 ? [...RIDERS_MODES] : visible ? next.shown.stops : [];
        } else if (layerId === VEHICLES_LAYER_ID) {
            const keys = allVehicleKeys();
            next.hidden.vehicleGroups = visible ? [] : keys;
            next.shown.vehicleGroups = visible
                ? effective.value.vehicleGroups.length === 0 ? defaultVehicleKeys() : next.shown.vehicleGroups
                : [];
        }
        user.value = next;
    }

    function defaultVehicleKeys(): string[] {
        const ds = dataset.value;
        return ds === undefined ? [] : DEFAULT_VEHICLE_MODES.flatMap((mode) => ds.modeGroups[mode].map((index) => ds.groups[index].key));
    }

    /** Panel checkbox of one line or bus type. */
    function setGroupVisible(key: string, visible: boolean): void {
        const next = cloneUserState(user.value);
        next.hidden.vehicleGroups = visible ? removeAll(next.hidden.vehicleGroups, key) : addUnique(next.hidden.vehicleGroups, key);
        next.shown.vehicleGroups = visible ? addUnique(next.shown.vehicleGroups, key) : removeAll(next.shown.vehicleGroups, key);
        user.value = next;
    }

    /** Panel checkbox of a whole mode (header) or the "All" box (every mode). */
    function setModeVehiclesVisible(modes: RidersMode[], visible: boolean): void {
        const ds = dataset.value;
        if (ds === undefined) return;
        const keys = modes.flatMap((mode) => ds.modeGroups[mode].map((index) => ds.groups[index].key));
        const next = cloneUserState(user.value);
        next.hidden.vehicleGroups = visible ? removeAll(next.hidden.vehicleGroups, ...keys) : addUnique(next.hidden.vehicleGroups, ...keys);
        next.shown.vehicleGroups = visible ? addUnique(next.shown.vehicleGroups, ...keys) : removeAll(next.shown.vehicleGroups, ...keys);
        user.value = next;
    }

    // --- consumer API ---------------------------------------------------------------------------------------

    function requestToClaim(request: RidersRequest): RidersClaim {
        const claim = emptyClaim();
        const modes = request.modes ?? [];
        claim.network = addUnique(modesOf(request.network), ...modes);
        claim.stops = addUnique(modesOf(request.stops), ...modes);
        claim.vehicleModes = addUnique(modesOf(request.vehicles), ...modes);
        claim.vehicleGroups = [...(request.routes ?? [])];
        claim.timeline = request.timeline === true;
        if (request.basemap !== undefined) claim.basemap = request.basemap;
        claim.controls = request.controls === true;
        return claim;
    }

    /** An explicit request wins over an earlier user hide of the same item. */
    function clearHiddenFor(claim: RidersClaim): void {
        const next = cloneUserState(user.value);
        next.hidden.network = removeAll(next.hidden.network, ...claim.network);
        next.hidden.stops = removeAll(next.hidden.stops, ...claim.stops);
        const ds = dataset.value;
        if (ds !== undefined) {
            const keys = [
                ...claim.vehicleModes.flatMap((mode) => ds.modeGroups[mode].map((index) => ds.groups[index].key)),
                ...claim.vehicleGroups.flatMap((reference) => resolveGroupKey(ds, reference) ?? []),
            ];
            next.hidden.vehicleGroups = removeAll(next.hidden.vehicleGroups, ...keys);
        } else if (claim.vehicleModes.length > 0 || claim.vehicleGroups.length > 0) {
            next.hidden.vehicleGroups = [];
        }
        user.value = next;
    }

    /** Replaces the consumer's claim. Registering twice is idempotent: the second call updates the first. */
    function activate(consumer: string, request: RidersRequest = {}): void {
        const claim = requestToClaim(request);
        const hadControls = Object.values(claims.value).some((existing) => existing.controls);
        clearHiddenFor(claim);
        claims.value = { ...claims.value, [consumer]: claim };
        if (claim.controls && !hadControls) controlsOpen.value = true;
        if (request.time !== undefined) setTime(request.time);
    }

    function updateClaim(consumer: string, update: (claim: RidersClaim) => RidersClaim): void {
        const current = claims.value[consumer] ?? emptyClaim();
        const hadControls = Object.values(claims.value).some((existing) => existing.controls);
        const next = update({ ...current });
        clearHiddenFor(next);
        claims.value = { ...claims.value, [consumer]: next };
        if (next.controls && !hadControls) controlsOpen.value = true;
    }

    /** Withdraws one consumer's claim. The module tears itself down when the last consumer is gone. */
    function release(consumer: string = DEFAULT_CONSUMER): void {
        if (claims.value[consumer] === undefined) return;
        const { [consumer]: _released, ...rest } = claims.value;
        claims.value = rest;
    }

    function deactivateAll(): void {
        claims.value = {};
        sync();
    }

    // --- clock ----------------------------------------------------------------------------------------------

    function setTime(value: number | string): boolean {
        const seconds = parseRidersTime(value);
        if (seconds === undefined) return false;
        time.value = clampTime(seconds);
        clock?.seek(seconds);
        forceNextPush = true;
        return true;
    }

    function setPlaying(value: boolean): void {
        playing.value = value;
        clock?.setPlaying(value);
    }

    function setSpeed(value: number): void {
        speed.value = value;
        if (clock !== undefined) clock.speed = value;
    }

    function openControls(): void {
        controlsOpen.value = true;
    }

    function closeControls(): void {
        controlsOpen.value = false;
    }

    function snapshot(): RidersStatus {
        return {
            active: active.value,
            consumers: [...consumers.value],
            loading: loadStatus.value,
            error: loadError.value,
            effective: effective.value,
            time: time.value,
            playing: playing.value,
            speed: speed.value,
            serviceDate: dataset.value?.meta.dateLabel,
        };
    }

    function retryLoad(): void {
        if (loadStatus.value === "error") {
            loadStatus.value = "idle";
            sync();
        }
    }

    return {
        claims,
        user,
        dataset,
        loadStatus,
        loadError,
        consumers,
        active,
        effective,
        controlsOpen,
        controlsWanted,
        controlsVisible,
        time,
        playing,
        speed,
        stats,
        activate,
        updateClaim,
        release,
        deactivateAll,
        setTime,
        setPlaying,
        setSpeed,
        setGroupVisible,
        setModeVehiclesVisible,
        setCapabilityVisible,
        openControls,
        closeControls,
        snapshot,
        retryLoad,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useHamburgRidersStore, import.meta.hot));
}

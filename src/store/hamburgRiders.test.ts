import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
    activateHamburgRiders,
    deactivateHamburgRiders,
    enableTimeline,
    getRidersState,
    hideRoute,
    hideTransportMode,
    setRidersTime,
    showRoute,
    showStops,
    showTransportMode,
} from "@helpers/hamburgRiders/ridersApi";
import { FakeMap, fixtureDataset } from "@helpers/hamburgRiders/ridersFixtures";
import { RidersClock } from "@helpers/hamburgRiders/ridersVehicles";
import { ridersDeps, useHamburgRidersStore } from "./hamburgRiders";
import { useMapStore } from "./map";

vi.mock("@helpers/toast", () => ({ useToast: () => ({ add: vi.fn() }) }));
vi.mock("maplibre-gl", () => ({
    Popup: class { setLngLat() { return this; } setHTML() { return this; } addTo() { return this; } remove() { return this; } },
}));

const settle = async (): Promise<void> => {
    for (let i = 0; i < 4; i += 1) await nextTick();
    await Promise.resolve();
};

let fake: FakeMap;
let frameCallbacks: Array<(ts: number) => void>;
let basemapCalls: string[];
const original = { ...ridersDeps };

const riders = (_unused = ""): string[] => fake.layers.filter((l) => l.id.startsWith("hamburgriders:") && l.layout.visibility !== "none").map((l) => l.id.replace("hamburgriders:", ""));

beforeEach(() => {
    setActivePinia(createPinia());
    fake = new FakeMap();
    frameCallbacks = [];
    basemapCalls = [];
    const mapStore = useMapStore();
    mapStore.map = fake as never;
    // Style-reading setLogicalLayerVisibility goes through mapStore.map, which is the fake.
    ridersDeps.loadDataset = async () => fixtureDataset();
    ridersDeps.createClock = (onFrame) => new RidersClock(onFrame, {
        request: (cb) => frameCallbacks.push(cb),
        cancel: () => frameCallbacks.splice(0),
    });
    ridersDeps.createBasemap = () => ({
        enable: async () => { basemapCalls.push("enable"); },
        disable: () => { basemapCalls.push("disable"); },
    }) as never;
    useHamburgRidersStore();
});

afterEach(() => {
    useHamburgRidersStore().deactivateAll();
    Object.assign(ridersDeps, original);
});

describe("HamburgRiders store", () => {
    test("activating a mode adds only Riders layers, lists them in TOSCA's layer list and deactivating removes them", async () => {
        const mapStore = useMapStore();
        fake.addLayer({ id: "someone-elses-layer", type: "fill" });
        activateHamburgRiders({ consumer: "a", modes: ["u-bahn"] });
        await settle();
        expect(riders("")).toEqual(["network:u-bahn", "stops", "vehicles"]);
        expect(mapStore.layersOnMap.filter((l) => l.id.startsWith("hamburgriders:"))).toHaveLength(6);
        expect(mapStore.getLayerUiState("hamburgriders:network:u-bahn")?.visible).toBe(true);
        expect(mapStore.getLayerUiState("hamburgriders:network:bus")?.visible).toBe(false);

        deactivateHamburgRiders("a");
        await settle();
        expect(fake.layers.map((l) => l.id)).toEqual(["someone-elses-layer"]);
        expect(mapStore.layersOnMap).toHaveLength(0);
        expect(fake.getSource("hamburgriders:stops-src")).toBeUndefined();
        expect(getRidersState().active).toBe(false);
    });

    test("repeated activation and deactivation leaves no duplicates or leftovers", async () => {
        for (let round = 0; round < 3; round += 1) {
            activateHamburgRiders({ consumer: "a", modes: ["s-bahn"], basemap: "dark", controls: true });
            await settle();
            expect(fake.layers.filter((l) => l.id === "hamburgriders:vehicles")).toHaveLength(1);
            expect(frameCallbacks).toHaveLength(1);
            deactivateHamburgRiders("a");
            await settle();
            expect(fake.layers).toHaveLength(0);
            expect(frameCallbacks).toHaveLength(0);
        }
        expect(basemapCalls.filter((call) => call === "enable")).toHaveLength(3);
        expect(basemapCalls.at(-1)).toBe("disable");
        expect(useMapStore().layersOnMap).toHaveLength(0);
    });

    test("two consumers share layers: the first leaving keeps what the second asked for", async () => {
        activateHamburgRiders({ consumer: "story", modes: ["u-bahn", "s-bahn"], basemap: "dark", controls: true });
        activateHamburgRiders({ consumer: "equity", routes: ["U3"] });
        await settle();
        expect(getRidersState().effective.vehicleGroups.sort()).toEqual(["s-bahn|S1", "u-bahn|U3"]);

        deactivateHamburgRiders("story");
        await settle();
        const state = getRidersState();
        expect(state.active).toBe(true);
        expect(state.effective.vehicleGroups).toEqual(["u-bahn|U3"]);
        expect(state.effective.darkBasemap).toBe(false);
        expect(state.effective.network).toEqual([]);
        expect(basemapCalls.at(-1)).toBe("disable");
        expect(useHamburgRidersStore().controlsVisible).toBe(false);
        expect(riders("")).toEqual(["vehicles"]);

        deactivateHamburgRiders("equity");
        await settle();
        expect(fake.layers).toHaveLength(0);
    });

    test("mode and route functions only touch the caller's own request", async () => {
        activateHamburgRiders({ consumer: "a", modes: ["u-bahn"] });
        showTransportMode("s-bahn", { consumer: "b", stops: false });
        showStops(["bus"], { consumer: "b" });
        await settle();
        expect(getRidersState().effective.stops.sort()).toEqual(["bus", "u-bahn"]);
        hideTransportMode("u-bahn", { consumer: "b" });
        await settle();
        expect(getRidersState().effective.vehicleModes).toContain("u-bahn");
        expect(showRoute("U9", { consumer: "b" })).toBeUndefined();
        expect(showRoute("MetroBus", { consumer: "b" })).toBe("bus|MetroBus");
        hideRoute("metrobus", { consumer: "b" });
        await settle();
        expect(getRidersState().effective.vehicleGroups).not.toContain("bus|MetroBus");
    });

    test("timeline: shown with vehicles or on request, stopped and hidden when nothing needs it", async () => {
        activateHamburgRiders({ consumer: "a", network: ["bus"] });
        await settle();
        expect(getRidersState().effective.timeline).toBe(false);
        expect(frameCallbacks).toHaveLength(0);

        enableTimeline({ consumer: "a" });
        await settle();
        expect(getRidersState().effective.timeline).toBe(true);
        expect(frameCallbacks).toHaveLength(1);
        expect(setRidersTime("09:15")).toBe(true);
        expect(getRidersState().time).toBe(33300);
        expect(setRidersTime("bad")).toBe(false);

        deactivateHamburgRiders("a");
        await settle();
        expect(frameCallbacks).toHaveLength(0);
        expect(getRidersState().time).toBe(25200);
    });

    test("the TOSCA layer list and the Riders panel stay on one state", async () => {
        const store = useHamburgRidersStore();
        const mapStore = useMapStore();
        activateHamburgRiders({ consumer: "a", network: true, vehicles: true });
        await settle();
        expect(store.effective.network).toHaveLength(4);

        // User switches the U-Bahn network off in TOSCA's layer list.
        mapStore.setLogicalLayerVisibility(mapStore.layersOnMap.find((l) => l.id === "hamburgriders:network:u-bahn")!, false);
        await settle();
        expect(store.effective.network).not.toContain("u-bahn");

        // User unchecks U3 in the Riders panel: the vehicle layer stays on for the other lines.
        store.setGroupVisible("u-bahn|U3", false);
        await settle();
        expect(store.effective.vehicleGroups).not.toContain("u-bahn|U3");
        expect(mapStore.getLayerUiState("hamburgriders:vehicles")?.visible).toBe(true);

        // Hiding vehicles in the layer list unchecks every line in the panel.
        mapStore.setLogicalLayerVisibility(mapStore.layersOnMap.find((l) => l.id === "hamburgriders:vehicles")!, false);
        await settle();
        expect(store.effective.vehicleGroups).toEqual([]);
        expect(store.effective.timeline).toBe(false);

        // An explicit request from a consumer wins over the earlier user hide.
        showTransportMode("u-bahn", { consumer: "a" });
        await settle();
        expect(store.effective.network).toContain("u-bahn");
        expect(store.effective.vehicleGroups).toContain("u-bahn|U3");
    });

    test("closing the controls keeps the layers; deactivating removes the controls", async () => {
        const store = useHamburgRidersStore();
        activateHamburgRiders({ consumer: "a", modes: ["s-bahn"], controls: true });
        await settle();
        expect(store.controlsVisible).toBe(true);
        store.closeControls();
        expect(store.controlsVisible).toBe(false);
        expect(store.controlsWanted).toBe(true);
        expect(riders("")).toContain("vehicles");
        deactivateHamburgRiders("a");
        await settle();
        expect(store.controlsWanted).toBe(false);
    });

    test("a layer deleted in the layer list counts as hidden", async () => {
        const mapStore = useMapStore();
        activateHamburgRiders({ consumer: "a", modes: ["bus"] });
        await settle();
        await mapStore.deleteMapLayer("hamburgriders:stops");
        await settle();
        expect(useHamburgRidersStore().effective.stops).toEqual([]);
    });
});

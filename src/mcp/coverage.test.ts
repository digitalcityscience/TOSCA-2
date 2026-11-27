import { readdirSync } from "node:fs";
import { join } from "node:path";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBufferStore } from "@store/buffer";
import { useDrawStore } from "@store/draw";
import { useFilterStore } from "@store/filter";
import { useGeostorySceneStore } from "@store/geostoryScenes";
import { useMapStore } from "@store/map";
import { useOgcLayersStore } from "@store/ogcLayers";
import { useSensorThingsLayersStore } from "@store/sensorThingsLayers";
import { availableCommands } from "./commandCatalog";
import { NOT_YET_COVERED_MODULES, STORE_COVERAGE, SUPPORT_STORES } from "./coverage";

vi.mock("@helpers/toast", () => ({ useToast: () => ({ add: vi.fn() }) }));

const STORES: Record<string, () => object> = {
    map: useMapStore,
    filter: useFilterStore,
    draw: useDrawStore,
    buffer: useBufferStore,
    ogcLayers: useOgcLayersStore,
    sensorThingsLayers: useSensorThingsLayersStore,
    geostoryScenes: useGeostorySceneStore,
};

function actionsOf(store: object): string[] {
    return Object.entries(store)
        .filter(([key, value]) => !key.startsWith("$") && !key.startsWith("_") && typeof value === "function")
        .map(([key]) => key)
        .sort();
}

describe("assistant coverage of TOSCA", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it("places every action of the map stores", () => {
        expect(Object.keys(STORES).sort()).toEqual(Object.keys(STORE_COVERAGE).sort());
        for (const [name, useStore] of Object.entries(STORES)) {
            expect(actionsOf(useStore()), `store ${name}: add new actions to coverage.ts`).toEqual(
                Object.keys(STORE_COVERAGE[name]).sort(),
            );
        }
    });

    it("names only commands that exist", () => {
        const names = new Set(availableCommands().map((command) => command.name));
        for (const [store, actions] of Object.entries(STORE_COVERAGE)) {
            for (const [action, coverage] of Object.entries(actions)) {
                if ("commands" in coverage) {
                    for (const name of coverage.commands) expect(names.has(name), `${store}.${action} → ${name}`).toBe(true);
                }
            }
        }
    });

    it("places every store file", () => {
        const files = readdirSync(join(process.cwd(), "src", "store"))
            .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
            .map((file) => file.replace(/\.ts$/, ""));
        const placed = [...Object.keys(STORE_COVERAGE), ...Object.keys(SUPPORT_STORES), ...Object.keys(NOT_YET_COVERED_MODULES)];
        // urbanStories.<story>.ts files belong to the urban stories module.
        const unplaced = files.filter((file) => !placed.includes(file) && !placed.includes(file.split(".")[0]));
        expect(unplaced, "add new store files to coverage.ts").toEqual([]);
    });
});

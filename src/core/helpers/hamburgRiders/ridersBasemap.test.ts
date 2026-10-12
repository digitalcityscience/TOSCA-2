import { describe, expect, test } from "vitest";
import type { StyleSpecification } from "maplibre-gl";
import { RidersDarkBasemap } from "./ridersBasemap";
import { FakeMap } from "./ridersFixtures";

const darkStyle = {
    version: 8,
    sources: { carto: { type: "vector", url: "https://example.test/tiles.json" } },
    layers: [
        { id: "bg", type: "background", paint: {} },
        { id: "roads", type: "line", source: "carto", "source-layer": "transportation" },
    ],
} as unknown as StyleSpecification;

function setup() {
    const map = new FakeMap();
    // Two TOSCA basemaps as BasemapManager installs them: "backdrop" visible, "dataviz" hidden, hillshade above both.
    map.addLayer({ id: "basemap:backdrop:layer:0:bg", type: "background", layout: { visibility: "visible" } });
    map.addLayer({ id: "basemap:dataviz:layer:0:bg", type: "background", layout: { visibility: "none" } });
    map.addLayer({ id: "terrain-hillshade", type: "raster", layout: { visibility: "none" } });
    const dark = new RidersDarkBasemap(map as never, { fetchStyle: async () => darkStyle });
    const visible = (): string[] => map.layers.filter((l) => l.id.startsWith("basemap:") && l.layout.visibility !== "none").map((l) => l.id.split(":")[1]);
    return { map, dark, visible };
}

describe("RidersDarkBasemap", () => {
    test("shows the dark basemap in place of the current one and restores it afterwards", async () => {
        const { map, dark, visible } = setup();
        await dark.enable();
        expect(visible()).toEqual(["hamburgriders-dark", "hamburgriders-dark"]);
        // Installed below the hillshade overlay, like TOSCA's own basemaps.
        const ids = map.layers.map((l) => l.id);
        expect(ids.indexOf("basemap:hamburgriders-dark:layer:1:roads")).toBeLessThan(ids.indexOf("terrain-hillshade"));

        dark.disable();
        expect(visible()).toEqual(["backdrop"]);
        expect(map.layers.some((l) => l.id.includes("hamburgriders-dark"))).toBe(false);
        expect(map.handlers).toHaveLength(0);
    });

    test("a basemap the user picks meanwhile wins and is not overwritten on exit", async () => {
        const { map, dark, visible } = setup();
        await dark.enable();
        // The user clicks "dataviz" in TOSCA's basemap control: its layers turn on, the dark ones must go.
        map.setLayoutProperty("basemap:dataviz:layer:0:bg", "visibility", "visible");
        map.emit("styledata");
        expect(dark.supersededByUser).toBe(true);
        expect(visible()).toEqual(["dataviz"]);

        dark.disable();
        expect(visible()).toEqual(["dataviz"]);
    });

    test("enable and disable can be repeated and a late disable cancels a pending enable", async () => {
        const { dark, visible } = setup();
        const pending = dark.enable();
        dark.disable();
        await pending;
        expect(visible()).toEqual(["backdrop"]);
        await dark.enable();
        dark.disable();
        await dark.enable();
        dark.disable();
        expect(visible()).toEqual(["backdrop"]);
    });
});

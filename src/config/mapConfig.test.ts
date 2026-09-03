import { describe, expect, test } from "vitest";
import { mapConfiguration, resolveMapConfiguration } from "./mapConfig";

const environment = {
    VITE_MAPTILER_API_KEY: "map key",
    VITE_INHOUSE_MAP_BASE_URL: "https://maps.example.test/",
    VITE_INHOUSE_MAP_API_KEY: "in-house key",
};

describe("map configuration", () => {
    test("keeps application ids separate from provider map ids", () => {
        const resolved = resolveMapConfiguration(mapConfiguration, environment, (key) => key);
        const streets = resolved.basemaps.find(({ id }) => id === "streets");

        expect(resolved.initialBasemapId).toBe("streets");
        expect(streets).toMatchObject({
            kind: "vector",
            id: "streets",
            styleUrl: "https://api.maptiler.com/maps/dataviz-v4/style.json?key=map%20key",
            thumbnailUrl: "https://api.maptiler.com/maps/dataviz-v4/0/0/0.png?key=map%20key",
        });
    });

    test("resolves explicit thumbnails for vector and raster basemaps", () => {
        const resolved = resolveMapConfiguration(mapConfiguration, environment, (key) => key);

        expect(resolved.basemaps.find(({ id }) => id === "backdrop")?.thumbnailUrl)
            .toContain("/maps/backdrop-v4/0/0/0.png");
        expect(resolved.basemaps.find(({ id }) => id === "satellite")?.thumbnailUrl)
            .toContain("/maps/satellite/0/0/0.jpg");
    });

    test("resolves MapTiler and in-house resources through the same provider model", () => {
        const resolved = resolveMapConfiguration(mapConfiguration, environment, (key) => key);
        const inHouse = resolved.basemaps.find(({ id }) => id === "in-house");

        expect(inHouse).toMatchObject({
            kind: "vector",
            styleUrl: "https://maps.example.test/styles/light.json?key=in-house%20key",
            thumbnailUrl: "https://maps.example.test/styles/light/0/0/0.png?key=in-house%20key",
        });
    });

    test("reports missing environment-backed basemap resources", () => {
        expect(() => resolveMapConfiguration(
            mapConfiguration,
            {
                VITE_MAPTILER_API_KEY: "key",
                VITE_INHOUSE_MAP_BASE_URL: "https://maps.example.test",
            },
            (key) => key
        )).toThrow("Missing basemap environment variable \"VITE_INHOUSE_MAP_API_KEY\"");
    });
});

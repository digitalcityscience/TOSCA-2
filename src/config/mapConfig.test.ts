import { describe, expect, test, vi } from "vitest";
import {
    inHouseTerrainExample,
    mapConfiguration,
    resolveMapConfiguration,
    resolveMapProviderUrl,
    type MapConfiguration,
} from "./mapConfig";

const environment = {
    VITE_MAPTILER_API_KEY: "map key",
    VITE_INHOUSE_MAP_BASE_URL: "https://maps.example.test/",
    VITE_INHOUSE_MAP_API_KEY: "inHouse key",
};

describe("map configuration", () => {
    test("keeps application ids separate from provider map ids", () => {
        const resolved = resolveMapConfiguration(mapConfiguration, environment, (key) => key);
        const dataviz = resolved.basemaps.find(({ id }) => id === "dataviz");

        expect(resolved.initialBasemapId).toBe("backdrop");
        expect(dataviz).toMatchObject({
            kind: "vector",
            id: "dataviz",
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

    test("resolves MapTiler and inHouse resources through the same provider model", () => {
        const resolved = resolveMapConfiguration(mapConfiguration, environment, (key) => key);
        const inHouse = resolved.basemaps.find(({ id }) => id === "inHouse");

        expect(inHouse).toMatchObject({
            kind: "vector",
            styleUrl: "https://maps.example.test/styles/osm-bright.json?key=inHouse%20key",
            thumbnailUrl: "https://maps.example.test/thumbnails/osmBright.jpg?key=inHouse%20key",
        });
    });

    test("builds direct Martin tile templates without encoding placeholders", () => {
        expect(resolveMapProviderUrl(
            mapConfiguration,
            "inHouse",
            "tiles/terrain/{z}/{x}/{y}",
            environment
        )).toBe(
            "https://maps.example.test/tiles/terrain/{z}/{x}/{y}?key=inHouse%20key"
        );
    });

    test("keeps the in-house direct terrain implementation as a working example", () => {
        const directConfiguration: MapConfiguration = {
            ...mapConfiguration,
            terrain: inHouseTerrainExample,
        };
        const resolved = resolveMapConfiguration(directConfiguration, environment, (key) => key);

        expect(resolved.terrain).toMatchObject({
            exaggeration: 1,
            demSource: {
                type: "raster-dem",
                tiles: [
                    "https://maps.example.test/tiles/terrain-hamburg-official/{z}/{x}/{y}?key=inHouse%20key",
                ],
                encoding: "mapbox",
                tileSize: 256,
                minzoom: 9,
                maxzoom: 14,
            },
            hillshadeSource: {
                type: "raster",
                tiles: [
                    "https://maps.example.test/tiles/hillshade-hamburg-official/{z}/{x}/{y}?key=inHouse%20key",
                ],
                tileSize: 256,
                minzoom: 9,
                maxzoom: 14,
            },
        });
    });

    test("uses MapTiler TileJSON terrain and hillshade sources", () => {
        const resolved = resolveMapConfiguration(mapConfiguration, environment, (key) => key);

        expect(resolved.terrain).toMatchObject({
            exaggeration: 1,
            demSource: {
                type: "raster-dem",
                url: "https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=map%20key",
                encoding: "mapbox",
                tileSize: 512,
                maxzoom: 14,
            },
            hillshadeSource: {
                type: "raster",
                url: "https://api.maptiler.com/tiles/hillshade/tiles.json?key=map%20key",
            },
        });
        expect(resolved.terrain.demSource.tiles).toBeUndefined();
        expect(resolved.terrain.hillshadeSource.tiles).toBeUndefined();
    });

    test("skips a basemap whose provider is missing a required environment value", () => {
        vi.spyOn(console, "error").mockImplementation(() => {});

        const resolved = resolveMapConfiguration(
            mapConfiguration,
            {
                VITE_MAPTILER_API_KEY: "key",
                VITE_INHOUSE_MAP_BASE_URL: "https://maps.example.test",
                // VITE_INHOUSE_MAP_API_KEY intentionally omitted
            },
            (key) => key
        );

        expect(resolved.basemaps.find(({ id }) => id === "inHouse")).toBeUndefined();
        expect(resolved.basemaps.find(({ id }) => id === "dataviz")).toBeDefined();
    });

    test("skips a basemap whose provider baseUrl is missing entirely", () => {
        vi.spyOn(console, "error").mockImplementation(() => {});

        const resolved = resolveMapConfiguration(
            mapConfiguration,
            {
                VITE_MAPTILER_API_KEY: "key",
                // VITE_INHOUSE_MAP_BASE_URL and VITE_INHOUSE_MAP_API_KEY both omitted
            },
            (key) => key
        );

        expect(resolved.basemaps.find(({ id }) => id === "inHouse")).toBeUndefined();
        expect(resolved.basemaps).toHaveLength(mapConfiguration.basemaps.length - 1);
    });

    test("falls back to the first available basemap when the initial one was skipped", () => {
        vi.spyOn(console, "error").mockImplementation(() => {});

        const configurationWithInHouseInitial: MapConfiguration = {
            ...mapConfiguration,
            initialBasemapId: "inHouse",
        };

        const resolved = resolveMapConfiguration(
            configurationWithInHouseInitial,
            { VITE_MAPTILER_API_KEY: "key" },
            (key) => key
        );

        expect(resolved.initialBasemapId).toBe(resolved.basemaps[0].id);
        expect(resolved.initialBasemapId).not.toBe("inHouse");
    });

    test("throws only when every basemap fails to resolve", () => {
        expect(() => resolveMapConfiguration(
            mapConfiguration,
            {},
            (key) => key
        )).toThrow("No basemaps could be configured");
    });
});

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
    VITE_INHOUSE_MAP_API_KEY: "in-house key",
};
const inHouseBasemapIds = ["inHouseBright", "inHouseNight"];

describe("map configuration", () => {
    test("preserves the configured basemap order and default", () => {
        const resolved = resolveMapConfiguration(mapConfiguration, environment, (key) => key);
        const dataviz = resolved.basemaps.find(({ id }) => id === "dataviz");

        expect(resolved.initialBasemapId).toBe("inHouseBright");
        expect(resolved.basemaps.map(({ id }) => id)).toEqual([
            "inHouseBright",
            "inHouseNight",
            "satellite",
            "dataviz",
            "backdrop",
        ]);
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

    test("resolves every in-house basemap through the shared provider", () => {
        const resolved = resolveMapConfiguration(mapConfiguration, environment, (key) => key);
        const inHouseBasemaps = resolved.basemaps.filter(({ id }) => id.startsWith("inHouse"));

        expect(inHouseBasemaps).toMatchObject([
            {
                kind: "vector",
                id: "inHouseBright",
                title: "map.basemap.inHouseBright",
                styleUrl: "https://maps.example.test/styles/osm-bright.json?key=in-house%20key",
                thumbnailUrl: "https://maps.example.test/thumbnails/osmBright.jpg?key=in-house%20key",
            },
            {
                kind: "vector",
                id: "inHouseNight",
                title: "map.basemap.inHouseNight",
                styleUrl: "https://maps.example.test/styles/osm-night.json?key=in-house%20key",
                thumbnailUrl: "https://maps.example.test/thumbnails/osmNight.jpg?key=in-house%20key",
            },
        ]);
    });

    test("builds direct Martin tile templates without encoding placeholders", () => {
        expect(resolveMapProviderUrl(
            mapConfiguration,
            "inHouse",
            "tiles/terrain/{z}/{x}/{y}",
            environment
        )).toBe(
            "https://maps.example.test/tiles/terrain/{z}/{x}/{y}?key=in-house%20key"
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
                    "https://maps.example.test/tiles/terrain-hamburg-official/{z}/{x}/{y}?key=in-house%20key",
                ],
                encoding: "mapbox",
                tileSize: 256,
                minzoom: 9,
                maxzoom: 14,
            },
            hillshadeSource: {
                type: "raster",
                tiles: [
                    "https://maps.example.test/tiles/hillshade-hamburg-official/{z}/{x}/{y}?key=in-house%20key",
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

    test("appends the encoded in-house key to provider URLs", () => {
        const resolved = resolveMapConfiguration(
            mapConfiguration,
            {
                VITE_MAPTILER_API_KEY: "key",
                VITE_INHOUSE_MAP_BASE_URL: "https://maps.example.test",
                VITE_INHOUSE_MAP_API_KEY: "client key/+",
            },
            (key) => key
        );

        expect(resolved.basemaps.find(({ id }) => id === "inHouseBright")?.thumbnailUrl)
            .toBe("https://maps.example.test/thumbnails/osmBright.jpg?key=client%20key%2F%2B");
    });

    test("skips the in-house basemap when its API key is missing", () => {
        vi.spyOn(console, "error").mockImplementation(() => {});

        const resolved = resolveMapConfiguration(
            mapConfiguration,
            {
                VITE_MAPTILER_API_KEY: "key",
                VITE_INHOUSE_MAP_BASE_URL: "https://maps.example.test",
            },
            (key) => key
        );

        expect(resolved.basemaps.filter(({ id }) => id.startsWith("inHouse"))).toHaveLength(0);
    });

    test("skips a basemap whose provider baseUrl is missing entirely", () => {
        vi.spyOn(console, "error").mockImplementation(() => {});

        const resolved = resolveMapConfiguration(
            mapConfiguration,
            {
                VITE_MAPTILER_API_KEY: "key",
                // VITE_INHOUSE_MAP_BASE_URL intentionally omitted
            },
            (key) => key
        );

        expect(resolved.basemaps.filter(({ id }) => id.startsWith("inHouse"))).toHaveLength(0);
        expect(resolved.basemaps).toHaveLength(
            mapConfiguration.basemaps.length - inHouseBasemapIds.length
        );
    });

    test("falls back to the first available basemap when the initial one was skipped", () => {
        vi.spyOn(console, "error").mockImplementation(() => {});

        const configurationWithInHouseInitial: MapConfiguration = {
            ...mapConfiguration,
            initialBasemapId: "inHouseBright",
        };

        const resolved = resolveMapConfiguration(
            configurationWithInHouseInitial,
            { VITE_MAPTILER_API_KEY: "key" },
            (key) => key
        );

        expect(resolved.initialBasemapId).toBe(resolved.basemaps[0].id);
        expect(resolved.initialBasemapId).not.toBe("inHouseBright");
    });

    test("throws only when every basemap fails to resolve", () => {
        expect(() => resolveMapConfiguration(
            mapConfiguration,
            {},
            (key) => key
        )).toThrow("No basemaps could be configured");
    });
});

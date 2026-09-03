import { describe, expect, test } from "vitest";
import {
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

    test("resolves direct terrain and hillshade tile templates", () => {
        const resolved = resolveMapConfiguration(mapConfiguration, environment, (key) => key);

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

    test("supports TileJSON terrain and hillshade sources", () => {
        const tileJsonConfiguration: MapConfiguration = {
            ...mapConfiguration,
            terrain: {
                exaggeration: 0.75,
                dem: {
                    kind: "tilejson",
                    url: { provider: "maptiler", path: "tiles/terrain-rgb-v2/tiles.json" },
                    encoding: "mapbox",
                    tileSize: 512,
                    maxzoom: 14,
                },
                hillshade: {
                    kind: "tilejson",
                    url: { provider: "maptiler", path: "tiles/hillshade/tiles.json" },
                },
            },
        };

        const resolved = resolveMapConfiguration(
            tileJsonConfiguration,
            environment,
            (key) => key
        );

        expect(resolved.terrain).toMatchObject({
            exaggeration: 0.75,
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

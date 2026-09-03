import { describe, expect, test } from "vitest";
import { type StyleSpecification } from "maplibre-gl";
import {
    compileRasterStyleBundle,
    compileVectorStyleBundle,
} from "./mapStyleBundle";

describe("compileVectorStyleBundle", () => {
    test("namespaces sources and layers while retaining style order and visibility", () => {
        const style: StyleSpecification = {
            version: 8,
            sprite: "./sprites/basic",
            glyphs: "./fonts/{fontstack}/{range}.pbf",
            sources: {
                tiles: {
                    type: "vector",
                    url: "./tiles.json",
                },
                places: {
                    type: "geojson",
                    data: "./places.geojson",
                },
            },
            layers: [
                {
                    id: "background",
                    type: "background",
                    paint: { "background-color": "#ffffff" },
                },
                {
                    id: "parks",
                    type: "fill",
                    source: "tiles",
                    "source-layer": "landuse",
                    layout: { visibility: "none" },
                    paint: { "fill-pattern": "trees" },
                },
                {
                    id: "labels",
                    type: "symbol",
                    source: "places",
                    layout: {
                        "text-field": ["get", "name"],
                        "icon-image": ["get", "icon"],
                    },
                },
            ],
        };

        const bundle = compileVectorStyleBundle(
            "city streets",
            style,
            "https://maps.example.test/styles/day/style.json",
            { fontStackOverride: ["Open Sans Regular"] }
        );

        expect(bundle.sources.map(({ id }) => id)).toEqual([
            "basemap:city-streets:source:0:tiles",
            "basemap:city-streets:source:1:places",
        ]);
        expect(bundle.sources[0].specification).toMatchObject({
            url: "https://maps.example.test/styles/day/tiles.json",
        });
        expect(bundle.sources[1].specification).toMatchObject({
            data: "https://maps.example.test/styles/day/places.geojson",
        });
        expect(bundle.layers.map(({ specification }) => specification.id)).toEqual([
            "basemap:city-streets:layer:0:background",
            "basemap:city-streets:layer:1:parks",
            "basemap:city-streets:layer:2:labels",
        ]);
        expect(bundle.layers[1]).toMatchObject({
            activeVisibility: "none",
            specification: {
                source: "basemap:city-streets:source:0:tiles",
                paint: { "fill-pattern": "basemap-city-streets-sprite:trees" },
            },
        });
        expect(bundle.layers[2].specification).toMatchObject({
            source: "basemap:city-streets:source:1:places",
            layout: {
                "text-font": ["Open Sans Regular"],
                "icon-image": [
                    "concat",
                    "basemap-city-streets-sprite:",
                    ["get", "icon"],
                ],
            },
        });
        expect(bundle.sprites).toEqual([{
            id: "basemap-city-streets-sprite",
            url: "https://maps.example.test/styles/day/sprites/basic",
        }]);
    });

    test("rejects layers that reference an undeclared source", () => {
        expect(() => compileVectorStyleBundle("broken", {
            version: 8,
            sources: {},
            layers: [{ id: "water", type: "fill", source: "missing" }],
        }, "https://maps.example.test/style.json")).toThrow(
            "Basemap layer \"water\" references unknown source \"missing\""
        );
    });
});

describe("compileRasterStyleBundle", () => {
    test("adapts a raster source and optional layer styling into one bundle", () => {
        const bundle = compileRasterStyleBundle("satellite", {
            type: "raster",
            tiles: ["https://tiles.example.test/{z}/{x}/{y}.jpg"],
            tileSize: 512,
        }, {
            paint: { "raster-saturation": -0.1 },
        });

        expect(bundle).toMatchObject({
            id: "satellite",
            sources: [{
                id: "basemap:satellite:source:0:raster",
                specification: { type: "raster", tileSize: 512 },
            }],
            layers: [{
                activeVisibility: "visible",
                specification: {
                    id: "basemap:satellite:layer:0:raster",
                    type: "raster",
                    source: "basemap:satellite:source:0:raster",
                    paint: { "raster-saturation": -0.1 },
                },
            }],
        });
    });
});

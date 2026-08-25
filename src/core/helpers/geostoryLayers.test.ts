import { describe, expect, test, vi } from "vitest";
import { loadGeostoryLayersOnMap } from "./geostoryLayers";
import { type GeoStoryDetail } from "@store/geostory";
import { type GeoServerVectorTypeLayerDetail } from "@store/geoserver";

function makeStory(): GeoStoryDetail {
    return {
        layers: [
            {
                display_order: 2,
                style_assignment: null,
                layer: {
                    id: "private-layer",
                    name: "private",
                    workspace: { id: "workspace-1", name: "city" },
                    geometry_type: "Polygon",
                    srid: 4326,
                    published_url: "",
                    is_public: false,
                    publishing_state: "PUBLISHED",
                },
            },
            {
                display_order: 1,
                style_assignment: {
                    id: "roads-assignment",
                    style_id: "roads-style",
                    name: "story-roads",
                    qualified_name: "city:story-roads",
                    role: "alternate",
                    format: "mbstyle",
                    style_layer_ids: ["roads-fill", "roads-outline"],
                },
                layer: {
                    id: "roads-layer",
                    name: "roads",
                    workspace: { id: "workspace-1", name: "city" },
                    geometry_type: "Polygon",
                    srid: 4326,
                    published_url: "",
                    is_public: true,
                    publishing_state: "PUBLISHED",
                },
            },
            {
                display_order: 0,
                style_assignment: null,
                layer: {
                    id: "draft-layer",
                    name: "draft",
                    workspace: { id: "workspace-1", name: "city" },
                    geometry_type: "Polygon",
                    srid: 4326,
                    published_url: "",
                    is_public: true,
                    publishing_state: "DRAFT",
                },
            },
        ],
    } as GeoStoryDetail;
}

function makeVectorDetail(): GeoServerVectorTypeLayerDetail {
    return {
        featureType: {
            name: "roads",
            title: "Roads",
            attributes: {
                attribute: [
                    {
                        name: "geom",
                        minOccurs: 0,
                        maxOccurs: 1,
                        nillable: true,
                        binding: "org.locationtech.jts.geom.Polygon",
                    },
                ],
            },
            latLonBoundingBox: {
                minx: 9,
                miny: 53,
                maxx: 10,
                maxy: 54,
                crs: "EPSG:4326",
            },
        },
    } as unknown as GeoServerVectorTypeLayerDetail;
}

describe("loadGeostoryLayersOnMap", () => {
    test("resets the map and only loads public published layers", async () => {
        const callOrder: string[] = [];
        const geoserverStore = {
            getLayerInformation: vi.fn(async () => {
                callOrder.push("catalog");
                return {
                    provider: {
                        id: "provider-1",
                        name: "GeoServer",
                        base_url: "https://maps.example.test/geoserver",
                    },
                    layer: {
                        name: "roads",
                        type: "VECTOR",
                        defaultStyle: { name: "default", href: "/styles/default" },
                        resource: {
                            "@class": "featureType",
                            name: "roads",
                            href: "/resources/roads",
                        },
                        attribution: { logoWidth: 0, logoHeight: 0 },
                        dateCreated: "2026-05-01T00:00:00Z",
                        dateModified: "2026-05-02T00:00:00Z",
                    },
                };
            }),
            getLayerDetail: vi.fn(async () => makeVectorDetail()),
            getLayerStyling: vi.fn(async () => ({
                version: 8,
                sources: {},
                layers: [
                    {
                        id: "roads-fill",
                        type: "fill",
                        source: "roads",
                        "source-layer": "roads",
                        paint: { "fill-color": "#336699" },
                    },
                    {
                        id: "roads-outline",
                        type: "line",
                        source: "roads",
                        "source-layer": "roads",
                        paint: { "line-color": "#ffffff" },
                    },
                ],
            })),
        };
        const mapStore = {
            map: { fitBounds: vi.fn() },
            resetMapData: vi.fn(async () => {
                callOrder.push("reset");
            }),
            addMapDataSource: vi.fn(async () => {
                callOrder.push("source");
            }),
            addMapLayer: vi.fn(async () => {
                callOrder.push("layer");
            }),
            addCompanionLayer: vi.fn(),
            layersOnMap: [],
            geometryConversion: vi.fn((): "fill" => "fill"),
        };

        const addedCount = await loadGeostoryLayersOnMap(
            makeStory(),
            geoserverStore,
            mapStore
        );

        expect(addedCount).toBe(1);
        expect(callOrder[0]).toBe("reset");
        expect(geoserverStore.getLayerInformation).toHaveBeenCalledWith(
            { name: "roads", href: "" },
            "city"
        );
        expect(mapStore.addMapDataSource).toHaveBeenCalledTimes(1);
        expect(mapStore.addMapLayer).toHaveBeenCalledTimes(1);
        expect(geoserverStore.getLayerStyling).toHaveBeenCalledWith(
            expect.stringContaining(
                "/api/v1/catalog/providers/provider-1/styles/roads-style"
            )
        );
        expect(mapStore.addMapLayer).toHaveBeenCalledWith(expect.objectContaining({
            layerType: "fill",
            layerStyle: expect.objectContaining({
                paint: { "fill-color": "#336699" },
            }),
        }));
        expect(mapStore.addCompanionLayer).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                type: "line",
                paint: { "line-color": "#ffffff" },
            })
        );
        expect(mapStore.map.fitBounds).toHaveBeenCalledTimes(1);
    });
});

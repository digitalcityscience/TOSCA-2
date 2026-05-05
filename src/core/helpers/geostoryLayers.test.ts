import { describe, expect, test, vi } from "vitest";
import { loadGeostoryLayersOnMap } from "./geostoryLayers";
import { type GeoStoryDetail } from "@store/geostory";
import { type GeoServerVectorTypeLayerDetail } from "@store/geoserver";

function makeStory(): GeoStoryDetail {
    return {
        id: "story-1",
        title: "Story",
        summary: "",
        hero_image_url: null,
        hero_image_alt: "",
        campaign: "campaign-1",
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-02T00:00:00Z",
        status: "published",
        context: null,
        feature_links: [],
        layers: [
            {
                display_order: 2,
                layer: {
                    id: "private-layer",
                    name: "private",
                    workspace: { id: "workspace-1", name: "city" },
                    geometry_type: "Polygon",
                    srid: 4326,
                    published_url: "do-not-use-private",
                    is_public: false,
                    publishing_state: "PUBLISHED",
                },
            },
            {
                display_order: 1,
                layer: {
                    id: "roads-layer",
                    name: "roads",
                    workspace: { id: "workspace-1", name: "city" },
                    geometry_type: "Polygon",
                    srid: 4326,
                    published_url: "do-not-use-roads",
                    is_public: true,
                    publishing_state: "PUBLISHED",
                },
            },
            {
                display_order: 0,
                layer: {
                    id: "draft-layer",
                    name: "draft",
                    workspace: { id: "workspace-1", name: "city" },
                    geometry_type: "Polygon",
                    srid: 4326,
                    published_url: "do-not-use-draft",
                    is_public: true,
                    publishing_state: "DRAFT",
                },
            },
        ],
    };
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
    test("resets the map, skips non-renderable layers, and uses catalog workspace/name", async () => {
        const callOrder: string[] = [];
        const catalogStore = {
            getLayerInformation: vi.fn(async () => {
                callOrder.push("catalog");
                return {
                    layer: {
                        name: "roads",
                        type: "VECTOR",
                        defaultStyle: { name: "default", href: "/catalog/styles/default" },
                        resource: { "@class": "featureType", name: "roads", href: "/catalog/resources/roads" },
                        attribution: { logoWidth: 0, logoHeight: 0 },
                        dateCreated: "2026-05-01T00:00:00Z",
                        dateModified: "2026-05-02T00:00:00Z",
                    },
                };
            }),
            getLayerDetail: vi.fn(async () => makeVectorDetail()),
        };
        const mapStore = {
            map: {
                fitBounds: vi.fn(),
            },
            resetMapData: vi.fn(async () => {
                callOrder.push("reset");
            }),
            addMapDataSource: vi.fn(async () => {
                callOrder.push("source");
            }),
            addMapLayer: vi.fn(async () => {
                callOrder.push("layer");
            }),
            geometryConversion: vi.fn((): "fill" => "fill"),
        };

        const addedCount = await loadGeostoryLayersOnMap(
            makeStory(),
            catalogStore,
            mapStore
        );

        expect(addedCount).toBe(1);
        expect(callOrder[0]).toBe("reset");
        expect(catalogStore.getLayerInformation).toHaveBeenCalledTimes(1);
        expect(catalogStore.getLayerInformation).toHaveBeenCalledWith(
            { name: "roads", href: "" },
            "city"
        );
        expect(catalogStore.getLayerDetail).toHaveBeenCalledWith("/catalog/resources/roads");
        expect(mapStore.addMapDataSource).toHaveBeenCalledTimes(1);
        expect(mapStore.addMapLayer).toHaveBeenCalledTimes(1);
        expect(mapStore.map.fitBounds).toHaveBeenCalledTimes(1);
    });
});

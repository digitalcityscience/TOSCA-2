import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
    buildCatalogLayerUrl,
    buildCatalogLayersUrl,
    buildCatalogProvidersUrl,
    buildCatalogResourceUrl,
    buildCatalogWorkspacesUrl,
    buildRasterFeatureInfoUrl,
    buildWmsLegendUrl,
    deduplicatePopupAttributeFeatures,
    type CatalogProvider,
    type GeoserverRasterTypeLayerDetail,
    type GeoServerVectorTypeLayerDetail,
    queryRasterFeatureInfo,
    resolveLegendUrl,
    type RasterFeatureInfoLayer,
    type RasterFeatureInfoPoint,
    type WorkspaceListItem,
    useGeoserverStore,
} from "./geoserver";

describe("WMS legends", () => {
    test("adds the assigned style to a generated group-member legend URL", () => {
        const url = new URL(buildWmsLegendUrl(
            "Hamburg",
            "districts",
            "https://maps.example.test/geoserver",
            "hamburg-group"
        ));

        expect(url.searchParams.get("LAYER")).toBe("Hamburg:districts");
        expect(url.searchParams.get("STYLE")).toBe("hamburg-group");
    });

    test("prefers the assigned style's advertised legend", async () => {
        const legend = await resolveLegendUrl(async () => ({
            version: "1.3.0",
            workspace: "Hamburg",
            layers: new Map([["districts", {
                name: "districts",
                title: "Districts",
                abstract: "",
                keywords: [],
                srsList: [],
                boundingBoxes: [],
                queryable: true,
                opaque: false,
                styles: [
                    { name: "default", legendUrls: [{ href: "https://example.test/default.png" }] },
                    { name: "hamburg-group", legendUrls: [{ href: "https://example.test/group.png" }] },
                ],
            }]]),
        }), "Hamburg", "districts", "https://maps.example.test/geoserver", "hamburg-group");

        expect(legend).toBe("https://example.test/group.png");
    });
});

describe("popup feature deduplication", () => {
    test("collapses repeated render passes but preserves distinct overlapping features", () => {
        const repeated = {
            id: 7,
            source: "health-data",
            sourceLayer: "health_data",
            properties: { district: "A", score: 4 },
        };
        const distinct = {
            id: 8,
            source: "health-data",
            sourceLayer: "health_data",
            properties: { district: "B", score: 4 },
        };

        expect(deduplicatePopupAttributeFeatures([
            repeated,
            { ...repeated },
            distinct,
        ])).toEqual([repeated, distinct]);
    });

    test("uses stable properties and geometry when vector tiles have no feature id", () => {
        const repeated = {
            source: "health-data",
            sourceLayer: "health_data",
            properties: { pattern: "dots", category: "high" },
            geometry: { type: "Point", coordinates: [9, 53] },
        };

        expect(deduplicatePopupAttributeFeatures([
            repeated,
            {
                ...repeated,
                properties: { category: "high", pattern: "dots" },
            },
        ])).toHaveLength(1);
    });
});

function jsonResponse(body: unknown, init?: ResponseInit): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: {
            "Content-Type": "application/json",
        },
        ...init,
    });
}

const provider: CatalogProvider = {
    id: "provider/1",
    name: "Primary GeoServer",
    base_url: "https://maps.example.test/geoserver/",
};

const rasterFeatureInfoLayer: RasterFeatureInfoLayer = {
    source: "rainfall-source",
    workspaceName: "Hamburg",
    time: "2026-08-04T12:00:00Z",
    details: {
        catalog: {
            provider: {
                id: "primary",
                name: "Primary GeoServer",
                base_url: "https://maps.example.test/geoserver/",
            },
            workspace_name: "Hamburg",
        },
        coverage: { name: "rainfall" },
    } as GeoserverRasterTypeLayerDetail,
};

const rasterFeatureInfoPoint: RasterFeatureInfoPoint = {
    lng: 10,
    lat: 53.55,
};

describe("raster feature info", () => {
    test("builds a provider-aware WMS GetFeatureInfo URL", () => {
        const url = new URL(buildRasterFeatureInfoUrl(
            rasterFeatureInfoLayer,
            rasterFeatureInfoPoint
        ));

        expect(`${url.origin}${url.pathname}`).toBe("https://maps.example.test/geoserver/wms");
        expect(url.searchParams.get("REQUEST")).toBe("GetFeatureInfo");
        expect(url.searchParams.get("LAYERS")).toBe("Hamburg:rainfall");
        expect(url.searchParams.get("QUERY_LAYERS")).toBe("Hamburg:rainfall");
        expect(url.searchParams.get("VERSION")).toBe("1.1.1");
        expect(url.searchParams.get("SRS")).toBe("EPSG:4326");
        expect(url.searchParams.get("X")).toBe("1");
        expect(url.searchParams.get("Y")).toBe("1");
        expect(url.searchParams.get("TIME")).toBe("2026-08-04T12:00:00Z");
        expect(url.searchParams.get("BBOX")?.split(",")).toHaveLength(4);
    });

    test("normalizes GeoJSON coverage properties for the existing popup", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
            type: "FeatureCollection",
            features: [{
                type: "Feature",
                geometry: { type: "Point", coordinates: [10, 53.55] },
                properties: { GRAY_INDEX: 17.5 },
            }],
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        })));

        await expect(queryRasterFeatureInfo(
            rasterFeatureInfoLayer,
            rasterFeatureInfoPoint
        )).resolves.toEqual([{
            source: "rainfall-source",
            sourceLayer: "rainfall",
            properties: { GRAY_INDEX: 17.5 },
        }]);
    });

    test("falls back to text/plain when JSON feature info is unavailable", async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response("Unsupported format", { status: 400 }))
            .mockResolvedValueOnce(new Response(
                "Results for FeatureType 'rainfall':\nGRAY_INDEX = 8.25\n",
                { status: 200, headers: { "Content-Type": "text/plain" } }
            ));
        vi.stubGlobal("fetch", fetchMock);

        await expect(queryRasterFeatureInfo(
            rasterFeatureInfoLayer,
            rasterFeatureInfoPoint
        )).resolves.toEqual([{
            source: "rainfall-source",
            sourceLayer: "rainfall",
            properties: { GRAY_INDEX: "8.25" },
        }]);
        expect(new URL(fetchMock.mock.calls[1][0]).searchParams.get("INFO_FORMAT"))
            .toBe("text/plain");
    });
});

function workspace(name = "Hamburg"): WorkspaceListItem {
    return {
        name,
        href:
            "http://localhost:8000/api/v1/catalog/providers/provider%2F1/" +
            `workspaces/${encodeURIComponent(name)}/layers`,
        provider: {
            ...provider,
            base_url: provider.base_url.replace(/\/+$/, ""),
        },
    };
}

describe("catalog store", () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        setActivePinia(createPinia());
        vi.stubEnv("VITE_BACKEND_ROOT_URL", "http://localhost:8000");
        fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
    });

    test("builds provider-aware catalog URLs from the backend root", () => {
        expect(buildCatalogProvidersUrl().toString()).toBe(
            "http://localhost:8000/api/v1/catalog/providers"
        );
        expect(buildCatalogWorkspacesUrl("provider/1").toString()).toBe(
            "http://localhost:8000/api/v1/catalog/providers/provider%2F1/workspaces"
        );
        expect(buildCatalogLayersUrl("provider/1", "Harbour City").toString()).toBe(
            "http://localhost:8000/api/v1/catalog/providers/provider%2F1/" +
            "workspaces/Harbour%20City/layers"
        );
        expect(buildCatalogLayerUrl("provider/1", "Harbour City", "rain/2026").toString()).toBe(
            "http://localhost:8000/api/v1/catalog/providers/provider%2F1/" +
            "workspaces/Harbour%20City/layers/rain%2F2026"
        );
        expect(buildCatalogResourceUrl("provider/1", "Harbour City", "rain/2026").toString()).toBe(
            "http://localhost:8000/api/v1/catalog/providers/provider%2F1/" +
            "workspaces/Harbour%20City/resources/rain%2F2026"
        );
    });

    test("loads providers before their workspaces and retains provider ownership", async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse([provider]))
            .mockResolvedValueOnce(jsonResponse({
                workspaces: {
                    workspace: [
                        {
                            name: "Hamburg",
                            href:
                                "http://localhost:8000/api/v1/catalog/providers/provider%2F1/" +
                                "workspaces/Hamburg/layers",
                        },
                    ],
                },
            }));

        const catalog = useGeoserverStore();
        const response = await catalog.getWorkspaceList();

        expect(fetchMock.mock.calls.map(([url]) => url.toString())).toEqual([
            "http://localhost:8000/api/v1/catalog/providers",
            "http://localhost:8000/api/v1/catalog/providers/provider%2F1/workspaces",
        ]);
        expect(response.workspaces.workspace[0].provider).toEqual({
            ...provider,
            base_url: "https://maps.example.test/geoserver",
        });
        expect(catalog.workspacesByProvider[provider.id][0].name).toBe("Hamburg");
    });

    test("loads workspace layers and annotates them with catalog context", async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({
            layers: {
                layer: [
                    {
                        name: "districts",
                        href:
                            "http://localhost:8000/api/v1/catalog/providers/provider%2F1/" +
                            "workspaces/Hamburg/layers/districts",
                    },
                ],
            },
        }));

        const catalog = useGeoserverStore();
        const response = await catalog.getLayerList(workspace());

        expect(fetchMock.mock.calls[0][0].toString()).toBe(
            "http://localhost:8000/api/v1/catalog/providers/provider%2F1/" +
            "workspaces/Hamburg/layers"
        );
        expect(response.layers.layer[0]).toMatchObject({
            name: "districts",
            provider_id: "provider/1",
            workspace_name: "Hamburg",
        });
    });

    test("retains groups returned by the provider-wide catalog", async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse([provider]))
            .mockResolvedValueOnce(jsonResponse({
                layers: { layer: [] },
                groups: {
                    group: [{
                        id: "group-1",
                        name: "mobility",
                        title: "Mobility",
                        description: "",
                        render_type: "VECTOR",
                        member_count: 2,
                        href:
                            "http://localhost:8000/api/v1/catalog/providers/provider%2F1/" +
                            "workspaces/Hamburg/groups/mobility",
                    }],
                },
            }));

        const catalog = useGeoserverStore();
        const response = await catalog.getLayerList();

        expect(response.groups?.group[0]).toMatchObject({
            id: "group-1",
            provider_id: "provider/1",
            workspace_name: "Hamburg",
        });
        expect(catalog.groupList).toHaveLength(1);
    });

    test("loads catalog groups and expands member resource details", async () => {
        const groupHref =
            "http://localhost:8000/api/v1/catalog/providers/provider%2F1/" +
            "workspaces/Hamburg/groups/mobility";
        fetchMock
            .mockResolvedValueOnce(jsonResponse({
                layers: { layer: [] },
                groups: {
                    group: [{
                        id: "group-1",
                        name: "mobility",
                        title: "Mobility",
                        description: "",
                        render_type: "VECTOR",
                        member_count: 2,
                        href: groupHref,
                    }],
                },
            }))
            .mockResolvedValueOnce(jsonResponse({
                group: {
                    id: "group-1",
                    name: "mobility",
                    title: "Mobility",
                    description: "",
                    render_type: "VECTOR",
                    workspace: { id: "workspace-1", name: "Hamburg" },
                    provider,
                    members: [{
                        id: "roads-1",
                        name: "roads",
                        title: "Roads",
                        source_alias: "roads",
                        order: 0,
                        geometry_type: "LineString",
                        resource_href: "/api/v1/catalog/providers/provider%2F1/workspaces/Hamburg/resources/roads",
                    }],
                    sources: { roads: { type: "vector", tiles: [] } },
                    layers: [{ id: "roads", type: "line", source: "roads" }],
                    sprite: null,
                    style: {
                        id: "style-1",
                        name: "mobility",
                        format: "mbstyle",
                        content_hash: "abc",
                        href: "/api/v1/catalog/providers/provider%2F1/styles/style-1",
                    },
                },
            }))
            .mockResolvedValueOnce(jsonResponse({
                featureType: {
                    name: "roads",
                    title: "Roads",
                    attributes: { attribute: [] },
                },
            }));

        const catalog = useGeoserverStore();
        const response = await catalog.getLayerList(workspace());
        const manifest = await catalog.getLayerGroup(response.groups!.group[0]);

        expect(response.groups!.group[0]).toMatchObject({
            provider_id: "provider/1",
            workspace_name: "Hamburg",
        });
        expect(manifest.members[0].details).toMatchObject({
            featureType: { name: "roads" },
        });
    });

    test("loads layer and resource details through Django and attaches provider metadata", async () => {
        const resourceUrl =
            "http://localhost:8000/api/v1/catalog/providers/provider%2F1/" +
            "workspaces/Hamburg/resources/districts";
        fetchMock
            .mockResolvedValueOnce(jsonResponse({
                layer: {
                    name: "districts",
                    type: "VECTOR",
                    defaultStyle: {
                        name: "districts",
                        href: "http://localhost:8000/api/v1/catalog/styles/districts",
                    },
                    resource: {
                        "@class": "featureType",
                        name: "Hamburg:districts",
                        href: resourceUrl,
                    },
                    attribution: {
                        logoWidth: 0,
                        logoHeight: 0,
                    },
                    dateCreated: "2026-07-01",
                    dateModified: "2026-07-01",
                },
            }))
            .mockResolvedValueOnce(jsonResponse({
                featureType: {
                    name: "districts",
                },
            }));

        const catalog = useGeoserverStore();
        catalog.providers = [{
            ...provider,
            base_url: "https://maps.example.test/geoserver",
        }];
        const catalogWorkspace = workspace();
        const information = await catalog.getLayerInformation(
            { name: "districts", href: "" },
            catalogWorkspace
        );
        const detail = await catalog.getLayerDetail(
            information.layer.resource.href
        ) as GeoServerVectorTypeLayerDetail;

        expect(fetchMock.mock.calls.map(([url]) => url.toString())).toEqual([
            "http://localhost:8000/api/v1/catalog/providers/provider%2F1/" +
                "workspaces/Hamburg/layers/districts",
            resourceUrl,
        ]);
        expect(information.provider?.id).toBe("provider/1");
        expect(detail.catalog).toEqual({
            provider: {
                ...provider,
                base_url: "https://maps.example.test/geoserver",
            },
            workspace_name: "Hamburg",
        });
    });

    test("uses native style negotiation and ignores SLD styles", async () => {
        fetchMock.mockResolvedValueOnce(new Response("<StyledLayerDescriptor />", {
            status: 200,
            headers: {
                "Content-Type": "application/vnd.ogc.sld+xml",
            },
        }));

        const catalog = useGeoserverStore();
        const style = await catalog.getLayerStyling(
            "http://localhost:8000/api/v1/catalog/providers/provider-1/styles/style-1"
        );

        const headers = fetchMock.mock.calls[0][1].headers as Headers;
        expect(headers.get("Accept")).toBe("*/*");
        expect(style).toBeUndefined();
    });

    test("returns catalog styles that are available as JSON", async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({
            version: 8,
            layers: [{ id: "districts", type: "fill" }],
        }));

        const catalog = useGeoserverStore();
        const style = await catalog.getLayerStyling(
            "http://localhost:8000/api/v1/catalog/providers/provider-1/styles/style-2"
        );

        expect(style.layers[0].id).toBe("districts");
    });

    test("requires a provider id when providers contain the same workspace name", async () => {
        const secondProvider: CatalogProvider = {
            id: "provider-2",
            name: "Secondary GeoServer",
            base_url: "https://secondary.example.test/geoserver",
        };
        fetchMock
            .mockResolvedValueOnce(jsonResponse([provider, secondProvider]))
            .mockResolvedValueOnce(jsonResponse({
                workspaces: {
                    workspace: [{ name: "Shared", href: "/provider-1/shared" }],
                },
            }))
            .mockResolvedValueOnce(jsonResponse({
                workspaces: {
                    workspace: [{ name: "Shared", href: "/provider-2/shared" }],
                },
            }))
            .mockResolvedValueOnce(jsonResponse({
                layer: {
                    name: "roads",
                    type: "VECTOR",
                    defaultStyle: { name: "roads", href: "/styles/roads" },
                    resource: { "@class": "featureType", name: "roads", href: "/resources/roads" },
                    attribution: { logoWidth: 0, logoHeight: 0 },
                    dateCreated: "2026-07-01",
                    dateModified: "2026-07-01",
                },
            }));

        const catalog = useGeoserverStore();
        await catalog.getWorkspaceList();

        await expect(catalog.getLayerInformation(
            { name: "roads", href: "" },
            "Shared"
        )).rejects.toThrow(
            "Workspace \"Shared\" exists in multiple providers; a provider id is required."
        );

        await catalog.getLayerInformation(
            {
                name: "roads",
                href: "https://secondary.example.test/geoserver/Shared/wms",
            },
            "Shared"
        );
        expect(fetchMock.mock.calls[3][0].toString()).toBe(
            "http://localhost:8000/api/v1/catalog/providers/provider-2/" +
            "workspaces/Shared/layers/roads"
        );
    });
});

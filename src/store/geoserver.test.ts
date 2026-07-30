import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
    buildCatalogLayerUrl,
    buildCatalogLayersUrl,
    buildCatalogProvidersUrl,
    buildCatalogResourceUrl,
    buildCatalogWorkspacesUrl,
    type CatalogProvider,
    type GeoServerVectorTypeLayerDetail,
    type WorkspaceListItem,
    useGeoserverStore,
} from "./geoserver";

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

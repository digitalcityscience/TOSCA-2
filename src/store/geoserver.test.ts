import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { buildCatalogUrl, buildProviderCatalogUrl, useGeoserverStore } from "./geoserver";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: {
            "Content-Type": "application/json",
        },
        ...init,
    });
}

describe("geoserver catalog migration", () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        setActivePinia(createPinia());
        vi.stubEnv("VITE_BACKEND_ROOT_URL", "https://api.example.test");
        vi.stubEnv(
            "VITE_GEOSERVER_BASE_URL",
            "https://geo.example.test/geoserver"
        );
        fetchMock = vi.fn().mockImplementation(async (url: URL | string) => {
            const value = String(url);
            if (value.endsWith("/api/v1/catalog/providers")) {
                return jsonResponse([
                    {
                        id: "provider-1",
                        name: "Provider One",
                        base_url: "https://provider-one.example.test/geoserver",
                    },
                ]);
            }
            if (value.includes("/workspaces") && !value.includes("/layers")) {
                return jsonResponse({ workspaces: { workspace: [] } });
            }
            if (value.includes("/layers") && !value.includes("/resources")) {
                return jsonResponse({ layers: { layer: [] } });
            }
            if (value.includes("/resources")) {
                return jsonResponse({});
            }
            if (value.includes("/styles")) {
                return jsonResponse({ layers: [] });
            }
            return jsonResponse({ layer: { name: "roads", type: "VECTOR", resource: { href: "" }, defaultStyle: { href: "" } } });
        });
        vi.stubGlobal("fetch", fetchMock);
    });

    function lastFetchUrl(): string {
        const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
        return String(call[0]);
    }

    function lastFetchHeaders(): Headers {
        const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
        return call[1].headers as Headers;
    }

    test("builds encoded catalog URLs from the backend root", () => {
        expect(
            buildProviderCatalogUrl("provider-1", [
                "workspaces",
                "city space",
                "layers",
                "roads/paths",
            ]).toString()
        ).toBe(
            "https://api.example.test/api/v1/catalog/providers/provider-1/workspaces/city%20space/layers/roads%2Fpaths"
        );
    });

    test("derives catalog root from GEONODE REST URL when backend root is blank", () => {
        vi.stubEnv("VITE_BACKEND_ROOT_URL", "");
        vi.stubEnv("VITE_GEONODE_REST_URL", "http://localhost:8000/api");

        expect(buildProviderCatalogUrl("provider-1", ["workspaces"]).toString()).toBe(
            "http://localhost:8000/api/v1/catalog/providers/provider-1/workspaces"
        );
    });

    test("reports backend root values without protocol clearly", () => {
        vi.stubEnv("VITE_BACKEND_ROOT_URL", "localhost:8000");

        expect(() => buildCatalogUrl(["workspaces"])).toThrow(
            "VITE_BACKEND_ROOT_URL must be an absolute URL including protocol"
        );
    });

    test("uses catalog endpoints for metadata reads", async () => {
        const geoserver = useGeoserverStore();

        await geoserver.getWorkspaceList();
        expect(lastFetchUrl()).toBe(
            "https://api.example.test/api/v1/catalog/providers/provider-1/workspaces"
        );

        await geoserver.getLayerList();
        expect(lastFetchUrl()).toBe(
            "https://api.example.test/api/v1/catalog/providers/provider-1/layers"
        );

        await geoserver.getLayerList("city space");
        expect(lastFetchUrl()).toBe(
            "https://api.example.test/api/v1/catalog/providers/provider-1/workspaces/city%20space/layers"
        );

        await geoserver.getLayerInformation({ name: "roads/paths", href: "" }, "city space");
        expect(lastFetchUrl()).toBe(
            "https://api.example.test/api/v1/catalog/providers/provider-1/workspaces/city%20space/layers/roads%2Fpaths"
        );

        await geoserver.getLayerDetail(
            "/api/v1/catalog/providers/provider-1/workspaces/city%20space/resources/roads%2Fpaths"
        );
        expect(lastFetchUrl()).toBe(
            "https://api.example.test/api/v1/catalog/providers/provider-1/workspaces/city%20space/resources/roads%2Fpaths"
        );

        await geoserver.getLayerStyling("/api/v1/catalog/providers/provider-1/styles/default.mbstyle");
        expect(lastFetchUrl()).toBe(
            "https://api.example.test/api/v1/catalog/providers/provider-1/styles/default.mbstyle"
        );
    });

    test("does not send browser Basic auth for catalog metadata requests", async () => {
        const geoserver = useGeoserverStore();

        await geoserver.getWorkspaceList();
        await geoserver.getLayerList("city");
        await geoserver.getLayerInformation({ name: "roads", href: "" }, "city");
        await geoserver.getLayerDetail("/api/v1/catalog/providers/provider-1/workspaces/city/resources/roads");
        await geoserver.getLayerStyling("/api/v1/catalog/providers/provider-1/styles/default.mbstyle");

        for (const call of fetchMock.mock.calls) {
            const headers = call[1].headers as Headers;
            expect(headers.get("Authorization")).toBeNull();
        }
    });

    test("deduplicates repeated catalog metadata requests", async () => {
        const geoserver = useGeoserverStore();

        await geoserver.getLayerDetail("/api/v1/catalog/providers/provider-1/workspaces/city/resources/roads");
        await geoserver.getLayerDetail("/api/v1/catalog/providers/provider-1/workspaces/city/resources/roads");

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test("keeps WMS GeoJSON fetches on GeoServer without Basic auth", async () => {
        const geoserver = useGeoserverStore();

        await geoserver.getGeoJSONLayerSource("roads", "city", "1,2,3,4");

        expect(lastFetchUrl()).toContain(
            "https://provider-one.example.test/geoserver/city/wms?"
        );
        expect(lastFetchHeaders().get("Authorization")).toBeNull();
    });

    test("throws a clear error for failed catalog responses", async () => {
        fetchMock.mockImplementationOnce(async () => {
            return jsonResponse("Missing layer", {
                status: 404,
                statusText: "Not Found",
            });
        });

        await expect(useGeoserverStore().getWorkspaceList()).rejects.toThrow(
            "Catalog request failed (404 Not Found): \"Missing layer\""
        );
    });
});

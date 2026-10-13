import { beforeEach, describe, expect, test, vi } from "vitest";
import type { GeoServerVectorTypeLayerDetail, GeoserverLayerInfo } from "@store/geoserver";

const geoserver = {
    getLayerInformation: vi.fn(),
    getLayerDetail: vi.fn(),
    getStyleList: vi.fn(),
    getLayerStyling: vi.fn(),
};
const layersOnMap: Array<Record<string, any>> = [];
const mapStore = {
    layersOnMap,
    addMapDataSource: vi.fn(async () => undefined),
    addMapLayer: vi.fn(async (params: Record<string, any>) => {
        layersOnMap.push({ id: params.identifier });
        return undefined;
    }),
    addCompanionLayer: vi.fn(),
    acquireMapSprite: vi.fn(async (_url: string, id: string) => id),
    releaseMapSprite: vi.fn(),
    geometryConversion: vi.fn(() => "fill"),
};

vi.mock("@store/geoserver", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@store/geoserver")>()),
    useGeoserverStore: () => geoserver,
}));
vi.mock("@store/map", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@store/map")>()),
    useMapStore: () => mapStore,
}));

import {
    addCatalogRasterLayer,
    addCatalogVectorLayer,
    loadCatalogLayerStyling,
    resolveCatalogLayer,
} from "./catalogLayerLoader";

function detail(name = "hamburg_mobility"): GeoServerVectorTypeLayerDetail {
    return {
        catalog: { provider: { id: "prov" }, workspace_name: "WS" },
        featureType: {
            name,
            title: name,
            attributes: { attribute: [{ name: "geom", binding: "org.locationtech.jts.geom.MultiLineString" }] },
        },
    } as unknown as GeoServerVectorTypeLayerDetail;
}

function layerInfo(styleNames: string[] = []): GeoserverLayerInfo {
    return {
        name: "hamburg_mobility",
        type: "VECTOR",
        defaultStyle: { name: "generic", href: "/styles/generic.json" },
        styles: styleNames.map((name) => ({ name, href: `/styles/${name}.json` })),
        resource: { "@class": "featureType", name: "hamburg_mobility", href: "/res" },
    } as unknown as GeoserverLayerInfo;
}

const mbStyle = (minzoom?: number, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    layers: [{ id: "l1", type: "line", source: "hamburg_mobility", paint: { "line-color": "#f00" }, ...(minzoom === undefined ? {} : { minzoom }) }],
    ...extra,
});

beforeEach(() => {
    vi.clearAllMocks();
    layersOnMap.length = 0;
    geoserver.getStyleList.mockResolvedValue([
        { id: "s1", name: "metric-a", format: "mbstyle", provider: { id: "prov" }, workspace: null, scope: "global" },
        { id: "s2", name: "metric-b", format: "mbstyle", provider: { id: "prov" }, workspace: null, scope: "global" },
    ]);
});

describe("resolveCatalogLayer", () => {
    test("returns info and detail", async () => {
        geoserver.getLayerInformation.mockResolvedValue({ layer: layerInfo() });
        geoserver.getLayerDetail.mockResolvedValue(detail());
        const result = await resolveCatalogLayer({ providerId: "prov", workspace: "WS", layerName: "x" });
        expect(result.ok).toBe(true);
        expect(geoserver.getLayerInformation).toHaveBeenCalledWith({ name: "x", href: "" }, "WS", "prov");
    });

    test("maps a catalog 404 to not-found instead of throwing", async () => {
        geoserver.getLayerInformation.mockRejectedValue(new Error("Catalog layer WS:x request failed (404 Not Found): nope"));
        expect(await resolveCatalogLayer({ providerId: "prov", workspace: "WS", layerName: "x" }))
            .toMatchObject({ ok: false, reason: "not-found" });
    });

    test("maps other failures to error", async () => {
        geoserver.getLayerInformation.mockRejectedValue(new Error("Catalog layer request failed (500 Server Error)"));
        expect(await resolveCatalogLayer({ providerId: "prov", workspace: "WS", layerName: "x" }))
            .toMatchObject({ ok: false, reason: "error" });
    });
});

describe("loadCatalogLayerStyling", () => {
    test("loads the default plus alternates and marks the first as default", async () => {
        geoserver.getLayerStyling.mockResolvedValue(mbStyle());
        const info = layerInfo();
        info.defaultStyle = { name: "metric-a", href: "/styles/a.json" } as never;
        info.styles = [{ name: "metric-b", href: "/styles/b.json" }] as never;
        const bundle = await loadCatalogLayerStyling(info, "WS", "prov", "hamburg_mobility");
        expect(bundle?.styles.map((style) => style.name)).toEqual(["metric-a", "metric-b"]);
        expect(bundle?.styles[0].isDefault).toBe(true);
        expect(bundle?.defaultStyleId).toBe(bundle?.styles[0].id);
    });

    test("returns undefined when the style document is a 404 / not MBStyle", async () => {
        geoserver.getLayerStyling.mockResolvedValue(undefined);
        const bundle = await loadCatalogLayerStyling(layerInfo(), "WS", "prov", "hamburg_mobility");
        expect(bundle).toBeUndefined();
    });

    test("returns undefined when every style request throws", async () => {
        geoserver.getLayerStyling.mockRejectedValue(new Error("404"));
        const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
        expect(await loadCatalogLayerStyling(layerInfo(), "WS", "prov", "hamburg_mobility")).toBeUndefined();
        error.mockRestore();
    });
});

describe("loadCatalogLayerStyling: styles the layer does not list (M4)", () => {
    const listItem = (name: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
        id: `id-${name}`,
        name,
        qualified_name: `WS:${name}`,
        title: name,
        format: "mbstyle",
        scope: "workspace",
        workspace: { id: "w", name: "WS" },
        provider: { id: "prov" },
        ...extra,
    });
    const metricStyle = (sourceLayer: string, metric?: string): Record<string, unknown> => ({
        metadata: { ...(metric === undefined ? {} : { "tosca:metric": metric }), "tosca:attributes": [{ name: metric }] },
        layers: [{ id: "metric-layer", type: "line", source: sourceLayer, "source-layer": sourceLayer, paint: { "line-color": "#f00" } }],
    });
    const documents: Record<string, Record<string, unknown> | undefined> = {};
    const requested: string[] = [];

    beforeEach(() => {
        requested.length = 0;
        Object.keys(documents).forEach((key) => delete documents[key]);
        documents["id-generic"] = mbStyle();
        geoserver.getLayerStyling.mockImplementation(async (url: string) => {
            requested.push(url);
            const id = url.split("/styles/")[1] ?? "";
            return id === "" ? mbStyle() : documents[id] ?? mbStyle();
        });
        geoserver.getStyleList.mockResolvedValue([
            listItem("generic", { id: "id-generic", qualified_name: "WS:generic" }),
            listItem("metric-x"),
            listItem("metric-sld", { format: "sld" }),
            listItem("metric-global", { scope: "global", workspace: null, qualified_name: "metric-global" }),
            listItem("metric-other-ws", { workspace: { id: "w2", name: "OTHER" }, qualified_name: "OTHER:metric-other-ws" }),
        ]);
    });

    const load = async (supplemental: Array<{ name: string; attribute?: string }>) => (
        await loadCatalogLayerStyling(
            { ...layerInfo(), defaultStyle: { name: "generic", href: "/styles/id-generic" } } as GeoserverLayerInfo,
            "WS", "prov", "hamburg_mobility", undefined, supplemental
        )
    );

    test("offers a registered style the layer does not list, after the default, never as the default", async () => {
        documents["id-metric-x"] = metricStyle("hamburg_mobility", "comfort_score");
        const bundle = await load([{ name: "metric-x", attribute: "comfort_score" }]);
        expect(bundle?.styles.map((style) => [style.name, style.isDefault])).toEqual([["generic", true], ["metric-x", false]]);
        expect(bundle?.defaultStyleId).toBe(bundle?.styles[0].id);
        expect(bundle?.styles[1].layers[0]["source-layer"]).toBe("hamburg_mobility");
        expect(bundle?.styles[1].attributes).toEqual([{ name: "comfort_score" }]);
    });

    test("fetches the style document by its catalog id, once per request", async () => {
        documents["id-metric-x"] = metricStyle("hamburg_mobility", "comfort_score");
        await load([{ name: "metric-x" }, { name: "metric-x" }]);
        expect(requested.filter((url) => url.endsWith("/styles/id-metric-x"))).toHaveLength(1);
    });

    test("refuses a style whose source-layer is another layer", async () => {
        documents["id-metric-x"] = metricStyle("hamburg_bezirke", "comfort_score");
        const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const bundle = await load([{ name: "metric-x", attribute: "comfort_score" }]);
        expect(bundle?.styles.map((style) => style.name)).toEqual(["generic"]);
        error.mockRestore();
    });

    test("refuses a style that declares another metric, accepts one that declares none", async () => {
        documents["id-metric-x"] = metricStyle("hamburg_mobility", "safety_index");
        const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
        expect((await load([{ name: "metric-x", attribute: "comfort_score" }]))?.styles.map((style) => style.name)).toEqual(["generic"]);
        error.mockRestore();
        documents["id-metric-x"] = metricStyle("hamburg_mobility");
        expect((await load([{ name: "metric-x", attribute: "comfort_score" }]))?.styles.map((style) => style.name)).toEqual(["generic", "metric-x"]);
    });

    test("never requests SLD styles, styles of another workspace or unknown names", async () => {
        const bundle = await load([{ name: "metric-sld" }, { name: "metric-other-ws" }, { name: "does-not-exist" }]);
        expect(bundle?.styles.map((style) => style.name)).toEqual(["generic"]);
        expect(requested.filter((url) => /metric-(sld|other-ws)/.test(url))).toEqual([]);
    });

    test("accepts a global style and a qualified name", async () => {
        documents["id-metric-global"] = metricStyle("hamburg_mobility");
        documents["id-metric-x"] = metricStyle("hamburg_mobility");
        const bundle = await load([{ name: "metric-global" }, { name: "WS:metric-x" }]);
        expect(bundle?.styles.map((style) => style.name)).toEqual(["generic", "metric-global", "metric-x"]);
    });

    test("does not load an assigned style twice", async () => {
        const info = { ...layerInfo(["metric-x"]), defaultStyle: { name: "generic", href: "/styles/id-generic" } } as GeoserverLayerInfo;
        documents["id-metric-x"] = metricStyle("hamburg_mobility", "comfort_score");
        const bundle = await loadCatalogLayerStyling(info, "WS", "prov", "hamburg_mobility", undefined, [{ name: "metric-x" }]);
        expect(bundle?.styles.map((style) => style.name)).toEqual(["generic", "metric-x"]);
        expect(requested.filter((url) => url.endsWith("/styles/id-metric-x"))).toHaveLength(1);
    });

    test("a failing supplemental request never costs the layer its own styles", async () => {
        geoserver.getLayerStyling.mockImplementation(async (url: string) => {
            if (url.endsWith("/styles/id-metric-x")) throw new Error("Catalog style request failed (500)");
            return mbStyle();
        });
        const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const bundle = await load([{ name: "metric-x" }]);
        expect(bundle?.styles.map((style) => style.name)).toEqual(["generic"]);
        error.mockRestore();
    });

    test("without a loaded default there is nothing to be an alternate of", async () => {
        geoserver.getLayerStyling.mockResolvedValue(undefined);
        expect(await load([{ name: "metric-x" }])).toBeUndefined();
    });

    test("callers that pass no supplemental styles (Datastores) get exactly the layer's own styles", async () => {
        const bundle = await loadCatalogLayerStyling(
            { ...layerInfo(), defaultStyle: { name: "generic", href: "/styles/id-generic" } } as GeoserverLayerInfo,
            "WS", "prov", "hamburg_mobility"
        );
        expect(bundle?.styles.map((style) => style.name)).toEqual(["generic"]);
        expect(requested).toEqual(["/styles/id-generic"]);
    });
});

describe("addCatalogVectorLayer", () => {
    const styling = (minzoom?: number, spriteUrl?: string): any => ({
        defaultStyleId: "s1",
        styles: [
            { id: "s1", name: "metric-a", isDefault: true, spriteUrl, layers: [{ id: "a1", type: "line", paint: { "line-color": "#0f0" }, ...(minzoom === undefined ? {} : { minzoom }) }, { id: "a2", type: "line", paint: {} }] },
            { id: "s2", name: "metric-b", layers: [{ id: "b1", type: "line", paint: { "line-color": "#00f" } }] },
        ],
    });

    test("catalog style: sets availableStyles / activeStyleId and companion layers", async () => {
        const { runtimeId } = await addCatalogVectorLayer({ detail: detail(), workspace: "WS", styling: styling() });
        const record = layersOnMap.find((layer) => layer.id === runtimeId);
        expect(record?.activeStyleId).toBe("s1");
        expect(record?.availableStyles).toHaveLength(2);
        expect(mapStore.addCompanionLayer).toHaveBeenCalledTimes(1);
        const params = mapStore.addMapLayer.mock.calls[0][0] as Record<string, any>;
        expect(params.sourceProtocol).toBe("wmts");
        expect(params.layerStyle.paint).toEqual({ "line-color": "#0f0" });
    });

    test("preferredStyleName selects that style; unknown names fall back to the default", async () => {
        const first = await addCatalogVectorLayer({ detail: detail(), workspace: "WS", styling: styling(), preferredStyleName: "metric-b" });
        expect(layersOnMap.find((layer) => layer.id === first.runtimeId)?.activeStyleId).toBe("s2");
        const second = await addCatalogVectorLayer({ detail: detail(), workspace: "WS", styling: styling(), preferredStyleName: "does-not-exist" });
        expect(layersOnMap.find((layer) => layer.id === second.runtimeId)?.activeStyleId).toBe("s1");
    });

    test("no style: generated fallback paint, no style records", async () => {
        const { runtimeId } = await addCatalogVectorLayer({ detail: detail(), workspace: "WS" });
        const record = layersOnMap.find((layer) => layer.id === runtimeId);
        expect(record?.availableStyles).toBeUndefined();
        const params = mapStore.addMapLayer.mock.calls[0][0] as Record<string, any>;
        expect(params.layerStyle).toBeUndefined();
        expect(params.layerType).toBe("fill");
    });

    test("minZoom is applied to the generated fallback style", async () => {
        const result = await addCatalogVectorLayer({ detail: detail(), workspace: "WS", minZoom: 15 });
        const params = mapStore.addMapLayer.mock.calls[0][0] as Record<string, any>;
        expect(params.layerStyle).toEqual({ minzoom: 15 });
        expect(result.minZoomWarning).toBe(false);
    });

    test("catalog style keeps its own minzoom and warns when it is missing or lower", async () => {
        const missing = await addCatalogVectorLayer({ detail: detail(), workspace: "WS", styling: styling(), minZoom: 15 });
        expect(missing.minZoomWarning).toBe(true);
        expect((mapStore.addMapLayer.mock.calls[0][0] as any).layerStyle.minzoom).toBeUndefined();
        const lower = await addCatalogVectorLayer({ detail: detail(), workspace: "WS", styling: styling(12), minZoom: 15 });
        expect(lower.minZoomWarning).toBe(true);
        const ok = await addCatalogVectorLayer({ detail: detail(), workspace: "WS", styling: styling(15), minZoom: 15 });
        expect(ok.minZoomWarning).toBe(false);
    });

    test("does not mutate the catalog style document", async () => {
        const bundle = styling();
        const snapshot = JSON.stringify(bundle);
        await addCatalogVectorLayer({ detail: detail(), workspace: "WS", styling: bundle, minZoom: 15 });
        expect(JSON.stringify(bundle)).toBe(snapshot);
    });

    test("sprite is attached on success and released when the layer cannot be added", async () => {
        await addCatalogVectorLayer({ detail: detail(), workspace: "WS", styling: styling(undefined, "https://x/sprite") });
        expect(mapStore.acquireMapSprite).toHaveBeenCalledTimes(1);
        expect(mapStore.releaseMapSprite).not.toHaveBeenCalled();

        mapStore.addMapLayer.mockRejectedValueOnce(new Error("boom"));
        await expect(addCatalogVectorLayer({ detail: detail(), workspace: "WS", styling: styling(undefined, "https://x/sprite") })).rejects.toThrow("boom");
        expect(mapStore.releaseMapSprite).toHaveBeenCalledTimes(1);
    });
});

describe("addCatalogRasterLayer", () => {
    test("adds the WMS raster path and sets popup attributes", async () => {
        const raster = { catalog: { provider: { id: "prov" } }, coverage: { name: "dem", title: "DEM" } } as never;
        const id = await addCatalogRasterLayer({ detail: raster, workspace: "WS", attributes: [] });
        expect((mapStore.addMapDataSource.mock.calls[0] as any)[0]).toMatchObject({ sourceDataType: "raster", sourceProtocol: "wms" });
        expect(layersOnMap.find((layer) => layer.id === id)?.attributes).toEqual([]);
    });
});

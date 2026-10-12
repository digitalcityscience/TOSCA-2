import { beforeEach, describe, expect, test, vi } from "vitest";
import type { ExploreEntry, MetricOption } from "../../config/urbanStories";

const geoserver = {
    getLayerInformation: vi.fn(),
    getLayerDetail: vi.fn(),
    getStyleList: vi.fn(),
    getLayerStyling: vi.fn(),
};
vi.mock("@store/geoserver", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@store/geoserver")>()),
    useGeoserverStore: () => geoserver,
}));

import {
    activeMetricKey,
    evaluateEntry,
    metricStyleOptionId,
    probeEntry,
    probeLayer,
    resetUrbanStoryProbes,
    styleLacksZoomFloor,
    supplementalStylesFor,
    withZoomFloor,
} from "./urbanStoryLayers";
import { useCatalogFixtureStory } from "../../config/urbanStories/__fixtures__/useCatalogFixtureStory";

useCatalogFixtureStory();

const PROVIDER = "prov";

function metric(key: string, styleName: string | null, attribute = key): MetricOption {
    return { key, label: { en: key, de: key }, attribute, styleName };
}

function entry(overrides: Partial<ExploreEntry> = {}): ExploreEntry {
    return {
        key: "e",
        title: { en: "E", de: "E" },
        group: "admin",
        geometry: "polygon",
        layer: { providerId: PROVIDER, workspace: "WS", layerName: "layer_a" },
        rendering: "vector-tiles",
        mvt: "verified",
        metrics: [metric("m1", "style-one"), metric("m2", "style-two"), metric("m3", null)],
        requiredAttributes: ["m1", "m2", "m3"],
        source: { dataset: "d", release: "r", metadataPath: "p" },
        readiness: "published",
        ...overrides,
    };
}

function detail(attributes: string[]): unknown {
    return {
        catalog: { provider: { id: PROVIDER }, workspace_name: "WS" },
        featureType: { name: "layer_a", attributes: { attribute: attributes.map((name) => ({ name, binding: "java.lang.Double" })) } },
    };
}

function layerInfo(defaultName: string, alternates: string[] = []): unknown {
    return {
        name: "layer_a",
        type: "VECTOR",
        defaultStyle: { name: defaultName, href: `/styles/${defaultName}.json` },
        styles: alternates.map((name) => ({ name, href: `/styles/${name}.json` })),
        resource: { "@class": "featureType", name: "layer_a", href: "/res/layer_a" },
    };
}

const listItem = (name: string): unknown => ({
    id: `id-${name}`, name, qualified_name: `WS:${name}`, title: name, format: "mbstyle", scope: "global",
    provider: { id: PROVIDER }, workspace: null,
});

const mbStyle = { layers: [{ id: "x", type: "fill", source: "layer_a", paint: {} }] };

beforeEach(() => {
    vi.clearAllMocks();
    resetUrbanStoryProbes();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    geoserver.getStyleList.mockResolvedValue([]);
    geoserver.getLayerStyling.mockResolvedValue(undefined);
});

function liveLayer(attributes: string[], info = layerInfo("generic")): void {
    geoserver.getLayerInformation.mockResolvedValue({ layer: info });
    geoserver.getLayerDetail.mockResolvedValue(detail(attributes));
}

describe("recorded catalog fixtures (live state 2026-10-11)", () => {
    test("empty /styles + generic default: entry unstyled, every metric pending", async () => {
        liveLayer(["m1", "m2", "m3"]);
        const result = await probeEntry(entry());
        expect(result.readiness).toBe("unstyled");
        expect(result.metrics.m1).toMatchObject({ readiness: "metric-style-pending", reason: "style-not-in-catalog" });
        expect(result.metrics.m3).toMatchObject({ readiness: "metric-style-pending", reason: "no-style-name" });
    });

    test("admin feature type with only 6 attributes: attributes-missing lists the missing columns", async () => {
        liveLayer(["fid", "geom", "name", "schluessel", "bezirk_name", "flaeche"]);
        const result = await probeEntry(entry());
        expect(result.readiness).toBe("attributes-missing");
        expect(result.missingAttributes).toEqual(["m1", "m2", "m3"]);
        expect(result.metrics.m1.readiness).toBe("attributes-missing");
    });

    test("catalog 404: temporarily unavailable", async () => {
        geoserver.getLayerInformation.mockRejectedValue(new Error("Catalog layer WS:layer_a request failed (404 Not Found): x"));
        expect((await probeEntry(entry())).readiness).toBe("temporarily-unavailable");
    });

    test("other catalog failure: error", async () => {
        geoserver.getLayerInformation.mockRejectedValue(new Error("request failed (500 Server Error)"));
        expect((await probeEntry(entry())).readiness).toBe("error");
    });

    test("two assigned MBStyles: assigned metrics available, the rest pending with a reason", async () => {
        geoserver.getStyleList.mockResolvedValue([listItem("style-one"), listItem("style-two"), listItem("style-unassigned")]);
        geoserver.getLayerStyling.mockResolvedValue(mbStyle);
        liveLayer(["m1", "m2", "m3"], layerInfo("style-one", ["style-two"]));
        const result = await probeEntry(entry({ metrics: [metric("m1", "style-one"), metric("m2", "style-two"), metric("m3", "style-unassigned"), metric("m4", "style-ghost", "m3")] }));
        expect(result.readiness).toBe("available");
        expect(result.metrics.m1.readiness).toBe("available");
        expect(result.metrics.m2.readiness).toBe("available");
        expect(result.metrics.m3).toMatchObject({ readiness: "metric-style-pending", reason: "style-not-applicable" });
        expect(result.metrics.m4).toMatchObject({ readiness: "metric-style-pending", reason: "style-not-in-catalog" });
    });

    test("assigned style whose document is not MBStyle: pending with reason not-mbstyle", async () => {
        geoserver.getStyleList.mockResolvedValue([listItem("style-one")]);
        geoserver.getLayerStyling.mockResolvedValue(undefined);
        liveLayer(["m1", "m2", "m3"], layerInfo("style-one"));
        const result = await probeEntry(entry());
        expect(result.metrics.m1).toMatchObject({ readiness: "metric-style-pending", reason: "not-mbstyle" });
    });

    test("a config styleName that is not in the catalog never produces a style request", async () => {
        geoserver.getStyleList.mockResolvedValue([listItem("something-else")]);
        liveLayer(["m1", "m2", "m3"]);
        await probeEntry(entry({ metrics: [metric("m1", "guessed-style-name")] }));
        const requested = geoserver.getLayerStyling.mock.calls.map((call) => String(call[0]));
        expect(requested.some((url) => url.includes("guessed-style-name"))).toBe(false);
    });
});

describe("tiles-unavailable (decision F1: never a WMS fallback)", () => {
    test.each(["pending", "unavailable"] as const)("mvt %s makes no catalog request", async (mvt) => {
        const result = await probeEntry(entry({ mvt }));
        expect(result.readiness).toBe("tiles-unavailable");
        expect(geoserver.getLayerInformation).not.toHaveBeenCalled();
        expect(geoserver.getStyleList).not.toHaveBeenCalled();
    });

    test("a runtime tile error overrides an otherwise available layer and requests nothing", async () => {
        const result = await probeEntry(entry(), { tilesFailed: true });
        expect(result.readiness).toBe("tiles-unavailable");
        expect(geoserver.getLayerInformation).not.toHaveBeenCalled();
    });

    test("no code path requests a WMS URL", async () => {
        liveLayer(["m1", "m2", "m3"]);
        await probeEntry(entry());
        await probeEntry(entry({ mvt: "pending" }));
        const requests = [...geoserver.getLayerStyling.mock.calls, ...geoserver.getLayerDetail.mock.calls].map((call) => String(call[0]));
        expect(requests.some((url) => /wms/i.test(url))).toBe(false);
    });
});

describe("bounded probing", () => {
    test("one style list per provider and one detail per layer per session", async () => {
        liveLayer(["m1", "m2", "m3"]);
        await Promise.all([probeEntry(entry()), probeEntry(entry({ key: "other" })), probeEntry(entry({ key: "third" }))]);
        await probeEntry(entry());
        expect(geoserver.getLayerInformation).toHaveBeenCalledTimes(1);
        expect(geoserver.getLayerDetail).toHaveBeenCalledTimes(1);
        expect(geoserver.getStyleList).toHaveBeenCalledTimes(1);
    });

    test("a second layer of the same provider reuses the style list", async () => {
        liveLayer(["m1"]);
        await probeLayer({ providerId: PROVIDER, workspace: "WS", layerName: "layer_a" });
        await probeLayer({ providerId: PROVIDER, workspace: "WS", layerName: "layer_b" });
        expect(geoserver.getStyleList).toHaveBeenCalledTimes(1);
        expect(geoserver.getLayerInformation).toHaveBeenCalledTimes(2);
    });

    test("force (Refresh status) asks the catalog again", async () => {
        liveLayer(["m1", "m2", "m3"]);
        await probeEntry(entry());
        await probeEntry(entry(), { force: true });
        expect(geoserver.getLayerInformation).toHaveBeenCalledTimes(2);
    });

    test("a missing layer is logged once per session", async () => {
        geoserver.getLayerInformation.mockRejectedValue(new Error("request failed (404 Not Found)"));
        await probeEntry(entry());
        await probeEntry(entry(), { force: true });
        await probeEntry(entry({ key: "x" }), { force: true });
        expect(console.error).toHaveBeenCalledTimes(1);
    });

    test("no more than four probes run at once", async () => {
        let running = 0;
        let peak = 0;
        geoserver.getLayerInformation.mockImplementation(async () => {
            running += 1;
            peak = Math.max(peak, running);
            await new Promise((resolve) => setTimeout(resolve, 5));
            running -= 1;
            return { layer: layerInfo("generic") };
        });
        geoserver.getLayerDetail.mockResolvedValue(detail([]));
        await Promise.all(Array.from({ length: 12 }, (_, index) => probeLayer({ providerId: PROVIDER, workspace: "WS", layerName: `l${index}` })));
        expect(peak).toBeLessThanOrEqual(4);
    });
});

describe("evaluateEntry", () => {
    test("without a probe it reports tiles-unavailable", () => {
        expect(evaluateEntry(entry(), undefined).readiness).toBe("tiles-unavailable");
    });
});

describe("style option lookup", () => {
    const record = {
        activeStyleId: "id-1",
        availableStyles: [
            { id: "id-1", name: "style-one", layers: [{ id: "a", type: "fill", minzoom: 14 }] },
            { id: "id-2", name: "style-two", layers: [{ id: "b", type: "fill" }] },
        ],
    } as never;

    test("metricStyleOptionId matches by catalog style name only", () => {
        expect(metricStyleOptionId(record, metric("m", "style-two"))).toBe("id-2");
        expect(metricStyleOptionId(record, metric("m", "missing"))).toBeUndefined();
        expect(metricStyleOptionId(record, metric("m", null))).toBeUndefined();
    });

    test("activeMetricKey follows the active style", () => {
        expect(activeMetricKey(record, [metric("m1", "style-one"), metric("m2", "style-two")])).toBe("m1");
    });

    test("styleLacksZoomFloor", () => {
        expect(styleLacksZoomFloor(record, 14)).toBe(false);
        expect(styleLacksZoomFloor(record, 15)).toBe(true);
        expect(styleLacksZoomFloor(record, undefined)).toBe(false);
    });
});

describe("supplementalStylesFor", () => {
    const ref = (layerName: string) => ({ providerId: PROVIDER, workspace: "HAMBURG-ADMINISTRATIVE", layerName });

    test("lists only the configured styles of that layer, with the metric they must show", () => {
        expect(supplementalStylesFor(ref("hamburg_stadtteile"))).toEqual([{ name: "urbanstories-green-access", attribute: "grn_mean" }]);
        // 15-Minute City owns the styling of Bezirke and buildings: the catalog is never asked for its styles.
        expect(supplementalStylesFor(ref("hamburg_bezirke"))).toEqual([]);
        expect(supplementalStylesFor({ providerId: PROVIDER, workspace: "HAMBURG-BUILDINGS", layerName: "hamburg_buildings" }).map((request) => request.name))
            .not.toContain("urbanstories-15-minute-city");
        // Public Transport Equity owns the styling of statistical units as well.
        expect(supplementalStylesFor(ref("hamburg_statistical_units"))).toEqual([]);
    });

    test("is empty for layers without a verified style and for layers the configs do not use", () => {
        expect(supplementalStylesFor({ providerId: PROVIDER, workspace: "HAMBURG-POIs", layerName: "food" })).toEqual([]);
        expect(supplementalStylesFor({ providerId: PROVIDER, workspace: "HAMBURG-GREEN-SPACES", layerName: "green_areas" })).toEqual([]);
        expect(supplementalStylesFor({ providerId: PROVIDER, workspace: "OTHER", layerName: "hamburg_bezirke" })).toEqual([]);
    });
});

describe("withZoomFloor", () => {
    const bundle = (...minzooms: Array<number | undefined>): any => ({
        defaultStyleId: "a",
        styles: [{ id: "a", name: "a", isDefault: true, layers: minzooms.map((minzoom, index) => ({ id: `l${index}`, type: "fill", ...(minzoom === undefined ? {} : { minzoom }) })) }],
    });

    test("raises missing and lower minzoom values to the floor and keeps higher ones", () => {
        const result = withZoomFloor(bundle(undefined, 10, 16), 14);
        expect(result.styles[0].layers.map((layer: { minzoom?: number }) => layer.minzoom)).toEqual([14, 14, 16]);
    });

    test("returns the input untouched without a floor, and never mutates its input", () => {
        const input = bundle(undefined);
        expect(withZoomFloor(input, undefined)).toBe(input);
        const snapshot = JSON.stringify(input);
        withZoomFloor(input, 15);
        expect(JSON.stringify(input)).toBe(snapshot);
    });

    test("the floor makes styleLacksZoomFloor false, so the QA badge only shows for unprotected layers", () => {
        const floored = withZoomFloor(bundle(undefined), 15);
        const record = { availableStyles: floored.styles, activeStyleId: "a" };
        expect(styleLacksZoomFloor(record, 15)).toBe(false);
        expect(styleLacksZoomFloor({ availableStyles: bundle(undefined).styles, activeStyleId: "a" }, 15)).toBe(true);
    });
});

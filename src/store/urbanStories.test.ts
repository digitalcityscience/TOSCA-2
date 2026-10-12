import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getStoryConfig } from "../config/urbanStories";
import { resetUrbanStoryProbes } from "@helpers/urbanStoryLayers";
import { useMapStore, type LayerObjectWithAttributes } from "./map";
import { useUrbanStoriesStore } from "./urbanStories";
import { useCatalogFixtureStory } from "../config/urbanStories/__fixtures__/useCatalogFixtureStory";

useCatalogFixtureStory();

const loader = vi.hoisted(() => ({
    resolveCatalogLayer: vi.fn(),
    loadCatalogLayerStyling: vi.fn(),
    addCatalogVectorLayer: vi.fn(),
}));
vi.mock("@helpers/catalogLayerLoader", () => loader);
// Provider style list lookups must not hit the network in tests.
vi.mock("@store/geoserver", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@store/geoserver")>()),
    useGeoserverStore: () => ({ getStyleList: async () => [] }),
}));
vi.mock("@helpers/toast", () => ({ useToast: () => ({ add: vi.fn() }) }));

const ADMIN_ATTRIBUTES = ["m15_decay_mean", "m15_decay_median", "m15_categories_mean", "m15_n", "m15_share_low_confidence",
    "m15_share_food", "m15_share_health", "m15_share_education", "m15_share_restaurant", "m15_share_culture",
    "m15_share_bank_post", "m15_share_sport", "m15_share_park", "m15_share_stop_any", "grn_x",
    // The generic store tests use the catalog-styled Green Spaces Stadtteile entry.
    ...getStoryConfig("green-spaces")!.explore.flatMap((entry) => entry.requiredAttributes)];

function catalogLayer(attributes: string[], styles?: unknown) {
    return {
        ok: true,
        info: { name: "layer", type: "VECTOR", defaultStyle: { name: "generic", href: "/generic" }, resource: { href: "/r" } },
        detail: {
            featureType: { name: "layer", attributes: { attribute: attributes.map((name) => ({ name, binding: "x" })) } },
        },
        styles,
    };
}

let runtimeSequence = 0;
let map: ReturnType<typeof fakeMap>;

function fakeMap() {
    const listeners: Record<string, Array<(event: unknown) => void>> = {};
    return {
        listeners,
        on: vi.fn((type: string, listener: (event: unknown) => void) => { (listeners[type] ??= []).push(listener); }),
        off: vi.fn(),
        getLayer: () => ({ type: "fill" }),
        getLayoutProperty: () => undefined,
        getPaintProperty: () => undefined,
        removeLayer: vi.fn(),
        removeSource: vi.fn(),
        getSource: () => undefined,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    resetUrbanStoryProbes();
    runtimeSequence = 0;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    map = fakeMap();
    useMapStore().map = map as never;
    loader.resolveCatalogLayer.mockImplementation(async () => catalogLayer(ADMIN_ATTRIBUTES));
    loader.loadCatalogLayerStyling.mockResolvedValue(undefined);
    loader.addCatalogVectorLayer.mockImplementation(async (options: { detail: { featureType: { name: string } } }) => {
        runtimeSequence += 1;
        const runtimeId = `layer:${options.detail.featureType.name}:${runtimeSequence}`;
        useMapStore().add2MapLayerList({
            id: runtimeId, source: runtimeId, sourceType: "geoserver", type: "fill", showOnLayerList: true,
        } as LayerObjectWithAttributes, undefined, { notify: false });
        return { runtimeId, minZoomWarning: false };
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("urbanStories store: adding layers", () => {
    test("adds an entry once and tracks only the runtime id", async () => {
        const store = useUrbanStoriesStore();
        const result = await store.addEntry("green-spaces", "stadtteile-green-access");
        expect(result.status).toBe("added");
        expect(store.addedByStory).toEqual({
            "green-spaces": { "stadtteile-green-access": expect.stringMatching(/^layer:/) },
        });
        // Only ids are kept: no layer state of any kind.
        expect(Object.values(store.addedByStory["green-spaces"] ?? {}).every((value) => typeof value === "string")).toBe(true);
        expect((await store.addEntry("green-spaces", "stadtteile-green-access")).status).toBe("exists");
        expect(loader.addCatalogVectorLayer).toHaveBeenCalledTimes(1);
        expect(store.trackedLayers).toHaveLength(1);
    });

    test("passes the zoom floor and the workspace to the loader", async () => {
        const store = useUrbanStoriesStore();
        loader.resolveCatalogLayer.mockResolvedValue(catalogLayer(["geom"]));
        await store.addEntry("walkability-safety", "street-segments");
        expect(loader.addCatalogVectorLayer).toHaveBeenCalledWith(expect.objectContaining({
            workspace: "HAMBURG-MOBILITY",
            minZoom: 9,
        }));
    });

    test("the same catalog layer from two stories yields one record", async () => {
        const store = useUrbanStoriesStore();
        const first = await store.addEntry("green-spaces", "stadtteile-green-access");
        const second = await store.addEntry("green-spaces", "stadtteile-green-access");
        expect(first.status).toBe("added");
        expect(second.status).toBe("exists");
        expect(second.status === "exists" && first.status === "added" && second.runtimeId === first.runtimeId).toBe(true);
        expect(loader.addCatalogVectorLayer).toHaveBeenCalledTimes(1);
        const greenEntry = getStoryConfig("green-spaces")!.explore.find((entry) => entry.key === "stadtteile-green-access")!;
        expect(store.runtimeIdFor("green-spaces", greenEntry)).toBe(first.status === "added" ? first.runtimeId : undefined);
        expect(useMapStore().layersOnMap).toHaveLength(1);
    });

    test("concurrent adds of one layer do not create a duplicate", async () => {
        const store = useUrbanStoriesStore();
        const [a, b] = await Promise.all([
            store.addEntry("green-spaces", "stadtteile-green-access"),
            store.addEntry("green-spaces", "stadtteile-green-access"),
        ]);
        expect([a.status, b.status].sort()).toEqual(["added", "busy"]);
        expect(loader.addCatalogVectorLayer).toHaveBeenCalledTimes(1);
    });

    test("layers stay tracked when the story changes", async () => {
        const store = useUrbanStoriesStore();
        store.selectStory("green-spaces");
        await store.addEntry("green-spaces", "stadtteile-green-access");
        store.selectStory("green-spaces");
        store.selectStory("green-spaces");
        expect(store.trackedLayers).toHaveLength(1);
        expect(store.trackedLayers[0].storyKey).toBe("green-spaces");
    });

    test("a layer removed outside the panel reverts the entry to addable", async () => {
        const store = useUrbanStoriesStore();
        const result = await store.addEntry("green-spaces", "stadtteile-green-access");
        const runtimeId = result.status === "added" ? result.runtimeId : "";
        useMapStore().removeFromMapLayerList(runtimeId);
        await nextTick();
        expect(store.addedByStory).toEqual({});
        expect(store.trackedLayers).toHaveLength(0);
        expect((await store.addEntry("green-spaces", "stadtteile-green-access")).status).toBe("added");
    });

    test("removeEntry deletes the layer from the map", async () => {
        const store = useUrbanStoriesStore();
        await store.addEntry("green-spaces", "stadtteile-green-access");
        await store.removeEntry("green-spaces", "stadtteile-green-access");
        expect(map.removeLayer).toHaveBeenCalled();
        expect(useMapStore().layersOnMap).toHaveLength(0);
        expect(store.addedByStory).toEqual({});
    });
});

describe("urbanStories store: unavailable layers", () => {
    test("a catalog 404 is temporarily-unavailable, adds nothing and logs once", async () => {
        loader.resolveCatalogLayer.mockResolvedValue({ ok: false, reason: "not-found" });
        const store = useUrbanStoriesStore();
        expect((await store.addEntry("transit-equity", "buildings-pt")).status).toBe("temporarily-unavailable");
        expect((await store.addEntry("transit-equity", "buildings-pt")).status).toBe("temporarily-unavailable");
        expect(loader.addCatalogVectorLayer).not.toHaveBeenCalled();
        expect(console.error).toHaveBeenCalledTimes(1);
        const entry = getStoryConfig("transit-equity")!.explore.find((candidate) => candidate.key === "buildings-pt")!;
        expect(store.readinessOf("transit-equity", entry)?.readiness).toBe("temporarily-unavailable");
    });

    test("a layer published after a cached 404 can be added without a manual refresh", async () => {
        loader.resolveCatalogLayer.mockResolvedValueOnce({ ok: false, reason: "not-found" });
        const store = useUrbanStoriesStore();
        await store.addEntry("green-spaces", "stadtteile-green-access");
        loader.resolveCatalogLayer.mockResolvedValue(catalogLayer(ADMIN_ATTRIBUTES));
        expect((await store.addEntry("green-spaces", "stadtteile-green-access")).status).toBe("added");
    });

    test("an entry without verified tiles is never requested", async () => {
        const entry = getStoryConfig("green-spaces")!.explore.find((candidate) => candidate.key === "stadtteile-green-access")!;
        const original = entry.mvt;
        entry.mvt = "pending";
        try {
            const store = useUrbanStoriesStore();
            expect((await store.addEntry("green-spaces", "stadtteile-green-access")).status).toBe("tiles-unavailable");
            expect(loader.resolveCatalogLayer).not.toHaveBeenCalled();
            expect(loader.addCatalogVectorLayer).not.toHaveBeenCalled();
        } finally {
            entry.mvt = original;
        }
    });

    test("a MapLibre error on the layer's source marks tiles unavailable and keeps Remove possible", async () => {
        const store = useUrbanStoriesStore();
        const result = await store.addEntry("green-spaces", "stadtteile-green-access");
        const runtimeId = result.status === "added" ? result.runtimeId : "";
        expect(map.on).toHaveBeenCalledWith("error", expect.any(Function));
        map.listeners.error.forEach((listener) => listener({ sourceId: runtimeId, error: new Error("tile 500") }));
        const entry = getStoryConfig("green-spaces")!.explore.find((candidate) => candidate.key === "stadtteile-green-access")!;
        expect(store.readinessOf("transit-equity", entry)?.readiness).toBe("tiles-unavailable");
        expect(store.runtimeIdFor("transit-equity", entry)).toBe(runtimeId);
        // Errors of unrelated sources are ignored.
        map.listeners.error.forEach((listener) => listener({ sourceId: "basemap" }));
        expect(Object.keys(store.tileErrorIds)).toEqual([runtimeId]);
        await store.removeEntry("green-spaces", "stadtteile-green-access");
        await nextTick();
        expect(store.tileErrorIds).toEqual({});
    });

    test("a loader failure becomes an error status, not an exception", async () => {
        loader.addCatalogVectorLayer.mockRejectedValueOnce(new Error("boom"));
        const store = useUrbanStoriesStore();
        expect((await store.addEntry("green-spaces", "stadtteile-green-access")).status).toBe("error");
        expect(Object.values(store.layerStatus)).toEqual(["error"]);
        expect((await store.addEntry("green-spaces", "stadtteile-green-access")).status).toBe("added");
    });

    test("no map yet is reported, not thrown", async () => {
        useMapStore().map = undefined as never;
        expect((await useUrbanStoriesStore().addEntry("green-spaces", "stadtteile-green-access")).status).toBe("map-not-ready");
    });
});

describe("urbanStories store: metrics", () => {
    const STYLE_A = { id: "style-a", name: "urbanstories-a", layers: [{ id: "a", type: "fill" }] };
    const STYLE_B = { id: "style-b", name: "urbanstories-b", layers: [{ id: "b", type: "fill" }] };

    function stylableEntry() {
        const entry = getStoryConfig("green-spaces")!.explore.find((candidate) => candidate.key === "stadtteile-green-access")!;
        const originals = entry.metrics.map((metric) => metric.styleName);
        entry.metrics[0].styleName = "urbanstories-a";
        entry.metrics[1].styleName = "urbanstories-b";
        loader.loadCatalogLayerStyling.mockResolvedValue({ defaultStyleId: "style-a", styles: [STYLE_A, STYLE_B] });
        return { entry, restore: () => entry.metrics.forEach((metric, index) => { metric.styleName = originals[index]; }) };
    }

    test("adds with the chosen metric's style and switches an added layer through the style switcher", async () => {
        const { entry, restore } = stylableEntry();
        try {
            const store = useUrbanStoriesStore();
            const mapStore = useMapStore();
            const switchStyle = vi.spyOn(mapStore, "setStandaloneLayerStyle").mockResolvedValue();
            const added = await store.applyMetric("green-spaces", entry.key, entry.metrics[0].key);
            expect(added.status).toBe("applied");
            expect(loader.addCatalogVectorLayer).toHaveBeenCalledWith(expect.objectContaining({ preferredStyleName: "urbanstories-a" }));
            expect(switchStyle).not.toHaveBeenCalled();

            const runtimeId = added.status === "applied" ? added.runtimeId : "";
            const record = mapStore.layersOnMap.find((layer) => layer.id === runtimeId)!;
            record.availableStyles = [STYLE_A, STYLE_B];
            record.activeStyleId = "style-a";
            expect(store.activeMetricOf("green-spaces", entry)).toBe(entry.metrics[0].key);

            const switched = await store.applyMetric("green-spaces", entry.key, entry.metrics[1].key);
            expect(switched).toEqual({ status: "applied", runtimeId });
            expect(switchStyle).toHaveBeenCalledWith(runtimeId, "style-b");
        } finally {
            restore();
        }
    });

    test("a metric without a verified catalog style is not applied and no style is guessed", async () => {
        const store = useUrbanStoriesStore();
        const entry = getStoryConfig("green-spaces")!.explore.find((candidate) => candidate.key === "stadtteile-green-access")!;
        const mapStore = useMapStore();
        const switchStyle = vi.spyOn(mapStore, "setStandaloneLayerStyle").mockResolvedValue();
        await store.addEntry("green-spaces", entry.key);
        const result = await store.applyMetric("green-spaces", entry.key, entry.metrics[0].key);
        expect(result.status).toBe("metric-unavailable");
        expect(switchStyle).not.toHaveBeenCalled();
    });

    test("a failing style switch is reported as an error", async () => {
        const { entry, restore } = stylableEntry();
        try {
            const store = useUrbanStoriesStore();
            const mapStore = useMapStore();
            await store.addEntry("green-spaces", entry.key);
            const record = mapStore.layersOnMap[0];
            record.availableStyles = [STYLE_A, STYLE_B];
            record.activeStyleId = "style-a";
            vi.spyOn(mapStore, "setStandaloneLayerStyle").mockRejectedValue(new Error("boom"));
            expect((await store.applyMetric("green-spaces", entry.key, entry.metrics[1].key)).status).toBe("error");
        } finally {
            restore();
        }
    });
});

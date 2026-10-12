import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { resetUrbanStoryProbes } from "@helpers/urbanStoryLayers";
import {
    createFakeCatalog, fakeRegistryMap, wireMapStore,
} from "../components/UrbanStories/__fixtures__/catalogHarness";
import { addExploreLayer, fakeSceneEngine, publishStoryConfig, storyDetail } from "../components/UrbanStories/__fixtures__/runHarness";
import { useGeostorySceneStore } from "./geostoryScenes";
import { useMapStore } from "./map";
import { useUrbanStoriesStore } from "./urbanStories";

/**
 * UST-10 regression protection: Urban Stories sits on top of Datastores, the map store and the
 * GeoStory reader. These tests pin what must not change when it is added, loaded or run.
 */

const backend = vi.hoisted(() => ({ fetchBackendJson: vi.fn() }));
vi.mock("./backend", async (importOriginal) => ({
    ...(await importOriginal<typeof import("./backend")>()),
    fetchBackendJson: backend.fetchBackendJson,
}));
const catalogHolder = vi.hoisted(() => ({ current: undefined as undefined | { geoserver: unknown } }));
vi.mock("@store/geoserver", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@store/geoserver")>()),
    useGeoserverStore: () => catalogHolder.current!.geoserver,
}));
vi.mock("@helpers/toast", () => ({ useToast: () => ({ add: vi.fn() }) }));

/** Raw sources of the shared and reader code, to guard the dependency direction. */
const sources = {
    ...import.meta.glob<string>("../components/Data/**/*.vue", { query: "?raw", import: "default", eager: true }),
    ...import.meta.glob<string>("../components/Geostories/**/*.vue", { query: "?raw", import: "default", eager: true }),
    ...import.meta.glob<string>("./{geostory,geostoryScenes,map,geoserver,filter}.ts", { query: "?raw", import: "default", eager: true }),
    ...import.meta.glob<string>("../core/helpers/{catalogLayerLoader,geostoryScenes,geostoryLayers,mapStyleBundle}.ts", { query: "?raw", import: "default", eager: true }),
};

describe("dependency direction", () => {
    test("the sources under guard were found", () => {
        const paths = Object.keys(sources);
        expect(paths.some((path) => path.endsWith("WorkspaceVectorLayerListingItem.vue"))).toBe(true);
        expect(paths.some((path) => path.endsWith("GeoStoryDetail.vue"))).toBe(true);
        expect(paths.some((path) => path.endsWith("/map.ts"))).toBe(true);
        expect(paths.some((path) => path.endsWith("geostoryScenes.ts"))).toBe(true);
        expect(paths.some((path) => path.endsWith("catalogLayerLoader.ts"))).toBe(true);
    });

    test("Datastores, the GeoStory reader, the map store and the shared loader never import Urban Stories code", () => {
        const offenders = Object.entries(sources)
            .filter(([, source]) => /urban-?stor|urbanStor|UrbanStor/.test(source))
            .map(([path]) => path);
        expect(offenders).toEqual([]);
    });
});

describe("shared behaviour stays as Datastores and the reader had it", () => {
    let restoreConfig: Array<() => void> = [];
    let map: ReturnType<typeof fakeRegistryMap>;

    function setup() {
        setActivePinia(createPinia());
        resetUrbanStoryProbes();
        catalogHolder.current = createFakeCatalog();
        map = fakeRegistryMap();
        const mapStore = wireMapStore(map);
        return { mapStore, urban: useUrbanStoriesStore(), scene: useGeostorySceneStore() };
    }

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
        restoreConfig = [publishStoryConfig("green-spaces", "story-1")];
        backend.fetchBackendJson.mockImplementation(async () => storyDetail(4));
    });

    afterEach(() => {
        restoreConfig.forEach((restore) => restore());
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    test("a layer added the Datastores way gets only its own styles and no zoom floor", async () => {
        const { mapStore } = setup();
        const { loadCatalogLayerStyling, addCatalogVectorLayer, resolveCatalogLayer } = await import("@helpers/catalogLayerLoader");
        const ref = { providerId: "01a11617-bb5c-75ce-bd6d-9c52d34dc20b", workspace: "HAMBURG-BUILDINGS", layerName: "hamburg_buildings" };
        const resolved = await resolveCatalogLayer(ref);
        if (!resolved.ok || !("featureType" in resolved.detail)) throw new Error("fixture layer must resolve");

        const styling = await loadCatalogLayerStyling(resolved.info, ref.workspace, ref.providerId, ref.layerName);
        expect(styling?.styles.map((style) => style.name)).toEqual(["default-hamburg_buildings"]);

        const { runtimeId } = await addCatalogVectorLayer({ detail: resolved.detail, workspace: ref.workspace, styling });
        const layer = mapStore.layersOnMap.find((candidate) => candidate.id === runtimeId)!;
        expect(layer.minzoom).toBeUndefined();
        expect(layer.availableStyles?.map((style) => style.name)).toEqual(["default-hamburg_buildings"]);
    });

    test("a Datastores layer is neither tracked, hidden by focus mode, nor removed by the panel", async () => {
        const { mapStore, urban, scene } = setup();
        const engine = fakeSceneEngine(scene);
        const datastores = addExploreLayer(map, "datastores:layer");
        urban.setFocusEnabled(true);
        await urban.addEntry("green-spaces", "green-areas");

        await urban.startStory("green-spaces");
        expect(map.layers.get(datastores.id)?.visibility).toBe("visible");
        await urban.removeEntry("green-spaces", "green-areas");
        await urban.endRun({ camera: "previous" });

        expect(urban.trackedLayers).toEqual([]);
        expect(mapStore.layersOnMap.map((layer) => layer.id)).toEqual([datastores.id]);
        expect(map.layers.get(datastores.id)?.visibility).toBe("visible");
        expect(engine.closeStory).toHaveBeenCalledTimes(1);
    });

    test("a reader story is never closed, replaced or hidden by anything the panel does", async () => {
        const { urban, scene } = setup();
        const engine = fakeSceneEngine(scene);
        const readerStory = storyDetail(3, { id: "reader" });
        scene.story = readerStory;
        scene.activeSceneId = "scene-2";

        urban.selectStory("green-spaces");
        await urban.addEntry("green-spaces", "green-areas");
        await urban.applyMetric("green-spaces", "stadtteile-green-access", "grn_mean");
        urban.setFocusEnabled(true);
        urban.setFocusEnabled(false);
        urban.selectStory("transit-equity");
        await urban.endRun({ camera: "overview" });
        await urban.refreshStatus("green-spaces");

        expect(engine.closeStory).not.toHaveBeenCalled();
        expect(engine.openStory).not.toHaveBeenCalled();
        expect(scene.story).toBe(readerStory);
        expect(scene.activeSceneId).toBe("scene-2");
        expect(map.flyTo).not.toHaveBeenCalled();
    });

    test("a style swap from the panel keeps the opacity the user set", async () => {
        const { urban, mapStore } = setup();
        const added = (await urban.addEntry("green-spaces", "stadtteile-green-access")) as { runtimeId: string };
        const layer = mapStore.layersOnMap.find((candidate) => candidate.id === added.runtimeId)!;
        mapStore.setLogicalLayerOpacity(layer, 0.35);

        await urban.applyMetric("green-spaces", "stadtteile-green-access", "grn_mean");

        expect(layer.availableStyles?.find((style) => style.id === layer.activeStyleId)?.name).toBe("urbanstories-green-access");
        expect(mapStore.getLayerUiState(layer.id)?.opacity).toBe(0.35);
    });

    test("the map store keeps the actions the other features call", () => {
        setup();
        const mapStore = useMapStore() as unknown as Record<string, unknown>;
        for (const name of [
            "addMapDataSource", "addMapLayer", "addCompanionLayer", "add2MapLayerList", "deleteMapLayer", "deleteMapDataSource",
            "resetMapData", "setStandaloneLayerStyle", "setLogicalLayerVisibility", "setLogicalLayerOpacity", "getLayerUiState",
            "requestLayerPanelExpansion", "acquireMapSprite", "releaseMapSprite", "geometryConversion",
        ]) {
            expect(typeof mapStore[name], name).toBe("function");
        }
    });
});

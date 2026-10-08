import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { sceneLayersBounds } from "@helpers/geostoryScenes";
import { useGeoserverStore } from "./geoserver";
import type { GeoStoryDetail } from "./geostory";
import { useGeostorySceneStore } from "./geostoryScenes";
import { useMapStore } from "./map";
import scenesDetailFixture from "./__fixtures__/geostory-scenes-detail.json";

const validateSpriteUrl = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@helpers/mapStyleBundle", () => ({ validateSpriteUrl }));
vi.mock("@helpers/toast", () => ({ useToast: () => ({ add: vi.fn() }) }));

// Real story: scene 0 "Overview" (3 WMS layers, no camera), scene 1 "Harbour
// detail" (1 vector-tile layer, captured camera, fly transition).
function story(): GeoStoryDetail {
    return structuredClone(scenesDetailFixture) as unknown as GeoStoryDetail;
}

function fakeMap() {
    const sources = new Map<string, unknown>();
    const layers = new Map<string, { id: string; source?: string }>();
    const map = {
        addSource: (id: string, source: unknown) => sources.set(id, source),
        getSource: (id: string) => sources.get(id),
        removeSource: (id: string) => sources.delete(id),
        addLayer: (layer: { id: string; source?: string }) => layers.set(layer.id, layer),
        getLayer: (id: string) => layers.get(id),
        removeLayer: (id: string) => layers.delete(id),
        addSprite: vi.fn(),
        removeSprite: vi.fn(),
        flyTo: vi.fn(),
        easeTo: vi.fn(),
        jumpTo: vi.fn(),
        fitBounds: vi.fn(),
    };
    return { map, sources, layers };
}

function setReducedMotion(reduce: boolean): void {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: reduce })));
}

describe("geostory scene store", () => {
    let fake: ReturnType<typeof fakeMap>;

    beforeEach(() => {
        setActivePinia(createPinia());
        vi.stubEnv("VITE_BACKEND_ROOT_URL", "http://localhost:8000");
        setReducedMotion(false);
        fake = fakeMap();
        useMapStore().map = fake.map;
        const geoserver = useGeoserverStore();
        vi.spyOn(geoserver, "getLayerDetail").mockResolvedValue(
            { featureType: { name: "layer" } } as never
        );
        vi.spyOn(geoserver, "getLayerStyling").mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function sceneLayerIdsOnMap(): Set<string> {
        return new Set([...fake.layers.values()].map((layer) => layer.id.split(":render:")[0]));
    }

    function onlyScene(detail: GeoStoryDetail, index: number): void {
        const scene = detail.scenes[index];
        expect(fake.layers.size).toBe(scene.render_layers.length);
        expect(fake.sources.size).toBe(new Set(scene.render_layers.map((layer) => layer.source)).size);
        expect(sceneLayerIdsOnMap().size).toBe(1);
        const listed = useMapStore().layersOnMap.filter((layer) => layer.showOnLayerList);
        expect(listed.map((layer) => layer.displayName)).toEqual([scene.title]);
    }

    test("opens a story on its first scene, fitted to its layers", async () => {
        const detail = story();
        const scenes = useGeostorySceneStore();

        await scenes.openStory(detail);

        expect(scenes.activeSceneId).toBe(detail.scenes[0].id);
        expect(scenes.activeScene?.title).toBe("Overview");
        onlyScene(detail, 0);
        const [west, south, east, north] = sceneLayersBounds(detail.scenes[0])!;
        expect(fake.map.fitBounds).toHaveBeenCalledWith(
            [[west, south], [east, north]],
            { padding: 40, bearing: 0, pitch: 0, duration: 1500 }
        );
    });

    test("switches to a scene with a captured camera", async () => {
        const detail = story();
        const scenes = useGeostorySceneStore();
        await scenes.openStory(detail);

        await scenes.showScene(detail.scenes[1].id);

        expect(scenes.activeSceneId).toBe(detail.scenes[1].id);
        onlyScene(detail, 1);
        expect(fake.map.flyTo).toHaveBeenCalledWith({
            center: [10.03086, 53.56882], zoom: 13.4, bearing: -20, pitch: 45, duration: 1500,
        });
    });

    test("exposes the requested scene as target before the switch finishes", async () => {
        const detail = story();
        const scenes = useGeostorySceneStore();
        await scenes.openStory(detail);

        const switching = scenes.showScene(detail.scenes[1].id);
        expect(scenes.targetSceneId).toBe(detail.scenes[1].id);
        expect(scenes.activeSceneId).toBe(detail.scenes[0].id);
        await switching;
        expect(scenes.activeSceneId).toBe(detail.scenes[1].id);

        await scenes.closeStory();
        expect(scenes.targetSceneId).toBeUndefined();
    });

    test("ends on the last requested scene after rapid switches", async () => {
        const detail = story();
        const scenes = useGeostorySceneStore();
        await scenes.openStory(detail);
        const [overview, harbour] = detail.scenes;

        void scenes.showScene(harbour.id);
        void scenes.showScene(overview.id);
        void scenes.showScene(harbour.id);
        await scenes.showScene(overview.id);
        await scenes.showScene(harbour.id);

        expect(scenes.activeSceneId).toBe(harbour.id);
        expect(scenes.switching).toBe(false);
        onlyScene(detail, 1);
        expect(useMapStore().layersOnMap.filter((layer) => layer.logicalKind === "group")).toHaveLength(1);
    });

    test("uses easeTo for ease transitions and jumps when motion is reduced", async () => {
        const detail = story();
        detail.scenes[1].transition = { type: "ease", duration_ms: 800 };
        const scenes = useGeostorySceneStore();
        await scenes.openStory(detail);

        await scenes.showScene(detail.scenes[1].id);
        expect(fake.map.easeTo).toHaveBeenCalledWith(expect.objectContaining({ duration: 800 }));

        setReducedMotion(true);
        await scenes.showScene(detail.scenes[0].id);
        await scenes.showScene(detail.scenes[1].id);
        expect(fake.map.jumpTo).toHaveBeenCalledWith({
            center: [10.03086, 53.56882], zoom: 13.4, bearing: -20, pitch: 45,
        });
        expect(fake.map.fitBounds).toHaveBeenLastCalledWith(
            expect.anything(), expect.objectContaining({ duration: 0 })
        );
    });

    test("an empty scene clears the previous layers and keeps the view", async () => {
        const detail = story();
        detail.scenes[1] = { ...detail.scenes[1], layers: [], render_layers: [], legend: [] };
        detail.scenes[1].camera = { center: null, zoom: null, bearing: 0, pitch: 0, bounds: null };
        const scenes = useGeostorySceneStore();
        await scenes.openStory(detail);
        fake.map.fitBounds.mockClear();

        await scenes.showScene(detail.scenes[1].id);

        expect(scenes.activeSceneId).toBe(detail.scenes[1].id);
        expect(fake.layers.size).toBe(0);
        expect(fake.sources.size).toBe(0);
        expect(fake.map.fitBounds).not.toHaveBeenCalled();
        expect(fake.map.flyTo).not.toHaveBeenCalled();
    });

    test("re-adds the active scene after the reader removed it from the map", async () => {
        const detail = story();
        const scenes = useGeostorySceneStore();
        await scenes.openStory(detail);
        const mapStore = useMapStore();
        const group = mapStore.layersOnMap.find((layer) => layer.logicalKind === "group")!;
        await mapStore.deleteMapLayer(group.id, false);
        expect(fake.layers.size).toBe(0);

        await scenes.showScene(detail.scenes[0].id);

        onlyScene(detail, 0);
    });

    test("drops a scene that was still loading when the story closed", async () => {
        const detail = story();
        const scenes = useGeostorySceneStore();
        await scenes.openStory(detail);
        await scenes.closeStory({ removeLayers: true });
        expect(fake.layers.size).toBe(0);

        const pending = scenes.showScene(detail.scenes[1].id);
        await pending;

        // No story is open, so nothing is drawn.
        expect(fake.layers.size).toBe(0);
        expect(scenes.activeSceneId).toBeUndefined();
    });

    test("ignores a scene load that finishes after another story was opened", async () => {
        const first = story();
        const second = story();
        second.id = "another-story";
        second.scenes = [{ ...second.scenes[1], id: "another-scene", order: 0 }];
        const geoserver = useGeoserverStore();
        let release!: () => void;
        vi.mocked(geoserver.getLayerDetail).mockImplementationOnce(() => new Promise((resolve) => {
            release = () => resolve({ featureType: { name: "slow" } } as never);
        }));
        const scenes = useGeostorySceneStore();

        const firstOpen = scenes.openStory(first);
        await vi.waitFor(() => expect(release).toBeDefined());
        const secondOpen = scenes.openStory(second);
        release();
        await Promise.all([firstOpen, secondOpen]);

        expect(scenes.story?.id).toBe("another-story");
        expect(scenes.activeSceneId).toBe("another-scene");
        expect(useMapStore().layersOnMap.filter((layer) => layer.showOnLayerList)
            .map((layer) => layer.displayName)).toEqual(["Harbour detail"]);
    });

    test("closing keeps the scene on the map; the next story replaces it", async () => {
        const detail = story();
        const scenes = useGeostorySceneStore();
        await scenes.openStory(detail);

        await scenes.closeStory();
        expect(scenes.story).toBeUndefined();
        expect(fake.layers.size).toBe(detail.scenes[0].render_layers.length);

        await scenes.openStory(detail);
        onlyScene(detail, 0);
    });
});

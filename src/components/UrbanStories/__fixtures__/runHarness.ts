import { vi } from "vitest";
import { getStoryConfig, type UrbanStoryKey } from "../../../config/urbanStories";
import type { GeoStoryDetail } from "@store/geostory";
import type { useGeostorySceneStore } from "@store/geostoryScenes";
import { useMapStore, type LayerObjectWithAttributes } from "@store/map";
import scenesDetailFixture from "@store/__fixtures__/geostory-scenes-detail.json";

export type Deferred<T = void> = ReturnType<typeof deferred<T>>;

/** A promise the test resolves or rejects by hand, for ordering races. */
export function deferred<T = void>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

/**
 * A published story with `count` scenes, each with an anchor and one paragraph after it
 * (plus an introduction paragraph before the first anchor). Built from the real scene fixture.
 */
export function storyDetail(count: number, overrides: Partial<GeoStoryDetail> = {}): GeoStoryDetail {
    const base = structuredClone(scenesDetailFixture) as unknown as GeoStoryDetail;
    const template = base.scenes[1];
    const scenes = Array.from({ length: count }, (_, index) => ({
        ...structuredClone(template),
        id: `scene-${index + 1}`,
        order: index,
        title: `Scene ${index + 1}`,
        caption: `Caption ${index + 1}`,
    }));
    const blocks = [
        { type: "paragraph", data: { text: "Intro text" } },
        ...scenes.flatMap((scene, index) => [
            { type: "mapScene", data: { scene_id: scene.id } },
            { type: "paragraph", data: { text: `Narrative ${index + 1}` } },
        ]),
    ];
    return { ...base, id: "story-1", status: "published", scenes, content: { blocks }, ...overrides };
}

export function fakeCameraMap() {
    const layers = new Map<string, { visibility: string }>();
    return {
        layers,
        on: vi.fn(),
        off: vi.fn(),
        getCenter: () => ({ lng: 9.99, lat: 53.55 }),
        getZoom: () => 11,
        getBearing: () => 0,
        getPitch: () => 0,
        getCanvas: () => ({ getBoundingClientRect: () => ({ left: 0, width: 1200 }) }),
        flyTo: vi.fn(),
        jumpTo: vi.fn(),
        fitBounds: vi.fn(),
        easeTo: vi.fn(),
        getLayer: (id: string) => (layers.has(id) ? { type: "fill" } : undefined),
        getLayoutProperty: (id: string) => layers.get(id)?.visibility,
        setLayoutProperty: vi.fn((id: string, _property: string, value: string) => {
            const layer = layers.get(id);
            if (layer !== undefined) layer.visibility = value;
        }),
        getPaintProperty: () => undefined,
        setPaintProperty: vi.fn(),
        setFilter: vi.fn(),
        removeLayer: vi.fn(),
        removeSource: vi.fn(),
        getSource: () => undefined,
    };
}

/** Register an Explore-style layer on the fake map and in `mapStore.layersOnMap`. */
export function addExploreLayer(map: ReturnType<typeof fakeCameraMap>, runtimeId: string, visible = true): LayerObjectWithAttributes {
    map.layers.set(runtimeId, { visibility: visible ? "visible" : "none" });
    const record = { id: runtimeId, source: runtimeId, sourceType: "geoserver", type: "fill", showOnLayerList: true } as LayerObjectWithAttributes;
    useMapStore().add2MapLayerList(record, undefined, { notify: false });
    return record;
}

/**
 * Replace the scene engine's three actions with state-faithful fakes, so the Urban Stories
 * store runs against the same `story / targetSceneId / activeSceneId` surface the engine exposes.
 */
export function fakeSceneEngine(sceneStore: ReturnType<typeof useGeostorySceneStore>) {
    // `open` holds openStory before it assigns the story (a close racing the engine's own first
    // await); `afterAssign` holds it after, like the engine waiting for the first scene.
    const gate = {
        open: undefined as Deferred | undefined,
        afterAssign: undefined as Deferred | undefined,
    };
    const openStory = vi.spyOn(sceneStore, "openStory").mockImplementation(async (detail) => {
        await gate.open?.promise;
        sceneStore.story = detail;
        const first = detail.scenes[0]?.id;
        sceneStore.targetSceneId = first;
        sceneStore.activeSceneId = first;
        await gate.afterAssign?.promise;
    });
    const showScene = vi.spyOn(sceneStore, "showScene").mockImplementation(async (sceneId) => {
        sceneStore.targetSceneId = sceneId;
        sceneStore.activeSceneId = sceneId;
    });
    const closeStory = vi.spyOn(sceneStore, "closeStory").mockImplementation(async () => {
        sceneStore.story = undefined;
        sceneStore.targetSceneId = undefined;
        sceneStore.activeSceneId = undefined;
    });
    return { openStory, showScene, closeStory, gate };
}

/** Give a story config a backend id for one test; returns the restore function. */
export function publishStoryConfig(key: UrbanStoryKey, id: string | null): () => void {
    const config = getStoryConfig(key);
    if (config === undefined) throw new Error(`unknown story ${key}`);
    const previous = config.geostory.id;
    config.geostory.id = id;
    return () => { config.geostory.id = previous; };
}

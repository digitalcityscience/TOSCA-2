import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
    createGeoStorySceneLoader,
    sceneCameraMove,
    sceneLayersBounds,
    sceneToGroupManifest,
    type CatalogLayerDetail,
} from "./geostoryScenes";
import { useMapStore } from "@store/map";
import type { GeoStoryDetail, GeoStoryScene } from "@store/geostory";
import scenesDetailFixture from "@store/__fixtures__/geostory-scenes-detail.json";

const validateSpriteUrl = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@helpers/mapStyleBundle", () => ({ validateSpriteUrl }));
vi.mock("@helpers/toast", () => ({ useToast: () => ({ add: vi.fn() }) }));

// Real story detail from the dev backend: scene 0 draws three SLD layers as WMS
// images, scene 1 one MBStyle layer as vector tiles with a highlight selection.
function story(): GeoStoryDetail {
    return structuredClone(scenesDetailFixture) as unknown as GeoStoryDetail;
}

function withScene(detail: GeoStoryDetail, index: number): GeoStoryScene {
    return detail.scenes[index];
}

function memberIdOf(layer: { metadata?: Record<string, unknown> }): unknown {
    return layer.metadata?.["tosca:member-id"];
}

const vectorDetail = { featureType: { name: "StatGebiet_roh_F_v5" } } as unknown as CatalogLayerDetail;

beforeEach(() => {
    vi.stubEnv("VITE_BACKEND_ROOT_URL", "http://localhost:8000");
});

describe("sceneToGroupManifest", () => {
    test("maps a WMS scene to a group with one member per scene layer", () => {
        const detail = story();
        const scene = withScene(detail, 0);

        const manifest = sceneToGroupManifest(detail, scene)!;

        expect(manifest.id).toBe(scene.id);
        expect(manifest.title).toBe("Overview");
        expect(manifest.composition).toBe("VECTOR");
        expect(manifest.legend).toBeNull();
        expect(manifest.provider.base_url).toBe("http://localhost:8080/geoserver");
        expect(manifest.workspace.name).toBe("Hamburg");
        expect(manifest.layers).toBe(scene.render_layers);
        expect(manifest.members.map((member) => member.id)).toEqual(scene.layers.map((layer) => layer.id));
        expect(manifest.members.map((member) => member.source_alias)).toEqual(
            scene.layers.map((layer) => layer.source_key)
        );
        expect(Object.keys(manifest.sources).sort()).toEqual(
            [...new Set(scene.layers.map((layer) => layer.source_key))].sort()
        );
        // Only the styles this scene uses travel with it.
        expect(Object.keys(manifest.styles).sort()).toEqual(
            [...new Set(scene.render_layers.map((layer) => layer.metadata?.["tosca:style-id"]))].sort()
        );
        expect(manifest.sprites).toEqual({});
    });

    test("names every render layer's member, so addMapGroup can route popups and legends", () => {
        const detail = story();

        for (const scene of detail.scenes) {
            const manifest = sceneToGroupManifest(detail, scene)!;
            const memberIds = new Set(manifest.members.map((member) => member.id));
            for (const layer of manifest.layers) {
                expect(memberIds.has(memberIdOf(layer) as string)).toBe(true);
            }
        }
    });

    test("maps a vector-tile scene with a provider-scoped resource href", () => {
        const detail = story();
        const scene = withScene(detail, 1);
        const sceneLayer = scene.layers[0];

        const manifest = sceneToGroupManifest(detail, scene, {
            detailsByLayerId: new Map([[sceneLayer.layer.id, vectorDetail]]),
        })!;

        const [member] = manifest.members;
        expect(member.data_type).toBe("VECTOR");
        expect(member.details).toBe(vectorDetail);
        expect(member.title).toBe("StatGebiet_roh_F_v5");
        expect(member.resource_href).toBe(
            `http://localhost:8000/api/v1/catalog/providers/${sceneLayer.layer.provider.id}` +
            "/workspaces/Adipositas/resources/StatGebiet_roh_F_v5"
        );
        expect(Object.keys(manifest.sources)).toEqual([sceneLayer.source_key]);
        expect(manifest.sources[sceneLayer.source_key!]).toEqual(detail.map.sources[sceneLayer.source_key!]);
    });

    test("reports MIXED composition for raster and vector members", () => {
        const detail = story();
        const scene = withScene(detail, 0);
        scene.legend[0].data_type = "RASTER";

        expect(sceneToGroupManifest(detail, scene)!.composition).toBe("MIXED");
    });

    test("falls back to the story title for an untitled scene", () => {
        const detail = story();
        const scene = withScene(detail, 0);
        scene.title = "";

        expect(sceneToGroupManifest(detail, scene)!.title).toBe(detail.title);
    });

    test("carries only the sprites of the scene's styles", () => {
        const detail = story();
        const scene = withScene(detail, 0);
        const styleId = scene.render_layers[0].metadata!["tosca:style-id"] as string;
        detail.map.styles[styleId].sprite_id = "sprite-a";
        detail.map.sprites = {
            "sprite-a": { id: "sprite-a", url: "http://localhost:8000/sprites/a", content_hash: "a" },
            "sprite-b": { id: "sprite-b", url: "http://localhost:8000/sprites/b", content_hash: "b" },
        };

        expect(Object.keys(sceneToGroupManifest(detail, scene)!.sprites)).toEqual(["sprite-a"]);
    });

    test("returns nothing for a scene without drawable layers", () => {
        const detail = story();
        const empty = { ...withScene(detail, 0), layers: [], render_layers: [], legend: [] };
        const unstyled = {
            ...withScene(detail, 0),
            layers: withScene(detail, 0).layers.map((layer) => ({
                ...layer, source_key: null, style_assignment: null,
            })),
            render_layers: [],
        };

        expect(sceneToGroupManifest(detail, empty)).toBeUndefined();
        expect(sceneToGroupManifest(detail, unstyled)).toBeUndefined();
    });
});

describe("createGeoStorySceneLoader", () => {
    test("loads each layer's catalog detail once per story", async () => {
        const detail = story();
        // Show the vector layer in both scenes.
        detail.scenes[0] = { ...detail.scenes[1], id: "copy-of-harbour" };
        const getLayerDetail = vi.fn(async () => vectorDetail);
        const loader = createGeoStorySceneLoader(detail, {
            getLayerDetail,
            getLayerStyling: vi.fn(async () => undefined),
        });

        const first = await loader.manifestFor(detail.scenes[0]);
        const second = await loader.manifestFor(detail.scenes[1]);

        expect(getLayerDetail).toHaveBeenCalledTimes(1);
        expect(getLayerDetail).toHaveBeenCalledWith(first!.members[0].resource_href);
        expect(second!.members[0].details).toBe(vectorDetail);
    });

    test("draws a layer whose detail fails and reports the failure once", async () => {
        const detail = story();
        const failure = new Error("catalog 404");
        const onLayerError = vi.fn();
        const loader = createGeoStorySceneLoader(detail, {
            getLayerDetail: vi.fn(async () => { throw failure; }),
            getLayerStyling: vi.fn(async () => undefined),
        }, { onLayerError });

        const manifest = await loader.manifestFor(detail.scenes[1]);
        await loader.manifestFor(detail.scenes[1]);

        expect(manifest!.members[0].details).toBeUndefined();
        expect(manifest!.layers).toHaveLength(detail.scenes[1].render_layers.length);
        expect(onLayerError).toHaveBeenCalledTimes(1);
        expect(onLayerError).toHaveBeenCalledWith(failure, detail.scenes[1].layers[0]);
    });

    test("resolves MBStyle popup attributes once per style", async () => {
        const detail = story();
        const attributes = [{ name: "STATGEB", label: "Statistical area" }];
        const getLayerStyling = vi.fn(async () => ({ metadata: { "tosca:attributes": attributes } }));
        const loader = createGeoStorySceneLoader(detail, {
            getLayerDetail: vi.fn(async () => vectorDetail),
            getLayerStyling,
        });

        const manifest = await loader.manifestFor(detail.scenes[1]);
        await loader.manifestFor(detail.scenes[1]);

        const styleId = detail.scenes[1].render_layers[0].metadata!["tosca:style-id"] as string;
        expect(manifest!.styles[styleId].attributes).toEqual(attributes);
        expect(getLayerStyling).toHaveBeenCalledTimes(1);
        expect(getLayerStyling).toHaveBeenCalledWith(detail.map.styles[styleId].href);
    });

    test("skips catalog requests for a scene with nothing to draw", async () => {
        const detail = story();
        const getLayerDetail = vi.fn(async () => vectorDetail);
        const loader = createGeoStorySceneLoader(detail, {
            getLayerDetail,
            getLayerStyling: vi.fn(async () => undefined),
        });

        const manifest = await loader.manifestFor({ ...detail.scenes[0], layers: [], render_layers: [] });

        expect(manifest).toBeUndefined();
        expect(getLayerDetail).not.toHaveBeenCalled();
    });
});

describe("addMapGroup with scene manifests", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    function fakeMap() {
        const sources = new Map<string, unknown>();
        const layers = new Map<string, { id: string; source?: string }>();
        return {
            sources,
            layers,
            map: {
                addSource: (id: string, source: unknown) => sources.set(id, source),
                getSource: (id: string) => sources.get(id),
                removeSource: (id: string) => sources.delete(id),
                addLayer: (layer: { id: string; source?: string }) => layers.set(layer.id, layer),
                getLayer: (id: string) => layers.get(id),
                removeLayer: (id: string) => layers.delete(id),
                addSprite: vi.fn(),
                removeSprite: vi.fn(),
            },
        };
    }

    test.each([0, 1])("adds scene %i unchanged and lists it as one group", async (index) => {
        const detail = story();
        const scene = detail.scenes[index];
        const fake = fakeMap();
        const mapStore = useMapStore();
        mapStore.map = fake.map;

        const group = await mapStore.addMapGroup(sceneToGroupManifest(detail, scene)!);

        expect(fake.layers.size).toBe(scene.render_layers.length);
        expect(fake.sources.size).toBe(new Set(scene.render_layers.map((layer) => layer.source)).size);
        for (const layer of fake.layers.values()) {
            expect(fake.sources.has(layer.source!)).toBe(true);
        }
        expect(group.logicalKind).toBe("group");
        expect(group.displayName).toBe(scene.title);
        expect(Object.keys(group.groupMemberLayerIds ?? {}).sort()).toEqual(
            scene.layers.map((layer) => layer.id).sort()
        );
        expect(mapStore.layersOnMap.filter((layer) => layer.showOnLayerList)).toHaveLength(1);
    });
});

describe("sceneCameraMove", () => {
    const captured = { center: [10, 53.5] as [number, number], zoom: 12, bearing: -20, pitch: 45, bounds: null };

    function withCamera(camera: GeoStoryScene["camera"], type: "fly" | "ease" | "jump" = "fly"): GeoStoryScene {
        return { ...story().scenes[0], camera, transition: { type, duration_ms: 900 } };
    }

    test.each([
        ["fly", "flyTo"],
        ["ease", "easeTo"],
    ] as const)("animates a captured camera with %s", (type, method) => {
        expect(sceneCameraMove(withCamera(captured, type))).toEqual({
            method,
            options: { center: [10, 53.5], zoom: 12, bearing: -20, pitch: 45, duration: 900 },
        });
    });

    test("jumps for jump transitions and for reduced motion", () => {
        const jump = { method: "jumpTo", options: { center: [10, 53.5], zoom: 12, bearing: -20, pitch: 45 } };

        expect(sceneCameraMove(withCamera(captured, "jump"))).toEqual(jump);
        expect(sceneCameraMove(withCamera(captured, "fly"), { reducedMotion: true })).toEqual(jump);
    });

    test("fits captured bounds, keeping bearing and pitch", () => {
        const camera = { center: null, zoom: null, bearing: 15, pitch: 30, bounds: [9, 53, 11, 54] as GeoStoryScene["camera"]["bounds"] };

        expect(sceneCameraMove(withCamera(camera))).toEqual({
            method: "fitBounds",
            bounds: [[9, 53], [11, 54]],
            options: { padding: 40, bearing: 15, pitch: 30, duration: 900 },
        });
    });

    test("fits the union of the layers' extents without a camera", () => {
        const scene = withCamera({ center: null, zoom: null, bearing: 0, pitch: 0, bounds: null });
        const union = sceneLayersBounds(scene)!;

        expect(union[0]).toBe(Math.min(...scene.layers.map((layer) => layer.layer.bounds![0])));
        expect(union[3]).toBe(Math.max(...scene.layers.map((layer) => layer.layer.bounds![3])));
        expect(sceneCameraMove(scene, { reducedMotion: true })).toEqual({
            method: "fitBounds",
            bounds: [[union[0], union[1]], [union[2], union[3]]],
            options: { padding: 40, bearing: 0, pitch: 0, duration: 0 },
        });
    });

    test("keeps the view for an empty scene without a camera", () => {
        const scene = {
            ...withCamera({ center: null, zoom: null, bearing: 0, pitch: 0, bounds: null }),
            layers: [],
            render_layers: [],
        };

        expect(sceneCameraMove(scene)).toBeUndefined();
    });
});

import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
    buildStoryDetailUrl,
    buildStoryListUrl,
    getStoryAnchors,
    isMapSceneBlock,
    resolveBackendMediaUrl,
    sortedScenes,
    type GeoStoryDetail,
    type GeoStoryScene,
    useGeostoryStore,
} from "./geostory";
import scenesDetailFixture from "./__fixtures__/geostory-scenes-detail.json";

// Real `GET /api/v1/stories/{id}/` response from the dev backend (trimmed content).
const scenesDetail = scenesDetailFixture as unknown as GeoStoryDetail;

function scene(id: string, order: number): GeoStoryScene {
    return { ...scenesDetail.scenes[0], id, order };
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: {
            "Content-Type": "application/json",
        },
        ...init,
    });
}

describe("geostory store", () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        setActivePinia(createPinia());
        vi.stubEnv("VITE_BACKEND_ROOT_URL", "http://localhost:8000");
        fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
    });

    test("builds list, detail, and media URLs from the backend root", () => {
        expect(buildStoryListUrl().toString()).toBe(
            "http://localhost:8000/api/v1/stories/"
        );
        expect(buildStoryDetailUrl("story/id").toString()).toBe(
            "http://localhost:8000/api/v1/stories/story%2Fid/"
        );
        expect(resolveBackendMediaUrl("/media/story.jpg")).toBe(
            "http://localhost:8000/media/story.jpg"
        );
    });

    test("loads the first page and appends cursor pages", async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse({
                next: "/api/v1/stories/?cursor=next",
                previous: null,
                results: [{ id: "1", title: "One" }],
            }))
            .mockResolvedValueOnce(jsonResponse({
                next: null,
                previous: "/api/v1/stories/",
                results: [{ id: "2", title: "Two" }],
            }));

        const geostory = useGeostoryStore();
        await geostory.loadStories();
        await geostory.loadMoreStories();

        expect(geostory.stories.map((story) => story.id)).toEqual(["1", "2"]);
        expect(fetchMock.mock.calls[0][0].toString()).toBe(
            "http://localhost:8000/api/v1/stories/"
        );
        expect(fetchMock.mock.calls[1][0].toString()).toBe(
            "http://localhost:8000/api/v1/stories/?cursor=next"
        );
    });

    test("loads story detail", async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({
            id: "story-1",
            title: "Story",
            summary: "Summary",
            content: {
                blocks: [
                    { type: "paragraph", data: { text: "The story itself" } },
                ],
            },
            layers: [],
        }));

        const geostory = useGeostoryStore();
        const detail = await geostory.getStoryDetail("story-1");

        expect(detail.id).toBe("story-1");
        expect(detail.content.blocks?.[0].data?.text).toBe("The story itself");
        expect("context" in detail).toBe(false);
        expect(geostory.selectedStory?.id).toBe("story-1");
        expect(fetchMock.mock.calls[0][0].toString()).toBe(
            "http://localhost:8000/api/v1/stories/story-1/"
        );
    });

    test("surfaces failed API responses clearly", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        fetchMock.mockResolvedValueOnce(jsonResponse("No stories", {
            status: 500,
            statusText: "Server Error",
        }));

        const geostory = useGeostoryStore();
        await expect(geostory.loadStories()).rejects.toThrow(
            "GeoStory request failed (500 Server Error): \"No stories\""
        );
        expect(geostory.error).toBe(
            "We couldn't reach the GeoStory service. Please try again in a moment."
        );
    });

    test("loads a story with map scenes", async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(scenesDetailFixture));

        const geostory = useGeostoryStore();
        const detail = await geostory.getStoryDetail(scenesDetail.id);

        const [overview, harbour] = sortedScenes(detail);
        expect([overview.title, harbour.title]).toEqual(["Overview", "Harbour detail"]);
        // A camera-less scene fits the map to its layers.
        expect(overview.camera).toEqual({
            center: null, zoom: null, bearing: 0, pitch: 0, bounds: null,
        });
        expect(harbour.camera.center).toEqual([10.03086, 53.56882]);
        expect(harbour.transition).toEqual({ type: "fly", duration_ms: 1500 });

        const vectorLayer = harbour.layers[0];
        expect(vectorLayer.layer.provider.base_url).toBe("http://localhost:8080/geoserver");
        expect(vectorLayer.layer.bounds).toHaveLength(4);
        expect(vectorLayer.features).toEqual({
            mode: "highlight", attribute: "STATGEB", ids: [49009],
        });
        expect(harbour.legend[0].rendering).toBe("vector-tiles");

        // Every render layer names its member and uses a shared story source.
        for (const item of sortedScenes(detail)) {
            const memberIds = new Set(item.layers.map((layer) => layer.id));
            for (const renderLayer of item.render_layers) {
                expect(memberIds.has(renderLayer.metadata?.["tosca:member-id"] as string)).toBe(true);
                expect(detail.map.sources[renderLayer.source as string]).toBeDefined();
            }
        }
        expect(overview.layers.map((layer) => layer.source_key)).toEqual(
            overview.render_layers.map((layer) => layer.source)
        );
    });

    test("sorts scenes by order without mutating the story", () => {
        const story = { scenes: [scene("b", 2), scene("a", 0), scene("c", 1)] };

        expect(sortedScenes(story).map((item) => item.id)).toEqual(["a", "c", "b"]);
        expect(story.scenes.map((item) => item.id)).toEqual(["b", "a", "c"]);
    });

    test("resolves scene anchors in content order", () => {
        const harbour = scenesDetail.scenes[1];

        expect(getStoryAnchors(scenesDetail)).toEqual([
            { sceneId: harbour.id, blockIndex: 3 },
        ]);
    });

    test("skips anchors to unknown scenes and repeated anchors", () => {
        const story = {
            scenes: [scene("a", 0), scene("b", 1)],
            content: {
                blocks: [
                    { type: "mapScene", data: { scene_id: "b" } },
                    { type: "paragraph", data: { text: "Text" } },
                    { type: "mapScene", data: { scene_id: "deleted" } },
                    { type: "mapScene", data: { scene_id: "b" } },
                    { type: "mapScene", data: {} },
                    { type: "mapScene", data: { scene_id: "a" } },
                ],
            },
        };

        expect(getStoryAnchors(story)).toEqual([
            { sceneId: "b", blockIndex: 0 },
            { sceneId: "a", blockIndex: 5 },
        ]);
    });

    test("recognises only well-formed map scene blocks", () => {
        expect(isMapSceneBlock({ type: "mapScene", data: { scene_id: "x" } })).toBe(true);
        expect(isMapSceneBlock({ type: "mapScene" })).toBe(false);
        expect(isMapSceneBlock({ type: "paragraph", data: { scene_id: "x" } })).toBe(false);
    });

    test("treats a story without scenes or content as having no anchors", () => {
        const story = { scenes: [], content: { blocks: [] } };

        expect(sortedScenes(story)).toEqual([]);
        expect(getStoryAnchors(story)).toEqual([]);
    });
});

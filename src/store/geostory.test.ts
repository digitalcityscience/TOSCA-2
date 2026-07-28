import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
    buildStoryDetailUrl,
    buildStoryListUrl,
    resolveBackendMediaUrl,
    useGeostoryStore,
} from "./geostory";

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
            layers: [],
        }));

        const geostory = useGeostoryStore();
        const detail = await geostory.getStoryDetail("story-1");

        expect(detail.id).toBe("story-1");
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
});

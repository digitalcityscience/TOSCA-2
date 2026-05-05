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

    test("builds list, detail, and media URLs from the Django root", () => {
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

    test("loads first page and appends cursor pages", async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse({
                next: "/api/v1/stories/?cursor=next",
                previous: null,
                results: [{ id: "1", title: "One", summary: "", hero_image_url: null, hero_image_alt: "", campaign: "c", created_at: "2026-05-01T00:00:00Z" }],
            }))
            .mockResolvedValueOnce(jsonResponse({
                next: null,
                previous: "/api/v1/stories/",
                results: [{ id: "2", title: "Two", summary: "", hero_image_url: null, hero_image_alt: "", campaign: "c", created_at: "2026-05-02T00:00:00Z" }],
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
            hero_image_url: null,
            hero_image_alt: "",
            campaign: "campaign-1",
            created_at: "2026-05-01T00:00:00Z",
            updated_at: "2026-05-02T00:00:00Z",
            status: "published",
            context: null,
            layers: [],
            feature_links: [],
        }));

        const detail = await useGeostoryStore().getStoryDetail("story-1");

        expect(detail.id).toBe("story-1");
        expect(fetchMock.mock.calls[0][0].toString()).toBe(
            "http://localhost:8000/api/v1/stories/story-1/"
        );
    });

    test("throws clear errors for failed responses", async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse("No stories", {
            status: 500,
            statusText: "Server Error",
        }));

        await expect(useGeostoryStore().loadStories()).rejects.toThrow(
            "GeoStory request failed (500 Server Error): \"No stories\""
        );
    });
});

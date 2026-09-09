import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
    buildEventDetailUrl,
    buildEventListUrl,
    buildEventMapUrl,
    buildEventSeriesDetailUrl,
    buildEventTaxonomyUrl,
    buildEventTypesUrl,
    buildEventWithinUrl,
    HAMBURG_EVENT_BBOX,
    useEventsStore,
} from "./events";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: {
            "Content-Type": "application/json",
        },
        ...init,
    });
}

describe("events store", () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        setActivePinia(createPinia());
        vi.stubEnv("VITE_BACKEND_ROOT_URL", "http://localhost:8000");
        // Pin the timezone so month-window math (which uses local wall-clock
        // dates) doesn't shift by a DST hour depending on the host machine.
        vi.stubEnv("TZ", "UTC");
        fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test("builds event URLs from the backend root", () => {
        expect(buildEventListUrl().toString()).toBe(
            "http://localhost:8000/api/v1/events/"
        );
        expect(buildEventDetailUrl("event/id").toString()).toBe(
            "http://localhost:8000/api/v1/events/event%2Fid/"
        );
        expect(buildEventWithinUrl().toString()).toBe(
            "http://localhost:8000/api/v1/events/within/"
        );
        expect(buildEventSeriesDetailUrl("series/id").toString()).toBe(
            "http://localhost:8000/api/v1/event-series/series%2Fid/"
        );
        expect(buildEventTypesUrl().toString()).toBe(
            "http://localhost:8000/api/v1/event-types/"
        );
        expect(buildEventTaxonomyUrl("public_health").toString()).toBe(
            "http://localhost:8000/api/v1/event-taxonomy/?profile_key=public_health"
        );
    });

    test("shares filters between list and map requests while keeping bbox map-only", () => {
        const filters = {
            campaign_id: "campaign-1",
            profile_key: "public_health",
            dimension_code: "field_of_action",
            term_code: "sport_bewegung",
            start_after: "2026-06-01T00:00:00Z",
        };

        expect(buildEventListUrl(filters).toString()).toBe(
            "http://localhost:8000/api/v1/events/?campaign_id=campaign-1&profile_key=public_health&dimension_code=field_of_action&term_code=sport_bewegung&start_after=2026-06-01T00%3A00%3A00Z"
        );
        expect(buildEventMapUrl(filters, [9, 53, 10, 54]).toString()).toBe(
            "http://localhost:8000/api/v1/events/map/?campaign_id=campaign-1&profile_key=public_health&dimension_code=field_of_action&term_code=sport_bewegung&start_after=2026-06-01T00%3A00%3A00Z&bbox=9%2C53%2C10%2C54"
        );
    });

    test("repeats taxonomy parameters for multiple category filters", () => {
        const url = buildEventListUrl({
            profile_key: "public_health",
            dimension_code: ["topic", "audience"],
            term_code: ["movement", "seniors"],
        });

        expect(url.searchParams.getAll("dimension_code")).toEqual(["topic", "audience"]);
        expect(url.searchParams.getAll("term_code")).toEqual(["movement", "seniors"]);
    });

    test("loads event type and taxonomy registries", async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse([
                {
                    id: "type-1",
                    code: "public_health",
                    label: "Public Health",
                    profile_mode: "extension",
                    profile_key: "public_health",
                },
            ]))
            .mockResolvedValueOnce(jsonResponse({
                profile_key: "public_health",
                dimensions: [
                    {
                        id: "dimension-1",
                        code: "field_of_action",
                        label: "Field",
                        selection_mode: "multiple",
                        terms: [],
                    },
                ],
            }));

        const events = useEventsStore();
        await events.loadEventTypes();
        const registry = await events.loadEventTaxonomy("public_health");

        expect(events.eventTypes[0].profile_key).toBe("public_health");
        expect(registry.dimensions[0].code).toBe("field_of_action");
        expect(fetchMock.mock.calls[1][0].toString()).toBe(
            "http://localhost:8000/api/v1/event-taxonomy/?profile_key=public_health"
        );
    });

    test("loads only the next two months on initial refresh, following cursor pages within that window", async () => {
        vi.setSystemTime(new Date("2026-01-15T00:00:00.000Z"));

        fetchMock
            .mockResolvedValueOnce(jsonResponse({
                next: "/api/v1/events/?cursor=next",
                previous: null,
                results: [{ id: "1" }],
            }))
            .mockResolvedValueOnce(jsonResponse({
                next: null,
                previous: "/api/v1/events/",
                results: [{ id: "2" }],
            }));

        const events = useEventsStore();
        await events.loadEvents();

        expect(events.events.map((event) => event.id)).toEqual(["1", "2"]);
        expect(fetchMock.mock.calls[0][0].toString()).toBe(
            "http://localhost:8000/api/v1/events/?start_after=2026-01-15T00%3A00%3A00.000Z&start_before=2026-03-01T00%3A00%3A00.000Z"
        );
        expect(fetchMock.mock.calls[1][0].toString()).toBe(
            "http://localhost:8000/api/v1/events/?cursor=next"
        );
    });

    test("loadMoreEvents fetches only the next month and appends onto the loaded events", async () => {
        vi.setSystemTime(new Date("2026-01-15T00:00:00.000Z"));

        fetchMock
            .mockResolvedValueOnce(jsonResponse({ next: null, previous: null, results: [{ id: "1" }] }))
            .mockResolvedValueOnce(jsonResponse({ next: null, previous: null, results: [{ id: "2" }] }));

        const events = useEventsStore();
        await events.loadEvents();
        await events.loadMoreEvents();

        expect(events.events.map((event) => event.id)).toEqual(["1", "2"]);
        expect(fetchMock.mock.calls[1][0].toString()).toBe(
            "http://localhost:8000/api/v1/events/?start_after=2026-03-01T00%3A00%3A00.000Z&start_before=2026-04-01T00%3A00%3A00.000Z"
        );
    });

    test("refreshes map data through the newly loaded month", async () => {
        vi.setSystemTime(new Date("2026-01-15T00:00:00.000Z"));
        const emptyMap = {
            spatial_events: { type: "FeatureCollection", features: [] },
            online_events: [],
        };
        fetchMock
            .mockResolvedValueOnce(jsonResponse(emptyMap))
            .mockResolvedValueOnce(jsonResponse({ next: null, previous: null, results: [{ id: "1" }] }))
            .mockResolvedValueOnce(jsonResponse(emptyMap))
            .mockResolvedValueOnce(jsonResponse({ next: null, previous: null, results: [{ id: "2" }] }))
            .mockResolvedValueOnce(jsonResponse(emptyMap));

        const events = useEventsStore();
        await events.loadEventMap();
        await events.loadEvents();
        await events.loadMoreEvents();

        expect(fetchMock.mock.calls[2][0].toString()).toContain(
            "start_before=2026-03-01T00%3A00%3A00.000Z"
        );
        expect(fetchMock.mock.calls[4][0].toString()).toContain(
            "start_before=2026-04-01T00%3A00%3A00.000Z"
        );
    });

    test("stops offering more once an explicit start_before filter caps the window", async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ next: null, previous: null, results: [] }));

        const events = useEventsStore();
        events.setFilters({ start_before: "2026-02-01T00:00:00.000Z" });
        await events.loadEvents();

        expect(events.canLoadMore).toBe(false);
    });

    test("loads map buckets and event details", async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse({
                spatial_events: { type: "FeatureCollection", features: [] },
                online_events: [{ id: "online-1" }],
            }))
            .mockResolvedValueOnce(jsonResponse({
                id: "event-1",
                title: "Event",
                content: {
                    blocks: [
                        { type: "paragraph", data: { text: "Series event content" } },
                    ],
                },
                content_override: null,
                content_source: "series",
            }));

        const events = useEventsStore();
        await events.loadEventMap();
        const detail = await events.getEventDetail("event-1");

        expect(events.onlineEvents).toHaveLength(1);
        expect(detail.id).toBe("event-1");
        expect(detail.content.blocks?.[0].data?.text).toBe("Series event content");
        expect(detail.content_override).toBeNull();
        expect(detail.content_source).toBe("series");
        expect("context" in detail).toBe(false);
        expect(events.selectedEvent?.id).toBe("event-1");
        expect(fetchMock.mock.calls[0][0].toString()).toBe(
            `http://localhost:8000/api/v1/events/map/?bbox=${HAMBURG_EVENT_BBOX.join("%2C")}`
        );
    });

    test("loads and caches one Hamburg map payload per filter set", async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse({
                spatial_events: { type: "FeatureCollection", features: [] },
                online_events: [],
            }))
            .mockResolvedValueOnce(jsonResponse({
                spatial_events: { type: "FeatureCollection", features: [] },
                online_events: [],
            }));

        const events = useEventsStore();
        await Promise.all([
            events.loadEventMap(),
            events.loadEventMap(),
        ]);
        await events.loadEventMap();

        expect(fetchMock).toHaveBeenCalledTimes(1);

        events.setFilters({ campaign_id: "campaign-2" });
        await events.loadEventMap();

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[1][0].toString()).toBe(
            `http://localhost:8000/api/v1/events/map/?campaign_id=campaign-2&bbox=${HAMBURG_EVENT_BBOX.join("%2C")}`
        );
    });

    test("surfaces failed API responses clearly", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        fetchMock.mockResolvedValueOnce(jsonResponse("No events", {
            status: 500,
            statusText: "Server Error",
        }));

        const events = useEventsStore();
        await expect(events.loadEvents()).rejects.toThrow(
            "Event request failed (500 Server Error): \"No events\""
        );
        expect(events.error).toBe(
            "We couldn't reach the event service. Please try again in a moment."
        );
    });
});

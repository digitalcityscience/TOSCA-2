import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
    buildEventDetailUrl,
    buildEventListUrl,
    buildEventMapUrl,
    buildEventSeriesDetailUrl,
    buildEventTaxonomyUrl,
    buildEventTypesUrl,
    buildEventWithinUrl,
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
        fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
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
            include_past: false,
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

    test("loads every cursor page in a single list refresh", async () => {
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
        expect(events.next).toBeNull();
        expect(fetchMock.mock.calls[1][0].toString()).toBe(
            "http://localhost:8000/api/v1/events/?cursor=next"
        );
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
            }));

        const events = useEventsStore();
        await events.loadEventMap([9, 53, 10, 54]);
        const detail = await events.getEventDetail("event-1");

        expect(events.onlineEvents).toHaveLength(1);
        expect(detail.id).toBe("event-1");
        expect(events.selectedEvent?.id).toBe("event-1");
        expect(fetchMock.mock.calls[0][0].toString()).toBe(
            "http://localhost:8000/api/v1/events/map/?bbox=9%2C53%2C10%2C54"
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

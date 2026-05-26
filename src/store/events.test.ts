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

    test("builds event URLs from the Django root", () => {
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

    test("keeps shared map filters and only adds bbox to map URL", () => {
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
                { id: "type-1", code: "public_health", label: "Public Health", profile_mode: "extension", profile_key: "public_health" },
            ]))
            .mockResolvedValueOnce(jsonResponse({
                profile_key: "public_health",
                dimensions: [
                    { id: "dimension-1", code: "field_of_action", label: "Handlungsfeld", selection_mode: "multiple", terms: [] },
                ],
            }));

        const events = useEventsStore();
        await events.loadEventTypes();
        const registry = await events.loadEventTaxonomy("public_health");

        expect(events.eventTypes[0].profile_key).toBe("public_health");
        expect(registry.dimensions[0].code).toBe("field_of_action");
        expect(fetchMock.mock.calls[0][0].toString()).toBe(
            "http://localhost:8000/api/v1/event-types/"
        );
        expect(fetchMock.mock.calls[1][0].toString()).toBe(
            "http://localhost:8000/api/v1/event-taxonomy/?profile_key=public_health"
        );
    });

    test("loads first page and appends cursor pages", async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse({
                next: "/api/v1/events/?cursor=next",
                previous: null,
                results: [{ id: "1", title: "One", summary: "", campaign: "c", event_type: "t", start_datetime: "2026-06-01T10:00:00Z", end_datetime: "2026-06-01T11:00:00Z", location_mode: "physical", status: "published", visibility: "public", series_id: null, series_name: "", occurrence_index: null, total_occurrences: null, is_exception: false, created_at: "2026-05-01T00:00:00Z" }],
            }))
            .mockResolvedValueOnce(jsonResponse({
                next: null,
                previous: "/api/v1/events/",
                results: [{ id: "2", title: "Two", summary: "", campaign: "c", event_type: "t", start_datetime: "2026-06-02T10:00:00Z", end_datetime: "2026-06-02T11:00:00Z", location_mode: "online", status: "published", visibility: "public", series_id: null, series_name: "", occurrence_index: null, total_occurrences: null, is_exception: false, created_at: "2026-05-02T00:00:00Z" }],
            }));

        const events = useEventsStore();
        await events.loadEvents();
        await events.loadMoreEvents();

        expect(events.events.map((event) => event.id)).toEqual(["1", "2"]);
        expect(fetchMock.mock.calls[0][0].toString()).toBe(
            "http://localhost:8000/api/v1/events/"
        );
        expect(fetchMock.mock.calls[1][0].toString()).toBe(
            "http://localhost:8000/api/v1/events/?cursor=next"
        );
    });

    test("loads map buckets and detail", async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse({
                spatial_events: { type: "FeatureCollection", features: [] },
                online_events: [{ id: "online-1", title: "Online", summary: "", campaign: "c", event_type: "t", start_datetime: "2026-06-01T10:00:00Z", end_datetime: "2026-06-01T11:00:00Z", location_mode: "online", status: "published", visibility: "public", series_id: null, series_name: "", occurrence_index: null, total_occurrences: null, is_exception: false }],
            }))
            .mockResolvedValueOnce(jsonResponse({
                id: "event-1",
                title: "Event",
                summary: "Summary",
                campaign: "campaign-1",
                event_type: "type-1",
                profile_key: "",
                profile: null,
                start_datetime: "2026-06-01T10:00:00Z",
                end_datetime: "2026-06-01T11:00:00Z",
                location_mode: "physical",
                status: "published",
                visibility: "public",
                series_id: null,
                series_name: "",
                occurrence_index: null,
                total_occurrences: null,
                is_exception: false,
                created_at: "2026-05-01T00:00:00Z",
                updated_at: "2026-05-02T00:00:00Z",
                context: null,
                location: null,
                venue_address: "",
                district: "",
                online_url: "",
                online_platform: "",
                access_notes: "",
                provider_name: "",
                provider_address: "",
                provider_phone: "",
                provider_email: "",
                provider_social: "",
                provider_url: "",
                language: [],
                language_note: "",
                lead_name: "",
                external_url: "",
                series: null,
                organizer: 1,
                taxonomy_assignments: [],
                layers: [],
                feature_links: [],
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
        expect(fetchMock.mock.calls[1][0].toString()).toBe(
            "http://localhost:8000/api/v1/events/event-1/"
        );
    });

    test("throws clear errors for failed responses", async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse("No events", {
            status: 500,
            statusText: "Server Error",
        }));

        await expect(useEventsStore().loadEvents()).rejects.toThrow(
            "Event request failed (500 Server Error): \"No events\""
        );
    });
});

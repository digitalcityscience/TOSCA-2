import { acceptHMRUpdate, defineStore } from "pinia";
import { ref } from "vue";
import {
    getBackendRootUrl,
    resolveBackendUrl,
    type GeoStoryEditorBlock,
    type GeoStoryLayerLink,
    type GeoStoryLayerSummary,
    type GeoStoryFeatureLink,
} from "./geostory";
import { type FeatureCollection, type Point } from "@helpers/geojson";

const EVENTS_API_PATH = "/api/v1/events";
const EVENT_SERIES_API_PATH = "/api/v1/event-series";

type LocationMode = "physical" | "online" | "hybrid" | "by_arrangement" | "home_visit";

export interface EventFilters {
    campaign_id?: string;
    event_type_id?: string;
    dimension_id?: string;
    term_id?: string;
    include_past?: boolean;
    start_after?: string;
    start_before?: string;
}

export interface EventListItem {
    id: string;
    title: string;
    summary: string;
    campaign: string;
    event_type: string;
    profile_key?: string;
    start_datetime: string;
    end_datetime: string;
    location_mode: LocationMode;
    status: string;
    visibility: string;
    series_id: string | null;
    series_name: string;
    occurrence_index: number | null;
    total_occurrences: number | null;
    is_exception: boolean;
    created_at: string;
}

export interface EventListResponse {
    next: string | null;
    previous: string | null;
    results: EventListItem[];
}

export interface EventMapProperties extends Omit<EventListItem, "created_at"> {
    online_url?: string;
    online_platform?: string;
}

export type EventSpatialFeatureCollection = FeatureCollection<Point, EventMapProperties>;

export interface EventMapOnlineItem extends EventMapProperties {
    id: string;
}

export interface EventMapResponse {
    spatial_events: EventSpatialFeatureCollection;
    online_events: EventMapOnlineItem[];
}

export interface EventContext {
    id: string;
    title: string;
    content: {
        blocks?: GeoStoryEditorBlock[];
    } | null;
}

export interface PublicHealthProfile {
    target_age_note: string;
    registration: "required" | "not_required" | "by_arrangement" | string;
    short_notice_possible: boolean;
    cost_amount_eur: string | null;
    reduced_amount_eur: string | null;
    subsidy_program: string;
    transit_note: string;
    insurance_eligible: boolean;
    referral_required: boolean;
}

export interface EventTaxonomyTerm {
    id: string;
    code: string;
    label: string;
    parent_id: string | null;
    is_active: boolean;
}

export interface EventTaxonomyAssignment {
    dimension_id: string;
    dimension_code: string;
    dimension_label: string;
    selection_mode: string;
    profile_key: string;
    term_ids: string[];
    terms: EventTaxonomyTerm[];
}

export interface EventSeriesOccurrenceLink {
    id: string;
    start_datetime: string;
}

export interface EventSeriesNavigation {
    id: string;
    name: string;
    occurrence_index: number | null;
    total_occurrences: number | null;
    is_exception: boolean;
    original_start_datetime: string | null;
    previous_occurrence: EventSeriesOccurrenceLink | null;
    next_occurrence: EventSeriesOccurrenceLink | null;
}

export interface EventDetail extends EventListItem {
    context: EventContext | null;
    profile_key: string;
    profile: PublicHealthProfile | null;
    location: string | null;
    venue_address: string;
    district: string;
    online_url: string;
    online_platform: string;
    access_notes: string;
    provider_name: string;
    provider_address: string;
    provider_phone: string;
    provider_email: string;
    provider_social: string;
    provider_url: string;
    language: string[];
    language_note: string;
    lead_name: string;
    external_url: string;
    series: EventSeriesNavigation | null;
    organizer: number;
    taxonomy_assignments: EventTaxonomyAssignment[];
    layers: GeoStoryLayerLink[];
    feature_links: GeoStoryFeatureLink[];
    updated_at: string;
}

export interface EventSeriesDetail {
    id: string;
    name: string;
    occurrences?: EventListItem[];
}

export function buildEventListUrl(filters: EventFilters = {}): URL {
    const url = new URL(`${EVENTS_API_PATH}/`, getBackendRootUrl());
    appendEventFilters(url, filters);
    return url;
}

export function buildEventMapUrl(
    filters: EventFilters = {},
    bbox?: [number, number, number, number]
): URL {
    const url = new URL(`${EVENTS_API_PATH}/map/`, getBackendRootUrl());
    appendEventFilters(url, filters);
    if (bbox !== undefined) {
        url.searchParams.set("bbox", bbox.join(","));
    }
    return url;
}

export function buildEventWithinUrl(): URL {
    return new URL(`${EVENTS_API_PATH}/within/`, getBackendRootUrl());
}

export function buildEventDetailUrl(eventId: string): URL {
    return new URL(
        `${EVENTS_API_PATH}/${encodeURIComponent(eventId)}/`,
        getBackendRootUrl()
    );
}

export function buildEventSeriesDetailUrl(seriesId: string): URL {
    return new URL(
        `${EVENT_SERIES_API_PATH}/${encodeURIComponent(seriesId)}/`,
        getBackendRootUrl()
    );
}

function appendEventFilters(url: URL, filters: EventFilters): void {
    Object.entries(filters).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") {
            return;
        }
        url.searchParams.set(key, String(value));
    });
}

async function fetchJson<T>(url: URL): Promise<T> {
    const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: new Headers({
            "Content-Type": "application/json",
        }),
    });

    if (!response.ok) {
        const body = await response.text();
        const message = body === "" ? response.statusText : body;
        throw new Error(
            `Event request failed (${response.status} ${response.statusText}): ${message}`
        );
    }

    return await response.json() as T;
}

export function getEventFeatureId(featureId: string | number | undefined, properties?: { id?: string }): string {
    return String(properties?.id ?? featureId ?? "");
}

export const useEventsStore = defineStore("events", () => {
    const events = ref<EventListItem[]>([]);
    const next = ref<string | null>(null);
    const previous = ref<string | null>(null);
    const spatialEvents = ref<EventSpatialFeatureCollection>({
        type: "FeatureCollection",
        features: [],
    });
    const onlineEvents = ref<EventMapOnlineItem[]>([]);
    const selectedEvent = ref<EventDetail>();
    const loadingList = ref(false);
    const loadingMap = ref(false);
    const loadingDetail = ref(false);
    const error = ref("");
    const filters = ref<EventFilters>({
        include_past: false,
    });

    function setFilters(nextFilters: EventFilters): void {
        filters.value = {
            ...filters.value,
            ...nextFilters,
        };
    }

    async function loadEvents(): Promise<void> {
        loadingList.value = true;
        error.value = "";
        try {
            const response = await fetchJson<EventListResponse>(
                buildEventListUrl(filters.value)
            );
            events.value = response.results;
            next.value = response.next;
            previous.value = response.previous;
        } catch (err) {
            error.value = String(err);
            throw err;
        } finally {
            loadingList.value = false;
        }
    }

    async function loadMoreEvents(): Promise<void> {
        if (next.value === null) {
            return;
        }

        loadingList.value = true;
        error.value = "";
        try {
            const response = await fetchJson<EventListResponse>(
                resolveBackendUrl(next.value)
            );
            events.value = [...events.value, ...response.results];
            next.value = response.next;
            previous.value = response.previous;
        } catch (err) {
            error.value = String(err);
            throw err;
        } finally {
            loadingList.value = false;
        }
    }

    async function loadEventMap(bbox?: [number, number, number, number]): Promise<void> {
        loadingMap.value = true;
        error.value = "";
        try {
            const response = await fetchJson<EventMapResponse>(
                buildEventMapUrl(filters.value, bbox)
            );
            spatialEvents.value = response.spatial_events;
            onlineEvents.value = response.online_events;
        } catch (err) {
            error.value = String(err);
            throw err;
        } finally {
            loadingMap.value = false;
        }
    }

    async function getEventDetail(eventId: string): Promise<EventDetail> {
        loadingDetail.value = true;
        error.value = "";
        try {
            const response = await fetchJson<EventDetail>(
                buildEventDetailUrl(eventId)
            );
            selectedEvent.value = response;
            return response;
        } catch (err) {
            error.value = String(err);
            throw err;
        } finally {
            loadingDetail.value = false;
        }
    }

    async function getSeriesDetail(seriesId: string): Promise<EventSeriesDetail> {
        return await fetchJson<EventSeriesDetail>(buildEventSeriesDetailUrl(seriesId));
    }

    return {
        events,
        next,
        previous,
        spatialEvents,
        onlineEvents,
        selectedEvent,
        loadingList,
        loadingMap,
        loadingDetail,
        error,
        filters,
        setFilters,
        loadEvents,
        loadMoreEvents,
        loadEventMap,
        getEventDetail,
        getSeriesDetail,
    };
});

export type EventLayerLink = {
    layer: GeoStoryLayerSummary;
    display_order: number;
};

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useEventsStore, import.meta.hot));
}

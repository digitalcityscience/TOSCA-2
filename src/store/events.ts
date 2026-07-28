import { acceptHMRUpdate, defineStore } from "pinia";
import { ref } from "vue";
import { type FeatureCollection, type Point } from "@helpers/geojson";
import {
    fetchBackendJson,
    getBackendRootUrl,
    resolveBackendUrl,
} from "./backend";
import {
    reportDeveloperError,
    serviceUnavailableMessage,
} from "@helpers/userFacingError";

export {
    getBackendRootUrl,
    resolveBackendUrl,
    resolveBackendMediaUrl,
} from "./backend";

const EVENTS_API_PATH = "/api/v1/events";
const EVENT_SERIES_API_PATH = "/api/v1/event-series";
const EVENT_TYPES_API_PATH = "/api/v1/event-types";
const EVENT_TAXONOMY_API_PATH = "/api/v1/event-taxonomy";

export type EventLocationMode =
    | "physical"
    | "online"
    | "hybrid"
    | "by_arrangement"
    | "home_visit";

export interface EventFilters {
    campaign_id?: string;
    event_type_id?: string;
    profile_key?: string;
    dimension_code?: string;
    term_code?: string;
    dimension_id?: string;
    term_id?: string;
    include_past?: boolean;
    start_after?: string;
    start_before?: string;
}

export interface EventTypeRegistryItem {
    id: string;
    code: string;
    label: string;
    profile_mode: "core" | "extension";
    profile_key: string;
}

export interface EventTaxonomyRegistryTerm {
    id: string;
    code: string;
    label: string;
    parent_id: string | null;
    is_active: boolean;
}

export interface EventTaxonomyRegistryDimension {
    id: string;
    code: string;
    label: string;
    selection_mode: "single" | "multiple";
    terms: EventTaxonomyRegistryTerm[];
}

export interface EventTaxonomyRegistry {
    profile_key: string;
    dimensions: EventTaxonomyRegistryDimension[];
}

export interface EventTaxonomyChipGroup {
    dimension_code: string;
    dimension_label: string;
    terms: Array<{
        code: string;
        label: string;
    }>;
}

export interface EventListItem {
    id: string;
    title: string;
    summary: string;
    campaign: string;
    event_type: string;
    profile_key?: string;
    taxonomy_assignments?: EventTaxonomyChipGroup[];
    start_datetime: string;
    end_datetime: string;
    location_mode: EventLocationMode;
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

export interface EventEditorBlock {
    id?: string;
    type: string;
    data?: Record<string, unknown>;
}

export interface EventContext {
    id: string;
    title: string;
    content: {
        blocks?: EventEditorBlock[];
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

export interface EventLayerSummary {
    id: string;
    name: string;
    workspace: {
        id: string;
        name: string;
    };
    geometry_type: string;
    srid: number;
    published_url: string;
    is_public: boolean;
    publishing_state: string;
}

export interface EventLayerLink {
    layer: EventLayerSummary;
    display_order: number;
}

export interface EventFeatureLink {
    id: string;
    target_content_type: number;
    target_object_id: string;
    target_type: string;
    link_type: string;
}

export interface EventDetail extends EventListItem {
    context: EventContext | null;
    profile_key: string;
    profile: PublicHealthProfile | null;
    location: unknown;
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
    layers: EventLayerLink[];
    feature_links: EventFeatureLink[];
    updated_at: string;
}

export interface EventSeriesDetail {
    id: string;
    name: string;
    occurrences?: EventListItem[];
}

export function buildEventTypesUrl(): URL {
    return new URL(`${EVENT_TYPES_API_PATH}/`, getBackendRootUrl());
}

export function buildEventTaxonomyUrl(profileKey = ""): URL {
    const url = new URL(`${EVENT_TAXONOMY_API_PATH}/`, getBackendRootUrl());
    if (profileKey !== "") {
        url.searchParams.set("profile_key", profileKey);
    }
    return url;
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
        if (key === "include_past" && value === false) {
            return;
        }
        url.searchParams.set(key, String(value));
    });
}

export function getEventFeatureId(
    featureId: string | number | undefined,
    properties?: { id?: string }
): string {
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
    const eventTypes = ref<EventTypeRegistryItem[]>([]);
    const taxonomyRegistriesByProfile = ref<Record<string, EventTaxonomyRegistry>>({});
    const loadingList = ref(false);
    const loadingMap = ref(false);
    const loadingDetail = ref(false);
    const loadingRegistries = ref(false);
    const error = ref("");
    const filters = ref<EventFilters>({
        include_past: false,
    });

    function setFilters(nextFilters: EventFilters): void {
        filters.value = {
            include_past: false,
            ...nextFilters,
        };
    }

    async function loadEventTypes(): Promise<void> {
        loadingRegistries.value = true;
        try {
            eventTypes.value = await fetchBackendJson<EventTypeRegistryItem[]>(
                buildEventTypesUrl(),
                "Event"
            );
        } catch (err) {
            reportDeveloperError("Loading event types", err);
            throw err;
        } finally {
            loadingRegistries.value = false;
        }
    }

    async function loadEventTaxonomy(profileKey = ""): Promise<EventTaxonomyRegistry> {
        if (taxonomyRegistriesByProfile.value[profileKey] !== undefined) {
            return taxonomyRegistriesByProfile.value[profileKey];
        }

        loadingRegistries.value = true;
        try {
            const registry = await fetchBackendJson<EventTaxonomyRegistry>(
                buildEventTaxonomyUrl(profileKey),
                "Event"
            );
            taxonomyRegistriesByProfile.value[profileKey] = registry;
            return registry;
        } catch (err) {
            reportDeveloperError(`Loading event taxonomy for ${profileKey || "all profiles"}`, err);
            throw err;
        } finally {
            loadingRegistries.value = false;
        }
    }

    async function loadEvents(): Promise<void> {
        loadingList.value = true;
        error.value = "";
        try {
            const allEvents: EventListItem[] = [];
            let pageUrl: URL | null = buildEventListUrl(filters.value);
            let lastPrevious: string | null = null;

            while (pageUrl !== null) {
                const response: EventListResponse = await fetchBackendJson<EventListResponse>(
                    pageUrl,
                    "Event"
                );
                allEvents.push(...response.results);
                lastPrevious = response.previous;
                pageUrl = response.next === null ? null : resolveBackendUrl(response.next);
            }

            events.value = allEvents;
            next.value = null;
            previous.value = lastPrevious;
        } catch (err) {
            error.value = serviceUnavailableMessage("event");
            reportDeveloperError("Loading events", err);
            throw err;
        } finally {
            loadingList.value = false;
        }
    }

    async function loadEventMap(bbox?: [number, number, number, number]): Promise<void> {
        loadingMap.value = true;
        try {
            const response = await fetchBackendJson<EventMapResponse>(
                buildEventMapUrl(filters.value, bbox),
                "Event"
            );
            spatialEvents.value = response.spatial_events;
            onlineEvents.value = response.online_events;
        } catch (err) {
            reportDeveloperError("Loading event map data", err);
            throw err;
        } finally {
            loadingMap.value = false;
        }
    }

    async function getEventDetail(eventId: string): Promise<EventDetail> {
        loadingDetail.value = true;
        try {
            const response = await fetchBackendJson<EventDetail>(
                buildEventDetailUrl(eventId),
                "Event"
            );
            selectedEvent.value = response;
            return response;
        } catch (err) {
            reportDeveloperError(`Loading event detail ${eventId}`, err);
            throw err;
        } finally {
            loadingDetail.value = false;
        }
    }

    async function getSeriesDetail(seriesId: string): Promise<EventSeriesDetail> {
        return await fetchBackendJson<EventSeriesDetail>(
            buildEventSeriesDetailUrl(seriesId),
            "Event"
        );
    }

    return {
        events,
        next,
        previous,
        spatialEvents,
        onlineEvents,
        selectedEvent,
        eventTypes,
        taxonomyRegistriesByProfile,
        loadingList,
        loadingMap,
        loadingDetail,
        loadingRegistries,
        error,
        filters,
        setFilters,
        loadEventTypes,
        loadEventTaxonomy,
        loadEvents,
        loadEventMap,
        getEventDetail,
        getSeriesDetail,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useEventsStore, import.meta.hot));
}

import { acceptHMRUpdate, defineStore } from "pinia";
import { computed, ref } from "vue";
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

// Administrative extent of Hamburg (west, south, east, north). Event map
// data is loaded once for this extent and clustered locally by MapLibre.
export const HAMBURG_EVENT_BBOX: [number, number, number, number] = [
    8.4205518,
    53.3951118,
    10.3252805,
    53.9646546,
];

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
    dimension_code?: string | string[];
    term_code?: string | string[];
    dimension_id?: string;
    term_id?: string;
    start_after?: string;
    start_before?: string;
}

// Events are only ever browsed forward from now. With no explicit
// start_before filter, a list refresh loads this many months ahead;
// further months are fetched on demand (calendar month navigation, the
// list view's "load more") rather than paginating through everything.
const DEFAULT_WINDOW_MONTHS = 2;

function addMonths(date: Date, months: number): Date {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result;
}

function startOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
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

export interface EventEditorContent {
    blocks: EventEditorBlock[];
}

export type EventContentSource = "event" | "series" | "empty";

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
    content: EventEditorContent;
    content_override: EventEditorContent | null;
    content_source: EventContentSource;
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
    default_content: EventEditorContent;
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
        if (Array.isArray(value)) {
            value.filter((item) => item !== "").forEach((item) => {
                url.searchParams.append(key, item);
            });
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
    const spatialEvents = ref<EventSpatialFeatureCollection>({
        type: "FeatureCollection",
        features: [],
    });
    const onlineEvents = ref<EventMapOnlineItem[]>([]);
    const selectedEvent = ref<EventDetail>();
    const eventTypes = ref<EventTypeRegistryItem[]>([]);
    const taxonomyRegistriesByProfile = ref<Record<string, EventTaxonomyRegistry>>({});
    const loadingList = ref(false);
    const loadingMore = ref(false);
    const loadingMap = ref(false);
    const loadingDetail = ref(false);
    const loadingRegistries = ref(false);
    const loadedMapRequestKey = ref("");
    const error = ref("");
    const filters = ref<EventFilters>({});
    let activeMapRequest: Promise<void> | undefined;
    let activeMapRequestKey = "";

    // Tracks how far ahead events have been loaded so calendar navigation
    // and "load more" can fetch just the next slice instead of refetching
    // everything. windowCap mirrors an explicit start_before filter: once
    // the user asks for a bounded range, that range is loaded in full and
    // there is nothing further to fetch on demand.
    const windowStart = ref<Date | null>(null);
    const windowCap = ref<Date | null>(null);
    const loadedRangeEnd = ref<Date | null>(null);
    const canLoadMore = computed(() => windowCap.value === null);
    let activeExtension: Promise<void> | undefined;

    function setFilters(nextFilters: EventFilters): void {
        filters.value = { ...nextFilters };
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

    async function fetchAllPages(requestFilters: EventFilters): Promise<EventListItem[]> {
        const results: EventListItem[] = [];
        let pageUrl: URL | null = buildEventListUrl(requestFilters);

        while (pageUrl !== null) {
            const response: EventListResponse = await fetchBackendJson<EventListResponse>(
                pageUrl,
                "Event"
            );
            results.push(...response.results);
            pageUrl = response.next === null ? null : resolveBackendUrl(response.next);
        }

        return results;
    }

    async function mergeEventsRange(rangeStart: Date, rangeEnd: Date): Promise<void> {
        const requestFilters: EventFilters = {
            ...filters.value,
            start_after: rangeStart.toISOString(),
            start_before: rangeEnd.toISOString(),
        };
        const fetched = await fetchAllPages(requestFilters);
        events.value = [...events.value, ...fetched];
        loadedRangeEnd.value = rangeEnd;
    }

    function loadedWindowFilters(): EventFilters {
        return {
            ...filters.value,
            start_after: windowStart.value?.toISOString() ?? filters.value.start_after,
            start_before: loadedRangeEnd.value?.toISOString() ?? filters.value.start_before,
        };
    }

    async function syncLoadedEventMap(): Promise<void> {
        if (activeMapRequest === undefined && loadedMapRequestKey.value === "") {
            return;
        }
        // Map availability must not turn a successfully loaded event list into
        // an error. loadEventMap logs its own failure and remains retryable.
        await loadEventMap().catch(() => undefined);
    }

    async function loadEvents(): Promise<void> {
        loadingList.value = true;
        error.value = "";
        try {
            events.value = [];
            const start = filters.value.start_after !== undefined
                ? new Date(filters.value.start_after)
                : new Date();
            const cap = filters.value.start_before !== undefined
                ? new Date(filters.value.start_before)
                : null;
            windowStart.value = start;
            windowCap.value = cap;
            loadedRangeEnd.value = start;

            // Aligned to calendar months, not "N months from today": e.g.
            // on Sep 7 this loads through Oct 31, not through Nov 7.
            const initialTarget = cap ?? startOfMonth(addMonths(startOfMonth(start), DEFAULT_WINDOW_MONTHS));
            await mergeEventsRange(start, initialTarget);
            await syncLoadedEventMap();
        } catch (err) {
            error.value = serviceUnavailableMessage("event");
            reportDeveloperError("Loading events", err);
            throw err;
        } finally {
            loadingList.value = false;
        }
    }

    // Extends the loaded window forward to cover `target`, fetching only
    // the missing slice. No-ops if `target` is already covered, or clamps
    // to windowCap when the user has an explicit start_before filter set.
    async function ensureEventsThrough(target: Date): Promise<void> {
        if (activeExtension !== undefined) {
            await activeExtension.catch(() => undefined);
        }

        const cappedTarget = windowCap.value !== null && target.getTime() > windowCap.value.getTime()
            ? windowCap.value
            : target;
        if (loadedRangeEnd.value !== null && cappedTarget.getTime() <= loadedRangeEnd.value.getTime()) {
            return;
        }

        loadingMore.value = true;
        error.value = "";
        const rangeStart = loadedRangeEnd.value ?? windowStart.value ?? new Date();
        const request = mergeEventsRange(rangeStart, cappedTarget);
        activeExtension = request;
        try {
            await request;
            await syncLoadedEventMap();
        } catch (err) {
            error.value = serviceUnavailableMessage("event");
            reportDeveloperError("Loading more events", err);
            throw err;
        } finally {
            loadingMore.value = false;
            activeExtension = undefined;
        }
    }

    async function loadMoreEvents(): Promise<void> {
        const base = loadedRangeEnd.value ?? windowStart.value ?? new Date();
        await ensureEventsThrough(startOfMonth(addMonths(base, 1)));
    }

    async function loadEventMap(): Promise<void> {
        const requestUrl = buildEventMapUrl(loadedWindowFilters(), HAMBURG_EVENT_BBOX);
        const requestKey = requestUrl.toString();
        if (loadedMapRequestKey.value === requestKey) {
            return;
        }
        if (activeMapRequest !== undefined && activeMapRequestKey === requestKey) {
            return await activeMapRequest;
        }

        loadingMap.value = true;
        activeMapRequestKey = requestKey;
        const request = fetchEventMap(requestUrl, requestKey);
        activeMapRequest = request;
        try {
            await request;
        } finally {
            if (activeMapRequest === request) {
                activeMapRequest = undefined;
                activeMapRequestKey = "";
                loadingMap.value = false;
            }
        }
    }

    async function fetchEventMap(requestUrl: URL, requestKey: string): Promise<void> {
        try {
            const response = await fetchBackendJson<EventMapResponse>(requestUrl, "Event");
            if (activeMapRequestKey !== requestKey) {
                return;
            }
            spatialEvents.value = response.spatial_events;
            onlineEvents.value = response.online_events;
            loadedMapRequestKey.value = requestKey;
        } catch (err) {
            reportDeveloperError("Loading event map data", err);
            throw err;
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
        spatialEvents,
        onlineEvents,
        selectedEvent,
        eventTypes,
        taxonomyRegistriesByProfile,
        loadingList,
        loadingMore,
        loadingMap,
        loadingDetail,
        loadingRegistries,
        canLoadMore,
        error,
        filters,
        setFilters,
        loadEventTypes,
        loadEventTaxonomy,
        loadEvents,
        ensureEventsThrough,
        loadMoreEvents,
        loadEventMap,
        getEventDetail,
        getSeriesDetail,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useEventsStore, import.meta.hot));
}

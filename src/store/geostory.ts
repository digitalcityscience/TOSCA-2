import { acceptHMRUpdate, defineStore } from "pinia";
import { ref } from "vue";

const STORIES_API_PATH = "/api/v1/stories";

function trimTrailingSlash(value: string): string {
    return value.replace(/\/+$/, "");
}

function normalizeRootUrl(value: string): string {
    const trimmedValue = trimTrailingSlash(value.trim());
    if (trimmedValue === "") {
        return "";
    }
    if (/^https?:\/\//i.test(trimmedValue)) {
        return trimmedValue;
    }

    throw new Error(
        `VITE_BACKEND_ROOT_URL must be an absolute URL including protocol, for example http://localhost:8000. Received: ${value}`
    );
}

function getEnvValue(key: string): string {
    return String(import.meta.env[key] ?? "").trim();
}

export function getBackendRootUrl(): string {
    const backendRoot = normalizeRootUrl(getEnvValue("VITE_BACKEND_ROOT_URL"));
    if (backendRoot !== "") {
        return backendRoot;
    }

    const geonodeRestUrl = normalizeRootUrl(getEnvValue("VITE_GEONODE_REST_URL"));
    if (geonodeRestUrl !== "") {
        return geonodeRestUrl.replace(/\/api$/, "");
    }

    return trimTrailingSlash(window.location.origin);
}

export function buildStoryListUrl(): URL {
    return new URL(`${STORIES_API_PATH}/`, getBackendRootUrl());
}

export function buildStoryDetailUrl(storyId: string): URL {
    return new URL(
        `${STORIES_API_PATH}/${encodeURIComponent(storyId)}/`,
        getBackendRootUrl()
    );
}

export function resolveBackendUrl(urlOrPath: string): URL {
    return new URL(urlOrPath, getBackendRootUrl());
}

export function resolveBackendMediaUrl(url?: string | null): string | undefined {
    if (url === undefined || url === null || url === "") {
        return undefined;
    }

    return resolveBackendUrl(url).toString();
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
            `GeoStory request failed (${response.status} ${response.statusText}): ${message}`
        );
    }

    return await response.json() as T;
}

export interface GeoStoryListItem {
    id: string;
    title: string;
    summary: string;
    hero_image_url: string | null;
    hero_image_alt: string;
    campaign: string;
    created_at: string;
}

export interface GeoStoryListResponse {
    next: string | null;
    previous: string | null;
    results: GeoStoryListItem[];
}

export interface GeoStoryEditorContent {
    blocks?: GeoStoryEditorBlock[];
}

export interface GeoStoryEditorBlock {
    type: string;
    data?: Record<string, any>;
}

export interface GeoStoryContext {
    id: string;
    title: string;
    content: GeoStoryEditorContent | null;
}

export interface GeoStoryLayerSummary {
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

export interface GeoStoryLayerLink {
    layer: GeoStoryLayerSummary;
    display_order: number;
}

export interface GeoStoryFeatureLink {
    id: string;
    target_content_type: number;
    target_object_id: string;
    target_type: string;
    link_type: string;
}

export interface GeoStoryDetail extends GeoStoryListItem {
    status: string;
    context: GeoStoryContext | null;
    layers: GeoStoryLayerLink[];
    feature_links: GeoStoryFeatureLink[];
    updated_at: string;
}

export const useGeostoryStore = defineStore("geostory", () => {
    const stories = ref<GeoStoryListItem[]>([]);
    const next = ref<string | null>(null);
    const previous = ref<string | null>(null);
    const loadingList = ref(false);
    const loadingDetail = ref(false);
    const error = ref("");
    const selectedStory = ref<GeoStoryDetail>();

    async function loadStories(): Promise<void> {
        loadingList.value = true;
        error.value = "";
        try {
            const response = await fetchJson<GeoStoryListResponse>(buildStoryListUrl());
            stories.value = response.results;
            next.value = response.next;
            previous.value = response.previous;
        } catch (err) {
            error.value = String(err);
            throw err;
        } finally {
            loadingList.value = false;
        }
    }

    async function loadMoreStories(): Promise<void> {
        if (next.value === null) {
            return;
        }

        loadingList.value = true;
        error.value = "";
        try {
            const response = await fetchJson<GeoStoryListResponse>(
                resolveBackendUrl(next.value)
            );
            stories.value = [...stories.value, ...response.results];
            next.value = response.next;
            previous.value = response.previous;
        } catch (err) {
            error.value = String(err);
            throw err;
        } finally {
            loadingList.value = false;
        }
    }

    async function getStoryDetail(storyId: string): Promise<GeoStoryDetail> {
        loadingDetail.value = true;
        error.value = "";
        try {
            const response = await fetchJson<GeoStoryDetail>(
                buildStoryDetailUrl(storyId)
            );
            selectedStory.value = response;
            return response;
        } catch (err) {
            error.value = String(err);
            throw err;
        } finally {
            loadingDetail.value = false;
        }
    }

    return {
        stories,
        next,
        previous,
        loadingList,
        loadingDetail,
        error,
        selectedStory,
        loadStories,
        loadMoreStories,
        getStoryDetail,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useGeostoryStore, import.meta.hot));
}

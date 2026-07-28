import { acceptHMRUpdate, defineStore } from "pinia";
import { ref } from "vue";
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
    resolveBackendMediaUrl,
    resolveBackendUrl,
} from "./backend";

const STORIES_API_PATH = "/api/v1/stories";

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
    id?: string;
    type: string;
    data?: Record<string, unknown>;
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

export function buildStoryListUrl(): URL {
    return new URL(`${STORIES_API_PATH}/`, getBackendRootUrl());
}

export function buildStoryDetailUrl(storyId: string): URL {
    return new URL(
        `${STORIES_API_PATH}/${encodeURIComponent(storyId)}/`,
        getBackendRootUrl()
    );
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
            const response = await fetchBackendJson<GeoStoryListResponse>(
                buildStoryListUrl(),
                "GeoStory"
            );
            stories.value = response.results;
            next.value = response.next;
            previous.value = response.previous;
        } catch (err) {
            error.value = serviceUnavailableMessage("GeoStory");
            reportDeveloperError("Loading GeoStories", err);
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
            const response = await fetchBackendJson<GeoStoryListResponse>(
                resolveBackendUrl(next.value),
                "GeoStory"
            );
            stories.value = [...stories.value, ...response.results];
            next.value = response.next;
            previous.value = response.previous;
        } catch (err) {
            error.value = serviceUnavailableMessage("GeoStory");
            reportDeveloperError("Loading more GeoStories", err);
            throw err;
        } finally {
            loadingList.value = false;
        }
    }

    async function getStoryDetail(storyId: string): Promise<GeoStoryDetail> {
        loadingDetail.value = true;
        try {
            const response = await fetchBackendJson<GeoStoryDetail>(
                buildStoryDetailUrl(storyId),
                "GeoStory"
            );
            selectedStory.value = response;
            return response;
        } catch (err) {
            reportDeveloperError(`Loading GeoStory detail ${storyId}`, err);
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

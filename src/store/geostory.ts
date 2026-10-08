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
import type {
    CatalogGroupStyleLayer,
    CatalogLayerGroupManifest,
    CatalogProvider,
} from "./geoserver";

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
    about_author: string;
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
    blocks: GeoStoryEditorBlock[];
}

export interface GeoStoryEditorBlock {
    id?: string;
    type: string;
    data?: Record<string, unknown>;
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
    /** WGS84 extent reported by GeoServer; `null` until the layer was synced. */
    bounds?: GeoStoryBounds | null;
    published_url: string;
    is_public: boolean;
    publishing_state: string;
    sync_state?: string;
}

export interface GeoStoryStyleAssignment {
    attributes?: import("./geoserver").PopupAttributeDefinition[];
    id: string;
    style_id: string;
    name: string;
    qualified_name: string;
    role: "default" | "alternate";
    format: "mbstyle" | "sld";
    style_layer_ids: string[];
}

/**
 * Story-level layer link from before map scenes.
 *
 * @deprecated The backend sends it only for clients that predate scenes and
 * removes it in backend Task 10.9; render `GeoStoryDetail.scenes` instead.
 */
export interface GeoStoryLayerLink {
    layer: GeoStoryLayerSummary;
    style_assignment: GeoStoryStyleAssignment | null;
    display_order: number;
}

/** `[west, south, east, north]` in EPSG:4326. */
export type GeoStoryBounds = [number, number, number, number];

/** Content block marking where the map switches to a scene. Renders nothing. */
export interface GeoStoryMapSceneBlock extends GeoStoryEditorBlock {
    type: "mapScene";
    data: {
        scene_id: string;
    };
}

/**
 * Captured map view of a scene.
 *
 * @remarks
 * `center`, `zoom` and `bounds` may all be `null`: such a scene fits the map
 * to its layers (the union of `layers[].layer.bounds`).
 */
export interface GeoStorySceneCamera {
    /** `[lng, lat]` */
    center: [number, number] | null;
    zoom: number | null;
    bearing: number;
    pitch: number;
    bounds: GeoStoryBounds | null;
}

export interface GeoStorySceneTransition {
    /** MapLibre `flyTo`, `easeTo` or `jumpTo`. */
    type: "fly" | "ease" | "jump";
    duration_ms: number;
}

export type GeoStoryFeatureMode = "all" | "only" | "highlight";

export interface GeoStorySceneFeatures {
    mode: GeoStoryFeatureMode;
    /** Attribute whose values identify the selected features. */
    attribute: string | null;
    /** Attribute values, typed as in the vector tiles. */
    ids: Array<string | number>;
}

/** Layer summary inside a scene; carries its provider for catalog lookups. */
export interface GeoStorySceneLayerSummary extends GeoStoryLayerSummary {
    provider: CatalogProvider;
}

/** Descriptive metadata for one layer of a scene; drawing uses `render_layers`. */
export interface GeoStorySceneLayer {
    id: string;
    layer: GeoStorySceneLayerSummary;
    style_assignment: GeoStoryStyleAssignment | null;
    render_layer_ids: string[];
    /** Key into `GeoStoryDetail.map.sources`; `null` when the layer has no style. */
    source_key: string | null;
    display_order: number;
    opacity: number;
    features: GeoStorySceneFeatures;
}

export interface GeoStorySceneLegendEntry {
    scene_layer_id: string;
    layer_id: string;
    title: string;
    data_type: "VECTOR" | "RASTER";
    rendering: "vector-tiles" | "wms";
    style: {
        id: string;
        title: string;
    };
    /** GeoServer `GetLegendGraphic` PNG for this layer and style. */
    graphic_url: string;
}

/**
 * One captured map state of a story.
 *
 * @remarks
 * `render_layers` are MapLibre layer specifications, bottom to top, with opacity
 * and feature selection already applied. Each carries
 * `metadata["tosca:member-id"]` (the scene layer id), so a scene can be drawn as
 * a layer-group manifest with one member per scene layer.
 */
export interface GeoStoryScene {
    id: string;
    order: number;
    title: string;
    caption: string;
    camera: GeoStorySceneCamera;
    transition: GeoStorySceneTransition;
    layers: GeoStorySceneLayer[];
    render_layers: CatalogGroupStyleLayer[];
    /** Top-most layer first. */
    legend: GeoStorySceneLegendEntry[];
}

/** Sources, styles and sprites shared by every scene of a story. */
export interface GeoStoryMap {
    sources: CatalogLayerGroupManifest["sources"];
    styles: CatalogLayerGroupManifest["styles"];
    sprites: CatalogLayerGroupManifest["sprites"];
}

/** A `mapScene` anchor resolved against the story's scenes. */
export interface GeoStorySceneAnchor {
    sceneId: string;
    /** Index of the anchor block in `content.blocks`. */
    blockIndex: number;
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
    content: GeoStoryEditorContent;
    /** Ordered by `order`; see {@link sortedScenes}. */
    scenes: GeoStoryScene[];
    map: GeoStoryMap;
    /** @deprecated Removed by backend Task 10.9; use `scenes`. */
    layers?: GeoStoryLayerLink[];
    feature_links: GeoStoryFeatureLink[];
    updated_at: string;
}

export function isMapSceneBlock(block: GeoStoryEditorBlock): block is GeoStoryMapSceneBlock {
    return block.type === "mapScene" && typeof block.data?.scene_id === "string";
}

/** Scenes in display order, without mutating the story. */
export function sortedScenes(story: Pick<GeoStoryDetail, "scenes">): GeoStoryScene[] {
    return [...(story.scenes ?? [])].sort((a, b) => a.order - b.order);
}

/**
 * Anchors in content order, resolved against the story's scenes.
 *
 * @remarks
 * The backend guarantees each anchor points at one of the story's scenes, at
 * most once. This stays defensive anyway: anchors to unknown scenes and repeat
 * anchors for the same scene are skipped.
 */
export function getStoryAnchors(
    story: Pick<GeoStoryDetail, "content" | "scenes">
): GeoStorySceneAnchor[] {
    const sceneIds = new Set((story.scenes ?? []).map((scene) => scene.id));
    const seen = new Set<string>();
    const anchors: GeoStorySceneAnchor[] = [];
    (story.content?.blocks ?? []).forEach((block, blockIndex) => {
        if (!isMapSceneBlock(block)) return;
        const sceneId = block.data.scene_id;
        if (!sceneIds.has(sceneId) || seen.has(sceneId)) return;
        seen.add(sceneId);
        anchors.push({ sceneId, blockIndex });
    });
    return anchors;
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

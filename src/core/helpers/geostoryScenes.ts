import { resolveGroupPopupAttributes } from "./groupPopupAttributes";
import {
    buildCatalogResourceUrl,
    type CatalogLayerGroupManifest,
    type CatalogLayerGroupMember,
    type GeoserverRasterTypeLayerDetail,
    type GeoServerVectorTypeLayerDetail,
} from "@store/geoserver";
import type {
    GeoStoryBounds,
    GeoStoryDetail,
    GeoStoryScene,
    GeoStorySceneLayer,
} from "@store/geostory";

/**
 * Draw GeoStory scenes through the layer-group pipeline (`mapStore.addMapGroup`).
 *
 * @remarks
 * The backend builds scene `render_layers` and the story `map` block with the same
 * code as layer-group manifests, and tags every render layer with
 * `metadata["tosca:member-id"]` = scene layer id. A scene therefore maps onto a
 * group manifest with one member per drawn scene layer, which gives it the layer
 * listing entry, member legends, popups and opacity controls for free.
 */

export type CatalogLayerDetail = GeoServerVectorTypeLayerDetail | GeoserverRasterTypeLayerDetail;
type GroupStyles = CatalogLayerGroupManifest["styles"];

export interface SceneManifestInputs {
    /** Catalog details per layer id; a missing entry leaves the member without details. */
    detailsByLayerId?: ReadonlyMap<string, CatalogLayerDetail | undefined>;
    /** Styles with resolved popup attributes; defaults to `story.map.styles`. */
    styles?: GroupStyles;
}

/** Scene layers that are actually drawn (layers without a style have no render layers). */
export function drawnSceneLayers(scene: GeoStoryScene): GeoStorySceneLayer[] {
    return scene.layers.filter((sceneLayer) => {
        return sceneLayer.source_key !== null && sceneLayer.style_assignment !== null;
    });
}

/** Story sources referenced by a scene's render layers, in first-use order. */
export function sceneSourceKeys(scene: GeoStoryScene): string[] {
    const keys = scene.render_layers
        .map((layer) => layer.source)
        .filter((source): source is string => typeof source === "string");
    return [...new Set(keys)];
}

/** Style ids used by a scene's render layers. */
export function sceneStyleIds(scene: GeoStoryScene): string[] {
    const ids = scene.render_layers
        .map((layer) => layer.metadata?.["tosca:style-id"])
        .filter((id): id is string => typeof id === "string");
    return [...new Set(ids)];
}

/** Provider-scoped catalog resource URL for a scene layer. */
export function sceneLayerResourceHref(sceneLayer: GeoStorySceneLayer): string {
    const { layer } = sceneLayer;
    return buildCatalogResourceUrl(layer.provider.id, layer.workspace.name, layer.name).toString();
}

/**
 * Convert one scene into a layer-group manifest for `mapStore.addMapGroup`.
 *
 * @returns `undefined` for a scene with nothing to draw (`addMapGroup` rejects
 * empty manifests).
 */
export function sceneToGroupManifest(
    story: Pick<GeoStoryDetail, "title" | "map">,
    scene: GeoStoryScene,
    inputs: SceneManifestInputs = {}
): CatalogLayerGroupManifest | undefined {
    const drawn = drawnSceneLayers(scene);
    if (drawn.length === 0 || scene.render_layers.length === 0) return undefined;

    const legendBySceneLayer = new Map(scene.legend.map((entry) => [entry.scene_layer_id, entry]));
    const members: CatalogLayerGroupMember[] = drawn.map((sceneLayer) => {
        const { layer } = sceneLayer;
        const legend = legendBySceneLayer.get(sceneLayer.id);
        const assignment = sceneLayer.style_assignment!;
        const details = inputs.detailsByLayerId?.get(layer.id);
        return {
            id: sceneLayer.id,
            layer_id: layer.id,
            name: layer.name,
            title: legend?.title ?? layer.name,
            layer_title: legend?.title ?? layer.name,
            source_alias: sceneLayer.source_key!,
            source_key: sceneLayer.source_key!,
            order: sceneLayer.display_order,
            data_type: legend?.data_type ?? "VECTOR",
            geometry_type: layer.geometry_type,
            style_assignment: {
                id: assignment.id,
                style_id: assignment.style_id,
                style_layer_ids: assignment.style_layer_ids,
                ...(assignment.attributes === undefined ? {} : { attributes: assignment.attributes }),
            },
            render_layer_ids: sceneLayer.render_layer_ids,
            effective_style_layer_ids: sceneLayer.render_layer_ids,
            resource_href: sceneLayerResourceHref(sceneLayer),
            ...(details === undefined ? {} : { details }),
        };
    });

    const dataTypes = new Set(members.map((member) => member.data_type));
    const styles = inputs.styles ?? story.map.styles;
    const usedStyleIds = new Set(sceneStyleIds(scene));
    const firstLayer = drawn[0].layer;

    return {
        id: scene.id,
        name: scene.title,
        title: scene.title || story.title,
        description: scene.caption,
        composition: dataTypes.size > 1 ? "MIXED" : [...dataTypes][0],
        legend: null,
        warnings: [],
        // A group renders against one provider; scenes in practice use one
        // engine. Members keep their own provider through `details.catalog`.
        workspace: { ...firstLayer.workspace },
        provider: firstLayer.provider,
        members,
        sources: Object.fromEntries(
            sceneSourceKeys(scene)
                .filter((key) => story.map.sources[key] !== undefined)
                .map((key) => [key, story.map.sources[key]])
        ),
        layers: scene.render_layers,
        sprites: Object.fromEntries(
            Object.entries(story.map.sprites).filter(([spriteId]) => {
                return [...usedStyleIds].some((styleId) => styles[styleId]?.sprite_id === spriteId);
            })
        ),
        styles: Object.fromEntries(
            Object.entries(styles).filter(([styleId]) => usedStyleIds.has(styleId))
        ),
    };
}

export interface SceneCatalogStore {
    getLayerDetail: (url: string) => Promise<CatalogLayerDetail>;
    getLayerStyling: (url: string) => Promise<unknown>;
}

export interface GeoStorySceneLoaderOptions {
    /** Called once per layer whose catalog detail could not be loaded. */
    onLayerError?: (error: unknown, sceneLayer: GeoStorySceneLayer) => void;
}

export interface GeoStorySceneLoader {
    /** Group manifest for a scene, or `undefined` when the scene draws nothing. */
    manifestFor: (scene: GeoStoryScene) => Promise<CatalogLayerGroupManifest | undefined>;
}

/**
 * Build scene manifests for one story, loading catalog details and popup
 * attributes once per layer / style for the story's lifetime.
 *
 * @remarks
 * A layer whose catalog detail fails to load is still drawn: its member simply
 * has no `details` (popups, attribute table and filters are unavailable for it).
 * The failure is reported once through `onLayerError`.
 */
export function createGeoStorySceneLoader(
    story: Pick<GeoStoryDetail, "title" | "map">,
    catalog: SceneCatalogStore,
    options: GeoStorySceneLoaderOptions = {}
): GeoStorySceneLoader {
    const details = new Map<string, Promise<CatalogLayerDetail | undefined>>();
    const resolvedStyles = new Map<string, Promise<GroupStyles[string]>>();

    function loadDetail(sceneLayer: GeoStorySceneLayer): Promise<CatalogLayerDetail | undefined> {
        const layerId = sceneLayer.layer.id;
        let pending = details.get(layerId);
        if (pending === undefined) {
            pending = catalog.getLayerDetail(sceneLayerResourceHref(sceneLayer)).catch((error: unknown) => {
                options.onLayerError?.(error, sceneLayer);
                return undefined;
            });
            details.set(layerId, pending);
        }
        return pending;
    }

    function resolveStyle(styleId: string): Promise<GroupStyles[string]> | undefined {
        const style = story.map.styles[styleId];
        if (style === undefined) return undefined;
        let pending = resolvedStyles.get(styleId);
        if (pending === undefined) {
            pending = resolveGroupPopupAttributes({ [styleId]: style }, catalog.getLayerStyling)
                .then((resolved) => resolved[styleId]);
            resolvedStyles.set(styleId, pending);
        }
        return pending;
    }

    async function manifestFor(scene: GeoStoryScene): Promise<CatalogLayerGroupManifest | undefined> {
        const drawn = drawnSceneLayers(scene);
        if (drawn.length === 0 || scene.render_layers.length === 0) return undefined;

        const [detailEntries, styleEntries] = await Promise.all([
            Promise.all(drawn.map(async (sceneLayer) => {
                return [sceneLayer.layer.id, await loadDetail(sceneLayer)] as const;
            })),
            Promise.all(sceneStyleIds(scene).map(async (styleId) => {
                return [styleId, await resolveStyle(styleId)] as const;
            })),
        ]);

        const styles: GroupStyles = { ...story.map.styles };
        for (const [styleId, style] of styleEntries) {
            if (style !== undefined) styles[styleId] = style;
        }
        return sceneToGroupManifest(story, scene, {
            detailsByLayerId: new Map(detailEntries),
            styles,
        });
    }

    return { manifestFor };
}

/** Union of the drawn layers' extents, for "fit to layers" scenes. */
export function sceneLayersBounds(scene: GeoStoryScene): GeoStoryBounds | undefined {
    const boxes = drawnSceneLayers(scene)
        .map((sceneLayer) => sceneLayer.layer.bounds)
        .filter((bounds): bounds is GeoStoryBounds => Array.isArray(bounds) && bounds.length === 4);
    if (boxes.length === 0) return undefined;
    return [
        Math.min(...boxes.map((box) => box[0])),
        Math.min(...boxes.map((box) => box[1])),
        Math.max(...boxes.map((box) => box[2])),
        Math.max(...boxes.map((box) => box[3])),
    ];
}

export const SCENE_FIT_PADDING = 40;

/** One MapLibre camera call that brings the map to a scene. */
export type SceneCameraMove =
    | {
        method: "flyTo" | "easeTo" | "jumpTo";
        options: {
            center: [number, number];
            zoom: number;
            bearing: number;
            pitch: number;
            duration?: number;
        };
    }
    | {
        method: "fitBounds";
        bounds: [[number, number], [number, number]];
        options: {
            padding: number;
            bearing: number;
            pitch: number;
            duration: number;
        };
    };

/**
 * How to move the camera to a scene, or `undefined` to keep the current view.
 *
 * @remarks
 * A captured camera uses the scene's transition (`fly` / `ease` / `jump`). A scene
 * without a center fits its captured `bounds`, else the union of its layers'
 * extents; an empty scene without a camera keeps the current view. Reduced
 * motion always jumps (and fits without animation).
 */
export function sceneCameraMove(
    scene: GeoStoryScene,
    { reducedMotion = false }: { reducedMotion?: boolean } = {}
): SceneCameraMove | undefined {
    const { camera, transition } = scene;
    const animate = !reducedMotion && transition.type !== "jump";
    if (camera.center !== null && camera.zoom !== null) {
        const options = {
            center: camera.center,
            zoom: camera.zoom,
            bearing: camera.bearing,
            pitch: camera.pitch,
        };
        if (!animate) return { method: "jumpTo", options };
        return {
            method: transition.type === "ease" ? "easeTo" : "flyTo",
            options: { ...options, duration: transition.duration_ms },
        };
    }
    const bounds = camera.bounds ?? sceneLayersBounds(scene);
    if (bounds === undefined) return undefined;
    return {
        method: "fitBounds",
        bounds: [[bounds[0], bounds[1]], [bounds[2], bounds[3]]],
        options: {
            padding: SCENE_FIT_PADDING,
            bearing: camera.bearing,
            pitch: camera.pitch,
            duration: animate ? transition.duration_ms : 0,
        },
    };
}

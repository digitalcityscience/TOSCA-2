import { defineStore, acceptHMRUpdate } from "pinia";
import { ref, shallowRef } from "vue";
import {
    type CatalogLayerGroupManifest,
    type CatalogGroupStyleLayer,
    type GeoserverRasterTypeLayerDetail,
    type GeoServerVectorTypeLayerDetail,
    type PopupAttributeFeature,
} from "./geoserver";
import { type SourceSpecification, type AddLayerObject } from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { type PickingInfo, type FilterContext } from "@deck.gl/core";
import { Tile3DLayer } from "@deck.gl/geo-layers";
import { Tiles3DLoader } from "@loaders.gl/3d-tiles";
import { getDistanceScales, lngLatToWorld } from "@math.gl/web-mercator";
import { Matrix4 } from "@math.gl/core";
import { getRandomHexColor, isNullOrEmpty } from "../core/helpers/functions";
import { type FeatureCollection } from "@helpers/geojson";
import { type MapStyleLegendContext } from "@helpers/mapStyleLegend";
import { isEditableMapStyleColorProperty } from "@helpers/mapStyleEditing";
import { validateSpriteUrl } from "@helpers/mapStyleBundle";
import { useToast } from "@helpers/toast";

/**
 * Tile3DLayer's own `filterSubLayer` skips rendering a tile for the *picking*
 * pass whenever its aggregate content origin projects more than a quarter of
 * the viewport away from the picked point — a performance heuristic, not
 * configurable via props. With a pitched camera and tall buildings, a click
 * on the upper/side facade of a building can be screen-space-far from its
 * tile's (roughly ground-level) origin, so real geometry silently fails to
 * pick. Subclass to keep the normal tile-selection gate but skip that
 * picking-only distance cull.
 */
class PickableTile3DLayer extends Tile3DLayer {
    filterSubLayer(context: FilterContext): boolean {
        const { tile } = context.layer.props as unknown as {
            tile?: { selected?: boolean, viewportIds?: string[] }
        };
        if (tile?.selected !== true || tile.viewportIds?.includes(context.viewport.id) !== true) {
            return false;
        }
        return true;
    }
}

export interface LayerStyleOptions {
    paint?: Record<string, unknown>;
    layout?: Record<string, unknown>;
    filter?: unknown[];
    minzoom?: number;
    maxzoom?: number;
    visibility?: "none" | "visible";
}
export interface MapLayerStyleOption {
    id: string;
    name: string;
    title?: string;
    isDefault?: boolean;
    layers: CatalogGroupStyleLayer[];
    spriteUrl?: string;
}
export interface CustomAddLayerObject {
    id: string;
    source: string;
    sourceType: SourceType;
    type: LayerRenderType;
    "source-layer"?: string;
    paint?: Record<string, unknown>;
    layout?: Record<string, unknown>;
    filter?: unknown[];
    minzoom?: number;
    maxzoom?: number;
    filterLayer?: boolean;
    layerData?: FeatureCollection;
    displayName?: string;
    showOnLayerList?: boolean;
    keepOnTop?: boolean;
    companionLayerIds?: string[];
}
export interface LayerObjectWithAttributes extends CustomAddLayerObject {
    details?: GeoServerVectorTypeLayerDetail | GeoserverRasterTypeLayerDetail;
    workspaceName?: string;
    sourceProtocol?: "wms" | "wmts";
    /**
     * Currently selected time for a temporal raster layer. A single ISO 8601
     * instant or a "start/end" range. Mirrors the WMS TIME parameter so the UI
     * can render the active selection.
     */
    time?: string;
    logicalKind?: "layer" | "group";
    managedSourceIds?: string[];
    groupSourceIds?: Record<string, string>;
    groupManifest?: CatalogLayerGroupManifest;
    spriteRuntimeIds?: string[];
    mbStyleLayers?: CatalogLayerGroupManifest["layers"];
    mbStyleLegendContext?: MapStyleLegendContext;
    availableStyles?: MapLayerStyleOption[];
    activeStyleId?: string;
    /**
     * Which rendering pipeline owns this layer. Absent/"maplibre" means the id
     * is a real MapLibre style layer; "deckgl" means it only exists as an
     * entry in `deckLayerProps`, rendered through the interleaved deck.gl
     * overlay, and none of the MapLibre paint/layout calls apply to it.
     */
    renderer?: LayerRenderer;
    /** Source URL for a deck.gl `Tile3DLayer` (3D Tiles tileset.json). */
    tilesetUrl?: string;
}
type SourceType = "geojson" | "geoserver" | "deckgl";
export type LayerRenderer = "maplibre" | "deckgl";
export type MapLibreLayerTypes =
  | "fill"
  | "line"
  | "symbol"
  | "circle"
  | "heatmap"
  | "fill-extrusion"
  | "raster"
  | "hillshade"
  | "background";
/** MapLibre style-spec types, plus synthetic types for non-MapLibre renderers. */
export type LayerRenderType = MapLibreLayerTypes | "deckgl-tile3d";

interface BaseLayerParams {
    sourceType: SourceType;
    identifier: string;
    layerType: MapLibreLayerTypes;
    layerStyle?: LayerStyleOptions;
    displayName?: string;
    sourceIdentifier?: string;
    showOnLayerList?: boolean;
    keepOnTop?: boolean;
}
export interface GeoJSONLayerParams extends BaseLayerParams {
    sourceType: "geojson";
    geoJSONSrc: FeatureCollection;
    isFilterLayer: boolean;
    isDrawnLayer?: boolean;
}
interface GeoServerLayerParams extends BaseLayerParams {
    sourceType: "geoserver";
    geoserverLayerDetails:
    | GeoServerVectorTypeLayerDetail
    | GeoserverRasterTypeLayerDetail;
    sourceLayer?: string;
    sourceDataType: "vector" | "raster";
    sourceProtocol?: "wms" | "wmts";
    workspaceName?: string;
    time?: string;
}
export type LayerParams = GeoJSONLayerParams | GeoServerLayerParams;
export interface BaseDataSourceParams {
    sourceType: SourceType;
    identifier: string;
    isFilterLayer: boolean;
}
export interface GeoServerSourceParams extends BaseDataSourceParams {
    sourceType: "geoserver";
    workspaceName: string;
    layer: GeoServerVectorTypeLayerDetail | GeoserverRasterTypeLayerDetail;
    sourceDataType: "vector" | "raster";
    sourceProtocol?: "wms" | "wmts";
    /** Pinned GeoServer style name used for server-rendered raster tiles. */
    styleName?: string;
    /** Single ISO 8601 instant or "start/end" range for the WMS TIME param. */
    time?: string;
}
export interface GeoJSONSourceParams extends BaseDataSourceParams {
    sourceType: "geojson";
    geoJSONSrc: FeatureCollection;
}
export type SourceParams = GeoJSONSourceParams | GeoServerSourceParams;
let runtimeIdSequence = 0;

/** Create an insertion-scoped ID so catalog layers and group members never collide. */
export function createMapRuntimeId(kind: "layer" | "group", resourceId: string): string {
    runtimeIdSequence += 1;
    const safeResourceId = resourceId.replace(/[^a-zA-Z0-9_-]+/g, "-");
    return `${kind}:${safeResourceId}:${runtimeIdSequence}`;
}
/**
 * Builds a WMS GetMap tile URL for a raster source. MapLibre substitutes
 * `{bbox-epsg-3857}` per tile, so the URL is a tile template, not a one-shot
 * request. `time` is appended only when defined so callers can rely on the
 * GeoServer-side default behaviour when no selection has been made.
 */
function buildWmsRasterTileUrl(opts: {
    providerBaseUrl: string
    workspace: string
    layerName: string
    time?: string
    styleName?: string
}): string {
    const params = new URLSearchParams({
        REQUEST: "GetMap",
        SERVICE: "WMS",
        VERSION: "1.3.0",
        LAYERS: `${opts.workspace}:${opts.layerName}`,
        STYLES: opts.styleName ?? "",
        CRS: "EPSG:3857",
        WIDTH: "256",
        HEIGHT: "256",
        transparent: "true",
        format: "image/png",
        TILED: "true",
    });
    if (opts.time !== undefined && opts.time !== "") {
        params.set("TIME", opts.time);
    }
    // BBOX must stay unencoded so MapLibre can substitute its tile token.
    return `${opts.providerBaseUrl.replace(/\/+$/, "")}/wms?${params.toString()}&BBOX={bbox-epsg-3857}`;
}

function buildWmtsTileUrl(opts: {
    providerBaseUrl: string
    workspace: string
    layerName: string
    format: "image/png" | "application/vnd.mapbox-vector-tile"
    styleName?: string
}): string {
    const params = new URLSearchParams({
        REQUEST: "GetTile",
        SERVICE: "WMTS",
        VERSION: "1.0.0",
        LAYER: `${opts.workspace}:${opts.layerName}`,
        STYLE: opts.styleName ?? "",
        TILEMATRIX: "EPSG:900913:{z}",
        TILEMATRIXSET: "EPSG:900913",
        TILECOL: "{x}",
        TILEROW: "{y}",
        FORMAT: opts.format,
    });
    const query = params.toString().replace(
        /%7B([zxy])%7D/gi,
        (_match, coordinate: string) => `{${coordinate.toLowerCase()}}`
    );
    return `${opts.providerBaseUrl.replace(/\/+$/, "")}/gwc/service/wmts?${query}`;
}

function providerBaseUrl(
    detail: GeoServerVectorTypeLayerDetail | GeoserverRasterTypeLayerDetail
): string {
    return detail.catalog?.provider.base_url ??
        String(import.meta.env.VITE_GEOSERVER_BASE_URL ?? "").replace(/\/+$/, "");
}
export const useMapStore = defineStore("map", () => {
    const spriteRegistry = new Map<
        string,
        { runtimeId: string; references: number; loading?: Promise<void> }
    >();
    const toast = useToast();
    /**
   * Reference to the map instance, which will be assigned once a MapLibre map is initialized.
   * This will be used to interact with the MapLibre map for adding, removing, and manipulating layers and sources.
   */
    const map = shallowRef<any>();
    /**
   * An array containing detailed information about all the layers currently added to the map.
   * Each object in the array represents a layer with its attributes, such as its source type, display name, styling, etc.
   */
    const layersOnMap = ref<LayerObjectWithAttributes[]>([]);
    /**
   * Monotonic counter that is incremented on every MapLibre `styledata` event.
   * Vue computeds that read MapLibre paint/layout properties can dereference
   * this ref to opt into reactivity, since the MapLibre style object itself is
   * not a Vue ref.
   */
    const paintVersion = ref<number>(0);
    /** Reactive mirror of MapLibre's terrain state for terrain-sensitive UI. */
    const terrainEnabled = ref<boolean>(false);
    /**
   * The interleaved deck.gl overlay control, created lazily the first time a
   * deck.gl layer is added. `interleaved: true` lets deck.gl layers depth-sort
   * against MapLibre's own layers instead of always drawing on top of them.
   */
    const deckOverlay = shallowRef<MapboxOverlay>();
    /**
   * Props for every active deck.gl layer, keyed by the same `identifier` used
   * in `layersOnMap`. deck.gl layers are immutable, so a "prop update" (opacity,
   * visibility, z-order) rebuilds this map's entry and reinstantiates the
   * Layer from it in `syncDeckOverlay` — that is the normal deck.gl update
   * pattern, not a workaround.
   */
    const deckLayerProps = new Map<string, Record<string, unknown>>();
    /**
   * Rebuilds every deck.gl Layer instance from `deckLayerProps` and pushes them
   * to the overlay. Called after any add/remove/prop change.
   */
    function syncDeckOverlay(): void {
        if (deckOverlay.value === undefined) return;
        const layers = Array.from(deckLayerProps.values()).map(
            (props) => new PickableTile3DLayer(props)
        );
        deckOverlay.value.setProps({ layers });
    }
    /**
   * Lazily creates the interleaved deck.gl overlay and attaches it to the map.
   * Safe to call multiple times; only the first call has an effect.
   */
    function initializeDeckOverlay(): void {
        if (isNullOrEmpty(map.value) || deckOverlay.value !== undefined) return;
        const overlay = new MapboxOverlay({ interleaved: true, layers: [] });
        map.value.addControl(overlay);
        deckOverlay.value = overlay;
    }
    /**
   * Adds a 3D Tiles tileset (e.g. CityGML/CityJSON converted to 3D Tiles) as
   * an interleaved deck.gl layer, and registers a sidebar entry for it.
   *
   * @param {string} params.identifier - Unique layer id.
   * @param {string} params.tilesetUrl - URL of the tileset's root `tileset.json`.
   * @param {string} [params.displayName] - Optional display name for the sidebar.
   * @param {boolean} [params.showOnLayerList=true] - If true, shows in the sidebar.
   */
    function addDeckTilesetLayer(params: {
        identifier: string
        tilesetUrl: string
        displayName?: string
        showOnLayerList?: boolean
    }): void {
        if (isNullOrEmpty(map.value)) {
            throw new Error("There is no map to add layer");
        }
        const { identifier, tilesetUrl, displayName, showOnLayerList = true } = params;
        if (identifier === "") {
            throw new Error("Identifier is required to add layer");
        }
        initializeDeckOverlay();
        deckLayerProps.set(identifier, {
            id: identifier,
            data: tilesetUrl,
            loader: Tiles3DLoader,
            opacity: 1,
            visible: true,
            // "3d" (rather than plain true) enables depth-picking: the pick
            // result's `coordinate` is the real 3D point unprojected onto the
            // clicked surface, not a flat ray/plane approximation. We need
            // that accurate 3D point for CPU-side nearest-vertex matching —
            // see findNearestVertexBatchId — since b3dm content's GPU
            // picking-color index can't distinguish individual buildings.
            pickable: "3d",
        });
        syncDeckOverlay();
        const layerRecord: LayerObjectWithAttributes = {
            id: identifier,
            source: identifier,
            sourceType: "deckgl",
            type: "deckgl-tile3d",
            renderer: "deckgl",
            showOnLayerList,
            keepOnTop: false,
            displayName,
            tilesetUrl,
        };
        add2MapLayerList(layerRecord);
        // Buildings are meaningless from a straight-down view; tilt the camera
        // so the newly added 3D layer is actually visible.
        if (map.value.getPitch() < 30) {
            map.value.easeTo({ pitch: 60, duration: 800 });
        }
    }
    /** Removes a deck.gl layer from the overlay. Does not touch `layersOnMap`. */
    function removeDeckLayer(identifier: string): void {
        deckLayerProps.delete(identifier);
        syncDeckOverlay();
    }
    function setDeckLayerVisibility(identifier: string, visible: boolean): void {
        const props = deckLayerProps.get(identifier);
        if (props === undefined) return;
        deckLayerProps.set(identifier, { ...props, visible });
        syncDeckOverlay();
    }
    function setDeckLayerOpacity(identifier: string, opacity: number): void {
        const props = deckLayerProps.get(identifier);
        if (props === undefined) return;
        deckLayerProps.set(identifier, { ...props, opacity });
        syncDeckOverlay();
    }
    /**
   * Updates which MapLibre style layer a deck.gl layer should render
   * immediately below, mirroring MapLibre's own `moveLayer(id, beforeId)`
   * semantics so drag-reorder can interleave 3D layers between 2D ones.
   */
    function setDeckLayerBeforeId(identifier: string, beforeId?: string): void {
        const props = deckLayerProps.get(identifier);
        if (props === undefined) return;
        deckLayerProps.set(identifier, { ...props, beforeId });
        syncDeckOverlay();
    }
    /**
   * Picks every pickable deck.gl object under a click point (CSS pixel
   * coordinates, same space as MapLibre's `event.point`, since the overlay
   * is interleaved into the same canvas), mapped into the same
   * `PopupAttributeFeature` shape the vector/raster attribute popup uses.
   *
   * @param {{x: number, y: number}} point - Click point in canvas CSS pixels.
   */
    function pickDeckObjects(point: { x: number, y: number }): PopupAttributeFeature[] {
        if (deckOverlay.value === undefined) return [];
        let picks: PickingInfo[];
        try {
            picks = deckOverlay.value.pickMultipleObjects({
                x: point.x, y: point.y, radius: 5, depth: 5, unproject3D: true,
            });
        } catch (error) {
            console.error("deck.gl pick failed", error);
            return [];
        }
        return picks
            .filter((pick) => pick.picked && pick.layer !== null)
            .map((pick) => buildDeckPopupFeature(pick));
    }
    /**
   * Asynchronously adds a new data source to Maplibre map sources. The source can be either GeoJSON data or a Geoserver vector tile source.
   * @param {SourceParams} sourceParams - The parameters for the source to add.
   * @param {SourceType} params.sourceType - Specifies the type of the data source; either "geojson" or "geoserver".
   * @param {string} params.identifier - The unique identifier for the source to add.
   * @param {boolean} params.isFilterLayer - If true, the source is tagged as user-drawn data, which can be used as a filter layer for geometry filtering.
   * @param {string} [params.workspaceName] - The workspace name for the Geoserver source. Required only for Geoserver sources.
   * @param {GeoServerVectorTypeLayerDetail} [params.layer] - The layer details. Required only for Geoserver sources.
   * @param {FeatureCollection} [params.geoJSONSrc] - The GeoJSON data for the source. Required only for GeoJSON sources.
   * @returns {Promise<SourceSpecification>} A promise that resolves to the added source specification if successful, or rejects with an error.
   * @throws {Error} Throws an error if the map is not initialized, if required parameters are missing, or if adding the source fails.
   *
   * @example
   * ```typescript
   * // Adding a GeoJSON source
   * const geoJSONSourceParams: GeoJSONSourceParams = {
   *     sourceType: "geojson",
   *     identifier: "myGeoJSONSource",
   *     isFilterLayer: false,
   *     geoJSONSrc: myGeoJSONData
   * };
   * addMapDataSource(geoJSONSourceParams)
   *     .then(sourceSpec => console.log('GeoJSON source added:', sourceSpec))
   *     .catch(error => console.error('Error adding GeoJSON source:', error));
   *
   * // Adding a Geoserver source
   * const geoServerSourceParams: GeoServerSourceParams = {
   *     sourceType: "geoserver",
   *     identifier: "myGeoserverSource",
   *     isFilterLayer: false,
   *     workspaceName: "myWorkspace",
   *     layer: myGeoserverLayerDetails
   * };
   * addMapDataSource(geoServerSourceParams)
   *     .then(sourceSpec => console.log('Geoserver source added:', sourceSpec))
   *     .catch(error => console.error('Error adding Geoserver source:', error));
   * ```
   */
    async function addMapDataSource(
        params: SourceParams
    ): Promise<SourceSpecification> {
        const { sourceType, identifier } = params;
        if (isNullOrEmpty(map.value)) {
            throw new Error("There is no map to add source");
        }
        if (identifier === "") {
            throw new Error("Identifier is required to add source");
        }
        if (sourceType === "geoserver") {
            if (params.layer === undefined) {
                throw new Error("Layer information required to add geoserver sources");
            }
            if (params.workspaceName === undefined || params.workspaceName === "") {
                throw new Error("Workspace name required to add geoserver sources");
            }
            if (params.sourceProtocol !== undefined) {
                if (params.sourceProtocol === "wms") {
                    if (params.sourceDataType === "raster") {
                        map.value?.addSource(identifier, {
                            type: "raster",
                            tiles: [
                                buildWmsRasterTileUrl({
                                    providerBaseUrl: providerBaseUrl(params.layer),
                                    workspace: params.workspaceName,
                                    layerName: (params.layer as GeoserverRasterTypeLayerDetail).coverage.name,
                                    time: params.time,
                                    styleName: params.styleName,
                                }),
                            ],
                        });
                    }
                    if (params.sourceDataType === "vector") {
                        throw new Error(
                            "WMS cannot provide a MapLibre vector tile source."
                        );
                    }
                }
                if (params.sourceProtocol === "wmts") {
                    if (params.sourceDataType === "raster") {
                        map.value?.addSource(identifier, {
                            type: "raster",
                            tiles: [
                                buildWmtsTileUrl({
                                    providerBaseUrl: providerBaseUrl(params.layer),
                                    workspace: params.workspaceName,
                                    layerName: (params.layer as GeoserverRasterTypeLayerDetail).coverage.name,
                                    format: "image/png",
                                    styleName: params.styleName,
                                }),
                            ],
                            tileSize: 256,
                        });
                    }
                    if (params.sourceDataType === "vector") {
                        map.value?.addSource(identifier, {
                            type: "vector",
                            tiles: [
                                buildWmtsTileUrl({
                                    providerBaseUrl: providerBaseUrl(params.layer),
                                    workspace: params.workspaceName,
                                    layerName: (params.layer as GeoServerVectorTypeLayerDetail).featureType.name,
                                    format: "application/vnd.mapbox-vector-tile",
                                }),
                            ],
                        });
                    }
                }
            }
        }
        if (sourceType === "geojson") {
            if (params.geoJSONSrc === undefined) {
                throw new Error("GeoJSON data required to add GeoJSON sources");
            }
            map.value?.addSource(identifier, {
                type: "geojson",
                data: params.geoJSONSrc,
            });
        }
        const addedSource = map.value?.getSource(identifier);
        if (addedSource !== undefined) {
            console.log(`Source ${identifier} added successfully`);
            return addedSource as SourceSpecification;
        } else {
            throw new Error(`Couldn't add requested source: ${identifier}`);
        }
    }
    /**
   * Deletes a data source from the Maplibre map.
   * @param {string} identifier - The unique identifier for the source to delete.
   * @throws {Error} Throws an error if the map is not initialized or if the source cannot be found.
   */
    function deleteMapDataSource(identifier: string): void {
        if (isNullOrEmpty(map.value)) {
            throw new Error("There is no map to delete source from");
        }
        const source = map.value?.getSource(identifier);
        if (source === undefined) {
            throw new Error(`Source with identifier ${identifier} not found`);
        }
        map.value?.removeSource(identifier);
        console.log(`Source ${identifier} deleted successfully`);
    }
    /**
   * Asynchronously adds a new layer to a Maplibre map based on the provided parameters. This function supports adding
   * layers from GeoServer or GeoJSON data sources. It allows for customization of the layer's appearance through
   * Maplibre style options and can tag layers as filter layers for geometry filtering. It also allows for appearance of layer
   * on map layer list.
   *
   * @param {LayerParams} params - The parameters for adding the layer, encapsulated in an object.
   * @param {SourceType} params.sourceType - Specifies the type of the data source for the layer; either "geojson" or "geoserver".
   * @param {string} params.identifier - A unique identifier for the layer. This ID is used for adding, accessing, and manipulating the layer within the map instance.
   * @param {MapLibreLayerTypes} params.layerType - The type of the layer, determining how the source data is rendered (e.g., "circle", "line", "fill").
   * @param {LayerStyleOptions} [params.layerStyle] - Optional style options for customizing the appearance of the layer according to Maplibre's style specification.
   * @param {GeoServerVectorTypeLayerDetail} [params.geoserverLayerDetails] - Required for GeoServer sourced layers; includes details necessary for attribute listing.
   * @param {string} [params.sourceLayer] - Specifies the target layer within a vector tile source. Required for vector tile sources containing multiple layers.
   * @param {FeatureCollection} [params.geoJSONSrc] - GeoJSON data for the layer. Required if the source type is "geojson" and isFilterLayer is true.
   * @param {boolean} [params.isFilterLayer=false] - If true, marks the layer as a filter layer, which can be used for geometry filtering. Default is false.
   * @param {boolean} [params.isDrawnLayer] - If true, marks the layer as a user-drawn layer.
   * @param {string} [params.displayName] - Optional display name for the layer, used for UI purposes.
   * @param {string} [params.sourceIdentifier] - Optional source identifier if the source is already added to the map.
   * @param {boolean} [params.showOnLayerList=true] - If true, the layer will be shown in the layer list UI. Default is true.
   * @param {boolean} [params.keepOnTop=false] - If true, reorder operations keep this layer above visible user layers.
   * @returns {Promise<AddLayerObject | undefined>} A promise that resolves with the added layer object if the addition is successful, or rejects with an error message if it fails.
   * @throws {Error} Throws an error if the map is not initialized, if required parameters are missing, or if the layer cannot be added.
   */
    async function addMapLayer(
        params: LayerParams
    ): Promise<AddLayerObject | undefined> {
        const {
            sourceType,
            identifier,
            layerType,
            layerStyle,
            displayName,
            sourceIdentifier,
            showOnLayerList = true,
            keepOnTop = false,
        } = params;
        if (isNullOrEmpty(map.value)) {
            throw new Error("There is no map to add layer");
        }
        if (identifier === "") {
            throw new Error("Identifier is required to add layer");
        }
        // Additional validation for geoserver source type
        if (sourceType === "geoserver" && !("geoserverLayerDetails" in params)) {
            throw new Error("Layer details required to add geoserver layers");
        }
        // Additional validation for geojson source type
        if (sourceType === "geojson" && !("geoJSONSrc" in params)) {
            throw new Error("GeoJSON data required to add GeoJSON layers");
        }
        const styling = generateStyling(layerType, layerStyle);
        const source = sourceIdentifier ?? identifier;

        const layerObject: CustomAddLayerObject = {
            id: identifier,
            source,
            sourceType,
            type: layerType,
            showOnLayerList,
            keepOnTop,
            ...styling,
            // Conditional properties
            ...(sourceType === "geoserver" && params.sourceLayer != null
                ? { "source-layer": params.sourceLayer }
                : {}),
            ...(sourceType === "geojson" && params.isFilterLayer
                ? {
                    filterLayer: params.isFilterLayer,
                }
                : {}),
            ...(sourceType === "geojson" &&
      (params.isFilterLayer ||
        (params.isDrawnLayer !== undefined && params.isDrawnLayer))
                ? {
                    layerData: params.geoJSONSrc,
                }
                : {}),
            ...(displayName !== undefined && displayName !== ""
                ? { displayName }
                : {}),
        };
        // check if layer is raster type and add before vector layers
        let beforeId;
        let index;
        if (layerType === "raster") {
            const indexOfFirstVectorLayer = layersOnMap.value.findIndex((layer) => {
                return layer.type !== "raster";
            });
            if (indexOfFirstVectorLayer !== -1) {
                index = indexOfFirstVectorLayer;
            }
            // beforeId must reference a real MapLibre style layer. deck.gl
            // entries (renderer === "deckgl") only exist as interleaved
            // overlay layers, not in the style's own layer stack, so they
            // cannot anchor `addLayer`'s beforeId — skip past them.
            const firstAnchorableVectorLayer = layersOnMap.value.find((layer) => {
                return layer.type !== "raster" && layer.renderer !== "deckgl";
            });
            if (firstAnchorableVectorLayer !== undefined) {
                beforeId = firstAnchorableVectorLayer.id;
            }
        }
        // add layer object to map
        map.value?.addLayer(layerObject as AddLayerObject, beforeId);
        if (map.value?.getLayer(identifier) === undefined) {
            throw new Error(`Couldn't add requested layer: ${identifier}`);
        }
        if (sourceType === "geoserver") {
            (layerObject as LayerObjectWithAttributes).details =
                params.geoserverLayerDetails;
            if (params.workspaceName !== undefined) {
                (layerObject as LayerObjectWithAttributes).workspaceName =
                    params.workspaceName;
            }
            (layerObject as LayerObjectWithAttributes).sourceProtocol = params.sourceProtocol;
            (layerObject as LayerObjectWithAttributes).time = params.time;
        }
        add2MapLayerList(layerObject as LayerObjectWithAttributes, index);
        return map.value.getLayer(identifier) as AddLayerObject;
    }
    /**
   * Asynchronously deletes a layer from the Maplibre map.
   * @param {string} identifier - The unique identifier for the layer to delete.
   * @returns {Promise<void>} A promise that resolves if the layer is successfully deleted, or rejects with an error.
   * @throws {Error} Throws an error if the map is not initialized or if the layer cannot be found.
   */
    async function deleteMapLayer(
        identifier: string,
        information?: boolean
    ): Promise<void> {
        const record = layersOnMap.value.find((l) => l.id === identifier);
        if (record?.renderer === "deckgl") {
            removeDeckLayer(identifier);
            removeFromMapLayerList(identifier, information);
            return;
        }
        await new Promise<void>((resolve, reject) => {
            if (isNullOrEmpty(map.value)) {
                reject(new Error("There is no map to delete layer from"));
                return;
            }

            const layer = map.value?.getLayer(identifier);

            if (layer === undefined) {
                reject(new Error(`Layer with identifier ${identifier} not found`));
                return;
            }

            try {
                // Remove companions before the parent so a missing child
                // cannot poison the parent removal.
                const parentRecord = layersOnMap.value.find(
                    (l) => l.id === identifier
                );
                parentRecord?.companionLayerIds?.forEach((companionId) => {
                    if (map.value?.getLayer(companionId) !== undefined) {
                        try {
                            map.value.removeLayer(companionId);
                        } catch (err) {
                            console.error(
                                `Failed to remove companion ${companionId} of ${identifier}`,
                                err
                            );
                        }
                    }
                });
                map.value?.removeLayer(identifier);
                if (parentRecord?.logicalKind === "group") {
                    parentRecord.managedSourceIds?.forEach((sourceId) => {
                        if (map.value?.getSource(sourceId) !== undefined) {
                            map.value.removeSource(sourceId);
                        }
                    });
                }
                parentRecord?.spriteRuntimeIds?.forEach(releaseMapSprite);
                removeFromMapLayerList(identifier, information);
                resolve();
            } catch (error) {
                reject(
                    error instanceof Error
                        ? error
                        : new Error("Unknown map layer deletion error"),
                );
            }
        });
    }
    /**
   * Resets the map by deleting all layers and data sources.
   *
   * This function first retrieves a list of all the unique data sources used by the layers on the map.
   * It then proceeds to delete all the layers on the map, followed by deleting all the data sources.
   * Finally, it clears the `layersOnMap` array to ensure the layer list is up-to-date.
   *
   * @throws {Error} Throws an error if the map is not initialized.
   */
    async function resetMapData(information?: boolean): Promise<void> {
        if (isNullOrEmpty(map.value)) {
            throw new Error("There is no map to reset");
        }
        // Get a list of all layer sources before deleting the layers
        const layerSources = new Set<string>();
        for (const layer of layersOnMap.value) {
            // Groups remove all of their managed sources as part of the same
            // logical deletion, so do not queue their primary source twice.
            // deck.gl layers have no MapLibre source to begin with.
            if (layer.logicalKind !== "group" && layer.renderer !== "deckgl") {
                layerSources.add(layer.source);
            }
        }
        const layersToDelete = [...layersOnMap.value];
        // Delete all layers on the map
        await Promise.all(
            layersToDelete.map(async (layer) => {
                try {
                    await deleteMapLayer(layer.id, information);
                } catch (error) {
                    console.error(`Error deleting layer ${layer.id}: `, error);
                }
            })
        );
        // Delete all sources on the map
        Array.from(layerSources).forEach((source) => {
            try {
                deleteMapDataSource(source);
            } catch (error) {
                console.error(`Error deleting source ${source}: `, error);
            }
        });
        // Clear the layersOnMap array
        layersOnMap.value = [];
    }
    /**
   * Generates the styling object for a MapLibre layer based on the specified layer type and optional custom style options.
   * If custom style options are provided and include a 'paint' property, those styles are used directly.
   * Otherwise, a default paint object is created based on the layer type.
   *
   * @param {MapLibreLayerTypes} layerType - The type of the MapLibre layer for which the styling is generated. This is used to determine the default styling if custom styling is not provided or lacks a 'paint' property.
   * @param {LayerStyleOptions} [layerStyle] - Optional custom style options for the layer. If this includes a 'paint' property, it will be used as the styling; otherwise, default styling based on the layer type will be generated.
   * @returns {LayerStyleOptions} The styling object for the MapLibre layer, which includes a 'paint' property among possible others, determined by the input parameters.
   */
    function generateStyling(
        layerType: MapLibreLayerTypes,
        layerStyle?: LayerStyleOptions
    ): LayerStyleOptions {
        let styling: LayerStyleOptions = {};
        if (layerType !== "raster") {
            const defaultPaint = createRandomPaintObj(layerType);
            styling = { ...layerStyle };
            if (layerStyle?.paint === undefined) {
                styling.paint = defaultPaint;
            }
        }
        return styling;
    }
    /**
   * Adds a new layer to the map's layer list.
   * @param {LayerObjectWithAttributes} layerObject - Object containing detailed layer information, including its attributes, source, and styling.
   * @param {number} [index] - Optional index for inserting the layer at a specific position within the layer list.
   */
    function add2MapLayerList(
        layerObject: LayerObjectWithAttributes,
        index?: number
    ): void {
        if (index !== undefined) {
            layersOnMap.value.splice(index, 0, layerObject);
        } else {
            layersOnMap.value.push(layerObject);
        }
        if (
            layerObject.showOnLayerList !== undefined &&
      layerObject.showOnLayerList
        ) {
            toast.add({
                severity: "success",
                summary: "Success",
                detail: `Layer ${
                    layerObject.displayName ?? layerObject.id
                } added successfully`,
                life: 3000,
            });
        }
    }
    /**
   * Moves a visible layer to a new sidebar position and mirrors that single
   * movement in the MapLibre layer stack.
   *
   * The sidebar displays layers from top to bottom, while MapLibre stores and
   * renders layers from bottom to top. The target index therefore uses the
   * sidebar order, and this function converts it to the corresponding
   * `moveLayer` `beforeId` without reconciling every layer.
   *
   * @param {string} identifier - The layer ID moved by the drag interaction.
   * @param {number} targetVisibleTopIndex - The target index in the visible sidebar list.
   * @throws {Error} Throws if the layer is missing or cannot be reordered.
   */
    function reorderVisibleMapLayer(
        identifier: string,
        targetVisibleTopIndex: number
    ): void {
        const currentVisibleLayers = getReorderableVisibleLayersTopToBottom();
        const currentVisibleIndex = currentVisibleLayers.findIndex(
            (layer) => layer.id === identifier
        );

        if (currentVisibleIndex === -1) {
            throw new Error(`Layer with identifier ${identifier} is not reorderable`);
        }

        const movedLayerRecord = currentVisibleLayers[currentVisibleIndex];
        const nextVisibleLayers = [...currentVisibleLayers];
        const [movedLayer] = nextVisibleLayers.splice(currentVisibleIndex, 1);
        nextVisibleLayers.splice(targetVisibleTopIndex, 0, movedLayer);

        // Both branches below resolve to the same thing: the id of the nearest
        // real MapLibre layer above the moved layer's new position (deck.gl
        // entries in between are skipped, since they are not part of
        // MapLibre's own layer stack and cannot anchor a `beforeId`).
        const beforeId = getMapLibreBeforeIdForVisibleMove(
            nextVisibleLayers,
            targetVisibleTopIndex
        );

        if (beforeId === identifier) {
            return;
        }

        if (movedLayerRecord.renderer === "deckgl") {
            // Re-interleave the deck.gl layer at its new position among the
            // MapLibre layers instead of moving a (nonexistent) style layer.
            setDeckLayerBeforeId(identifier, beforeId);
        } else {
            moveMapLibreLayer(identifier, beforeId);
            // Companions ride with their parent: re-issue moveLayer for each so
            // they sit immediately above the parent in registration order.
            const parent = layersOnMap.value.find((layer) => layer.id === identifier);
            parent?.companionLayerIds?.forEach((companionId) => {
                if (map.value?.getLayer(companionId) !== undefined) {
                    moveMapLibreLayer(companionId, beforeId);
                }
            });
        }
        moveLayerInState(identifier, beforeId);
    }

    /**
   * Adds a child MapLibre layer that is bound to an existing parent layer.
   *
   * Companion layers live on the MapLibre map but are NOT pushed into
   * `layersOnMap` — they are not shown in the sidebar and do not participate in
   * the reorder UI. Reorder and delete walk the parent's `companionLayerIds`
   * so the children always travel with the parent.
   *
   * @param {string} parentId - The parent layer ID that already exists in `layersOnMap`.
   * @param {AddLayerObject} layerSpec - MapLibre layer specification for the child layer.
   */
    function addCompanionLayer(parentId: string, layerSpec: AddLayerObject): void {
        if (isNullOrEmpty(map.value)) {
            return;
        }
        const parent = layersOnMap.value.find((layer) => layer.id === parentId);
        if (parent === undefined) {
            console.warn(`addCompanionLayer: parent layer "${parentId}" not found`);
            return;
        }
        const parentIndex = layersOnMap.value.findIndex((layer) => layer.id === parentId);
        // beforeId must reference a real MapLibre style layer — skip past any
        // deck.gl entries that may sit directly above the parent in the list.
        const aboveLayer = parentIndex >= 0
            ? layersOnMap.value.slice(parentIndex + 1).find((layer) => layer.renderer !== "deckgl")
            : undefined;
        const insertBeforeId = aboveLayer?.id;
        try {
            map.value.addLayer(layerSpec, insertBeforeId);
        } catch (error) {
            console.error(`addCompanionLayer: failed to add ${layerSpec.id}`, error);
            return;
        }
        if (parent.companionLayerIds === undefined) {
            parent.companionLayerIds = [];
        }
        if (!parent.companionLayerIds.includes(layerSpec.id)) {
            parent.companionLayerIds.push(layerSpec.id);
        }
    }

    /**
     * Add a complete catalog group as isolated runtime sources/layers while
     * registering a single logical entry in the map layer sidebar.
     */
    async function addMapGroup(manifest: CatalogLayerGroupManifest): Promise<LayerObjectWithAttributes> {
        if (isNullOrEmpty(map.value)) {
            throw new Error("There is no map to add the group");
        }
        if (manifest.layers.length === 0 || Object.keys(manifest.sources).length === 0) {
            throw new Error(`Layer group ${manifest.name} has no renderable content`);
        }

        const prefix = createMapRuntimeId("group", manifest.id);
        const sourceIds: Record<string, string> = {};
        const addedSources: string[] = [];
        const addedLayers: string[] = [];
        const spriteRuntimeIds: Record<string, string> = {};
        const addedSprites: string[] = [];
        try {
            for (const [alias, specification] of Object.entries(manifest.sources)) {
                const sourceId = `${prefix}:source:${sanitizeRuntimePart(alias)}`;
                sourceIds[alias] = sourceId;
                map.value.addSource(sourceId, specification as SourceSpecification);
                addedSources.push(sourceId);
            }
            for (const sprite of Object.values(manifest.sprites)) {
                // MapLibre uses the first colon as its sprite namespace
                // separator, so generated sprite IDs themselves stay colon-free.
                const runtimeId = `sprite-${sanitizeRuntimePart(prefix)}-${sanitizeRuntimePart(sprite.id)}`;
                const acquiredRuntimeId = await acquireMapSprite(sprite.url, runtimeId);
                spriteRuntimeIds[sprite.id] = acquiredRuntimeId;
                addedSprites.push(acquiredRuntimeId);
            }

            const runtimeLayerObjects: LayerObjectWithAttributes[] = [];
            manifest.layers.forEach((rawLayer, index) => {
                const sourceAlias = typeof rawLayer.source === "string" ? rawLayer.source : undefined;
                const styleId = typeof rawLayer.metadata?.["tosca:style-id"] === "string"
                    ? rawLayer.metadata["tosca:style-id"] as string
                    : undefined;
                const spriteId = styleId === undefined ? undefined : manifest.styles[styleId]?.sprite_id;
                const spriteRuntimeId = spriteId === null || spriteId === undefined
                    ? undefined
                    : spriteRuntimeIds[spriteId];
                const runtimeLayerId = `${prefix}:render:${index}:${sanitizeRuntimePart(String(rawLayer.id ?? index))}`;
                const layerObject = {
                    ...rawLayer,
                    id: runtimeLayerId,
                    ...(sourceAlias === undefined ? {} : { source: sourceIds[sourceAlias] }),
                    ...(rawLayer.paint === undefined
                        ? {}
                        : { paint: rewriteSpritePaint(rawLayer.paint, spriteRuntimeId) }),
                    ...(rawLayer.layout === undefined
                        ? {}
                        : { layout: rewriteSpriteLayout(rawLayer.layout, spriteRuntimeId) }),
                } as unknown as AddLayerObject;
                map.value.addLayer(layerObject);
                addedLayers.push(runtimeLayerId);
                runtimeLayerObjects.push({
                    ...(layerObject as unknown as CustomAddLayerObject),
                    source: sourceAlias === undefined ? addedSources[0] : sourceIds[sourceAlias],
                    sourceType: "geoserver",
                    type: rawLayer.type as MapLibreLayerTypes,
                    showOnLayerList: index === 0,
                });
            });

            const primary = runtimeLayerObjects[0];
            const logicalRecord: LayerObjectWithAttributes = {
                ...primary,
                displayName: manifest.title,
                showOnLayerList: true,
                logicalKind: "group",
                companionLayerIds: addedLayers.slice(1),
                managedSourceIds: addedSources,
                groupSourceIds: sourceIds,
                groupManifest: manifest,
                spriteRuntimeIds: addedSprites,
                workspaceName: manifest.workspace.name,
                details: manifest.members[0]?.details,
            };
            add2MapLayerList(logicalRecord);
            return logicalRecord;
        } catch (error) {
            [...addedLayers].reverse().forEach((layerId) => {
                if (map.value?.getLayer(layerId) !== undefined) map.value.removeLayer(layerId);
            });
            [...addedSources].reverse().forEach((sourceId) => {
                if (map.value?.getSource(sourceId) !== undefined) map.value.removeSource(sourceId);
            });
            [...addedSprites].reverse().forEach(releaseMapSprite);
            throw error;
        }
    }

    async function acquireMapSprite(url: string, preferredRuntimeId: string): Promise<string> {
        const existing = spriteRegistry.get(url);
        if (existing !== undefined) {
            existing.references += 1;
            // A concurrent acquire may still be loading this sprite; wait for
            // that same load so callers never reference a sprite that has not
            // finished attaching to the map yet.
            if (existing.loading !== undefined) {
                try {
                    await existing.loading;
                } catch (error) {
                    existing.references -= 1;
                    throw error;
                }
            }
            return existing.runtimeId;
        }
        // Reserve the registry slot synchronously, before awaiting validation, so
        // concurrent acquires of the same URL share this single sprite and its
        // reference count instead of each adding a duplicate. `Map.addSprite`
        // itself has no awaitable result (it fetches and applies the sprite
        // fire-and-forget), so the sprite's manifest is validated first and
        // `addSprite` is only called once that succeeds — this is what makes
        // `loading` a real signal callers can await and catch failures from.
        const loading = validateSpriteUrl(url).then(() => {
            map.value.addSprite(preferredRuntimeId, url);
        });
        const entry: { runtimeId: string; references: number; loading?: Promise<void> } = {
            runtimeId: preferredRuntimeId,
            references: 1,
            loading,
        };
        spriteRegistry.set(url, entry);
        try {
            await loading;
            entry.loading = undefined;
        } catch (error) {
            if (spriteRegistry.get(url) === entry) spriteRegistry.delete(url);
            throw error;
        }
        return preferredRuntimeId;
    }

    function releaseMapSprite(runtimeId: string): void {
        const entry = [...spriteRegistry.entries()].find(
            ([, candidate]) => candidate.runtimeId === runtimeId
        );
        if (entry === undefined) return;
        const [url, registered] = entry;
        registered.references -= 1;
        if (registered.references > 0) return;
        spriteRegistry.delete(url);
        if (typeof map.value?.removeSprite !== "function") return;
        try {
            map.value.removeSprite(runtimeId);
        } catch (error) {
            console.warn(`Failed to remove sprite ${runtimeId}`, error);
        }
    }

    function setLogicalLayerOpacity(layer: LayerObjectWithAttributes, opacity: number): void {
        const layerIds = [layer.id, ...(layer.companionLayerIds ?? [])];
        layerIds.forEach((layerId) => {
            const mapLayer = map.value?.getLayer(layerId);
            if (mapLayer === undefined) return;
            opacityPropertiesForType(mapLayer.type as MapLibreLayerTypes).forEach(
                (property) => map.value.setPaintProperty(layerId, property, opacity)
            );
        });
    }

    function layerOwnsSource(layer: LayerObjectWithAttributes, sourceId: string): boolean {
        return layer.source === sourceId || layer.managedSourceIds?.includes(sourceId) === true;
    }

    function displayNameForSource(sourceId: string): string | undefined {
        const layer = layersOnMap.value.find((item) => layerOwnsSource(item, sourceId));
        if (layer === undefined) return undefined;
        if (layer.logicalKind === "group") {
            const alias = Object.entries(layer.groupSourceIds ?? {})
                .find(([, runtimeId]) => runtimeId === sourceId)?.[0];
            const member = layer.groupManifest?.members.find(
                (item) => (item.source_key ?? item.source_alias) === alias
            );
            return member?.layer_title ?? member?.title ?? layer.displayName;
        }
        return layer.displayName ?? layer.source;
    }

    /**
   * Returns user-visible layers in the same order shown by the sidebar.
   *
   * @returns {LayerObjectWithAttributes[]} Visible, reorderable layers from top to bottom.
   */
    function getReorderableVisibleLayersTopToBottom(): LayerObjectWithAttributes[] {
        return layersOnMap.value
            .filter((layer) => layer.showOnLayerList !== false && layer.keepOnTop !== true)
            .slice()
            .reverse();
    }

    /**
   * Resolves the MapLibre insertion target for a sidebar move.
   *
   * @param {LayerObjectWithAttributes[]} visibleLayersTopToBottom - Visible layers after the drag move.
   * @param {number} targetVisibleTopIndex - The moved layer's target index in the sidebar list.
   * @returns {string | undefined} The layer ID that the moved layer should be inserted before.
   */
    function getMapLibreBeforeIdForVisibleMove(
        visibleLayersTopToBottom: LayerObjectWithAttributes[],
        targetVisibleTopIndex: number
    ): string | undefined {
        // Scan upward (toward the top of the sidebar) for the nearest entry
        // that is an actual MapLibre style layer. deck.gl entries are skipped
        // since MapLibre's `moveLayer`/`addLayer` beforeId must reference a
        // real style layer id.
        for (let i = targetVisibleTopIndex - 1; i >= 0; i--) {
            const candidate = visibleLayersTopToBottom[i];
            if (candidate.renderer !== "deckgl") {
                return candidate.id;
            }
        }

        return layersOnMap.value.find((layer) => layer.keepOnTop === true)?.id;
    }

    /**
   * Applies a single MapLibre layer-stack move when the map layer exists.
   *
   * @param {string} identifier - The layer ID to move.
   * @param {string} [beforeId] - Optional layer ID that receives the moved layer below it.
   */
    function moveMapLibreLayer(identifier: string, beforeId?: string): void {
        if (isNullOrEmpty(map.value) || map.value?.getLayer(identifier) === undefined) {
            return;
        }

        if (beforeId !== undefined && map.value?.getLayer(beforeId) === undefined) {
            map.value?.moveLayer(identifier);
            return;
        }

        if (beforeId === undefined) {
            map.value?.moveLayer(identifier);
            return;
        }

        map.value?.moveLayer(identifier, beforeId);
    }

    /**
   * Mirrors a MapLibre move in the local layer state with one remove/insert.
   *
   * @param {string} identifier - The layer ID to move.
   * @param {string} [beforeId] - Optional target layer ID for insertion.
   */
    function moveLayerInState(identifier: string, beforeId?: string): void {
        const currentIndex = layersOnMap.value.findIndex(
            (layer) => layer.id === identifier
        );

        if (currentIndex === -1) {
            throw new Error(`Layer with identifier ${identifier} not found in layer list`);
        }

        const [movedLayer] = layersOnMap.value.splice(currentIndex, 1);

        if (beforeId === undefined) {
            layersOnMap.value.push(movedLayer);
            return;
        }

        const targetIndex = layersOnMap.value.findIndex(
            (layer) => layer.id === beforeId
        );

        if (targetIndex === -1) {
            layersOnMap.value.push(movedLayer);
            return;
        }

        layersOnMap.value.splice(targetIndex, 0, movedLayer);
    }
    /**
   * Removes a layer from the `layersOnMap` list based on its identifier.
   * @param {string} identifier - The unique identifier for the layer to remove.
   * @param {boolean} [information] - Optional flag to trigger an information toast message when the layer is removed.
   * @throws {Error} Throws an error if the layer cannot be found in the list.
   */
    function removeFromMapLayerList(
        identifier: string,
        information?: boolean
    ): void {
        const index = layersOnMap.value.findIndex(
            (layer) => layer.id === identifier
        );
        if (index !== -1) {
            const [removedLayer] = layersOnMap.value.splice(index, 1);
            if (
                removedLayer.showOnLayerList !== undefined &&
        removedLayer.showOnLayerList
            ) {
                if (information !== undefined && information) {
                    toast.add({
                        severity: "success",
                        summary: "Success",
                        detail: `Layer ${
                            removedLayer.displayName ?? removedLayer.id
                        } removed successfully`,
                        life: 3000,
                    });
                }
            }
        } else {
            throw new Error(
                `Layer with identifier ${identifier} not found in layer list`
            );
        }
    }
    /**
   * Creates a random paint object for styling layers based on their type.
   * This function assigns a random color to the layers to differentiate them visually.
   * @param {MapLibreLayerTypes} type - The type of layer (e.g., "circle", "fill", "line") to determine the default paint properties.
   * @returns {Record<string, any>} - A paint object with properties specific to the layer type.
   */
    function createRandomPaintObj(type: MapLibreLayerTypes): Record<string, any> {
        const color = getRandomHexColor();
        switch (type) {
            case "circle":
                return {
                    "circle-color": color,
                    "circle-opacity": 1,
                    "circle-radius": 8,
                };
            case "fill":
                return {
                    "fill-color": color,
                    "fill-opacity": 0.6,
                    "fill-outline-color": "#000000",
                };
            case "line":
                return {
                    "line-color": color,
                    "line-opacity": 1,
                    "line-width": 3,
                };
            default:
                return {
                    "heatmap-color": color,
                    "heatmap-opacity": 1,
                    "heatmap-radius": 20,
                };
        }
    }
    /**
   * Converts a GeoJSON geometry type to a MapLibre layer type.
   * This function maps different geometry types (e.g., "Point", "LineString", "Polygon") to corresponding MapLibre layer types (e.g., "circle", "line", "fill").
   * @param {string} geometry - The GeoJSON geometry type (e.g., "Point", "Polygon").
   * @returns {MapLibreLayerTypes} - The MapLibre layer type that corresponds to the input geometry.
   */
    function geometryConversion(geometry: string): MapLibreLayerTypes {
        if (geometry === "Point" || geometry === "MultiPoint") {
            return "circle";
        }
        if (
            geometry === "Curve" ||
      geometry === "MultiCurve" ||
      geometry === "LineCurve" ||
      geometry === "Line" ||
      geometry === "LineString" ||
      geometry === "LinearRing" ||
      geometry === "MultiLineString"
        ) {
            return "line";
        }
        if (
            geometry === "Polygon" ||
      geometry === "MultiPolygon" ||
      geometry === "Geometry" ||
      geometry === "GeometryCollection"
        ) {
            return "fill";
        } else {
            return "heatmap";
        }
    }
    /**
     * Updates the WMS TIME parameter for an already-added raster layer in place.
     * Rebuilds the source's tile URLs via setTiles, which triggers a refetch
     * without removing or re-adding the layer, so z-order and any user-tweaked
     * paint properties survive.
     *
     * @param identifier - The source identifier used when the layer was added.
     * @param time - ISO 8601 instant, "start/end" range, or undefined to clear
     *               the TIME param and fall back to the server's default.
     */
    function setRasterLayerTime(identifier: string, time: string | undefined): void {
        if (isNullOrEmpty(map.value)) {
            throw new Error("There is no map to update");
        }
        const source = map.value?.getSource(identifier);
        if (source === undefined) {
            throw new Error(`Source with identifier ${identifier} not found`);
        }
        const layer = layersOnMap.value.find((l) => l.id === identifier);
        if (layer?.details === undefined || layer.workspaceName === undefined) {
            throw new Error(`Layer ${identifier} is not a workspace-bound raster layer`);
        }
        const details = layer.details as GeoserverRasterTypeLayerDetail;
        if (details.coverage === undefined) {
            throw new Error(`Layer ${identifier} is not a raster layer`);
        }
        const url = buildWmsRasterTileUrl({
            providerBaseUrl: providerBaseUrl(details),
            workspace: layer.workspaceName,
            layerName: details.coverage.name,
            time,
        });
        // MapLibre's raster source exposes setTiles at runtime; cast to access it.
        (source as unknown as { setTiles: (tiles: string[]) => void }).setTiles([url]);
        layer.time = time;
    }

    /** Update one declared color on an editable, single-pass standalone style. */
    function setStandaloneLayerPaintColor(
        identifier: string,
        property: string,
        color: string
    ): void {
        if (isNullOrEmpty(map.value)) {
            throw new Error("There is no map to update");
        }
        const layer = layersOnMap.value.find((candidate) => candidate.id === identifier);
        if (layer === undefined || layer.logicalKind === "group") {
            throw new Error(`Standalone layer ${identifier} not found`);
        }
        if ((layer.mbStyleLayers?.length ?? 0) > 1) {
            throw new Error(`Multi-pass style ${identifier} cannot be edited directly`);
        }
        if (!isEditableMapStyleColorProperty(layer.type, property)) {
            throw new Error(`${property} is not an editable color for ${layer.type}`);
        }

        map.value.setPaintProperty(identifier, property, color);
        layer.paint = { ...(layer.paint ?? {}), [property]: color };
        if (layer.mbStyleLayers?.length === 1) {
            layer.mbStyleLayers = layer.mbStyleLayers.map((styleLayer, index) => index === 0
                ? { ...styleLayer, paint: { ...(styleLayer.paint ?? {}), [property]: color } }
                : styleLayer
            );
        }
    }

    /** Replace every render pass for a standalone layer with another MBStyle. */
    async function setStandaloneLayerStyle(
        identifier: string,
        styleId: string
    ): Promise<void> {
        if (isNullOrEmpty(map.value)) {
            throw new Error("There is no map to update");
        }
        const layer = layersOnMap.value.find((candidate) => candidate.id === identifier);
        if (layer === undefined || layer.logicalKind === "group") {
            throw new Error(`Standalone layer ${identifier} not found`);
        }
        if (layer.activeStyleId === styleId) return;
        const selectedStyle = layer.availableStyles?.find((style) => style.id === styleId);
        if (selectedStyle === undefined || selectedStyle.layers.length === 0) {
            throw new Error(`Style ${styleId} is not available for layer ${identifier}`);
        }

        const oldLayerIds = [identifier, ...(layer.companionLayerIds ?? [])];
        const mapStyleLayers = (map.value.getStyle?.().layers ?? []) as AddLayerObject[];
        const oldIdSet = new Set(oldLayerIds);
        const oldLayerSpecs = mapStyleLayers.filter((candidate) => oldIdSet.has(candidate.id));
        const lastOldIndex = mapStyleLayers.reduce(
            (last, candidate, index) => oldIdSet.has(candidate.id) ? index : last,
            -1
        );
        const beforeId = lastOldIndex >= 0
            ? mapStyleLayers[lastOldIndex + 1]?.id
            : undefined;
        const wasHidden = map.value.getLayoutProperty?.(identifier, "visibility") === "none";
        const oldSpriteRuntimeIds = [...(layer.spriteRuntimeIds ?? [])];
        let newSpriteRuntimeId: string | undefined;

        if (selectedStyle.spriteUrl !== undefined) {
            newSpriteRuntimeId = await acquireMapSprite(
                selectedStyle.spriteUrl,
                `sprite-${sanitizeRuntimePart(identifier)}-${sanitizeRuntimePart(selectedStyle.id)}`
            );
        }

        // The sprite fetch above can outlive the layer: it may be deleted (or
        // the whole map reset) while we were awaiting. Bail out instead of
        // re-adding layers against a source that no longer exists.
        if (
            isNullOrEmpty(map.value) ||
            layersOnMap.value.find((candidate) => candidate.id === identifier) === undefined
        ) {
            if (newSpriteRuntimeId !== undefined) releaseMapSprite(newSpriteRuntimeId);
            throw new Error(`Layer ${identifier} is no longer available`);
        }

        const selectedStyleLayers = selectedStyle.layers.map((styleLayer) => ({
            ...styleLayer,
            metadata: {
                ...(styleLayer.metadata ?? {}),
                "tosca:member-id": "standalone",
                "tosca:style-id": "standalone-style",
            },
        }));
        const nextLayerSpecs = selectedStyleLayers.map((styleLayer, index) => {
            const layout = rewriteSpriteLayout(styleLayer.layout ?? {}, newSpriteRuntimeId);
            return {
                ...styleLayer,
                id: index === 0 ? identifier : `${identifier}:style:${index}`,
                type: styleLayer.type as MapLibreLayerTypes,
                source: layer.source,
                ...(layer["source-layer"] === undefined
                    ? {}
                    : { "source-layer": layer["source-layer"] }),
                ...(styleLayer.paint === undefined
                    ? {}
                    : { paint: rewriteSpritePaint(styleLayer.paint, newSpriteRuntimeId) }),
                ...(Object.keys(layout).length === 0 && !wasHidden
                    ? {}
                    : { layout: { ...layout, ...(wasHidden ? { visibility: "none" } : {}) } }),
            } as unknown as AddLayerObject;
        });

        const addedLayerIds: string[] = [];
        try {
            [...oldLayerIds].reverse().forEach((layerId) => {
                if (map.value.getLayer(layerId) !== undefined) map.value.removeLayer(layerId);
            });
            nextLayerSpecs.forEach((specification) => {
                map.value.addLayer(specification, beforeId);
                addedLayerIds.push(specification.id);
            });
        } catch (error) {
            [...addedLayerIds].reverse().forEach((layerId) => {
                if (map.value.getLayer(layerId) !== undefined) map.value.removeLayer(layerId);
            });
            oldLayerSpecs.forEach((specification) => map.value.addLayer(specification, beforeId));
            if (newSpriteRuntimeId !== undefined) releaseMapSprite(newSpriteRuntimeId);
            throw error;
        }

        const primary = nextLayerSpecs[0] as unknown as CatalogGroupStyleLayer;
        for (const key of ["paint", "layout", "filter", "minzoom", "maxzoom"] as const) {
            delete layer[key];
        }
        layer.type = primary.type as MapLibreLayerTypes;
        layer.paint = primary.paint;
        layer.layout = primary.layout;
        layer.filter = primary.filter;
        layer.minzoom = primary.minzoom;
        layer.maxzoom = primary.maxzoom;
        layer.companionLayerIds = nextLayerSpecs.slice(1).map((specification) => specification.id);
        layer.mbStyleLayers = selectedStyleLayers;
        layer.mbStyleLegendContext = {
            members: [{ id: "standalone", title: layer.displayName ?? layer.source }],
            styles: {
                "standalone-style": {
                    sprite_id: selectedStyle.spriteUrl === undefined ? null : "standalone-sprite",
                },
            },
            sprites: selectedStyle.spriteUrl === undefined
                ? {}
                : { "standalone-sprite": { url: selectedStyle.spriteUrl } },
        };
        layer.activeStyleId = selectedStyle.id;
        layer.spriteRuntimeIds = newSpriteRuntimeId === undefined ? [] : [newSpriteRuntimeId];
        oldSpriteRuntimeIds.forEach(releaseMapSprite);
    }
    return {
        map,
        layersOnMap,
        addMapDataSource,
        deleteMapDataSource,
        addMapLayer,
        deleteMapLayer,
        removeFromMapLayerList,
        reorderVisibleMapLayer,
        getReorderableVisibleLayersTopToBottom,
        addCompanionLayer,
        addMapGroup,
        acquireMapSprite,
        releaseMapSprite,
        setLogicalLayerOpacity,
        layerOwnsSource,
        displayNameForSource,
        paintVersion,
        terrainEnabled,
        resetMapData,
        geometryConversion,
        setRasterLayerTime,
        setStandaloneLayerStyle,
        setStandaloneLayerPaintColor,
        deckOverlay,
        initializeDeckOverlay,
        addDeckTilesetLayer,
        removeDeckLayer,
        setDeckLayerVisibility,
        setDeckLayerOpacity,
        setDeckLayerBeforeId,
        pickDeckObjects,
    };
});

function sanitizeRuntimePart(value: string): string {
    return value.replace(/[^a-zA-Z0-9_-]+/g, "-");
}

export function rewriteSpriteLayout(
    layout: Record<string, unknown>,
    spriteRuntimeId?: string
): Record<string, unknown> {
    const rewritten = { ...layout };
    if (spriteRuntimeId !== undefined && rewritten["icon-image"] !== undefined) {
        rewritten["icon-image"] = prefixSpriteReference(
            rewritten["icon-image"],
            spriteRuntimeId
        );
    }
    // MapLibre's implicit default is a two-font stack, but this app only ships
    // glyph PBFs for Open Sans Regular. Without an explicit text-font, the
    // missing two-font URL falls through to index.html and the PBF decoder
    // reports the misleading error "Unimplemented type".
    if (rewritten["text-field"] !== undefined && rewritten["text-font"] === undefined) {
        rewritten["text-font"] = ["Open Sans Regular"];
    }
    return rewritten;
}

export function rewriteSpritePaint(
    paint: Record<string, unknown>,
    spriteRuntimeId?: string
): Record<string, unknown> {
    if (spriteRuntimeId === undefined) return { ...paint };
    const rewritten = { ...paint };
    for (const property of [
        "background-pattern",
        "fill-pattern",
        "fill-extrusion-pattern",
        "line-pattern",
    ]) {
        if (rewritten[property] !== undefined) {
            rewritten[property] = prefixSpriteReference(rewritten[property], spriteRuntimeId);
        }
    }
    return rewritten;
}

/** Preserve every runtime-relevant MBStyle option for a standalone layer. */
export function mbStyleLayerOptions(
    layer: CatalogGroupStyleLayer,
    spriteRuntimeId?: string
): LayerStyleOptions {
    return {
        ...(layer.paint === undefined ? {} : { paint: rewriteSpritePaint(layer.paint, spriteRuntimeId) }),
        ...(layer.layout === undefined ? {} : { layout: rewriteSpriteLayout(layer.layout, spriteRuntimeId) }),
        ...(layer.filter === undefined ? {} : { filter: layer.filter }),
        ...(layer.minzoom === undefined ? {} : { minzoom: layer.minzoom }),
        ...(layer.maxzoom === undefined ? {} : { maxzoom: layer.maxzoom }),
    };
}

function prefixSpriteReference(value: unknown, spriteRuntimeId: string): unknown {
    return typeof value === "string"
        ? `${spriteRuntimeId}:${value}`
        : ["concat", `${spriteRuntimeId}:`, value];
}

function opacityPropertiesForType(type: MapLibreLayerTypes): string[] {
    switch (type) {
        case "circle": return ["circle-opacity"];
        case "fill": return ["fill-opacity"];
        case "line": return ["line-opacity"];
        case "heatmap": return ["heatmap-opacity"];
        case "raster": return ["raster-opacity"];
        case "symbol": return ["icon-opacity", "text-opacity"];
        case "fill-extrusion": return ["fill-extrusion-opacity"];
        default: return [];
    }
}

/**
 * Tile3DLayer's own `getPickingInfo` sets `info.object` to the whole loaded
 * Tile3D (not the individual clicked building) — deck.gl's MeshLayer, which
 * Tile3DLayer uses to render b3dm mesh content, is given the tile's
 * per-vertex `_BATCHID` attribute as a `featureIds` prop specifically so
 * `info.index` resolves to the picked *feature* (building) id rather than a
 * raw vertex index. That id indexes directly into the b3dm batch table
 * (`content.batchTableJson`, one array per property, one entry per building).
 * This covers tilesets with a plain-JSON batch table (the common case);
 * tilesets using a binary-encoded batch table would need loaders.gl's
 * (currently unused) `Tile3DBatchTableParser` wired in separately.
 */
/**
 * b3dm tiles always render through deck.gl's `ScenegraphLayer` (loaders.gl
 * hardcodes that render path by file extension — see PickableTile3DLayer's
 * `filterSubLayer` comment for the fuller trail), which has no per-vertex
 * picking-color concept: `pick.index` always resolves to the tile's single
 * "instance", never the individual building. GPU picking can't disambiguate
 * buildings here, so this does it on the CPU instead.
 *
 * With `pickable: "3d"` on the layer, `pick.coordinate` is an accurate 3D
 * point unprojected onto the actual clicked surface (not a flat-plane
 * approximation). This finds the mesh vertex nearest that point and returns
 * its `_BATCHID` (the same per-vertex glTF attribute read elsewhere for
 * batch-table lookups). Comparison happens in Web Mercator "world" space —
 * the exact same space and math (`addMetersToLngLat` /
 * `getDistanceScales`) deck.gl's own METER_OFFSETS coordinate system uses
 * internally to place `content.modelMatrix`-transformed vertices relative to
 * `content.cartographicOrigin` — so this stays consistent with how the tile
 * actually renders, without touching rendering itself (unlike an earlier,
 * reverted attempt that tried to reroute the renderer and broke it).
 *
 * Deliberately horizontal (X/Y) only: Web Mercator "world" units and real
 * meters (used for the vertical/Z axis) are different scales, and mixing
 * them without a matching Z conversion would bias the match unpredictably.
 * Buildings are horizontally separated, so X/Y alone is enough to identify
 * which one was clicked.
 */
function findNearestVertexBatchId(
    tile: { content?: any } | undefined,
    pickCoordinate: number[] | undefined
): number | undefined {
    const content = tile?.content;
    const positions = content?.gltf?.meshes?.[0]?.primitives?.[0]?.attributes?.POSITION?.value;
    const batchIds = content?.gltf?.meshes?.[0]?.primitives?.[0]?.attributes?._BATCHID?.value;
    const modelMatrix = content?.modelMatrix;
    const origin = content?.cartographicOrigin as number[] | undefined;
    if (
        positions === undefined || batchIds === undefined || modelMatrix === undefined ||
        origin === undefined || pickCoordinate === undefined
    ) {
        return undefined;
    }

    // ScenegraphLayer (the actual renderer for this content) walks the
    // glTF's own node hierarchy and applies each node's matrix on top of
    // Tile3DLayer's own `modelMatrix`. loaders.gl only "absorbs" a node's
    // matrix into `modelMatrix` when that matrix carries an earth-scale
    // (>100km) translation — a different optimization scenario. Our node's
    // matrix is a pure rotation (zero translation), so it's never absorbed,
    // and skipping it here (as an earlier version of this function did)
    // silently produces vertex positions that don't match what's actually
    // rendered — close enough to sometimes look plausible, but frequently
    // the wrong building. Combine it into one transform, applied once.
    const nodeMatrixArray = content?.gltf?.nodes?.[0]?.matrix as number[] | undefined;
    const combinedMatrix = nodeMatrixArray !== undefined
        ? new Matrix4(modelMatrix).multiplyRight(new Matrix4(nodeMatrixArray))
        : modelMatrix;

    const [originLng, originLat] = origin;
    const { unitsPerMeter, unitsPerMeter2 = [0, 0, 0] } = getDistanceScales({
        longitude: originLng, latitude: originLat, highPrecision: true,
    });
    const originWorld = lngLatToWorld([originLng, originLat]);
    const pickWorld = lngLatToWorld(pickCoordinate);

    let bestIndex = -1;
    let bestDistSq = Infinity;
    const vertexCount = positions.length / 3;
    for (let i = 0; i < vertexCount; i++) {
        const local: [number, number, number] = [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
        const [mx, my] = combinedMatrix.transformPoint(local) as number[];
        const worldX = originWorld[0] + mx * (unitsPerMeter[0] + unitsPerMeter2[0] * my);
        const worldY = originWorld[1] + my * (unitsPerMeter[1] + unitsPerMeter2[1] * my);
        const dx = worldX - pickWorld[0];
        const dy = worldY - pickWorld[1];
        const distSq = dx * dx + dy * dy;
        if (distSq < bestDistSq) {
            bestDistSq = distSq;
            bestIndex = i;
        }
    }
    return bestIndex >= 0 ? (batchIds[bestIndex] as number) : undefined;
}

function buildDeckPopupFeature(pick: PickingInfo): PopupAttributeFeature {
    const layerId = pick.layer!.id;
    const tile = pick.object as {
        id?: string
        content?: { batchTableJson?: Record<string, unknown[]>, uri?: string }
    } | undefined;
    const batchTable = tile?.content?.batchTableJson;
    const batchId = findNearestVertexBatchId(tile, pick.coordinate) ?? pick.index;
    if (batchTable !== undefined && batchId >= 0) {
        const rawProperties: Record<string, unknown> = {};
        for (const [name, values] of Object.entries(batchTable)) {
            if (Array.isArray(values) && batchId < values.length) {
                rawProperties[name] = values[batchId];
            }
        }
        // Some batch tables (e.g. vcs/CityGML-derived exports, like the
        // Hamburg LoD3 demo) nest the actual semantic attributes
        // (Gebaeudefunktion, Adresse, ...) inside a single "ATTRIBUTES"
        // object, alongside internal/structural fields (ID, CLASSID,
        // OLCS_GEOMETRYTYPE, PARENTPOSITION). Surface the nested object's
        // own contents instead of those structural fields when present.
        const nestedAttributes = Object.entries(rawProperties).find(
            ([name, value]) => name.toUpperCase() === "ATTRIBUTES" &&
                typeof value === "object" && value !== null && !Array.isArray(value)
        )?.[1] as Record<string, unknown> | undefined;
        const properties = nestedAttributes ?? rawProperties;
        if (Object.keys(properties).length > 0) {
            return { source: layerId, id: batchId, properties };
        }
    }
    // Fallback so an unresolved hit still shows something instead of nothing.
    return {
        source: layerId,
        properties: { tile: tile?.id ?? tile?.content?.uri ?? "unknown" },
    };
}
/* eslint-disable */
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useMapStore, import.meta.hot));
}

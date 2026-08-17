import { defineStore, acceptHMRUpdate } from "pinia";
import { ref, shallowRef } from "vue";
import {
    type CatalogLayerGroupManifest,
    type CatalogGroupStyleLayer,
    type GeoserverRasterTypeLayerDetail,
    type GeoServerVectorTypeLayerDetail,
} from "./geoserver";
import { type SourceSpecification, type AddLayerObject } from "maplibre-gl";
import { getRandomHexColor, isNullOrEmpty } from "../core/helpers/functions";
import { type FeatureCollection } from "@helpers/geojson";
import { type MapStyleLegendContext } from "@helpers/mapStyleLegend";
import { useToast } from "@helpers/toast";
export interface LayerStyleOptions {
    paint?: Record<string, unknown>;
    layout?: Record<string, unknown>;
    filter?: unknown[];
    minzoom?: number;
    maxzoom?: number;
    visibility?: "none" | "visible";
}
export interface CustomAddLayerObject {
    id: string;
    source: string;
    sourceType: SourceType;
    type: MapLibreLayerTypes;
    "source-layer"?: string;
    paint?: Record<string, unknown>;
    layout?: Record<string, unknown>;
    filter?: unknown[];
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
}
type SourceType = "geojson" | "geoserver";
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
}): string {
    const params = new URLSearchParams({
        REQUEST: "GetMap",
        SERVICE: "WMS",
        VERSION: "1.3.0",
        LAYERS: `${opts.workspace}:${opts.layerName}`,
        STYLES: "",
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
}): string {
    const params = new URLSearchParams({
        REQUEST: "GetTile",
        SERVICE: "WMTS",
        VERSION: "1.0.0",
        LAYER: `${opts.workspace}:${opts.layerName}`,
        STYLE: "",
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
            const firstVectorLayer = layersOnMap.value.find((layer) => {
                return layer.type !== "raster";
            });
            const indexOfFirstVectorLayer = layersOnMap.value.findIndex((layer) => {
                return layer.type !== "raster";
            });
            if (indexOfFirstVectorLayer !== -1) {
                index = indexOfFirstVectorLayer;
            }
            if (firstVectorLayer !== undefined) {
                beforeId = firstVectorLayer.id;
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
            if (layer.logicalKind !== "group") layerSources.add(layer.source);
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

        const nextVisibleLayers = [...currentVisibleLayers];
        const [movedLayer] = nextVisibleLayers.splice(currentVisibleIndex, 1);
        nextVisibleLayers.splice(targetVisibleTopIndex, 0, movedLayer);

        const beforeId = getMapLibreBeforeIdForVisibleMove(
            nextVisibleLayers,
            targetVisibleTopIndex
        );

        if (beforeId === identifier) {
            return;
        }

        moveMapLibreLayer(identifier, beforeId);
        // Companions ride with their parent: re-issue moveLayer for each so
        // they sit immediately above the parent in registration order.
        const parent = layersOnMap.value.find((layer) => layer.id === identifier);
        parent?.companionLayerIds?.forEach((companionId) => {
            if (map.value?.getLayer(companionId) !== undefined) {
                moveMapLibreLayer(companionId, beforeId);
            }
        });
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
        const aboveLayer = parentIndex >= 0 ? layersOnMap.value[parentIndex + 1] : undefined;
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
        // Reserve the registry slot synchronously, before awaiting addSprite, so
        // concurrent acquires of the same URL share this single sprite and its
        // reference count instead of each adding a duplicate.
        const loading = map.value.addSprite(preferredRuntimeId, url) as Promise<void>;
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
        if (targetVisibleTopIndex > 0) {
            return visibleLayersTopToBottom[targetVisibleTopIndex - 1]?.id;
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
        resetMapData,
        geometryConversion,
        setRasterLayerTime,
    };
});

function sanitizeRuntimePart(value: string): string {
    return value.replace(/[^a-zA-Z0-9_-]+/g, "-");
}

export function rewriteSpriteLayout(
    layout: Record<string, unknown>,
    spriteRuntimeId?: string
): Record<string, unknown> {
    if (spriteRuntimeId === undefined || layout["icon-image"] === undefined) return { ...layout };
    const iconImage = layout["icon-image"];
    return {
        ...layout,
        "icon-image": prefixSpriteReference(iconImage, spriteRuntimeId),
    };
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
/* eslint-disable */
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useMapStore, import.meta.hot));
}

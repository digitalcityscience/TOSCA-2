import bbox from "@turf/bbox";
import bboxPolygon from "@turf/bbox-polygon";
import { type FeatureCollection } from "./geojson";
import {
    buildCatalogStyleUrl,
    selectCatalogStyleLayers,
    type CatalogGroupStyleLayer,
    type GeoserverLayerInfoResponse,
    type GeoserverRasterTypeLayerDetail,
    type GeoServerVectorTypeLayerDetail,
} from "@store/geoserver";
import {
    createMapRuntimeId,
    mbStyleLayerOptions,
    rewriteSpriteLayout,
    rewriteSpritePaint,
    type GeoServerSourceParams,
    type LayerParams,
    type MapLibreLayerTypes,
} from "@store/map";
import { type AddLayerObject } from "maplibre-gl";
import { type GeoStoryDetail, type GeoStoryLayerLink } from "@store/geostory";
import { isNullOrEmpty } from "./functions";

interface GeoserverStore {
    getLayerInformation: (
        layer: { name: string, href: string },
        workspace: string
    ) => Promise<GeoserverLayerInfoResponse>;
    getLayerDetail: (
        url: string
    ) => Promise<GeoServerVectorTypeLayerDetail | GeoserverRasterTypeLayerDetail>;
    getLayerStyling: (url: string) => Promise<Record<string, unknown> | undefined>;
}

interface GeoStoryMapStore {
    map: {
        fitBounds: (bounds: number[], options: { padding: number }) => void;
    };
    resetMapData: (information?: boolean) => Promise<void>;
    addMapDataSource: (params: GeoServerSourceParams) => Promise<unknown>;
    addMapLayer: (params: LayerParams) => Promise<unknown>;
    geometryConversion: (geometry: string) => MapLibreLayerTypes;
    acquireMapSprite?: (url: string, preferredRuntimeId: string) => Promise<string>;
    releaseMapSprite?: (runtimeId: string) => void;
    addCompanionLayer?: (parentId: string, layerSpec: AddLayerObject) => void;
    layersOnMap?: Array<{
        id: string;
        companionLayerIds?: string[];
        spriteRuntimeIds?: string[];
        mbStyleLayers?: CatalogGroupStyleLayer[];
        activeStyleId?: string;
    }>;
}

export interface LoadGeostoryLayersOptions {
    onLayerError?: (error: unknown, layer: GeoStoryLayerLink) => void;
}

function getOrderedRenderableLayers(story: GeoStoryDetail): GeoStoryLayerLink[] {
    return [...story.layers]
        .sort((a, b) => a.display_order - b.display_order)
        .filter((item) => {
            return item.layer.is_public && item.layer.publishing_state === "PUBLISHED";
        });
}

function getVectorGeometryType(detail: GeoServerVectorTypeLayerDetail): string {
    const geometryAttribute = detail.featureType.attributes.attribute.find((attribute) => {
        return attribute.name.includes("geom");
    });
    return geometryAttribute?.binding.split(".").slice(-1)[0] ?? "";
}

interface SelectedVectorStyle {
    id: string;
    layers: CatalogGroupStyleLayer[];
    spriteUrl?: string;
}

async function loadSelectedVectorStyle(
    item: GeoStoryLayerLink,
    response: GeoserverLayerInfoResponse,
    geoserverStore: GeoserverStore
): Promise<SelectedVectorStyle | undefined> {
    const assignment = item.style_assignment;
    const providerId = response.provider?.id;
    if (assignment?.format !== "mbstyle" || providerId === undefined) {
        return undefined;
    }

    const document = await geoserverStore.getLayerStyling(
        buildCatalogStyleUrl(providerId, assignment.style_id).toString()
    );
    const documentLayers = document?.layers;
    if (!Array.isArray(documentLayers) || documentLayers.length === 0) {
        return undefined;
    }
    const selectedLayers = selectCatalogStyleLayers(
        documentLayers as CatalogGroupStyleLayer[],
        {
            id: assignment.style_id,
            name: assignment.name,
            href: buildCatalogStyleUrl(providerId, assignment.style_id).toString(),
            styleLayerIds: assignment.style_layer_ids,
            format: assignment.format,
        },
        item.layer.name
    );
    if (selectedLayers.length === 0) {
        return undefined;
    }
    const spriteUrl = document?.sprite;
    return {
        id: assignment.style_id,
        layers: selectedLayers.map((layer) => ({ ...layer })),
        ...(typeof spriteUrl === "string" ? { spriteUrl } : {}),
    };
}

export async function loadGeostoryLayersOnMap(
    story: GeoStoryDetail,
    geoserverStore: GeoserverStore,
    mapStore: GeoStoryMapStore,
    options: LoadGeostoryLayersOptions = {}
): Promise<number> {
    await mapStore.resetMapData(false);

    const layerBboxPolygons: FeatureCollection = {
        type: "FeatureCollection",
        features: [],
    };
    let addedLayerCount = 0;

    for (const item of getOrderedRenderableLayers(story)) {
        const workspaceName = item.layer.workspace.name;
        const layerName = item.layer.name;

        try {
            const response = await geoserverStore.getLayerInformation(
                { name: layerName, href: item.layer.published_url },
                workspaceName
            );
            if (response.layer === undefined) {
                continue;
            }

            const detail = await geoserverStore.getLayerDetail(response.layer.resource.href);
            const runtimeId = createMapRuntimeId("layer", item.layer.id);

            if (response.layer.type === "VECTOR") {
                const vectorDetail = detail as GeoServerVectorTypeLayerDetail;
                const dataType = getVectorGeometryType(vectorDetail);
                if (isNullOrEmpty(dataType) || isNullOrEmpty(vectorDetail)) {
                    continue;
                }

                let selectedStyle: SelectedVectorStyle | undefined;
                try {
                    selectedStyle = await loadSelectedVectorStyle(item, response, geoserverStore);
                } catch (styleError) {
                    options.onLayerError?.(styleError, item);
                }

                let spriteRuntimeId: string | undefined;
                let spriteRegisteredOnLayer = false;
                await mapStore.addMapDataSource({
                    sourceType: "geoserver",
                    sourceDataType: "vector",
                    sourceProtocol: "wmts",
                    identifier: runtimeId,
                    isFilterLayer: false,
                    workspaceName,
                    layer: vectorDetail,
                });
                try {
                    if (selectedStyle?.spriteUrl !== undefined && mapStore.acquireMapSprite !== undefined) {
                        spriteRuntimeId = await mapStore.acquireMapSprite(
                            selectedStyle.spriteUrl,
                            `sprite-${runtimeId.replace(/[^a-zA-Z0-9_-]+/g, "-")}`
                        );
                    }
                    const firstStyleLayer = selectedStyle?.layers[0];
                    await mapStore.addMapLayer({
                        sourceType: "geoserver",
                        sourceDataType: "vector",
                        sourceProtocol: "wmts",
                        identifier: runtimeId,
                        sourceIdentifier: runtimeId,
                        layerType: (firstStyleLayer?.type as MapLibreLayerTypes | undefined)
                            ?? mapStore.geometryConversion(dataType),
                        layerStyle: firstStyleLayer === undefined
                            ? undefined
                            : mbStyleLayerOptions(firstStyleLayer, spriteRuntimeId),
                        geoserverLayerDetails: vectorDetail,
                        sourceLayer: vectorDetail.featureType.name,
                        displayName: vectorDetail.featureType.title ?? undefined,
                        workspaceName,
                    });
                    const logicalLayer = mapStore.layersOnMap?.find((layer) => layer.id === runtimeId);
                    if (logicalLayer !== undefined && selectedStyle !== undefined) {
                        logicalLayer.mbStyleLayers = selectedStyle.layers;
                        logicalLayer.activeStyleId = selectedStyle.id;
                        if (spriteRuntimeId !== undefined) {
                            logicalLayer.spriteRuntimeIds = [spriteRuntimeId];
                            spriteRegisteredOnLayer = true;
                        }
                    }
                    selectedStyle?.layers.slice(1).forEach((styleLayer, index) => {
                        mapStore.addCompanionLayer?.(runtimeId, {
                            ...styleLayer,
                            id: `${runtimeId}:style:${index + 1}`,
                            type: styleLayer.type as MapLibreLayerTypes,
                            source: runtimeId,
                            "source-layer": vectorDetail.featureType.name,
                            ...(styleLayer.paint === undefined ? {} : {
                                paint: rewriteSpritePaint(styleLayer.paint, spriteRuntimeId),
                            }),
                            ...(styleLayer.layout === undefined ? {} : {
                                layout: rewriteSpriteLayout(styleLayer.layout, spriteRuntimeId),
                            }),
                        } as AddLayerObject);
                    });
                } catch (error) {
                    if (spriteRuntimeId !== undefined && !spriteRegisteredOnLayer) {
                        mapStore.releaseMapSprite?.(spriteRuntimeId);
                    }
                    throw error;
                }

                const bounds = vectorDetail.featureType.latLonBoundingBox;
                layerBboxPolygons.features.push(
                    bboxPolygon([bounds.minx, bounds.miny, bounds.maxx, bounds.maxy])
                );
                addedLayerCount += 1;
            }

            if (response.layer.type === "RASTER") {
                const rasterDetail = detail as GeoserverRasterTypeLayerDetail;
                if (isNullOrEmpty(rasterDetail)) {
                    continue;
                }

                await mapStore.addMapDataSource({
                    sourceType: "geoserver",
                    sourceDataType: "raster",
                    sourceProtocol: "wms",
                    identifier: runtimeId,
                    isFilterLayer: false,
                    workspaceName,
                    layer: rasterDetail,
                    styleName: item.style_assignment?.name,
                });
                await mapStore.addMapLayer({
                    sourceType: "geoserver",
                    sourceDataType: "raster",
                    sourceProtocol: "wms",
                    identifier: runtimeId,
                    sourceIdentifier: runtimeId,
                    layerType: "raster",
                    geoserverLayerDetails: rasterDetail,
                    sourceLayer: rasterDetail.coverage.name,
                    displayName: rasterDetail.coverage.title ?? undefined,
                    workspaceName,
                });

                const bounds = rasterDetail.coverage.latLonBoundingBox;
                layerBboxPolygons.features.push(
                    bboxPolygon([bounds.minx, bounds.miny, bounds.maxx, bounds.maxy])
                );
                addedLayerCount += 1;
            }
        } catch (error) {
            options.onLayerError?.(error, item);
        }
    }

    if (layerBboxPolygons.features.length > 0) {
        mapStore.map.fitBounds(bbox(layerBboxPolygons), { padding: 20 });
    }

    return addedLayerCount;
}

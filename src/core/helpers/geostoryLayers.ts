import bbox from "@turf/bbox";
import bboxPolygon from "@turf/bbox-polygon";
import { type FeatureCollection } from "./geojson";
import {
    type GeoserverLayerInfoResponse,
    type GeoserverRasterTypeLayerDetail,
    type GeoServerVectorTypeLayerDetail,
} from "@store/geoserver";
import {
    type GeoServerSourceParams,
    type LayerParams,
    type MapLibreLayerTypes,
} from "@store/map";
import { type GeoStoryDetail, type GeoStoryLayerLink } from "@store/geostory";
import { isNullOrEmpty } from "./functions";

interface CatalogStore {
    getLayerInformation: (
        layer: { name: string, href: string },
        workspace: string
    ) => Promise<GeoserverLayerInfoResponse>;
    getLayerDetail: (
        url: string
    ) => Promise<GeoServerVectorTypeLayerDetail | GeoserverRasterTypeLayerDetail>;
}

interface MapStore {
    map: {
        fitBounds: (bounds: number[], options: { padding: number }) => void;
    };
    resetMapData: (information?: boolean) => Promise<void>;
    addMapDataSource: (params: GeoServerSourceParams) => Promise<unknown>;
    addMapLayer: (params: LayerParams) => Promise<unknown>;
    geometryConversion: (geometry: string) => MapLibreLayerTypes;
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

export async function loadGeostoryLayersOnMap(
    story: GeoStoryDetail,
    catalogStore: CatalogStore,
    mapStore: MapStore,
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
            const response = await catalogStore.getLayerInformation(
                { name: layerName, href: "" },
                workspaceName
            );

            if (response.layer === undefined) {
                continue;
            }

            const detail = await catalogStore.getLayerDetail(response.layer.resource.href);

            if (response.layer.type === "VECTOR") {
                const vectorDetail = detail as GeoServerVectorTypeLayerDetail;
                const dataType = getVectorGeometryType(vectorDetail);
                if (isNullOrEmpty(dataType) || isNullOrEmpty(vectorDetail)) {
                    continue;
                }

                const sourceParams: GeoServerSourceParams = {
                    sourceType: "geoserver",
                    sourceDataType: "vector",
                    sourceProtocol: "wmts",
                    identifier: vectorDetail.featureType.name,
                    isFilterLayer: false,
                    workspaceName,
                    layer: vectorDetail,
                };
                await mapStore.addMapDataSource(sourceParams);

                const layerParams: LayerParams = {
                    sourceType: "geoserver",
                    sourceDataType: "vector",
                    sourceProtocol: "wmts",
                    identifier: vectorDetail.featureType.name,
                    layerType: mapStore.geometryConversion(dataType),
                    geoserverLayerDetails: vectorDetail,
                    sourceLayer: vectorDetail.featureType.name,
                    displayName: vectorDetail.featureType.title ?? undefined,
                };
                await mapStore.addMapLayer(layerParams);

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

                const sourceParams: GeoServerSourceParams = {
                    sourceType: "geoserver",
                    sourceDataType: "raster",
                    sourceProtocol: "wms",
                    identifier: rasterDetail.coverage.name,
                    isFilterLayer: false,
                    workspaceName,
                    layer: rasterDetail,
                };
                await mapStore.addMapDataSource(sourceParams);

                const layerParams: LayerParams = {
                    sourceType: "geoserver",
                    sourceDataType: "raster",
                    sourceProtocol: "wms",
                    identifier: rasterDetail.coverage.name,
                    layerType: "raster",
                    geoserverLayerDetails: rasterDetail,
                    sourceLayer: rasterDetail.coverage.name,
                    displayName: rasterDetail.coverage.title ?? undefined,
                };
                await mapStore.addMapLayer(layerParams);

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

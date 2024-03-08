/* eslint "@typescript-eslint/indent": "off" */
/* eslint "no-tabs": "off" */
import { defineStore, acceptHMRUpdate } from "pinia";
import { ref } from "vue";
import { type GeoServerFeatureType } from "./geoserver";
import { type SourceSpecification, type AddLayerObject } from "maplibre-gl";
import { getRandomHexColor, isNullOrEmpty } from "../core/helpers/functions";
import { type FeatureCollection } from "geojson";
export interface LayerStyleOptions {
	paint?: Record<string, unknown>;
	layout?: Record<string, unknown>;
	minzoom?: number;
	maxzoom?: number;
}
export interface CustomAddLayerObject {
	id: string;
	source: string;
	type: MapLibreLayerTypes;
	"source-layer"?: string;
	paint?: Record<string, unknown>;
	layout?: Record<string, unknown>;
	filterLayer?: boolean;
	filterLayerData?: FeatureCollection
}
export interface LayerObjectWithAttributes extends CustomAddLayerObject {
	details?: GeoServerFeatureType;
}
type SourceType = "geojson"|"geoserver"
type MapLibreLayerTypes = "fill" | "line" | "symbol" | "circle" | "heatmap" | "fill-extrusion" | "raster" | "hillshade" | "background";

export const useMapStore = defineStore("map", () => {
	const map = ref<any>();
	const layersOnMap = ref<LayerObjectWithAttributes[]>([]);
	/**
	 * Adds new source to Maplibre map sources. Source can be GeoJSON data or Geoserver vector tile source.
	 * @param sourceType - Either geojson or geoserver
	 * @param identifier - id for source to add.
	 * @param isFilterLayer - If true, source tagged as a user drawn data. This sources can be used as a filter layer for geometry filtering.
	 * @param workspaceName - Workspace name for Geoserver source. Only required for Geoserver sources.
	 * @param layer - Layer details. Only required for Geoserver sources.
	 * @param geoJSONSrc - GeoJSON data. Only required for GeoJSON sources.
	 * @returns - If success returns recently added source, else throws an error
	 */
	async function addMapDataSource(
		sourceType: SourceType,
		identifier: string,
		isFilterLayer: boolean,
		workspaceName?: string,
		layer?: GeoServerFeatureType,
		geoJSONSrc?: FeatureCollection
	): Promise<SourceSpecification> {
		if (!isNullOrEmpty(map.value)) {
			if (identifier === "") {
				throw new Error("Identifier is required to add source");
			}
			if (sourceType === "geoserver") {
				if (layer === undefined) {
					throw new Error("Layer information required to add geoserver sources");
				}
				if (workspaceName === undefined || workspaceName === "") {
					throw new Error("Workspace name required to add geoserver sources");
				}
				map.value.addSource(identifier, {
					type: "vector",
					tiles: [
						`${import.meta.env.VITE_GEOSERVER_BASE_URL}/gwc/service/wmts
						?REQUEST=GetTile&SERVICE=WMTS&VERSION=1.0.0
						&LAYER=${workspaceName}:${layer.featureType.name}
						&STYLE=
						&TILEMATRIX=EPSG:900913:{z}
						&TILEMATRIXSET=EPSG:900913
						&TILECOL={x}
						&TILEROW={y}
						&format=application/vnd.mapbox-vector-tile`,
					],
				});
				if (!isNullOrEmpty(map.value.getSource(identifier))) {
					return await Promise.resolve(
						map.value.getSource(identifier) as SourceSpecification
					);
				} else {
					throw new Error(
						`Couldn't add requested source: ${identifier}`
					);
				}
			}
			if (sourceType === "geojson") {
				if (geoJSONSrc === undefined) {
					throw new Error("GeoJSON data required to add GeoJSON sources");
				}
				const sourceIdentifier = isFilterLayer ? "drawn-"+identifier : identifier
				map.value.addSource(sourceIdentifier, {
					type:"geojson",
					data: geoJSONSrc
				})
				if (!isNullOrEmpty(map.value.getSource(sourceIdentifier))) {
					return await Promise.resolve(
						map.value.getSource(sourceIdentifier) as SourceSpecification
					);
				} else {
					throw new Error(`Couldn't add requested source: ${identifier}`);
				}
			}
			throw new Error("Invalid source type");
		} else {
			throw new Error("There is no map to add source");
		}
	}
	/**
	 * Adds layer with source to map
	 * @param layerID - id for layer to add
	 * @param layerType - which MapLibreLayerType suits for source
	 * @param details - feature details for attribute listing
	 * @param sourceLayer - Which layer from vector tile source. Only required for vector tile sources.
	 * @param layerStyle - If you want to add a style to layer use this parameter
	 * @returns - If succes returns layer, else throws an error
	 */
	async function addLyr(
		layerID: string,
		layerType: MapLibreLayerTypes,
		details: GeoServerFeatureType,
		sourceLayer?: string,
		layerStyle?: LayerStyleOptions
	): Promise<any | undefined> {
		if (!isNullOrEmpty(map.value)) {
			let styling = { ...layerStyle };
			if (isNullOrEmpty(layerStyle)) {
				const styleObj: LayerStyleOptions = {
					paint: createRandomPaintObj(layerType),
				};
				styling = { ...styleObj };
			}
			const layerObject: CustomAddLayerObject = {
				id: `layer-${layerID}`,
				source: layerID,
				type: layerType,
				...styling,
			};
			if (
				sourceLayer !== null &&
				sourceLayer !== undefined &&
				sourceLayer !== ""
			) {
				(layerObject as any)["source-layer"] = sourceLayer;
			}
			map.value.addLayer(layerObject as AddLayerObject);
			if (!isNullOrEmpty(map.value.getLayer(`layer-${layerID}`))) {
				(layerObject as LayerObjectWithAttributes).details = details;
				add2MapLayerList(layerObject as LayerObjectWithAttributes);
				return await Promise.resolve(map.value.getLayer(layerID));
			} else {
				throw new Error(`Couldn't add requested layer: ${layerID}`);
			}
		} else {
			throw new Error(`There is no map to add layer: ${layerID}`);
		}
	}
	async function addGeoJSONLayer(
		layerID: string,
		layerType: MapLibreLayerTypes,
		isFilterLayer: boolean,
		layerStyle?: LayerStyleOptions,
		geoJSONSrc?: FeatureCollection
	): Promise<any | undefined>{
		if (!isNullOrEmpty(map.value)) {
			let styling = { ...layerStyle };
			if (isNullOrEmpty(geoJSONSrc) && isFilterLayer){
				throw new Error("geoJSONSrc is mandatory for filter layers")
			}
			if (isNullOrEmpty(layerStyle)) {
				const styleObj: LayerStyleOptions = {
					paint: createRandomPaintObj(layerType),
				};
				styling = { ...styleObj };
			}
			const layerObject: CustomAddLayerObject = {
				id: layerID,
				source: `drawn-${layerID}`,
				type: layerType,
				filterLayer:isFilterLayer,
				filterLayerData:geoJSONSrc,
				...styling,
			};
			map.value.addLayer(layerObject as AddLayerObject);
			if (!isNullOrEmpty(map.value.getLayer(layerID))) {
				add2MapLayerList(layerObject as LayerObjectWithAttributes);
				return await Promise.resolve(map.value.getLayer(layerID));
			} else {
				throw new Error(`Couldn't add requested layer: ${layerID}`);
			}
		} else {
			throw new Error(`There is no map to add layer: ${layerID}`);
		}
	}
	/**
	 * Adds layers on map to a layerlist for layer listing
	 * @param layerObject detailed layer information
	 */
	function add2MapLayerList(layerObject: LayerObjectWithAttributes): void {
		layersOnMap.value.push(layerObject);
	}
	function createRandomPaintObj(
		type: MapLibreLayerTypes
	): Record<string, any> {
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
	function geometryConversion(geometry: string): MapLibreLayerTypes {
		if (geometry === "Point" || geometry === "MultiPoint") {
			return "circle";
		}
		if (geometry === "LineString" || geometry === "LinearRing") {
			return "line";
		}
		if (
			geometry === "Polygon" ||
			geometry === "MultiPolygon" ||
			geometry === "Geometry"
		) {
			return "fill";
		} else {
			return "heatmap";
		}
	}
	return {
		map,
		layersOnMap,
		addMapDataSource,
		addLyr,
		addGeoJSONLayer,
		geometryConversion,
	};
});
/* eslint-disable */
if (import.meta.hot) {
	import.meta.hot.accept(acceptHMRUpdate(useMapStore, import.meta.hot));
}

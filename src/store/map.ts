/* eslint "@typescript-eslint/indent": "off" */
/* eslint "no-tabs": "off" */
import { defineStore, acceptHMRUpdate } from "pinia";
import { ref } from "vue";
import { type GeoserverRasterTypeLayerDetail, type GeoServerVectorTypeLayerDetail } from "./geoserver";
import { type SourceSpecification, type AddLayerObject } from "maplibre-gl";
import { getRandomHexColor, isNullOrEmpty } from "../core/helpers/functions";
import { type FeatureCollection } from "geojson";
import { useToast } from "primevue/usetoast";
export interface LayerStyleOptions {
	paint?: Record<string, unknown>;
	layout?: Record<string, unknown>;
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
	filterLayer?: boolean;
	layerData?: FeatureCollection;
	displayName?: string;
	showOnLayerList?: boolean;
}
export interface LayerObjectWithAttributes extends CustomAddLayerObject {
	details?: GeoServerVectorTypeLayerDetail|GeoserverRasterTypeLayerDetail;
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
}
export interface GeoJSONLayerParams extends BaseLayerParams {
	sourceType: "geojson";
	geoJSONSrc: FeatureCollection;
	isFilterLayer: boolean;
	isDrawnLayer?: boolean;
}
interface GeoServerLayerParams extends BaseLayerParams {
	sourceType: "geoserver";
	geoserverLayerDetails: GeoServerVectorTypeLayerDetail|GeoserverRasterTypeLayerDetail;
	sourceLayer?: string;
	sourceDataType: "vector" | "raster";
	sourceProtocol?: "wms" | "wmts";
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
	layer: GeoServerVectorTypeLayerDetail|GeoserverRasterTypeLayerDetail;
	sourceDataType: "vector" | "raster";
	sourceProtocol?: "wms" | "wmts";
}
export interface GeoJSONSourceParams extends BaseDataSourceParams {
	sourceType: "geojson";
	geoJSONSrc: FeatureCollection;
}
export type SourceParams = GeoJSONSourceParams | GeoServerSourceParams;
export const useMapStore = defineStore("map", () => {
	const toast = useToast();
	const map = ref<any>();
	const layersOnMap = ref<LayerObjectWithAttributes[]>([]);
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
				throw new Error(
					"Layer information required to add geoserver sources"
				);
			}
			if (
				params.workspaceName === undefined ||
				params.workspaceName === ""
			) {
				throw new Error(
					"Workspace name required to add geoserver sources"
				);
			}
			if (params.sourceProtocol !== undefined || params.sourceProtocol !== "") {
				if (params.sourceProtocol === "wms") {
					if (params.sourceDataType === "raster") {
						/**
						 * @todo Add raster source handling
						 */
						map.value.addSource(identifier, {
							type: "raster",
							tiles: [
								`${import.meta.env.VITE_GEOSERVER_BASE_URL}/wms
								?REQUEST=GetMap
								&SERVICE=WMS
								&VERSION=1.3.0
								&LAYERS=${params.workspaceName}:${(params.layer as GeoserverRasterTypeLayerDetail).coverage.name}
								&STYLES=
								&CRS=EPSG:3857
								&WIDTH=256
								&HEIGHT=256
								&BBOX={bbox-epsg-3857}
								&transparent=true
								&format=image/png
								&TILED=true`,
							],
						});
					}
					if (params.sourceDataType === "vector") {
						map.value.addSource(identifier, {
							type: "vector",
							tiles: [
								`${import.meta.env.VITE_GEOSERVER_BASE_URL}/gwc/service/wmts
								?REQUEST=GetTile&SERVICE=WMTS&VERSION=1.0.0
								&LAYER=${params.workspaceName}:${(params.layer as GeoServerVectorTypeLayerDetail).featureType.name}
								&STYLE=
								&TILEMATRIX=EPSG:900913:{z}
								&TILEMATRIXSET=EPSG:900913
								&TILECOL={x}
								&TILEROW={y}
								&format=application/vnd.mapbox-vector-tile`,
							],
						});
					}
				}
				if (params.sourceProtocol === "wmts") {
					if (params.sourceDataType === "raster") {
						/**
						 * @todo Return error, because raster cannot be added as WMTS
						 */
					}
					if (params.sourceDataType === "vector") {
						map.value.addSource(identifier, {
							type: "vector",
							tiles: [
								`${import.meta.env.VITE_GEOSERVER_BASE_URL}/gwc/service/wmts
								?REQUEST=GetTile&SERVICE=WMTS&VERSION=1.0.0
								&LAYER=${params.workspaceName}:${(params.layer as GeoServerVectorTypeLayerDetail).featureType.name}
								&STYLE=
								&TILEMATRIX=EPSG:900913:{z}
								&TILEMATRIXSET=EPSG:900913
								&TILECOL={x}
								&TILEROW={y}
								&format=application/vnd.mapbox-vector-tile`,
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
			map.value.addSource(identifier, {
				type: "geojson",
				data: params.geoJSONSrc,
			});
		}
		const addedSource = map.value.getSource(identifier);
		if (addedSource !== undefined) {
			console.log(`Source ${identifier} added successfully`);
			return addedSource as SourceSpecification;
		} else {
			throw new Error(`Couldn't add requested source: ${identifier}`);
		}
	}
	/**
	 * Asynchronously deletes a data source from the Maplibre map.
	 * @param {string} identifier - The unique identifier for the source to delete.
	 * @returns {Promise<void>} A promise that resolves if the source is successfully deleted, or rejects with an error.
	 * @throws {Error} Throws an error if the map is not initialized or if the source cannot be found.
	 */
	async function deleteMapDataSource(identifier: string): Promise<void> {
		await new Promise<void>((resolve, reject) => {
			if (isNullOrEmpty(map.value)) {
				reject(new Error("There is no map to delete source from"));
				return;
			}
			const source = map.value.getSource(identifier);
			if (source === undefined) {
				reject(
					new Error(`Source with identifier ${identifier} not found`)
				);
				return;
			}
			map.value.removeSource(identifier);
			console.log(`Source ${identifier} deleted successfully`);
			resolve();
		});
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
		} = params;
		if (isNullOrEmpty(map.value)) {
			throw new Error("There is no map to add layer");
		}
		if (identifier === "") {
			throw new Error("Identifier is required to add layer");
		}
		// Additional validation for geoserver source type
		if (
			sourceType === "geoserver" &&
			!("geoserverLayerDetails" in params)
		) {
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
			...styling,
			// Conditional properties
			...(sourceType === "geoserver" && params.sourceLayer != null
				? { "source-layer": params.sourceLayer }
				: {}),
			...(sourceType === "geojson" && params.isFilterLayer
				? 	{
						filterLayer: params.isFilterLayer,
					}
				: {}),
			...(sourceType === "geojson" && (params.isFilterLayer || (params.isDrawnLayer !== undefined && params.isDrawnLayer))
				? 	{
						layerData: params.geoJSONSrc,
					}
				: {}),
			...(displayName !== undefined && displayName !== ""
				? { displayName }
				: {}),
		};
		// add layer object to map
		map.value.addLayer(layerObject as AddLayerObject);
		if (map.value.getLayer(identifier) === undefined) {
			throw new Error(`Couldn't add requested layer: ${identifier}`);
		}
		if (sourceType === "geoserver") {
			(layerObject as LayerObjectWithAttributes).details =
				params.geoserverLayerDetails;
		}
		add2MapLayerList(layerObject as LayerObjectWithAttributes);
		return await Promise.resolve(map.value.getLayer(identifier));
	}
	/**
	 * Asynchronously deletes a layer from the Maplibre map.
	 * @param {string} identifier - The unique identifier for the layer to delete.
	 * @returns {Promise<void>} A promise that resolves if the layer is successfully deleted, or rejects with an error.
	 * @throws {Error} Throws an error if the map is not initialized or if the layer cannot be found.
	 */
	async function deleteMapLayer(identifier: string, information?: boolean): Promise<void> {
		await new Promise<void>((resolve, reject) => {
			if (isNullOrEmpty(map.value)) {
				reject(new Error("There is no map to delete layer from"));
				return;
			}

			const layer = map.value.getLayer(identifier);

			if (layer === undefined) {
				reject(
					new Error(`Layer with identifier ${identifier} not found`)
				);
				return;
			}

			try {
				map.value.removeLayer(identifier);
				removeFromMapLayerList(identifier, information);
				resolve();
			} catch (error) {
				reject(error);
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
	async function resetMapData(): Promise<void> {
		if (isNullOrEmpty(map.value)) {
			throw new Error("There is no map to reset");
		}
		// Get a list of all layer sources before deleting the layers
		const layerSources = new Set<string>();
		for (const layer of layersOnMap.value) {
			layerSources.add(layer.source);
		}
		const layersToDelete = [...layersOnMap.value];
		// Delete all layers on the map
		await Promise.all(
			layersToDelete.map(async (layer) => {
				try {
					await deleteMapLayer(layer.id);
				} catch (error) {
					console.error(`Error deleting layer ${layer.id}: `, error);
				}
			})
		);
		// Delete all sources on the map
		await Promise.all(
			Array.from(layerSources).map(async (source) => {
				try {
					await deleteMapDataSource(source);
				} catch (error) {
					console.error(`Error deleting source ${source}: `, error);
				}
			})
		);
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
		if (layerType !== "raster"){
			const defaultPaint = createRandomPaintObj(layerType);
			styling = { ...layerStyle };
			if (layerStyle?.paint === undefined) {
				styling.paint = defaultPaint;
			}
		}
		return styling;
	}
	/**
	 * Adds layers on map to a layerlist for layer listing
	 * @param layerObject detailed layer information
	 */
	function add2MapLayerList(layerObject: LayerObjectWithAttributes): void {
		layersOnMap.value.push(layerObject);
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
	 * Removes a layer from the layersOnMap list based on its identifier.
	 * @param {string} identifier - The unique identifier for the layer to remove.
	 * @throws {Error} Throws an error if the layer cannot be found in the list.
	 */
	function removeFromMapLayerList(identifier: string, information?: boolean): void {
		const index = layersOnMap.value.findIndex(
			(layer) => layer.id === identifier
		);
		if (index !== -1) {
			const removedLayer = layersOnMap.value.splice(index, 1);
			if (
				removedLayer[0].showOnLayerList !== undefined &&
				removedLayer[0].showOnLayerList
			) {
				if (information !== undefined && information) {
					toast.add({
						severity: "info",
						summary: "Info",
						detail: `Layer ${identifier} removed from layer list`,
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
		if (
			geometry === "LineString" ||
			geometry === "LinearRing" ||
			geometry === "MultiLineString"
		) {
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
		deleteMapDataSource,
		addMapLayer,
		deleteMapLayer,
		removeFromMapLayerList,
		resetMapData,
		geometryConversion,
	};
});
/* eslint-disable */
if (import.meta.hot) {
	import.meta.hot.accept(acceptHMRUpdate(useMapStore, import.meta.hot));
}

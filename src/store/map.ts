/* eslint "@typescript-eslint/indent": "off" */
/* eslint "no-tabs": "off" */
import { defineStore, acceptHMRUpdate } from "pinia";
import { ref } from "vue";
import { type GeoServerFeatureType } from "./geoserver";
import { type SourceSpecification, type AddLayerObject } from "maplibre-gl";
import { getRandomHexColor, isNullOrEmpty } from "../core/helpers/functions";
import { type FeatureCollection } from "geojson";
import { useToast } from "primevue/usetoast";
export interface LayerStyleOptions {
	paint?: Record<string, unknown>;
	layout?: Record<string, unknown>;
	minzoom?: number;
	maxzoom?: number;
	visibility?: "none"|"visible"
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
	displayName?: string,
	showOnLayerList?: boolean
}
export interface LayerObjectWithAttributes extends CustomAddLayerObject {
	details?: GeoServerFeatureType;
}
type SourceType = "geojson"|"geoserver"
export type MapLibreLayerTypes = "fill" | "line" | "symbol" | "circle" | "heatmap" | "fill-extrusion" | "raster" | "hillshade" | "background";

export const useMapStore = defineStore("map", () => {
	const toast = useToast()
	const map = ref<any>();
	const layersOnMap = ref<LayerObjectWithAttributes[]>([]);
	/**
	 * Asynchronously adds a new data source to Maplibre map sources. The source can be either GeoJSON data or a Geoserver vector tile source.
	 * @param {SourceType} sourceType - Specifies the type of the data source; either "geojson" or "geoserver".
	 * @param {string} identifier - The unique identifier for the source to add.
	 * @param {boolean} isFilterLayer - If true, the source is tagged as user-drawn data, which can be used as a filter layer for geometry filtering.
	 * @param {string} [workspaceName] - The workspace name for the Geoserver source. Required only for Geoserver sources.
	 * @param {GeoServerFeatureType} [layer] - The layer details. Required only for Geoserver sources.
	 * @param {FeatureCollection} [geoJSONSrc] - The GeoJSON data for the source. Required only for GeoJSON sources.
	 * @returns {Promise<SourceSpecification>} A promise that resolves to the added source specification if successful, or rejects with an error.
	 * @throws {Error} Throws an error if the map is not initialized, if required parameters are missing, or if adding the source fails.
	 */
	async function addMapDataSource(
		sourceType: SourceType,
		identifier: string,
		isFilterLayer: boolean,
		workspaceName?: string,
		layer?: GeoServerFeatureType,
		geoJSONSrc?: FeatureCollection
	): Promise<SourceSpecification> {
		if (isNullOrEmpty(map.value)) {
			throw new Error("There is no map to add source");
		}
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
		}
		const addedSource = map.value.getSource(sourceType === "geojson" ? isFilterLayer ? "drawn-"+identifier : identifier : identifier);
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
			reject(new Error(`Source with identifier ${identifier} not found`));
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
	 * Maplibre style options and can tag layers as filter layers for geometry filtering.
	 *
	 * @param {SourceType} sourceType - Specifies the type of the data source for the layer; either "geojson" or "geoserver".
	 * @param {string} identifier - A unique identifier for the layer. This ID is used for adding, accessing, and manipulating the layer within the map instance.
	 * @param {MapLibreLayerTypes} layerType - The type of the layer, determining how the source data is rendered (e.g., "circle", "line", "fill").
	 * @param {LayerStyleOptions} [layerStyle] - Optional style options for customizing the appearance of the layer according to Maplibre's style specification.
	 * @param {GeoServerFeatureType} [geoserverLayerDetails] - Required for GeoServer sourced layers; includes details necessary for attribute listing.
	 * @param {string} [sourceLayer] - Specifies the target layer within a vector tile source. Required for vector tile sources containing multiple layers.
	 * @param {FeatureCollection} [geoJSONSrc] - GeoJSON data for the layer. Required if the source type is "geojson" and isFilterLayer is true.
	 * @param {boolean} [isFilterLayer=false] - If true, marks the layer as a filter layer, which can be used for geometry filtering. Default is false.
	 * @param {string} [displayName] - Optional display name for the layer, used for UI purposes.
	 * @param {string} [sourceIdentifier] - Optional source identifier if the source is already added to the map.
	 * @param {boolean} [showOnLayerList=true] - If true, the layer will be shown in the layer list UI. Default is true.
	 * @returns {Promise<any|undefined>} A promise that resolves with the added layer object if the addition is successful, or rejects with an error message if it fails.
	 * @throws {Error} Throws an error if the map is not initialized, if required parameters are missing, or if the layer cannot be added.
	 */
	async function addMapLayer(
		sourceType: SourceType,
		identifier: string,
		layerType: MapLibreLayerTypes,
		layerStyle?: LayerStyleOptions,
		geoserverLayerDetails?: GeoServerFeatureType,
		sourceLayer?: string,
		geoJSONSrc?: FeatureCollection,
		isFilterLayer: boolean=false,
		displayName?: string,
		sourceIdentifier?: string,
		showOnLayerList: boolean=true,

	): Promise<any|undefined>{
		if (isNullOrEmpty(map.value)) {
			throw new Error("There is no map to add layer");
		}
		if (identifier === "") {
			throw new Error("Identifier is required to add layer");
		}
		// Additional validation for geoserver source type
		if (sourceType === "geoserver" && geoserverLayerDetails === undefined) {
		throw new Error("Layer details required to add geoserver layers");
		}
		// Additional validation for geojson source type
		if (sourceType === "geojson" && geoJSONSrc === undefined) {
		throw new Error("GeoJSON data required to add GeoJSON layers");
		}
		const styling = generateStyling(layerType, layerStyle);

		let source;
		if (sourceIdentifier !== undefined) {
			source = sourceIdentifier;
		} else if (sourceType === "geojson") {
			source = isFilterLayer ? `drawn-${identifier}` : identifier;
		} else {
			source = identifier;
		}
		const layerObject: CustomAddLayerObject = {
			id: identifier,
			source,
			type: layerType,
			showOnLayerList,
			...styling,
			// Conditional properties
			...(sourceLayer !== undefined && sourceLayer !== "" ? { "source-layer": sourceLayer } : {}),
			...(isFilterLayer ? { filterLayer: isFilterLayer, filterLayerData: geoJSONSrc } : {}),
			...(displayName !== undefined && displayName !== "" ? { displayName }:{})
		};
		// add layer object to map
		map.value.addLayer(layerObject as AddLayerObject);
		if (map.value.getLayer(identifier) === undefined) {
			throw new Error(`Couldn't add requested layer: ${identifier}`);
		}
		if (sourceType === "geoserver") {
			(layerObject as LayerObjectWithAttributes).details = geoserverLayerDetails;
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
	async function deleteMapLayer(identifier: string): Promise<void> {
		await new Promise<void>((resolve, reject) => {
		if (isNullOrEmpty(map.value)) {
			reject(new Error("There is no map to delete layer from"));
			return;
		}

		const layer = map.value.getLayer(identifier);

		if (layer === undefined) {
			reject(new Error(`Layer with identifier ${identifier} not found`));
			return;
		}

		try {
			map.value.removeLayer(identifier);
			removeFromMapLayerList(identifier);
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
	function generateStyling(layerType: MapLibreLayerTypes, layerStyle?: LayerStyleOptions): LayerStyleOptions {
		let styling: LayerStyleOptions = {};
		const defaultPaint = createRandomPaintObj(layerType);
		styling = { ...layerStyle };
		if (layerStyle?.paint === undefined) {
			styling.paint = defaultPaint;
		}
		return styling;
	}
	/**
	 * Adds layers on map to a layerlist for layer listing
	 * @param layerObject detailed layer information
	 */
	function add2MapLayerList(layerObject: LayerObjectWithAttributes): void {
		layersOnMap.value.push(layerObject);
		toast.add({ severity: "success", summary: "Success", detail: `Layer ${layerObject.displayName ?? layerObject.id} added successfully`, life: 3000 });
	}
	/**
	 * Removes a layer from the layersOnMap list based on its identifier.
	 * @param {string} identifier - The unique identifier for the layer to remove.
	 * @throws {Error} Throws an error if the layer cannot be found in the list.
	 */
	function removeFromMapLayerList(identifier: string): void {
		const index = layersOnMap.value.findIndex(layer => layer.id === identifier);
		if (index !== -1) {
		layersOnMap.value.splice(index, 1);
		toast.add({ severity: "success", summary: "Success", detail: `Layer ${identifier} removed successfully`, life: 3000 });
		} else {
		throw new Error(`Layer with identifier ${identifier} not found in layer list`);
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
		if (geometry === "LineString" || geometry === "LinearRing" || geometry === "MultiLineString") {
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

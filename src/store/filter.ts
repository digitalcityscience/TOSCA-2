/* eslint "@typescript-eslint/indent": "off" */
/* eslint "no-tabs": "off" */
import { defineStore, acceptHMRUpdate } from "pinia";
import { ref } from "vue";
import { type GeoServerFeatureTypeAttribute } from "./geoserver";
import { type MultiPolygon, type FeatureCollection, type Feature, type Polygon } from "geojson";
import { isNullOrEmpty } from "../core/helpers/functions";
import { type MapLibreLayerTypes, useMapStore } from "./map";
import booleanWithin from "@turf/boolean-within";
import flatten from "@turf/flatten";
import { type MapGeoJSONFeature } from "maplibre-gl";

export type IntegerFilters = ">" | ">=" | "<" | "<=" | "==" | "!=";
export type StringFilters = "==" | "!=" | "in";
export type RelationTypes = "AND" | "OR"
export interface AppliedFiltersListItem {
  layerName: string,
  attributeFilters?: AttributeFilterItem[],
  geometryFilters?: GeometryFilterItem,
  attributeRelation?: RelationTypes
}
export interface GeometryFilterTargetItem {
  filterGeoJSON: FeatureCollection,
  identifier?: string
}
export interface GeometryFilterItem extends GeometryFilterTargetItem{
  targetLayerSourceType: MapLibreLayerTypes
  filterArray?: Array<string|number>,
}
export interface AttributeFilterItem {
  attribute: GeoServerFeatureTypeAttribute;
  operand: IntegerFilters | StringFilters;
  value: string
}
export const useFilterStore = defineStore("filter", () => {
  const mapStore = useMapStore()
  const attributeList = ref<GeoServerFeatureTypeAttribute[]>([]);
  const integerFilters = [">", ">=", "<", "<=", "==", "!="];
  const stringFilters = ["==", "!=", "in"];
  const filterNames = {
    ">": "greater than",
    ">=": "greater than or equal to",
    "<": "less than",
    "<=": "less than or equal to",
    "==": "equal to",
    "!=": "not equal to",
    in: "in",
  };
  const allowedBindings = [
    "java.lang.String",
    "java.lang.Integer",
    "java.lang.Long",
    "java.lang.Double",
  ];
  const allowedIDBindings = [
    "java.lang.String",
    "java.lang.Integer",
  ]
  const appliedFiltersList = ref<AppliedFiltersListItem[]>([])
/**
 * Adds a new attribute filter to the specified layer.
 * If a filter with the same attribute and operand already exists, it will throw an error.
 *
 * @param layername - The name of the target layer for the filter.
 * @param attributeFilter - The filter object containing attribute, operand, and value.
 * @param relationType - The relation type between the filters (default is "AND").
 * @returns A Promise that resolves to the updated applied filter list for the specified layer.
 * @throws {Error} If the filter is already applied to the layer.
 */
  async function addAttributeFilter(layername: string, attributeFilter: AttributeFilterItem, relationType: RelationTypes = "AND"): Promise<AppliedFiltersListItem> {
    const layerFilters = appliedFiltersList.value.find((item) => { return item.layerName === layername })
    if (appliedFiltersList.value.length > 0 && layerFilters !== undefined){
        if (layerFilters.attributeFilters !== undefined){
              let isinFilters = false
              layerFilters.attributeFilters.forEach(filter => {
                if ((filter.attribute.name === attributeFilter.attribute.name) && (filter.operand === attributeFilter.operand)){
                  isinFilters = true
                }
              });
              if (!isinFilters) {
                layerFilters.attributeFilters.push(attributeFilter)
              } else {
                throw new Error(`Requested filter already set: ${attributeFilter.attribute.name} ${filterNames[attributeFilter.operand]} ${attributeFilter.value}`)
              }
        } else {
          layerFilters.attributeFilters = [attributeFilter]
        }
    return await Promise.resolve(appliedFiltersList.value.filter((item) => { return item.layerName === layername })[0])
    } else {
      const newFilter: AppliedFiltersListItem = {
        layerName: layername,
        attributeFilters: [attributeFilter],
        attributeRelation: relationType
      }
      appliedFiltersList.value.push(newFilter)
      return await Promise.resolve(newFilter)
    }
  }
/**
 * Removes an attribute filter from the specified layer's filter list.
 *
 * @param layername - The name of the target layer from which to remove the filter.
 * @param attributeFilter - The filter object to remove.
 * @returns A Promise that resolves to the updated applied filter list for the specified layer.
 * @throws {Error} If the filter is not found or the layer does not exist.
 */
async function removeAttributeFilter(layername: string, attributeFilter: AttributeFilterItem): Promise<AppliedFiltersListItem> {
  const layerFiltersIndex = appliedFiltersList.value.findIndex(item => item.layerName === layername);
  if (layerFiltersIndex !== -1) {
    const layerFilters = appliedFiltersList.value[layerFiltersIndex];
    if (layerFilters.attributeFilters !== undefined) {
      const filterIndex = layerFilters.attributeFilters.findIndex(filter =>
        filter.attribute.name === attributeFilter.attribute.name && filter.operand === attributeFilter.operand);
      if (filterIndex !== -1) {
        // Remove the filter from the list
        appliedFiltersList.value[layerFiltersIndex].attributeFilters!.splice(filterIndex, 1)
        if (layerFilters.attributeFilters.length === 0) {
          delete layerFilters.attributeFilters;
          delete layerFilters.attributeRelation;
        }
        return await Promise.resolve(appliedFiltersList.value[layerFiltersIndex]);
      } else {
        throw new Error(`Filter not found: ${attributeFilter.attribute.name} ${filterNames[attributeFilter.operand]} ${attributeFilter.value}`);
      }
    } else {
      return await Promise.resolve(appliedFiltersList.value[layerFiltersIndex])
    }
  } else {
    throw new Error(`Layer not found: ${layername}`);
  }
}

/**
 * Adds a geometry filter to the specified layer.
 *
 * @param layername - The name of the target layer for the geometry filter.
 * @param geometryFilter - The geometry filter object containing filter information and source type.
 * @returns A Promise that resolves to the updated applied filter list for the specified layer.
 * @throws {Error} If the filterGeoJSON is not a valid FeatureCollection or the identifier is missing.
 */
  async function addGeometryFilter(layername: string, geometryFilter: GeometryFilterItem): Promise<AppliedFiltersListItem> {
    if (geometryFilter.targetLayerSourceType === undefined) {
      throw new Error("There is no target layer source type")
    }
    if (geometryFilter.filterGeoJSON.type !== "FeatureCollection") {
      throw new Error("Filter geojson is not a feature collection")
    }
    if (geometryFilter.filterGeoJSON.features.length<1){
      throw new Error("There is no geometry feature")
    }
    // create id list for filtering
    if (isNullOrEmpty(geometryFilter.identifier)){
      throw new Error("There is no identifier")
    }
    if (geometryFilter.filterArray?.length === 0){
      throw new Error("There is no array of identifiers")
    }
    const layerFilters = appliedFiltersList.value.find((item) => { return item.layerName === layername })
      if (layerFilters !== undefined){
        layerFilters.geometryFilters = { ...geometryFilter }
        return await Promise.resolve(appliedFiltersList.value.find((item) => { return item.layerName === layername })!)
      } else {
        const appliedFilter: AppliedFiltersListItem = {
          layerName:layername,
          geometryFilters:geometryFilter
        }
        appliedFiltersList.value.push(appliedFilter)
        return await Promise.resolve(appliedFiltersList.value.find((item) => { return item.layerName === layername })!)
      }
  }
/**
 * Removes the geometry filter from the specified layer.
 *
 * @param layername - The name of the target layer from which to remove the geometry filter.
 * @returns A Promise that resolves to the updated applied filter list for the specified layer.
 * @throws {Error} If the layer or geometry filter is not found or couldn't be deleted.
 */
  async function removeGeometryFilter(layername: string): Promise<AppliedFiltersListItem> {
    const layerFiltersIndex = appliedFiltersList.value.findIndex(item => item.layerName === layername)
    if (layerFiltersIndex !== -1) {
      if (appliedFiltersList.value[layerFiltersIndex].geometryFilters !== undefined) {
        delete appliedFiltersList.value[layerFiltersIndex].geometryFilters
        if (appliedFiltersList.value[layerFiltersIndex].geometryFilters === undefined){
          return await Promise.resolve(appliedFiltersList.value[layerFiltersIndex])
        } else {
          throw new Error("Couldn't delete geometry filter. Please try again.")
        }
      } else {
        throw new Error("Geometry filter not found");
      }
    } else {
      throw new Error(`Layer not found: ${layername}`);
    }
  }
/**
 * Generates a MapLibre expression based on the specified filters applied to a layer.
 *
 * @param appliedFilters - The filters applied to the layer.
 * @param attributeRelation - The relation type between the attribute filters ("AND" or "OR").
 * @returns A Promise that resolves to a MapLibre filter expression for the specified layer.
 */
  async function populateLayerFilter(appliedFilters: AppliedFiltersListItem, attributeRelation: RelationTypes): Promise<any[]> {
    const expressionBlock: any[] = ["all"]
    if (appliedFilters.attributeFilters !== undefined){
      if (appliedFilters.attributeFilters.length > 0){
        const appliedFilterBlock: any[] = []
        if (attributeRelation === "AND"){
          appliedFilterBlock.push("all")
        } else {
          appliedFilterBlock.push("any")
        }
        appliedFilters.attributeFilters.forEach((filter)=>{
          if (filter.attribute.binding==="java.lang.String") {
            appliedFilterBlock.push([filter.operand, ["downcase", ["get", filter.attribute.name]], filter.value.toLowerCase()])
          } else {
            appliedFilterBlock.push([filter.operand, ["get", filter.attribute.name], parseFloat(filter.value)])
          }
        })
        if (appliedFilterBlock.length>0){
          expressionBlock.push(appliedFilterBlock)
        }
      }
    }
    if (appliedFilters.geometryFilters !== undefined){
      if (appliedFilters.geometryFilters.targetLayerSourceType === "fill"||appliedFilters.geometryFilters.targetLayerSourceType === "circle" || appliedFilters.geometryFilters.targetLayerSourceType === "line"){
        if (appliedFilters.geometryFilters.filterArray!.length>0){
          const geomFiltetExpression = ["in", ["get", appliedFilters.geometryFilters.identifier], ["literal", appliedFilters.geometryFilters.filterArray]]
          expressionBlock.push(geomFiltetExpression)
        }
      }
    }
    if (expressionBlock.length>1){
      return await Promise.resolve(expressionBlock)
    } else {
      return await Promise.resolve(expressionBlock)
    }
  }
/**
 * Creates a list of identifiers for features that fall within the specified geometry filter on a given layer.
 *
 * @param layerName - The name of the target layer to apply the geometry filter.
 * @param geometryFilter - The geometry filter object containing the target GeoJSON and identifier.
 * @returns An array of feature identifiers that are within the given geometry.
 */
  function createGeometryFilter(layerName: string, geometryFilter: GeometryFilterTargetItem): Array<string|number> {
    const mapFeatureList: MapGeoJSONFeature[] = mapStore.map.queryRenderedFeatures({ layers:[layerName] })
    if (geometryFilter.identifier !== undefined && mapFeatureList.length>0){
      const filteredMapFeatureList = mapFeatureList.filter((feature)=>{
        if (feature.geometry.type === "MultiPolygon"){
          const polygons = flatten(feature.geometry)
          return polygons.features.some((poly: Feature<Polygon|MultiPolygon>)=> {
            for (const filterFeature of geometryFilter.filterGeoJSON.features) {
              if (booleanWithin(poly.geometry, filterFeature.geometry)) {
                return true
              }
            }
            return false
          })
        } else {
          for (const filterFeature of geometryFilter.filterGeoJSON.features) {
            if (booleanWithin(feature, filterFeature.geometry)) {
              return true
            }
          }
          return false
        }
      })
      const filteredIDArray = filteredMapFeatureList.map(mapFeature=>mapFeature.properties?.[geometryFilter.identifier!])
      return filteredIDArray
    } else {
      return []
    }
  }
  return {
    attributeList,
    integerFilters,
    stringFilters,
    filterNames,
    allowedBindings,
    allowedIDBindings,
    appliedFiltersList,
    addAttributeFilter,
    removeAttributeFilter,
    addGeometryFilter,
    removeGeometryFilter,
    createGeometryFilter,
    populateLayerFilter
  };
});
/* eslint-disable */
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useFilterStore, import.meta.hot));
}

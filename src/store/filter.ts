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
   * Verify whether a filter with an identical attribute and operand already exists in the filter list. If not, append the new filter to the layer's filter list.
   * @param layername - Target layer for filter
   * @param attributeFilter  - Filter information
   * @returns - Filterlist to apply to specified layer
   */
  async function addAttributeFilter(layername: string, attributeFilter: AttributeFilterItem): Promise<AppliedFiltersListItem> {
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
        attributeFilters: [attributeFilter]
      }
      appliedFiltersList.value.push(newFilter)
      return await Promise.resolve(newFilter)
    }
  }
  /**
 * Removes a filter with a specific attribute and operand from the filter list of a given layer.
 * @param layername - Target layer for filter removal
 * @param attributeFilter  - Filter information to remove
 * @returns - Updated filter list for the specified layer
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
   * Verify whether a filter with an identical attribute and operand already exists in the filter list. If not, append the new filter to the layer's filter list.
   * @param layername - Target layer for filter
   * @param attributeFilter  - Filter information
   * @returns - Filterlist to apply to specified layer
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
    if (geometryFilter.targetLayerSourceType === "fill") {
      // create id list for filtering
      if (isNullOrEmpty(geometryFilter.identifier)){
        throw new Error("There is no identifier")
      }
      if (geometryFilter.filterArray?.length === 0){
        throw new Error("There is no array of identifiers")
      }
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
   * Removes geometry filter from specified layer
   * @param layername target layer
   * @returns sth
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
   * Creates maplibre expression based on specified filters on layer
   * @param appliedFilters
   * @param attributeRelation
   * @returns maplibre expression for filtering
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
      if (appliedFilters.geometryFilters.targetLayerSourceType === "fill"){
        if (appliedFilters.geometryFilters.filterArray!.length>0){
          const geomFiltetExpression = ["in", ["get", appliedFilters.geometryFilters.identifier], ["literal", appliedFilters.geometryFilters.filterArray]]
          expressionBlock.push(geomFiltetExpression)
        }
      }
      if (appliedFilters.geometryFilters.targetLayerSourceType === "circle" || appliedFilters.geometryFilters.targetLayerSourceType === "line"){
        const geomFiltetExpression = ["within", appliedFilters.geometryFilters.filterGeoJSON]
        expressionBlock.push(geomFiltetExpression)
      }
    }
    if (expressionBlock.length>1){
      return await Promise.resolve(expressionBlock)
    } else {
      return await Promise.resolve(expressionBlock)
    }
  }
  /**
   * This function retrieves all features currently rendered on the map for a specified layer. It then evaluates each feature to determine whether it lies within a provided GeoJSON geometry. Finally, the function compiles a list of identifiers for those features that are found to be within the given geometry.
   * @param layerName layer to filter
   * @param geometryFilter geometryfilteritem object
   * @returns list of identifier
   */
  function createGeometryFilter(layerName: string, geometryFilter: GeometryFilterTargetItem): Array<string|number> {
    const mapFeatureList: MapGeoJSONFeature[] = mapStore.map.queryRenderedFeatures({ layers:[layerName] })
    if (mapFeatureList.length>0){
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

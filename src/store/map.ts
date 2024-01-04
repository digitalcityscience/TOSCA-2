import { defineStore, acceptHMRUpdate } from "pinia";
import { ref } from "vue";
import { GeoServerFeatureType } from "./geoserver";
import { SourceSpecification } from "maplibre-gl";
import { getRandomHexColor } from "../core/helpers/functions";
interface LayerStyleOptions {
  paint?: Object;
  layout?: Object;
  minzoom?: number;
  maxzoom?: number;
}
export interface CustomAddLayerObject {
  id: string;
  source: string;
  type: MapLibreLayerTypes;
  "source-layer"?: string;
  paint?: Object;
  layout?: Object;
}
export interface LayerObjectWithAttributes extends CustomAddLayerObject {
  details:GeoServerFeatureType
}
type MapLibreLayerTypes = "fill" | "line" | "symbol" | "circle" | "heatmap" | "fill-extrusion" | "raster" | "hillshade" | "background";

export const useMapStore = defineStore("map", () => {
  const map = ref<any>();
  const layersOnMap = ref<Array<LayerObjectWithAttributes>>([])
  /**
   * Add's a new source to maplibre map sources.
   * @param layer - Layer details
   * @param workspaceName -Layer's workspace name
   * @param sourceID - id for source to add
   * @returns - If success returns source, else throws an error
   */
  async function addSrc(
    layer: GeoServerFeatureType,
    workspaceName: string,
    sourceID: string
  ):Promise<SourceSpecification> {
    if (map.value) {
      console.log(map.value.getSource(sourceID))
      map.value.addSource(sourceID, {
        type: "vector",
        tiles: [
          `${
            import.meta.env.VITE_GEOSERVER_BASE_URL
          }/gwc/service/wmts?REQUEST=GetTile&SERVICE=WMTS&VERSION=1.0.0&LAYER=${workspaceName}:${
            layer.featureType.name
          }&STYLE=&TILEMATRIX=EPSG:900913:{z}&TILEMATRIXSET=EPSG:900913&TILECOL={x}&TILEROW={y}&format=application/vnd.mapbox-vector-tile`,
        ],
      });
      console.log(map.value.getSource(sourceID))
      if (map.value.getSource(sourceID)) {
        return Promise.resolve(map.value.getSource(sourceID) as SourceSpecification);
      } else {
        throw new Error(`Couldn't add requested source: ${sourceID}`);
      }
    } else {
      throw new Error(`There is no map to add source: ${sourceID}`);
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
    details:GeoServerFeatureType,
    sourceLayer?: string,
    layerStyle?: LayerStyleOptions
  ) {
    if (map.value) {
      let styling = {...layerStyle}
      if(!layerStyle){
        let styleObj: LayerStyleOptions = {
          paint:createRandomPaintObj(layerType),
        }
        styling = {...styleObj}
      }
      const layerObject: CustomAddLayerObject = {
        id: `layer-${layerID}`,
        source: layerID,
        type: layerType,
        ...styling,
      };
      if (sourceLayer) {
        (layerObject as any)["source-layer"] = sourceLayer;
      }
      console.log(layerObject)
      map.value.addLayer(layerObject);
      if (map.value.getLayer(`layer-${layerID}`)) {
        (layerObject as LayerObjectWithAttributes)["details"] = details
        add2MapLayerList(layerObject as LayerObjectWithAttributes)
        return Promise.resolve(map.value.getLayer(layerID));
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
  function add2MapLayerList(layerObject:LayerObjectWithAttributes){
    layersOnMap.value.push(layerObject)
  }
  function createRandomPaintObj(type:MapLibreLayerTypes){
    let color = getRandomHexColor()
    switch (type) {
      case 'circle':
        return {
          'circle-color':color,
          'circle-opacity':1,
          'circle-radius':8,
        }
      case 'fill':
        return {
          'fill-color':color,
          'fill-opacity':0.6,
          'fill-outline-color':'#000000',
        }
      case 'line':
        return {
          'line-color':color,
          'line-opacity':1,
          'line-width':3,
        }
      default:
        return {
          'heatmap-color':color,
          'heatmap-opacity':1,
          'heatmap-radius':20,
        }
    }
  }
  function geometryConversion(geometry: string): MapLibreLayerTypes {
    if (geometry == "Point" || geometry == "MultiPoint") {
      return "circle";
    }
    if (geometry == "LineString" || geometry == "LinearRing") {
      return "line";
    }
    if (geometry == "Polygon" || geometry == "MultiPolygon" || geometry=="Geometry") {
      return "fill";
    } else {
      return "heatmap";
    }
  }
  return {
    map,
    layersOnMap,
    addSrc,
    addLyr,
    geometryConversion,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useMapStore, import.meta.hot));
}

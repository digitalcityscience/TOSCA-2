import { defineStore, acceptHMRUpdate } from 'pinia'
import { ref } from 'vue'
export interface GeoServerFeatureType {
    featureType: {
      name: string;
      nativeName: string;
      namespace: {
        name: string;
        href: string;
      };
      title: string;
      abstract: string;
      keywords: {
        string: string[];
      };
      nativeCRS: string;
      srs: string;
      nativeBoundingBox: {
        minx: number;
        maxx: number;
        miny: number;
        maxy: number;
        crs: string;
      };
      latLonBoundingBox: {
        minx: number;
        maxx: number;
        miny: number;
        maxy: number;
        crs: string;
      };
      projectionPolicy: string;
      enabled: boolean;
      store: {
        "@class": string;
        name: string;
        href: string;
      };
      serviceConfiguration: boolean;
      simpleConversionEnabled: boolean;
      internationalTitle: string;
      internationalAbstract: string;
      maxFeatures: number;
      numDecimals: number;
      padWithZeros: boolean;
      forcedDecimal: boolean;
      overridingServiceSRS: boolean;
      skipNumberMatched: boolean;
      circularArcPresent: boolean;
      attributes: {
        attribute: Array<GeoServerFeatureTypeAttribute>;
      };
    };
  }
export interface GeoServerFeatureTypeAttribute {
  name: string;
  minOccurs: number;
  maxOccurs: number;
  nillable: boolean;
  binding: string;
}
export interface GeoserverLayerInfo{
        name: string;
        type: string;
        defaultStyle: {
          name: string;
          href: string;
        };
        resource: {
          "@class": string;
          name: string;
          href: string;
        };
        attribution: {
          logoWidth: number;
          logoHeight: number;
        };
        dateCreated: string;
        dateModified: string;
}
export interface GeoserverLayerInfoResponse{
    layer: GeoserverLayerInfo
}
export interface GeoserverLayerListItem {
    name:string
    href:string
}
export interface GeoserverLayerListResponse {
    layers: {
        layer : GeoserverLayerListItem[]
    }
}
export interface WorkspaceListItem{
    name:string
    href:string
}
export interface WorkspaceListResponse {
    workspaces: {
        workspace : WorkspaceListItem[]
    }
}
export const useGeoserverStore = defineStore('geoserver', () => {

 const pointData = ref()
 const auth = btoa(`${import.meta.env.VITE_GEOSERVER_USERNAME+':'+import.meta.env.VITE_GEOSERVER_PASSWORD}`)
 const layerList = ref<Array<GeoserverLayerListItem>>()
 const workspaceList = ref<Array<WorkspaceListItem>>()
 /**
  * Gets layer list from geoserver. If optional workspace argument used it returns only layer list under this workspace.
  * @returns
  */
 async function getLayerList(workspaceName?:string):Promise<GeoserverLayerListResponse>{
    let url = new URL(`${import.meta.env.VITE_GEOSERVER_REST_URL}/layers`)
    if(workspaceName){
        url = new URL(`${import.meta.env.VITE_GEOSERVER_REST_URL}/workspaces/${workspaceName}/layers`)
    }
    const response = await fetch(url,{ 
        method:'GET',
        redirect:'follow',
        headers: new Headers({
            'Content-Type':'application/json',
            'Authorization': `Basic ${auth}`
        }) 
    })
    return response.json()
 }
 /**
  * Lists all workspaces user has access in geoserver.
  * @returns
  */
 async function getWorkspaceList():Promise<WorkspaceListResponse>{
    const url = new URL(`${import.meta.env.VITE_GEOSERVER_REST_URL}/workspaces`)
    const response = await fetch(url,{ 
        method:'GET',
        redirect:'follow',
        headers: new Headers({
            'Content-Type':'application/json',
            'Authorization': `Basic ${auth}`
        }) 
    })
    return response.json()
 }
/**
 * Retrieves layer information based on GeoserverLayerInfo.
 *
 * @param layer - The layer for which to retrieve information.
 * @param workspace - The workspace in which the layer is located.
 * @returns - A Promise resolving to the JSON representation of the layer information.
 */
 async function getLayerInformation(layer:GeoserverLayerListItem,workspace:string):Promise<GeoserverLayerInfoResponse> {
    const url = new URL(`${import.meta.env.VITE_GEOSERVER_REST_URL}/workspaces/${workspace}/layers/${layer.name}`)
    const response = await fetch(url,{ 
        method:'GET',
        redirect:'follow',
        headers: new Headers({
            'Content-Type':'application/json',
            'Authorization': `Basic ${auth}`
        }) 
    })
    return response.json()
 }
 /**
 * Retrieves detailed layer information.
 *
 * @param url - Resource.href from GeoserverLayerInfo
 * @returns - A Promise resolving to the JSON representation of the layer detailed information.
 */
 async function getLayerDetail(url:string):Promise<GeoServerFeatureType> {
    const response = await fetch(url,{
        method:'GET',
        redirect:'follow',
        headers: new Headers({
            'Content-Type':'application/json',
            'Authorization': `Basic ${auth}`
        }) 
    })
    return response.json()
 }
 return {
    pointData,
    layerList,
    workspaceList,
    getLayerList,
    getWorkspaceList,
    getLayerInformation,
    getLayerDetail
 }
})

if (import.meta.hot) {
 import.meta.hot.accept(acceptHMRUpdate(useGeoserverStore, import.meta.hot))
}

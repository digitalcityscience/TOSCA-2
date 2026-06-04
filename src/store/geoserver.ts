/* eslint "@typescript-eslint/indent": "off" */
/* eslint "no-tabs": "off" */
import { defineStore, acceptHMRUpdate } from "pinia";
import { ref } from "vue";
export interface GeoServerVectorTypeLayerDetail {
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
      attribute: GeoServerFeatureTypeAttribute[];
    };
  };
}
export interface GeoserverRasterTypeLayerDetail {
  coverage: {
    name: string,
    nativeName: string,
    namespace: {
      name: string,
      href: string
    },
    title: string,
    description: string,
    keywords: {
      string: string[]
    },
    nativeCRS: string
    srs: string,
    nativeBoundingBox: {
      minx: number,
      maxx: number,
      miny: number,
      maxy: number,
      crs: string
    },
    latLonBoundingBox: {
      minx: number,
      maxx: number,
      miny: number,
      maxy: number,
      crs: string
    },
    projectionPolicy: string,
    enabled: boolean,
    metadata: {
      entry: Array<Record<string, unknown>>
    },
    store: {
      "@class": string,
      name: string,
      href: string
    },
    serviceConfiguration: boolean,
    simpleConversionEnabled: boolean,
    internationalTitle: string,
    internationalAbstract: string,
    nativeFormat: string,
    grid: {
      "@dimension": number,
      range: {
        low: string,
        high: string
      },
      transform: {
        scaleX: string,
        scaleY: string,
        shearX: number,
        shearY: number,
        translateX: number,
        translateY: number
      },
      crs: string
    },
    supportedFormats: {
      string: string[]
    },
    interpolationMethods: {
      string: string[]
    },
    defaultInterpolationMethod: string,
    dimensions: {
      coverageDimension: Array<Record<string, unknown>>
    },
    requestSRS: {
      string: string
    },
    responseSRS: {
      string: string
    },
    parameters: {
      entry: Array<Record<string, unknown>>
    },
    nativeCoverageName: string
  }
}
export interface GeoServerFeatureTypeAttribute {
  name: string;
  minOccurs: number;
  maxOccurs: number;
  nillable: boolean;
  binding: string;
}
export interface GeoserverLayerInfo {
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
export interface GeoserverLayerInfoResponse {
  layer: GeoserverLayerInfo;
}
export interface GeoserverLayerListItem {
  name: string;
  href: string;
}
export interface GeoserverLayerListResponse {
  layers: {
    layer: GeoserverLayerListItem[];
  };
}
export interface WorkspaceListItem {
  name: string;
  href: string;
}
export interface WorkspaceListResponse {
  workspaces: {
    workspace: WorkspaceListItem[];
  };
}
export interface WmsTimeDimension {
  /** Discrete time values from the Extent element, in source order. */
  values: string[];
  /** Default time value advertised by GeoServer (Extent @default). */
  default: string;
  /** Unit of measure, typically "ISO8601". */
  units: string;
  /** Whether the server returns the nearest available time when the request does not match exactly. */
  nearestValue: boolean;
}
export interface WmsBoundingBox {
  srs: string;
  minx: number;
  miny: number;
  maxx: number;
  maxy: number;
}
export interface WmsCapabilitiesLayer {
  name: string;
  title: string;
  abstract: string;
  keywords: string[];
  srsList: string[];
  latLonBoundingBox?: Omit<WmsBoundingBox, "srs">;
  boundingBoxes: WmsBoundingBox[];
  queryable: boolean;
  opaque: boolean;
  timeDimension?: WmsTimeDimension;
}
export interface WmsCapabilities {
  version: string;
  workspace: string;
  layers: Map<string, WmsCapabilitiesLayer>;
}
/**
 * Parses a WMS 1.1.1 GetCapabilities XML document into a flat lookup of
 * leaf layers keyed by `<Name>`. Nested container layers (those without a
 * `<Name>`) are traversed but not emitted.
 *
 * The parser is intentionally tolerant: missing optional elements yield
 * empty arrays/undefined rather than throwing, so unrelated callers can rely
 * on the structure without null checks for every field.
 */
export function parseWmsCapabilities(
  xml: string,
  workspace: string
): WmsCapabilities {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError !== null) {
    throw new Error(`Failed to parse WMS capabilities XML: ${parseError.textContent ?? ""}`);
  }
  const root = doc.documentElement;
  const version = root.getAttribute("version") ?? "1.3.0";
  const layers = new Map<string, WmsCapabilitiesLayer>();
  const layerElements = root.querySelectorAll("Capability > Layer Layer");
  layerElements.forEach((el) => {
    const nameEl = Array.from(el.children).find((c) => c.tagName === "Name");
    if (nameEl?.textContent === null || nameEl?.textContent === undefined || nameEl.textContent === "") {
      return;
    }
    const name = nameEl.textContent;
    const getChildText = (tag: string): string =>
      Array.from(el.children).find((c) => c.tagName === tag)?.textContent ?? "";
    const srsList = Array.from(el.children)
      .filter((c) => c.tagName === "SRS" || c.tagName === "CRS")
      .map((c) => c.textContent ?? "")
      .filter((s) => s !== "");
    const keywords = Array.from(el.querySelectorAll(":scope > KeywordList > Keyword"))
      .map((k) => k.textContent ?? "")
      .filter((k) => k !== "");
    let latLonBoundingBox: Omit<WmsBoundingBox, "srs"> | undefined;
    const exGeo = el.querySelector(":scope > EX_GeographicBoundingBox");
    if (exGeo !== null) {
      const childNum = (tag: string): number =>
        Number(Array.from(exGeo.children).find((c) => c.tagName === tag)?.textContent ?? "NaN");
      latLonBoundingBox = {
        minx: childNum("westBoundLongitude"),
        maxx: childNum("eastBoundLongitude"),
        miny: childNum("southBoundLatitude"),
        maxy: childNum("northBoundLatitude"),
      };
    } else {
      const llbb = el.querySelector(":scope > LatLonBoundingBox");
      if (llbb !== null) {
        latLonBoundingBox = {
          minx: Number(llbb.getAttribute("minx")),
          miny: Number(llbb.getAttribute("miny")),
          maxx: Number(llbb.getAttribute("maxx")),
          maxy: Number(llbb.getAttribute("maxy")),
        };
      }
    }
    const boundingBoxes = Array.from(el.querySelectorAll(":scope > BoundingBox")).map((b) => ({
      srs: b.getAttribute("SRS") ?? b.getAttribute("CRS") ?? "",
      minx: Number(b.getAttribute("minx")),
      miny: Number(b.getAttribute("miny")),
      maxx: Number(b.getAttribute("maxx")),
      maxy: Number(b.getAttribute("maxy")),
    }));
    let timeDimension: WmsTimeDimension | undefined;
    const timeDim = Array.from(el.querySelectorAll(":scope > Dimension")).find(
      (d) => d.getAttribute("name") === "time"
    );
    // WMS 1.3.0 carries values + default + nearestValue on <Dimension>.
    // WMS 1.1.1 leaves <Dimension> empty and uses a sibling <Extent>.
    const timeExtent = Array.from(el.querySelectorAll(":scope > Extent")).find(
      (e) => e.getAttribute("name") === "time"
    );
    const timeCarrier = (timeDim?.textContent?.trim() ?? "") !== "" ? timeDim : timeExtent;
    if (timeCarrier !== undefined && timeCarrier !== null) {
      const values = (timeCarrier.textContent ?? "")
        .split(",")
        .map((v) => v.trim())
        .filter((v) => v !== "");
      if (values.length > 0) {
        timeDimension = {
          values,
          default: timeCarrier.getAttribute("default") ?? values[values.length - 1],
          units: timeDim?.getAttribute("units") ?? "ISO8601",
          nearestValue: timeCarrier.getAttribute("nearestValue") === "1",
        };
      }
    }
    layers.set(name, {
      name,
      title: getChildText("Title"),
      abstract: getChildText("Abstract"),
      keywords,
      srsList,
      latLonBoundingBox,
      boundingBoxes,
      queryable: el.getAttribute("queryable") === "1",
      opaque: el.getAttribute("opaque") === "1",
      timeDimension,
    });
  });
  return { version, workspace, layers };
}
export const useGeoserverStore = defineStore("geoserver", () => {
  const pointData = ref();
  const auth = btoa(
    `${
      import.meta.env.VITE_GEOSERVER_USERNAME +
      ":" +
      import.meta.env.VITE_GEOSERVER_PASSWORD
    }`
  );
  const layerList = ref<GeoserverLayerListItem[]>();
  const workspaceList = ref<WorkspaceListItem[]>();
  const wmsCapabilitiesCache = new Map<string, Promise<WmsCapabilities>>();
  /**
   * Retrieves a list of layers from GeoServer.
   * If a workspace name is provided, it returns the layers from that specific workspace.
   *
   * @param workspaceName - Optional workspace name to filter the layers.
   * @returns A Promise resolving to a GeoServerLayerListResponse containing the list of layers.
   */
  async function getLayerList(
    workspaceName?: string
  ): Promise<GeoserverLayerListResponse> {
    let url = new URL(`${import.meta.env.VITE_GEOSERVER_REST_URL}/layers`);
    /* eslint-disable */
    if (workspaceName) {
      url = new URL(
        `${
          import.meta.env.VITE_GEOSERVER_REST_URL
        }/workspaces/${workspaceName}/layers`
      );
    }
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: new Headers({
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      }),
    });
    return await response.json();
  }
  /**
   * Retrieves a list of all workspaces the user has access to in GeoServer.
   *
   * @returns A Promise resolving to a WorkspaceListResponse containing the list of workspaces.
   */
  async function getWorkspaceList(): Promise<WorkspaceListResponse> {
    const url = new URL(
      `${import.meta.env.VITE_GEOSERVER_REST_URL}/workspaces`
    );
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: new Headers({
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      }),
    });
    return await response.json();
  }
  /**
   * Retrieves information about a specific layer within a given workspace.
   *
   * @param layer - The layer for which to retrieve information.
   * @param workspace - The workspace containing the layer.
   * @returns A Promise resolving to a GeoserverLayerInfoResponse containing layer information.
   */
  async function getLayerInformation(
    layer: GeoserverLayerListItem,
    workspace: string
  ): Promise<GeoserverLayerInfoResponse> {
    const url = new URL(
      `${
        import.meta.env.VITE_GEOSERVER_REST_URL
      }/workspaces/${workspace}/layers/${layer.name}`
    );
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: new Headers({
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      }),
    });
    return await response.json();
  }
  /**
   * Retrieves detailed information about a specific vector or raster layer from GeoServer.
   *
   * @param url - The URL to the resource containing the layer details.
   * @returns A Promise resolving to a GeoServerVectorTypeLayerDetail or GeoserverRasterTypeLayerDetail.
   */
  async function getLayerDetail(url: string): Promise<GeoServerVectorTypeLayerDetail|GeoserverRasterTypeLayerDetail> {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: new Headers({
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      }),
    });
    return await response.json();
  }
  /**
   * Retrieves a GeoJSON layer source from GeoServer using the WMS service.
   *
   * @param layer - The name of the layer to retrieve.
   * @param workspace - The name of the workspace containing the layer.
   * @param bbox - Optional bounding box to filter the data.
   * @param cqlFilter - Optional CQL filter to apply to the data.
   * @returns A Promise resolving to the GeoJSON object containing the requested layer data.
   */
  async function getGeoJSONLayerSource(layer: string, workspace: string, bbox?:string, cqlFilter?:string): Promise<any> {
    const url = new URL(
      `${import.meta.env.VITE_GEOSERVER_BASE_URL}/${workspace}/wms?service=WMS&version=1.1.0&request=GetMap&layers=${workspace}:${layer}&bbox=${bbox ?? ""}&width=512&height=512&srs=EPSG:4326&format=geojson&CQL_FILTER=${cqlFilter ?? ""}&styles=`
    );
    console.log(url);
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: new Headers({
        "Content-Type": "application/geojson",
        Authorization: `Basic ${auth}`,
      }),
    });
    return await response.json();
  }
  /**
   * Retrieves the layer's styling information from GeoServer.
   *
   * @param url - The URL to the style resource on GeoServer.
   * @returns A Promise resolving to the style object for the layer.
   */
  async function getLayerStyling(url:string):Promise<any> {
    const response = await fetch(url,{
      method: "GET",
      redirect: "follow",
      headers: new Headers({
        "Content-Type": "application/vnd.geoserver.mbstyle+json",
        Authorization: `Basic ${auth}`,
      }),
    });
    if (!response.ok) {
      throw new Error("Failed to fetch layer styling.");
    }
    return response.json();
  }
  /**
   * Fetches and parses the WMS GetCapabilities document for a workspace.
   * Result is cached per workspace for the lifetime of the store, since
   * GetCapabilities is a large document and rarely changes during a session.
   * Pass `force: true` to bypass and refresh the cache.
   *
   * @param workspace - The workspace whose WMS endpoint to query.
   * @param force - When true, ignores any cached value and refetches.
   * @returns Parsed capabilities with a Map of layers keyed by layer name.
   */
  async function fetchWmsCapabilities(
    workspace: string,
    force = false
  ): Promise<WmsCapabilities> {
    if (!force) {
      const cached = wmsCapabilitiesCache.get(workspace);
      if (cached !== undefined) return await cached;
    }
    const url = new URL(
      `${import.meta.env.VITE_GEOSERVER_BASE_URL}/${workspace}/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities`
    );
    const promise = (async (): Promise<WmsCapabilities> => {
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: new Headers({
          Authorization: `Basic ${auth}`,
        }),
      });
      if (!response.ok) {
        throw new Error(
          `Failed to fetch WMS capabilities for ${workspace}: ${response.status}`
        );
      }
      const text = await response.text();
      return parseWmsCapabilities(text, workspace);
    })();
    promise.catch(() => wmsCapabilitiesCache.delete(workspace));
    wmsCapabilitiesCache.set(workspace, promise);
    return await promise;
  }
  return {
    pointData,
    layerList,
    workspaceList,
    getLayerList,
    getWorkspaceList,
    getLayerInformation,
    getLayerDetail,
    getGeoJSONLayerSource,
    getLayerStyling,
    fetchWmsCapabilities
  };
});
/* eslint-disable */
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useGeoserverStore, import.meta.hot));
}

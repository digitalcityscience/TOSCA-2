/* eslint "@typescript-eslint/indent": "off" */
/* eslint "no-tabs": "off" */
import { defineStore, acceptHMRUpdate } from "pinia";
import { ref } from "vue";

const CATALOG_API_PATH = "/api/v1/catalog";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeRootUrl(value: string): string {
  const trimmedValue = trimTrailingSlash(value.trim());
  if (trimmedValue === "") {
    return "";
  }
  if (/^https?:\/\//i.test(trimmedValue)) {
    return trimmedValue;
  }

  throw new Error(
    `VITE_BACKEND_ROOT_URL must be an absolute URL including protocol, for example http://localhost:8000. Received: ${value}`
  );
}

function getEnvValue(key: string): string {
  return String(import.meta.env[key] ?? "").trim();
}

function getBackendRootUrl(): string {
  const backendRoot = normalizeRootUrl(getEnvValue("VITE_BACKEND_ROOT_URL"));
  if (backendRoot !== "") {
    return backendRoot;
  }

  const geonodeRestUrl = normalizeRootUrl(getEnvValue("VITE_GEONODE_REST_URL"));
  if (geonodeRestUrl !== "") {
    return geonodeRestUrl.replace(/\/api$/, "");
  }

  return trimTrailingSlash(window.location.origin);
}

export function buildCatalogUrl(pathSegments: string[] = []): URL {
  const encodedPath = pathSegments
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return new URL(
    `${CATALOG_API_PATH}${encodedPath === "" ? "" : `/${encodedPath}`}`,
    getBackendRootUrl()
  );
}

function resolveApiUrl(urlOrHref: string): URL {
  return new URL(urlOrHref, getBackendRootUrl());
}

function buildJsonHeaders(contentType = "application/json"): Headers {
  return new Headers({
    "Content-Type": contentType,
  });
}

function logCatalogTiming(message: string, details?: Record<string, unknown>): void {
  console.log(
    `[tosca-perf ${new Date().toISOString()} +${performance.now().toFixed(1)}ms] catalog:${message}`,
    details ?? ""
  );
}

async function fetchJson<T>(
  url: URL,
  contentType = "application/json"
): Promise<T> {
  const startedAt = performance.now();
  logCatalogTiming("request:start", {
    url: url.toString(),
    contentType,
  });
  const response = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: buildJsonHeaders(contentType),
  });
  logCatalogTiming("response:headers", {
    url: url.toString(),
    status: response.status,
    durationMs: Math.round(performance.now() - startedAt),
  });

  if (!response.ok) {
    const body = await response.text();
    const message = body === "" ? response.statusText : body;
    throw new Error(
      `Catalog request failed (${response.status} ${response.statusText}): ${message}`
    );
  }

  const bodyReadStartedAt = performance.now();
  const responseText = await response.text();
  logCatalogTiming("response:body-read", {
    url: url.toString(),
    bytes: responseText.length,
    bodyReadMs: Math.round(performance.now() - bodyReadStartedAt),
    totalMs: Math.round(performance.now() - startedAt),
  });

  const jsonParseStartedAt = performance.now();
  const body = JSON.parse(responseText) as T;
  logCatalogTiming("response:json-parse", {
    url: url.toString(),
    parseMs: Math.round(performance.now() - jsonParseStartedAt),
    totalMs: Math.round(performance.now() - startedAt),
  });
  return body;
}

type CatalogRequestCache = Map<string, Promise<unknown>>;

async function fetchCachedJson<T>(
  cache: CatalogRequestCache,
  url: URL,
  contentType = "application/json"
): Promise<T> {
  const cacheKey = `${contentType}:${url.toString()}`;
  const cachedRequest = cache.get(cacheKey);
  if (cachedRequest !== undefined) {
    logCatalogTiming("cache:hit", {
      url: url.toString(),
      contentType,
    });
    return await cachedRequest as T;
  }

  logCatalogTiming("cache:miss", {
    url: url.toString(),
    contentType,
  });
  const request = fetchJson<T>(url, contentType).catch((error) => {
    cache.delete(cacheKey);
    logCatalogTiming("cache:evict-error", {
      url: url.toString(),
      contentType,
      error: String(error),
    });
    throw error;
  });
  cache.set(cacheKey, request);

  return await request;
}

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
export const useGeoserverStore = defineStore("geoserver", () => {
  const pointData = ref();
  const layerList = ref<GeoserverLayerListItem[]>();
  const workspaceList = ref<WorkspaceListItem[]>();
  const catalogRequestCache: CatalogRequestCache = new Map();
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
    const url = workspaceName === undefined
      ? buildCatalogUrl(["layers"])
      : buildCatalogUrl(["workspaces", workspaceName, "layers"]);

    return await fetchCachedJson<GeoserverLayerListResponse>(catalogRequestCache, url);
  }
  /**
   * Retrieves a list of all workspaces the user has access to in GeoServer.
   *
   * @returns A Promise resolving to a WorkspaceListResponse containing the list of workspaces.
   */
  async function getWorkspaceList(): Promise<WorkspaceListResponse> {
    return await fetchCachedJson<WorkspaceListResponse>(catalogRequestCache, buildCatalogUrl(["workspaces"]));
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
    return await fetchCachedJson<GeoserverLayerInfoResponse>(
      catalogRequestCache,
      buildCatalogUrl(["workspaces", workspace, "layers", layer.name])
    );
  }
  /**
   * Retrieves detailed information about a specific vector or raster layer from GeoServer.
   *
   * @param url - The URL to the resource containing the layer details.
   * @returns A Promise resolving to a GeoServerVectorTypeLayerDetail or GeoserverRasterTypeLayerDetail.
   */
  async function getLayerDetail(url: string): Promise<GeoServerVectorTypeLayerDetail|GeoserverRasterTypeLayerDetail> {
    return await fetchCachedJson<GeoServerVectorTypeLayerDetail|GeoserverRasterTypeLayerDetail>(
      catalogRequestCache,
      resolveApiUrl(url)
    );
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
      `${trimTrailingSlash(String(import.meta.env.VITE_GEOSERVER_BASE_URL))}/${encodeURIComponent(workspace)}/wms`
    );
    url.search = new URLSearchParams({
      service: "WMS",
      version: "1.1.0",
      request: "GetMap",
      layers: `${workspace}:${layer}`,
      bbox: bbox ?? "",
      width: "512",
      height: "512",
      srs: "EPSG:4326",
      format: "geojson",
      CQL_FILTER: cqlFilter ?? "",
      styles: "",
    }).toString();

    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: buildJsonHeaders("application/geojson"),
    });
    if (!response.ok) {
      throw new Error("Failed to fetch GeoJSON layer source.");
    }
    return await response.json();
  }
  /**
   * Retrieves the layer's styling information from GeoServer.
   *
   * @param url - The URL to the style resource on GeoServer.
   * @returns A Promise resolving to the style object for the layer.
   */
  async function getLayerStyling(url:string):Promise<any> {
    return await fetchCachedJson<any>(
      catalogRequestCache,
      resolveApiUrl(url),
      "application/vnd.geoserver.mbstyle+json"
    );
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
    getLayerStyling
  };
});
/* eslint-disable */
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useGeoserverStore, import.meta.hot));
}

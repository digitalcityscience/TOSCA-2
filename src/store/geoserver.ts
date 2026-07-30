/* eslint "@stylistic/indent": "off" */
/* eslint "no-tabs": "off" */
import { defineStore, acceptHMRUpdate } from "pinia";
import { ref } from "vue";
import {
  fetchBackendJson,
  getBackendRootUrl,
  resolveBackendUrl,
} from "./backend";

const CATALOG_API_PATH = "/api/v1/catalog";

export interface CatalogProvider {
  id: string;
  name: string;
  base_url: string;
  engine_type?: string;
}

export interface CatalogResourceContext {
  provider: CatalogProvider;
  workspace_name: string;
}

export interface GeoServerVectorTypeLayerDetail {
  catalog?: CatalogResourceContext;
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
export interface CoverageTimeDimensionInfo {
  enabled: boolean;
  presentation?: string;
  units?: string;
  defaultValue?: {
    strategy?: "MINIMUM" | "MAXIMUM" | "NEAREST" | "FIXED";
    referenceValue?: string;
  };
  nearestMatchEnabled?: boolean;
  rawNearestMatchEnabled?: boolean;
  startValue?: string;
  endValue?: string;
}
export interface CoverageMetadataTimeEntry {
  "@key": "time";
  dimensionInfo: CoverageTimeDimensionInfo;
}
export interface CoverageMetadataElevationEntry {
  "@key": "elevation";
  dimensionInfo: { enabled: boolean };
}
export interface CoverageMetadataStringEntry {
  "@key": string;
  $?: string;
}
export type CoverageMetadataEntry =
  | CoverageMetadataTimeEntry
  | CoverageMetadataElevationEntry
  | CoverageMetadataStringEntry;
export interface GeoserverRasterTypeLayerDetail {
  catalog?: CatalogResourceContext;
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
      entry: CoverageMetadataEntry[]
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
  provider?: CatalogProvider;
  workspace?: WorkspaceListItem;
}
export interface GeoserverLayerListItem {
  name: string;
  href: string;
  provider_id?: string;
  workspace_name?: string;
}
export interface GeoserverLayerListResponse {
  layers: {
    layer: GeoserverLayerListItem[];
  };
}
export interface WorkspaceListItem {
  name: string;
  href: string;
  provider: CatalogProvider;
}
export interface WorkspaceListResponse {
  workspaces: {
    workspace: WorkspaceListItem[];
  };
}

export function buildCatalogProvidersUrl(): URL {
  return new URL(`${CATALOG_API_PATH}/providers`, getBackendRootUrl());
}

export function buildCatalogWorkspacesUrl(providerId: string): URL {
  return new URL(
    `${CATALOG_API_PATH}/providers/${encodeURIComponent(providerId)}/workspaces`,
    getBackendRootUrl()
  );
}

export function buildCatalogLayersUrl(
  providerId: string,
  workspaceName: string
): URL {
  return new URL(
    `${CATALOG_API_PATH}/providers/${encodeURIComponent(providerId)}` +
      `/workspaces/${encodeURIComponent(workspaceName)}/layers`,
    getBackendRootUrl()
  );
}

export function buildCatalogLayerUrl(
  providerId: string,
  workspaceName: string,
  layerName: string
): URL {
  return new URL(
    `${buildCatalogLayersUrl(providerId, workspaceName).pathname}` +
      `/${encodeURIComponent(layerName)}`,
    getBackendRootUrl()
  );
}

export function buildCatalogResourceUrl(
  providerId: string,
  workspaceName: string,
  layerName: string
): URL {
  return new URL(
    `${CATALOG_API_PATH}/providers/${encodeURIComponent(providerId)}` +
      `/workspaces/${encodeURIComponent(workspaceName)}` +
      `/resources/${encodeURIComponent(layerName)}`,
    getBackendRootUrl()
  );
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
export interface WmsLegendUrl {
  /** Absolute URL to the legend graphic, as advertised by GeoServer. */
  href: string;
  /** MIME type of the legend image (e.g. "image/png"), when provided. */
  format?: string;
  width?: number;
  height?: number;
}
export interface WmsStyle {
  name: string;
  title?: string;
  abstract?: string;
  legendUrls: WmsLegendUrl[];
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
  styles: WmsStyle[];
}
export interface WmsCapabilities {
  version: string;
  workspace: string;
  layers: Map<string, WmsCapabilitiesLayer>;
}
/**
 * Builds a GetLegendGraphic URL as a fallback when GetCapabilities does not
 * advertise a LegendURL for the layer's default style. GeoServer renders a
 * PNG legend swatch from this endpoint without needing a style name.
 */
export function buildWmsLegendUrl(
  workspace: string,
  layerName: string,
  providerBaseUrl = String(import.meta.env.VITE_GEOSERVER_BASE_URL ?? "")
): string {
  const params = new URLSearchParams({
    REQUEST: "GetLegendGraphic",
    VERSION: "1.0.0",
    FORMAT: "image/png",
    LAYER: `${workspace}:${layerName}`,
    TRANSPARENT: "true",
    // Compact legend tuned for the side panel: drop empty/invisible rules so
    // GeoServer doesn't pad the canvas, anti-alias labels, and stay
    // transparent so any residual blank canvas blends into the wrapper.
    LEGEND_OPTIONS: "fontAntiAliasing:true;fontSize:11;forceLabels:on;hideEmptyRules:true",
  });
  return `${providerBaseUrl.replace(/\/+$/, "")}/${workspace}/wms?${params.toString()}`;
}
/**
 * If `url` already points at a GeoServer GetLegendGraphic endpoint, merge in
 * the high-DPI rendering options we use for the constructed fallback so the
 * advertised LegendURL renders crisp instead of blurry when scaled.
 */
export function enhanceLegendUrl(url: string): string {
  if (!url.includes("GetLegendGraphic")) return url;
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("LEGEND_OPTIONS")) {
      parsed.searchParams.set(
        "LEGEND_OPTIONS",
        "fontAntiAliasing:true;fontSize:11;forceLabels:on;hideEmptyRules:true"
      );
    }
    if (!parsed.searchParams.has("TRANSPARENT")) {
      parsed.searchParams.set("TRANSPARENT", "true");
    }
    return parsed.toString();
  } catch {
    return url;
  }
}
/**
 * Resolves the best legend image URL for a WMS layer:
 *   1. The first LegendURL advertised in GetCapabilities (matches the layer's
 *      default style when present), or
 *   2. A constructed GetLegendGraphic URL as a fallback.
 *
 * Returns undefined only if the capabilities document cannot be fetched and
 * the caller wants to suppress a broken-image render.
 */
export async function resolveLegendUrl(
  fetchCapabilities: (workspace: string) => Promise<WmsCapabilities>,
  workspace: string,
  layerName: string,
  providerBaseUrl?: string
): Promise<string> {
  try {
    const caps = await fetchCapabilities(workspace);
    const layer = caps.layers.get(layerName);
    const advertised = layer?.styles.flatMap((s) => s.legendUrls)[0]?.href;
    if (advertised !== undefined && advertised !== "") return enhanceLegendUrl(advertised);
  } catch {
    // fall through to the constructed URL
  }
  return buildWmsLegendUrl(workspace, layerName, providerBaseUrl);
}
/**
 * Hard fallback bounds for the time slider when neither the coverage metadata
 * nor GetCapabilities advertise a time domain. Picked as a wide but bounded
 * range so the slider stays usable; refine once a real domain is available.
 */
export const RASTER_TIME_FALLBACK_START = "2000-01-01T00:00:00Z";
export const RASTER_TIME_FALLBACK_END = new Date().toISOString();
/**
 * Returns the coverage's time dimension descriptor when one is enabled in the
 * GeoServer coverage metadata, otherwise null. Used to detect whether a raster
 * layer supports time-based queries before fetching GetCapabilities.
 */
export function getTimeDimension(
  coverage: GeoserverRasterTypeLayerDetail["coverage"]
): CoverageTimeDimensionInfo | null {
  const entries = coverage.metadata?.entry ?? [];
  const entry = entries.find(
    (e): e is CoverageMetadataTimeEntry => e["@key"] === "time"
  );
  if (entry === undefined || !entry.dimensionInfo.enabled) return null;
  return entry.dimensionInfo;
}
export interface ResolvedTimeDomain {
  values: string[];
  default: string;
  /** Where the domain came from — useful for diagnostics and UI hints. */
  source: "capabilities" | "metadata" | "fallback";
}
/**
 * Resolves the discrete time domain for a raster layer using a priority chain:
 *
 *   1. WMS GetCapabilities <Dimension/Extent name="time"> — authoritative.
 *   2. Coverage metadata startValue/endValue — synthesised 2-point list.
 *   3. RASTER_TIME_FALLBACK_START / _END constants — last resort.
 *
 * Always returns a non-empty discrete value list so the slider can be index-based.
 */
export async function resolveTimeDomain(
  fetchCapabilities: (workspace: string) => Promise<WmsCapabilities>,
  workspace: string,
  layerName: string,
  coverage: GeoserverRasterTypeLayerDetail["coverage"]
): Promise<ResolvedTimeDomain> {
  try {
    const caps = await fetchCapabilities(workspace);
    const layer = caps.layers.get(layerName);
    const td = layer?.timeDimension;
    if (td !== undefined && td.values.length > 0) {
      return { values: td.values, default: td.default, source: "capabilities" };
    }
  } catch {
    // fall through to metadata / constants
  }
  const dim = getTimeDimension(coverage);
  if (dim !== null) {
    const start = dim.startValue ?? "";
    const end = dim.endValue ?? "";
    if (start !== "" && end !== "") {
      const values = start === end ? [start] : [start, end];
      return { values, default: end, source: "metadata" };
    }
  }
  const values = [RASTER_TIME_FALLBACK_START, RASTER_TIME_FALLBACK_END];
  return { values, default: RASTER_TIME_FALLBACK_END, source: "fallback" };
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
    const styles: WmsStyle[] = Array.from(el.querySelectorAll(":scope > Style")).map((styleEl) => {
      const childText = (tag: string): string =>
        Array.from(styleEl.children).find((c) => c.tagName === tag)?.textContent ?? "";
      const legendUrls: WmsLegendUrl[] = Array.from(styleEl.querySelectorAll(":scope > LegendURL")).map((legendEl) => {
        const resource = legendEl.querySelector(":scope > OnlineResource");
        // xlink namespace is the canonical carrier, but some servers omit the prefix.
        const href = resource?.getAttributeNS("http://www.w3.org/1999/xlink", "href")
          ?? resource?.getAttribute("xlink:href")
          ?? resource?.getAttribute("href")
          ?? "";
        const format = Array.from(legendEl.children).find((c) => c.tagName === "Format")?.textContent ?? undefined;
        const widthAttr = legendEl.getAttribute("width");
        const heightAttr = legendEl.getAttribute("height");
        return {
          href,
          format,
          width: widthAttr !== null ? Number(widthAttr) : undefined,
          height: heightAttr !== null ? Number(heightAttr) : undefined,
        };
      }).filter((l) => l.href !== "");
      return {
        name: childText("Name"),
        title: childText("Title") || undefined,
        abstract: childText("Abstract") || undefined,
        legendUrls,
      };
    });
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
      styles,
    });
  });
  return { version, workspace, layers };
}
export const useGeoserverStore = defineStore("geoserver", () => {
  const pointData = ref();
  const providers = ref<CatalogProvider[]>([]);
  const layerList = ref<GeoserverLayerListItem[]>([]);
  const workspaceList = ref<WorkspaceListItem[]>([]);
  const workspacesByProvider = ref<Record<string, WorkspaceListItem[]>>({});
  const loadingCatalog = ref(false);
  const catalogError = ref("");
  const wmsCapabilitiesCache = new Map<string, Promise<WmsCapabilities>>();
  let catalogLoadPromise: Promise<WorkspaceListResponse> | undefined;

  async function getProviderList(force = false): Promise<CatalogProvider[]> {
    if (!force && providers.value.length > 0) {
      return providers.value;
    }

    const response = await fetchBackendJson<CatalogProvider[]>(
      buildCatalogProvidersUrl(),
      "Catalog providers"
    );
    providers.value = response.map((provider) => ({
      ...provider,
      base_url: provider.base_url.replace(/\/+$/, ""),
    }));
    return providers.value;
  }

  /**
   * Retrieves catalog workspaces provider-first and flattens them for the
   * existing workspace browser while retaining provider ownership.
   *
   * @param force - Refetch providers and workspaces even when cached.
   */
  async function getWorkspaceList(force = false): Promise<WorkspaceListResponse> {
    if (!force && workspaceList.value.length > 0) {
      return { workspaces: { workspace: workspaceList.value } };
    }

    if (!force && catalogLoadPromise !== undefined) {
      return await catalogLoadPromise;
    }

    const request = (async (): Promise<WorkspaceListResponse> => {
      loadingCatalog.value = true;
      catalogError.value = "";
      try {
        const catalogProviders = await getProviderList(force);
        const providerWorkspaceEntries = await Promise.all(
          catalogProviders.map(async (provider) => {
            const response = await fetchBackendJson<{
              workspaces: { workspace?: Array<Omit<WorkspaceListItem, "provider">> }
            }>(
              buildCatalogWorkspacesUrl(provider.id),
              `Catalog workspaces for ${provider.name}`
            );
            const workspaces = (response.workspaces.workspace ?? []).map((workspace) => ({
              ...workspace,
              provider,
            }));
            return [provider.id, workspaces] as const;
          })
        );

        workspacesByProvider.value = Object.fromEntries(providerWorkspaceEntries);
        workspaceList.value = providerWorkspaceEntries.flatMap(([, workspaces]) => workspaces);
        return { workspaces: { workspace: workspaceList.value } };
      } catch (error) {
        catalogError.value = "The data catalog could not be loaded.";
        throw error;
      } finally {
        loadingCatalog.value = false;
      }
    })();

    catalogLoadPromise = request;
    try {
      return await request;
    } finally {
      if (catalogLoadPromise === request) {
        catalogLoadPromise = undefined;
      }
    }
  }

  async function resolveWorkspace(
    workspace: WorkspaceListItem | string,
    providerId?: string
  ): Promise<WorkspaceListItem> {
    if (typeof workspace !== "string") {
      return workspace;
    }

    if (workspaceList.value.length === 0) {
      await getWorkspaceList();
    }

    const matches = workspaceList.value.filter((item) => {
      return item.name === workspace &&
        (providerId === undefined || item.provider.id === providerId);
    });

    if (matches.length === 0) {
      throw new Error(`Workspace "${workspace}" was not found in the catalog.`);
    }
    if (matches.length > 1 && providerId === undefined) {
      throw new Error(
        `Workspace "${workspace}" exists in multiple providers; a provider id is required.`
      );
    }
    return matches[0];
  }

  async function getProviderBaseUrlForWorkspace(
    workspace: WorkspaceListItem | string,
    providerId?: string
  ): Promise<string> {
    return (await resolveWorkspace(workspace, providerId)).provider.base_url;
  }

  /**
   * Retrieves layers from the Django catalog for one provider workspace.
   */
  async function getLayerList(
    workspace?: WorkspaceListItem | string,
    providerId?: string
  ): Promise<GeoserverLayerListResponse> {
    if (workspace === undefined) {
      const catalogProviders = await getProviderList();
      const responses = await Promise.all(
        catalogProviders.map(async (provider) => {
          const url = new URL(
            `${CATALOG_API_PATH}/providers/${encodeURIComponent(provider.id)}/layers`,
            getBackendRootUrl()
          );
          const response = await fetchBackendJson<GeoserverLayerListResponse>(
            url,
            `Catalog layers for ${provider.name}`
          );
          return (response.layers.layer ?? []).map((layer) => ({
            ...layer,
            provider_id: provider.id,
            workspace_name: workspaceNameFromCatalogUrl(layer.href),
          }));
        })
      );
      layerList.value = responses.flat();
      return { layers: { layer: layerList.value } };
    }

    const catalogWorkspace = await resolveWorkspace(workspace, providerId);
    const response = await fetchBackendJson<GeoserverLayerListResponse>(
      buildCatalogLayersUrl(catalogWorkspace.provider.id, catalogWorkspace.name),
      `Catalog layers for ${catalogWorkspace.name}`
    );
    const layers = (response.layers.layer ?? []).map((layer) => ({
      ...layer,
      provider_id: catalogWorkspace.provider.id,
      workspace_name: catalogWorkspace.name,
    }));
    layerList.value = layers;
    return { layers: { layer: layers } };
  }

  /**
   * Retrieves the catalog layer record for a provider workspace.
   *
   * @param layer - The layer for which to retrieve information.
   * @param workspace - The workspace containing the layer.
   * @param providerId - Required only when a workspace name exists in multiple providers.
   * @returns A Promise resolving to a GeoserverLayerInfoResponse containing layer information.
   */
  async function getLayerInformation(
    layer: GeoserverLayerListItem,
    workspace: WorkspaceListItem | string,
    providerId?: string
  ): Promise<GeoserverLayerInfoResponse> {
    const inferredProviderId = providerId ??
      layer.provider_id ??
      await providerIdFromPublishedUrl(layer.href, workspace);
    const catalogWorkspace = await resolveWorkspace(
      workspace,
      inferredProviderId
    );
    const response = await fetchBackendJson<GeoserverLayerInfoResponse>(
      buildCatalogLayerUrl(
        catalogWorkspace.provider.id,
        catalogWorkspace.name,
        layer.name
      ),
      `Catalog layer ${catalogWorkspace.name}:${layer.name}`
    );
    return {
      ...response,
      provider: catalogWorkspace.provider,
      workspace: catalogWorkspace,
    };
  }

  /**
   * Retrieves vector or raster resource details through the Django catalog.
   *
   * @param url - Catalog resource URL returned by the layer record.
   * @returns A Promise resolving to a GeoServerVectorTypeLayerDetail or GeoserverRasterTypeLayerDetail.
   */
  async function getLayerDetail(url: string): Promise<GeoServerVectorTypeLayerDetail|GeoserverRasterTypeLayerDetail> {
    const detail = await fetchBackendJson<
      GeoServerVectorTypeLayerDetail | GeoserverRasterTypeLayerDetail
    >(resolveBackendUrl(url), "Catalog layer resource");
    const pathContext = catalogContextFromResourceUrl(url);
    if (pathContext === undefined) {
      return detail;
    }

    if (providers.value.length === 0) {
      await getProviderList();
    }
    const provider = providers.value.find((item) => item.id === pathContext.providerId);
    if (provider === undefined) {
      return detail;
    }
    return {
      ...detail,
      catalog: {
        provider,
        workspace_name: pathContext.workspaceName,
      },
    };
  }

  /**
   * Retrieves a GeoJSON layer source from the selected provider's WMS service.
   *
   * @param layer - The name of the layer to retrieve.
   * @param workspace - The name of the workspace containing the layer.
   * @param bbox - Optional bounding box to filter the data.
   * @param cqlFilter - Optional CQL filter to apply to the data.
   * @returns A Promise resolving to the GeoJSON object containing the requested layer data.
   */
  async function getGeoJSONLayerSource(
    layer: string,
    workspace: string,
    bbox?: string,
    cqlFilter?: string,
    providerId?: string
  ): Promise<any> {
    const providerBaseUrl = await getProviderBaseUrlForWorkspace(
      workspace,
      providerId
    );
    const url = new URL(
      `${providerBaseUrl}/${workspace}/wms?service=WMS&version=1.1.0&request=GetMap&layers=${workspace}:${layer}&bbox=${bbox ?? ""}&width=512&height=512&srs=EPSG:4326&format=geojson&CQL_FILTER=${cqlFilter ?? ""}&styles=`
    );
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: new Headers({
        Accept: "application/geo+json, application/json",
      }),
    });
    if (!response.ok) {
      throw new Error(
        `GeoJSON layer request failed (${response.status} ${response.statusText}).`
      );
    }
    return await response.json();
  }

  /**
   * Retrieves JSON styling through the Django catalog when available.
   * SLD is a valid catalog style format, but it cannot be applied directly as
   * MapLibre JSON styling, so SLD responses intentionally resolve undefined.
   *
   * @param url - The catalog style resource URL.
   * @returns The JSON style, or undefined when the style uses another format.
   */
  async function getLayerStyling(url:string):Promise<any | undefined> {
    const response = await fetch(resolveBackendUrl(url), {
      method: "GET",
      redirect: "follow",
      headers: new Headers({
        Accept: "*/*",
      }),
    });
    if (response.status === 400 || response.status === 406) {
      return undefined;
    }
    if (!response.ok) {
      throw new Error(
        `Catalog style request failed (${response.status} ${response.statusText}).`
      );
    }
    const contentType = response.headers.get("Content-Type")?.toLowerCase() ?? "";
    if (!contentType.includes("json")) {
      return undefined;
    }
    return await response.json();
  }

  /**
   * Fetches and parses WMS capabilities from the workspace's provider.
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
    force = false,
    providerId?: string
  ): Promise<WmsCapabilities> {
    const providerBaseUrl = await getProviderBaseUrlForWorkspace(workspace, providerId);
    const cacheKey = `${providerBaseUrl}/${workspace}`;
    if (!force) {
      const cached = wmsCapabilitiesCache.get(cacheKey);
      if (cached !== undefined) return await cached;
    }
    const url = new URL(
      `${providerBaseUrl}/${workspace}/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities`
    );
    const promise = (async (): Promise<WmsCapabilities> => {
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
      });
      if (!response.ok) {
        throw new Error(
          `Failed to fetch WMS capabilities for ${workspace}: ${response.status}`
        );
      }
      const text = await response.text();
      return parseWmsCapabilities(text, workspace);
    })();
    promise.catch(() => wmsCapabilitiesCache.delete(cacheKey));
    wmsCapabilitiesCache.set(cacheKey, promise);
    return await promise;
  }

  function workspaceNameFromCatalogUrl(url: string): string | undefined {
    try {
      const match = new URL(url, getBackendRootUrl()).pathname.match(
        /\/workspaces\/([^/]+)\/layers(?:\/|$)/
      );
      return match === null ? undefined : decodeURIComponent(match[1]);
    } catch {
      return undefined;
    }
  }

  function catalogContextFromResourceUrl(url: string): {
    providerId: string
    workspaceName: string
  } | undefined {
    try {
      const match = new URL(url, getBackendRootUrl()).pathname.match(
        /\/providers\/([^/]+)\/workspaces\/([^/]+)\/resources(?:\/|$)/
      );
      if (match === null) {
        return undefined;
      }
      return {
        providerId: decodeURIComponent(match[1]),
        workspaceName: decodeURIComponent(match[2]),
      };
    } catch {
      return undefined;
    }
  }

  async function providerIdFromPublishedUrl(
    publishedUrl: string,
    workspace: WorkspaceListItem | string
  ): Promise<string | undefined> {
    if (publishedUrl === "" || typeof workspace !== "string") {
      return undefined;
    }
    if (workspaceList.value.length === 0) {
      await getWorkspaceList();
    }
    const matchingProviders = workspaceList.value
      .filter((item) => item.name === workspace)
      .map((item) => item.provider)
      .filter((provider) => {
        return publishedUrl === provider.base_url ||
          publishedUrl.startsWith(`${provider.base_url}/`) ||
          publishedUrl.startsWith(`${provider.base_url}?`);
      });
    return matchingProviders.length === 1
      ? matchingProviders[0].id
      : undefined;
  }

  return {
    pointData,
    providers,
    layerList,
    workspaceList,
    workspacesByProvider,
    loadingCatalog,
    catalogError,
    getProviderList,
    getLayerList,
    getWorkspaceList,
    getLayerInformation,
    getLayerDetail,
    getProviderBaseUrlForWorkspace,
    getGeoJSONLayerSource,
    getLayerStyling,
    fetchWmsCapabilities
  };
});
/* eslint-disable */
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useGeoserverStore, import.meta.hot));
}

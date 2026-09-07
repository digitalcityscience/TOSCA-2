import type { BasemapOption } from "@helpers/baseMapControl";
import { reportDeveloperError } from "@helpers/userFacingError";
import type {
    RasterDEMSourceSpecification,
    RasterSourceSpecification,
} from "maplibre-gl";

type Translate = (key: string) => string;

interface EnvironmentValueDefinition {
    environmentVariable: string;
}

interface LiteralValueDefinition {
    value: string;
}

type ConfigurationValue = EnvironmentValueDefinition | LiteralValueDefinition;

export interface BasemapProviderDefinition {
    baseUrl: ConfigurationValue;
    apiKey: ConfigurationValue;
    apiKeyQueryParameter?: string;
}

interface BasemapUrlDefinition {
    provider: string;
    path: string;
}

interface BaseBasemapDefinition {
    id: string;
    titleKey: string;
    thumbnailUrl: BasemapUrlDefinition;
}

interface VectorBasemapDefinition extends BaseBasemapDefinition {
    kind: "vector";
    styleUrl: BasemapUrlDefinition;
    fontStackOverride?: string[];
}

interface RasterBasemapDefinition extends BaseBasemapDefinition {
    kind: "raster";
    tiles: BasemapUrlDefinition[];
    tileSize?: number;
}

export type BasemapDefinition = VectorBasemapDefinition | RasterBasemapDefinition;

/**
 * Load source metadata from a TileJSON endpoint. The provider URL resolver
 * appends the configured API key. TileJSON normally supplies `tiles`, zoom
 * limits, bounds, and attribution; the optional values below override it.
 */
interface TileJsonSourceDefinition {
    /** Select MapLibre's `url`/TileJSON source form. */
    kind: "tilejson";
    /** Provider-relative URL of the TileJSON document. */
    url: BasemapUrlDefinition;
    /** Optional override for the TileJSON tile size. */
    tileSize?: number;
    /** Optional override for the TileJSON minimum zoom. */
    minzoom?: number;
    /** Optional override for the TileJSON maximum zoom. */
    maxzoom?: number;
}

/**
 * Load tiles directly from one or more URL templates. Use this for Martin or
 * another service without TileJSON. Since no metadata document is fetched,
 * declare tile size and zoom limits here when they differ from MapLibre's
 * defaults. Templates may contain `{z}`, `{x}`, and `{y}` placeholders.
 */
interface DirectTileSourceDefinition {
    /** Select MapLibre's direct `tiles` source form. */
    kind: "tiles";
    /** Provider-relative tile URL templates. */
    tiles: BasemapUrlDefinition[];
    /** Tile pixel size; MapLibre defaults to 512 when omitted. */
    tileSize?: number;
    /** Lowest available tile zoom; MapLibre defaults to 0 when omitted. */
    minzoom?: number;
    /** Highest available tile zoom; MapLibre defaults to 22 when omitted. */
    maxzoom?: number;
}

type TerrainSourceDefinition = TileJsonSourceDefinition | DirectTileSourceDefinition;

export interface TerrainDefinition {
    /** Vertical scale applied when terrain is enabled. Defaults to 1. */
    exaggeration?: number;
    /** Elevation source used to construct MapLibre's 3D terrain mesh. */
    dem: TerrainSourceDefinition & {
        /** DEM pixel encoding. Use the encoding produced by the tile service. */
        encoding?: RasterDEMSourceSpecification["encoding"];
    };
    /** Pre-rendered raster shading shown only while terrain is enabled. */
    hillshade: TerrainSourceDefinition;
}

export interface MapConfiguration {
    initialBasemapId: string;
    providers: Record<string, BasemapProviderDefinition>;
    basemaps: BasemapDefinition[];
    terrain: TerrainDefinition;
}

export interface ResolvedMapConfiguration {
    initialBasemapId: string;
    basemaps: BasemapOption[];
    terrain: {
        exaggeration: number;
        demSource: RasterDEMSourceSpecification;
        hillshadeSource: RasterSourceSpecification;
    };
}

/**
 * Direct Martin terrain example. Assign this to `mapConfiguration.terrain`
 * when an in-house deployment should be used instead of MapTiler TileJSON.
 */
export const inHouseTerrainExample = {
    exaggeration: 1,
    dem: {
        kind: "tiles",
        tiles: [{ provider: "inHouse", path: "tiles/terrain-hamburg-official/{z}/{x}/{y}" }],
        encoding: "mapbox",
        tileSize: 256,
        minzoom: 9,
        maxzoom: 14,
    },
    hillshade: {
        kind: "tiles",
        tiles: [{ provider: "inHouse", path: "tiles/hillshade-hamburg-official/{z}/{x}/{y}" }],
        tileSize: 256,
        minzoom: 9,
        maxzoom: 14,
    },
} satisfies TerrainDefinition;

export const mapConfiguration = {
    initialBasemapId: "backdrop",
    providers: {
        maptiler: {
            baseUrl: { value: "https://api.maptiler.com" },
            apiKey: { environmentVariable: "VITE_MAPTILER_API_KEY" },
        },
        inHouse: {
            baseUrl: { environmentVariable: "VITE_INHOUSE_MAP_BASE_URL" },
            apiKey: { environmentVariable: "VITE_INHOUSE_MAP_API_KEY" },
        },
    },
    basemaps: [
        {
            kind: "vector",
            id: "dataviz",
            titleKey: "map.basemap.dataviz",
            styleUrl: { provider: "maptiler", path: "maps/dataviz-v4/style.json" },
            thumbnailUrl: { provider: "maptiler", path: "maps/dataviz-v4/0/0/0.png" },
            fontStackOverride: ["Open Sans Regular"],
        },
        {
            kind: "vector",
            id: "backdrop",
            titleKey: "map.basemap.backdrop",
            styleUrl: { provider: "maptiler", path: "maps/backdrop-v4/style.json" },
            thumbnailUrl: { provider: "maptiler", path: "maps/backdrop-v4/0/0/0.png" },
            fontStackOverride: ["Open Sans Regular"],
        },
        {
            kind: "vector",
            id: "inHouse",
            titleKey: "map.basemap.inHouse",
            styleUrl: { provider: "inHouse", path: "styles/osm-bright.json" },
            thumbnailUrl: { provider: "inHouse", path: "/thumbnails/osmBright.jpg" },
            fontStackOverride: ["Open Sans Regular"],
        },
        {
            kind: "raster",
            id: "satellite",
            titleKey: "map.basemap.satellite",
            tiles: [{ provider: "maptiler", path: "maps/satellite/{z}/{x}/{y}.jpg" }],
            thumbnailUrl: { provider: "maptiler", path: "maps/satellite/0/0/0.jpg" },
            tileSize: 512,
        },
    ],
    terrain: {
        exaggeration: 1,
        dem: {
            kind: "tilejson",
            url: { provider: "maptiler", path: "tiles/terrain-rgb-v2/tiles.json" },
            encoding: "mapbox",
            tileSize: 512,
            maxzoom: 14,
        },
        hillshade: {
            kind: "tilejson",
            url: { provider: "maptiler", path: "tiles/hillshade/tiles.json" },
        },
    },
} satisfies MapConfiguration;

export function resolveMapConfiguration(
    configuration: MapConfiguration,
    environment: Record<string, string | undefined>,
    translate: Translate
): ResolvedMapConfiguration {
    // A basemap whose provider is missing a required baseUrl/apiKey (e.g. an
    // in-house deployment env var left unset) is dropped from the list
    // instead of failing map setup for every basemap.
    const basemaps = configuration.basemaps.flatMap((definition): BasemapOption[] => {
        try {
            return [resolveBasemapDefinition(definition, configuration.providers, environment, translate)];
        } catch (err) {
            reportDeveloperError(`Skipping basemap "${definition.id}"`, err);
            return [];
        }
    });

    if (basemaps.length === 0) {
        throw new Error("No basemaps could be configured");
    }

    const initialBasemapId = basemaps.some(({ id }) => id === configuration.initialBasemapId)
        ? configuration.initialBasemapId
        : basemaps[0].id;
    if (initialBasemapId !== configuration.initialBasemapId) {
        reportDeveloperError(
            `Falling back to basemap "${initialBasemapId}"`,
            new Error(`Initial basemap "${configuration.initialBasemapId}" is not configured`)
        );
    }

    return {
        initialBasemapId,
        basemaps,
        terrain: {
            exaggeration: configuration.terrain.exaggeration ?? 1,
            demSource: {
                type: "raster-dem",
                ...resolveTerrainSource(configuration.terrain.dem, configuration, environment),
                ...(configuration.terrain.dem.encoding === undefined
                    ? {}
                    : { encoding: configuration.terrain.dem.encoding }),
            },
            hillshadeSource: {
                type: "raster",
                ...resolveTerrainSource(configuration.terrain.hillshade, configuration, environment),
            },
        },
    };
}

function resolveBasemapDefinition(
    definition: BasemapDefinition,
    providers: Record<string, BasemapProviderDefinition>,
    environment: Record<string, string | undefined>,
    translate: Translate
): BasemapOption {
    const base = {
        id: definition.id,
        title: translate(definition.titleKey),
        thumbnailUrl: resolveBasemapUrl(definition.thumbnailUrl, providers, environment),
    };

    if (definition.kind === "vector") {
        return {
            ...base,
            kind: "vector",
            styleUrl: resolveBasemapUrl(definition.styleUrl, providers, environment),
            fontStackOverride: definition.fontStackOverride,
        };
    }

    return {
        ...base,
        kind: "raster",
        source: {
            type: "raster",
            tiles: definition.tiles.map((url) => resolveBasemapUrl(url, providers, environment)),
            tileSize: definition.tileSize,
        },
    };
}

function resolveTerrainSource(
    definition: TerrainSourceDefinition,
    configuration: MapConfiguration,
    environment: Record<string, string | undefined>
): Omit<RasterSourceSpecification, "type"> {
    const endpoint = definition.kind === "tilejson"
        ? {
            url: resolveBasemapUrl(
                definition.url,
                configuration.providers,
                environment
            ),
        }
        : {
            tiles: definition.tiles.map((tile) => resolveBasemapUrl(
                tile,
                configuration.providers,
                environment
            )),
        };
    return {
        ...endpoint,
        ...(definition.tileSize === undefined ? {} : { tileSize: definition.tileSize }),
        ...(definition.minzoom === undefined ? {} : { minzoom: definition.minzoom }),
        ...(definition.maxzoom === undefined ? {} : { maxzoom: definition.maxzoom }),
    };
}

export function resolveMapProviderUrl(
    configuration: MapConfiguration,
    provider: string,
    path: string,
    environment: Record<string, string | undefined>
): string {
    return resolveBasemapUrl({ provider, path }, configuration.providers, environment);
}

function resolveBasemapUrl(
    definition: BasemapUrlDefinition,
    providers: Record<string, BasemapProviderDefinition>,
    environment: Record<string, string | undefined>
): string {
    const provider = providers[definition.provider];
    if (provider === undefined) {
        throw new Error(`Unknown basemap provider "${definition.provider}"`);
    }
    const baseUrl = resolveConfigurationValue(provider.baseUrl, environment);
    const apiKey = resolveConfigurationValue(provider.apiKey, environment);
    const resolvedUrl = `${baseUrl.replace(/\/+$/, "")}/${definition.path.replace(/^\/+/, "")}`;
    const separator = resolvedUrl.includes("?") ? "&" : "?";
    return `${resolvedUrl}${separator}${provider.apiKeyQueryParameter ?? "key"}=${encodeURIComponent(apiKey)}`;
}

function resolveConfigurationValue(
    definition: ConfigurationValue,
    environment: Record<string, string | undefined>
): string {
    if ("value" in definition) return definition.value;
    const value = environment[definition.environmentVariable]?.trim();
    if (value === undefined || value.length === 0) {
        throw new Error(
            `Missing basemap environment variable "${definition.environmentVariable}"`
        );
    }
    return value;
}

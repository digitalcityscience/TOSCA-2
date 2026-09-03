import type { BasemapOption } from "@helpers/baseMapControl";

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

export interface MapConfiguration {
    initialBasemapId: string;
    providers: Record<string, BasemapProviderDefinition>;
    basemaps: BasemapDefinition[];
}

export interface ResolvedMapConfiguration {
    initialBasemapId: string;
    basemaps: BasemapOption[];
}

export const mapConfiguration = {
    initialBasemapId: "streets",
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
            id: "streets",
            titleKey: "map.basemap.streets",
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
            id: "in-house",
            titleKey: "map.basemap.inHouse",
            styleUrl: { provider: "inHouse", path: "styles/light.json" },
            thumbnailUrl: { provider: "inHouse", path: "styles/light/0/0/0.png" },
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
} satisfies MapConfiguration;

export function resolveMapConfiguration(
    configuration: MapConfiguration,
    environment: Record<string, string | undefined>,
    translate: Translate
): ResolvedMapConfiguration {
    const basemaps = configuration.basemaps.map((definition): BasemapOption => {
        const base = {
            id: definition.id,
            title: translate(definition.titleKey),
            thumbnailUrl: resolveBasemapUrl(
                definition.thumbnailUrl,
                configuration.providers,
                environment
            ),
        };

        if (definition.kind === "vector") {
            return {
                ...base,
                kind: "vector",
                styleUrl: resolveBasemapUrl(
                    definition.styleUrl,
                    configuration.providers,
                    environment
                ),
                fontStackOverride: definition.fontStackOverride,
            };
        }

        return {
            ...base,
            kind: "raster",
            source: {
                type: "raster",
                tiles: definition.tiles.map((url) => resolveBasemapUrl(
                    url,
                    configuration.providers,
                    environment
                )),
                tileSize: definition.tileSize,
            },
        };
    });

    if (!basemaps.some(({ id }) => id === configuration.initialBasemapId)) {
        throw new Error(`Initial basemap "${configuration.initialBasemapId}" is not configured`);
    }

    return {
        initialBasemapId: configuration.initialBasemapId,
        basemaps,
    };
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

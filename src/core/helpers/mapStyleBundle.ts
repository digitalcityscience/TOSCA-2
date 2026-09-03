import {
    type LayerSpecification,
    type Map as MapLibreMap,
    type RasterLayerSpecification,
    type RasterSourceSpecification,
    type SourceSpecification,
    type StyleSpecification,
} from "maplibre-gl";

export interface CompiledStyleBundleLayer {
    specification: LayerSpecification;
    activeVisibility: "visible" | "none";
}

export interface CompiledStyleBundle {
    id: string;
    sources: Array<{ id: string; specification: SourceSpecification }>;
    layers: CompiledStyleBundleLayer[];
    sprites: Array<{ id: string; url: string }>;
}

export interface InstalledStyleBundle {
    id: string;
    sourceIds: string[];
    layers: Array<{ id: string; activeVisibility: "visible" | "none" }>;
    spriteIds: string[];
}

export interface CompileVectorStyleOptions {
    fontStackOverride?: string[];
    spriteRuntimeId?: string;
    registerSprite?: boolean;
}

const IMAGE_LAYOUT_PROPERTIES = ["icon-image"] as const;
const IMAGE_PAINT_PROPERTIES = [
    "background-pattern",
    "fill-pattern",
    "fill-extrusion-pattern",
    "line-pattern",
] as const;

/** Fetch and minimally validate a MapLibre v8 style document. */
export async function fetchMapStyle(styleUrl: string): Promise<StyleSpecification> {
    const response = await fetch(styleUrl);
    if (!response.ok) {
        throw new Error(`Failed to load basemap style (${response.status} ${response.statusText})`);
    }
    const document = await response.json() as unknown;
    if (!isStyleSpecification(document)) {
        throw new Error("Basemap style is not a valid MapLibre v8 style document");
    }
    return document;
}

/**
 * Confirm a sprite's manifest is reachable before registering it with the
 * map. `Map.addSprite` fetches and applies a sprite fire-and-forget with no
 * awaitable result, so a bad URL would otherwise install silently with
 * missing icons instead of surfacing as a load failure.
 */
export async function validateSpriteUrl(url: string): Promise<void> {
    const response = await fetch(`${url}.json`);
    if (!response.ok) {
        throw new Error(`Failed to load sprite (${response.status} ${response.statusText})`);
    }
    await response.json();
}

/**
 * Compile a complete style document into a collision-free runtime bundle.
 * Global style properties (camera, terrain, projection, glyphs, etc.) are
 * deliberately not imported; the application shell owns those values.
 */
export function compileVectorStyleBundle(
    id: string,
    style: StyleSpecification,
    styleUrl: string,
    options: CompileVectorStyleOptions = {}
): CompiledStyleBundle {
    if (Array.isArray(style.sprite)) {
        throw new Error("Basemap styles with multiple sprite sheets are not supported yet");
    }

    const prefix = `basemap:${sanitizeRuntimePart(id)}`;
    const sourceIds = new Map<string, string>();
    const sources = Object.entries(style.sources).map(([sourceId, specification], index) => {
        const runtimeId = `${prefix}:source:${index}:${sanitizeRuntimePart(sourceId)}`;
        sourceIds.set(sourceId, runtimeId);
        return {
            id: runtimeId,
            specification: resolveSourceUrls(specification, styleUrl),
        };
    });

    const spriteRuntimeId = style.sprite === undefined
        ? undefined
        : options.spriteRuntimeId ?? `basemap-${sanitizeRuntimePart(id)}-sprite`;
    const sprites = style.sprite === undefined || spriteRuntimeId === undefined || options.registerSprite === false
        ? []
        : [{ id: spriteRuntimeId, url: resolveStyleResourceUrl(style.sprite, styleUrl) }];

    const layers = style.layers.map((layer, index): CompiledStyleBundleLayer => {
        const sourceId = "source" in layer ? layer.source : undefined;
        const runtimeSourceId = sourceId === undefined ? undefined : sourceIds.get(sourceId);
        if (sourceId !== undefined && runtimeSourceId === undefined) {
            throw new Error(`Basemap layer "${layer.id}" references unknown source "${sourceId}"`);
        }

        const rawLayout = (layer.layout ?? {}) as Record<string, unknown>;
        const rawPaint = (layer.paint ?? {}) as Record<string, unknown>;
        const layout = rewriteImageProperties(rawLayout, IMAGE_LAYOUT_PROPERTIES, spriteRuntimeId);
        const paint = rewriteImageProperties(rawPaint, IMAGE_PAINT_PROPERTIES, spriteRuntimeId);
        if (
            layer.type === "symbol" &&
            layout["text-field"] !== undefined &&
            options.fontStackOverride !== undefined
        ) {
            layout["text-font"] = options.fontStackOverride;
        }

        const specification = {
            ...layer,
            id: `${prefix}:layer:${index}:${sanitizeRuntimePart(layer.id)}`,
            ...(runtimeSourceId === undefined ? {} : { source: runtimeSourceId }),
            ...(Object.keys(layout).length === 0 ? {} : { layout }),
            ...(Object.keys(paint).length === 0 ? {} : { paint }),
        } as LayerSpecification;

        return {
            specification,
            activeVisibility: rawLayout.visibility === "none" ? "none" : "visible",
        };
    });

    return { id, sources, layers, sprites };
}

/** Adapt a direct raster tile source into the same bundle shape as a style document. */
export function compileRasterStyleBundle(
    id: string,
    source: RasterSourceSpecification,
    layer: Partial<RasterLayerSpecification> = {}
): CompiledStyleBundle {
    const prefix = `basemap:${sanitizeRuntimePart(id)}`;
    const sourceId = `${prefix}:source:0:raster`;
    const rawLayout = (layer.layout ?? {}) as Record<string, unknown>;
    const specification = {
        ...layer,
        id: `${prefix}:layer:0:raster`,
        type: "raster",
        source: sourceId,
    } as RasterLayerSpecification;

    return {
        id,
        sources: [{ id: sourceId, specification: source }],
        layers: [{
            specification,
            activeVisibility: rawLayout.visibility === "none" ? "none" : "visible",
        }],
        sprites: [],
    };
}

/** Install all bundle resources hidden, preserving their authored active visibility. */
export function installStyleBundle(
    map: MapLibreMap,
    bundle: CompiledStyleBundle,
    beforeLayerId?: string
): InstalledStyleBundle {
    const addedSources: string[] = [];
    const addedLayers: string[] = [];
    const addedSprites: string[] = [];
    const actualBeforeId = beforeLayerId !== undefined && map.getLayer(beforeLayerId) !== undefined
        ? beforeLayerId
        : undefined;

    try {
        bundle.sprites.forEach((sprite) => {
            map.addSprite(sprite.id, sprite.url);
            addedSprites.push(sprite.id);
        });
        bundle.sources.forEach(({ id, specification }) => {
            map.addSource(id, specification);
            addedSources.push(id);
        });
        bundle.layers.forEach(({ specification }) => {
            map.addLayer({
                ...specification,
                layout: {
                    ...(specification.layout ?? {}),
                    visibility: "none",
                },
            } as LayerSpecification, actualBeforeId);
            addedLayers.push(specification.id);
        });
    } catch (error) {
        rollbackStyleBundle(map, addedLayers, addedSources, addedSprites);
        throw error;
    }

    return {
        id: bundle.id,
        sourceIds: addedSources,
        layers: bundle.layers.map(({ specification, activeVisibility }) => ({
            id: specification.id,
            activeVisibility,
        })),
        spriteIds: addedSprites,
    };
}

export function setStyleBundleVisibility(
    map: MapLibreMap,
    bundle: InstalledStyleBundle,
    visible: boolean
): void {
    bundle.layers.forEach((layer) => {
        if (map.getLayer(layer.id) !== undefined) {
            map.setLayoutProperty(
                layer.id,
                "visibility",
                visible ? layer.activeVisibility : "none"
            );
        }
    });
}

export function uninstallStyleBundle(map: MapLibreMap, bundle: InstalledStyleBundle): void {
    rollbackStyleBundle(
        map,
        bundle.layers.map(({ id }) => id),
        bundle.sourceIds,
        bundle.spriteIds
    );
}

function rollbackStyleBundle(
    map: MapLibreMap,
    layerIds: string[],
    sourceIds: string[],
    spriteIds: string[]
): void {
    [...layerIds].reverse().forEach((layerId) => {
        if (map.getLayer(layerId) !== undefined) map.removeLayer(layerId);
    });
    [...sourceIds].reverse().forEach((sourceId) => {
        if (map.getSource(sourceId) !== undefined) map.removeSource(sourceId);
    });
    [...spriteIds].reverse().forEach((spriteId) => {
        if (map.getSprite().some(({ id }) => id === spriteId)) map.removeSprite(spriteId);
    });
}

function resolveSourceUrls(
    specification: SourceSpecification,
    styleUrl: string
): SourceSpecification {
    const resolved = { ...specification } as Record<string, unknown>;
    if (typeof resolved.url === "string") {
        resolved.url = resolveStyleResourceUrl(resolved.url, styleUrl);
    }
    if (Array.isArray(resolved.tiles)) {
        resolved.tiles = resolved.tiles.map((url) =>
            typeof url === "string" ? resolveStyleResourceUrl(url, styleUrl) : url
        );
    }
    if (specification.type === "geojson" && typeof specification.data === "string") {
        resolved.data = resolveStyleResourceUrl(specification.data, styleUrl);
    }
    if (specification.type === "video") {
        resolved.urls = specification.urls.map((url) => resolveStyleResourceUrl(url, styleUrl));
    }
    return resolved as unknown as SourceSpecification;
}

export function resolveStyleResourceUrl(resourceUrl: string, styleUrl: string): string {
    return new URL(resourceUrl, styleUrl).toString();
}

function rewriteImageProperties(
    properties: Record<string, unknown>,
    propertyNames: readonly string[],
    spriteRuntimeId?: string
): Record<string, unknown> {
    const rewritten = { ...properties };
    if (spriteRuntimeId === undefined) return rewritten;
    propertyNames.forEach((property) => {
        const value = rewritten[property];
        if (value === undefined) return;
        rewritten[property] = typeof value === "string"
            ? `${spriteRuntimeId}:${value}`
            : ["concat", `${spriteRuntimeId}:`, value];
    });
    return rewritten;
}

function isStyleSpecification(value: unknown): value is StyleSpecification {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const candidate = value as Record<string, unknown>;
    return candidate.version === 8 &&
        typeof candidate.sources === "object" && candidate.sources !== null &&
        Array.isArray(candidate.layers);
}

function sanitizeRuntimePart(value: string): string {
    const sanitized = value.replace(/[^a-zA-Z0-9_-]+/g, "-");
    return sanitized === "" ? "unnamed" : sanitized;
}

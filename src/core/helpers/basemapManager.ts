import {
    type Map as MapLibreMap,
    type RasterLayerSpecification,
    type RasterSourceSpecification,
    type StyleSpecification,
} from "maplibre-gl";
import {
    compileRasterStyleBundle,
    compileVectorStyleBundle,
    fetchMapStyle,
    installStyleBundle,
    resolveStyleResourceUrl,
    setStyleBundleVisibility,
    uninstallStyleBundle,
    validateSpriteUrl,
    type InstalledStyleBundle,
} from "./mapStyleBundle";

interface BaseBasemapOption {
    id: string;
    title: string;
    thumbnailUrl?: string;
}

export interface VectorBasemapOption extends BaseBasemapOption {
    kind: "vector";
    styleUrl: string;
    fontStackOverride?: string[];
}

export interface RasterBasemapOption extends BaseBasemapOption {
    kind: "raster";
    source: RasterSourceSpecification;
    layer?: Partial<RasterLayerSpecification>;
}

export type BasemapOption = VectorBasemapOption | RasterBasemapOption;

export interface BasemapManagerOptions {
    beforeLayerId?: string;
    fetchStyle?: (styleUrl: string) => Promise<StyleSpecification>;
    validateSprite?: (spriteUrl: string) => Promise<void>;
}

/** Owns basemap resources without replacing the map's application style. */
export class BasemapManager {
    private readonly definitions = new Map<string, BasemapOption>();
    private readonly installed = new Map<string, InstalledStyleBundle>();
    private readonly loading = new Map<string, Promise<InstalledStyleBundle>>();
    private readonly spritesByUrl = new Map<
        string,
        { runtimeId: string; references: number; loading?: Promise<void> }
    >();
    private readonly spriteUrlByBasemap = new Map<string, string>();
    private readonly fetchStyle: (styleUrl: string) => Promise<StyleSpecification>;
    private readonly validateSprite: (spriteUrl: string) => Promise<void>;
    private activeId?: string;
    private activationVersion = 0;
    private disposed = false;

    constructor(
        private readonly map: MapLibreMap,
        basemaps: BasemapOption[],
        private readonly options: BasemapManagerOptions = {}
    ) {
        basemaps.forEach((basemap) => {
            if (this.definitions.has(basemap.id)) {
                throw new Error(`Duplicate basemap id "${basemap.id}"`);
            }
            this.definitions.set(basemap.id, basemap);
        });
        this.fetchStyle = options.fetchStyle ?? fetchMapStyle;
        this.validateSprite = options.validateSprite ?? validateSpriteUrl;
    }

    getActiveId(): string | undefined {
        return this.activeId;
    }

    async preload(id: string): Promise<void> {
        await this.ensureInstalled(id);
    }

    async activate(id: string): Promise<boolean> {
        if (this.disposed) return false;
        const activationVersion = ++this.activationVersion;
        if (this.activeId === id) return true;
        const target = await this.ensureInstalled(id);
        if (this.disposed || activationVersion !== this.activationVersion) return false;

        const active = this.activeId === undefined ? undefined : this.installed.get(this.activeId);
        try {
            // Reveal the fully installed target first. These synchronous style
            // mutations render together, and a failure can be rolled back
            // without leaving the map blank.
            setStyleBundleVisibility(this.map, target, true);
            if (active !== undefined) setStyleBundleVisibility(this.map, active, false);
        } catch (error) {
            try {
                setStyleBundleVisibility(this.map, target, false);
                if (active !== undefined) setStyleBundleVisibility(this.map, active, true);
            } catch (rollbackError) {
                console.error(`Failed to roll back basemap visibility after activating "${id}" failed:`, rollbackError);
            }
            throw error;
        }
        this.activeId = id;
        return true;
    }

    destroy(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.activationVersion += 1;
        [...this.installed.values()].reverse().forEach((bundle) => {
            try {
                uninstallStyleBundle(this.map, bundle);
            } catch (error) {
                console.error(`Failed to uninstall basemap "${bundle.id}":`, error);
            }
            const spriteUrl = this.spriteUrlByBasemap.get(bundle.id);
            if (spriteUrl !== undefined) {
                try {
                    this.releaseSprite(spriteUrl);
                } catch (error) {
                    console.error(`Failed to release sprite for basemap "${bundle.id}":`, error);
                }
            }
        });
        this.installed.clear();
        this.spriteUrlByBasemap.clear();
        this.activeId = undefined;
    }

    private async ensureInstalled(id: string): Promise<InstalledStyleBundle> {
        if (this.disposed) throw new Error("Basemap manager has been removed");
        const existing = this.installed.get(id);
        if (existing !== undefined) return existing;
        const pending = this.loading.get(id);
        if (pending !== undefined) return await pending;

        const definition = this.definitions.get(id);
        if (definition === undefined) throw new Error(`Unknown basemap "${id}"`);
        const installation = this.install(definition);
        this.loading.set(id, installation);
        try {
            return await installation;
        } finally {
            this.loading.delete(id);
        }
    }

    private async install(definition: BasemapOption): Promise<InstalledStyleBundle> {
        let acquiredSpriteUrl: string | undefined;
        try {
            const compiled = definition.kind === "raster"
                ? compileRasterStyleBundle(definition.id, definition.source, definition.layer)
                : await (async () => {
                    const style = await this.fetchStyle(definition.styleUrl);
                    if (Array.isArray(style.sprite)) {
                        throw new Error("Basemap styles with multiple sprite sheets are not supported yet");
                    }
                    const sprite = style.sprite === undefined
                        ? undefined
                        : await this.acquireSprite(resolveStyleResourceUrl(style.sprite, definition.styleUrl));
                    acquiredSpriteUrl = sprite?.url;
                    return compileVectorStyleBundle(
                        definition.id,
                        style,
                        definition.styleUrl,
                        {
                            fontStackOverride: definition.fontStackOverride,
                            spriteRuntimeId: sprite?.runtimeId,
                            registerSprite: false,
                        }
                    );
                })();
            if (this.disposed) throw new Error("Basemap manager has been removed");
            const installed = installStyleBundle(this.map, compiled, this.options.beforeLayerId);
            this.installed.set(definition.id, installed);
            if (acquiredSpriteUrl !== undefined) {
                this.spriteUrlByBasemap.set(definition.id, acquiredSpriteUrl);
            }
            return installed;
        } catch (error) {
            if (acquiredSpriteUrl !== undefined) {
                try {
                    this.releaseSprite(acquiredSpriteUrl);
                } catch (releaseError) {
                    console.error(
                        `Failed to release sprite for basemap "${definition.id}" after install failed:`,
                        releaseError
                    );
                }
            }
            throw error;
        }
    }

    /**
     * Acquire a sprite by URL, sharing one runtime registration across
     * basemaps that reference the same URL. The registry slot is reserved
     * synchronously (before the validation await) so concurrent acquires of
     * a new URL dedupe onto a single load instead of racing to add
     * duplicate sprites or colliding on the same generated runtime id.
     *
     * This never adopts a sprite it finds already registered on the map by
     * another subsystem (e.g. a data layer) — doing so would leave a
     * basemap silently depending on a sprite it doesn't own, which could be
     * removed out from under it whenever that other subsystem's own
     * reference count reaches zero.
     */
    private async acquireSprite(url: string): Promise<{ url: string; runtimeId: string }> {
        const existing = this.spritesByUrl.get(url);
        if (existing !== undefined) {
            existing.references += 1;
            if (existing.loading !== undefined) {
                try {
                    await existing.loading;
                } catch (error) {
                    existing.references -= 1;
                    throw error;
                }
            }
            return { url, runtimeId: existing.runtimeId };
        }

        const runtimeId = this.nextSpriteRuntimeId();
        const loading = this.validateSprite(url).then(() => {
            this.map.addSprite(runtimeId, url);
        });
        const entry: { runtimeId: string; references: number; loading?: Promise<void> } = {
            runtimeId,
            references: 1,
            loading,
        };
        this.spritesByUrl.set(url, entry);
        try {
            await loading;
            entry.loading = undefined;
        } catch (error) {
            if (this.spritesByUrl.get(url) === entry) this.spritesByUrl.delete(url);
            throw error;
        }
        return { url, runtimeId };
    }

    private releaseSprite(url: string): void {
        const registered = this.spritesByUrl.get(url);
        if (registered === undefined) return;
        registered.references -= 1;
        if (registered.references > 0) return;
        this.spritesByUrl.delete(url);
        if (this.map.getSprite().some(({ id }) => id === registered.runtimeId)) {
            this.map.removeSprite(registered.runtimeId);
        }
    }

    private nextSpriteRuntimeId(): string {
        const existingIds = new Set(this.map.getSprite().map(({ id }) => id));
        let index = 0;
        while (existingIds.has(`tosca-basemap-sprite-${index}`)) index += 1;
        return `tosca-basemap-sprite-${index}`;
    }
}

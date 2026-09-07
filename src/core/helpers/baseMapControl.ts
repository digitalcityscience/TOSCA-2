import {
    type IControl,
    type LayerSpecification,
    type SourceSpecification,
    type StyleSpecification,
} from "maplibre-gl";

interface BasemapOption {
    id: string;
    title: string;
    /** Raster XYZ tile URLs. Mutually exclusive with `vectorStyleUrl`. */
    tiles?: string[];
    /**
     * Full MapLibre style URL (e.g. an OpenFreeMap style) whose sources/layers are merged into
     * the map's single style, namespaced under this basemap's id. Mutually exclusive with `tiles`.
     */
    vectorStyleUrl?: string;
    /** Explicit thumbnail image for the basemap picker; required for vector-style basemaps since
     *  there is no single raster tile URL to derive one from. */
    thumbnailUrl?: string;
    sourceExtraParams?: Partial<maplibregl.RasterSourceSpecification>;
    layerExtraParams?: Partial<maplibregl.RasterLayerSpecification>;
}
export interface BaseMapControlOptions {
    maps: BasemapOption[];
    initialBasemap: string; // id of the initial basemap
}

function prefixSpriteIcon(value: unknown, spriteRuntimeId: string): unknown {
    return typeof value === "string"
        ? `${spriteRuntimeId}:${value}`
        : ["concat", `${spriteRuntimeId}:`, value];
}

export class BaseMapControl implements IControl {
    private readonly options: BaseMapControlOptions;

    private readonly container: HTMLElement;

    /** All MapLibre layer ids that belong to a given basemap; for basemaps merged from a full
     *  vector style this is many layers, not just `basemap.id`. */
    private readonly basemapLayerIds = new Map<string, string[]>();

    private map: maplibregl.Map | undefined;

    constructor(options: BaseMapControlOptions) {
        this.options = options;

        this.container = document.createElement("div");
        this.container.classList.add("maplibregl-ctrl", "maplibregl-ctrl-basemaps", "closed", "row");
        this.container.addEventListener("mouseenter", () => {
            this.container.classList.remove("closed");
        });
        this.container.addEventListener("mouseleave", () => {
            this.container.classList.add("closed");
        });
    }

    onAdd(map: maplibregl.Map): HTMLElement {
        /**
         * Add basemaps to the map once it's loaded. `firstLayerId` must be read inside
         * `initializeBasemaps`, not here: at `onAdd` time the style is still empty (the map was
         * just constructed), so capturing it early always resolves to `undefined` — which makes
         * `addLayer` append the raster basemap to the very top of the stack once `load` fires,
         * covering any layer added in the meantime (e.g. Terra Draw's, if the user starts drawing
         * before the map finishes loading).
         */
        this.map = map;
        if (map.loaded()) {
            void this.initializeBasemaps(map);
        } else {
            map.on("load", () => {
                void this.initializeBasemaps(map);
            })
        }
        return this.container;
    }

    onRemove(): void {
        this.container.parentNode?.removeChild(this.container);
    }

    private async initializeBasemaps(map: maplibregl.Map): Promise<void> {
        const layers = map.getStyle()?.layers;
        const firstLayerId: string|undefined = layers !== undefined && layers.length > 0 ? layers[0].id : undefined;
        for (const basemap of this.options.maps) {
            await this.addBasemap(map, basemap, firstLayerId);
        }
    }

    private async addBasemap(map: maplibregl.Map, basemap: BasemapOption, beforeId?: string): Promise<void> {
        const layerIds = basemap.vectorStyleUrl !== undefined
            ? await this.addVectorStyleBasemap(map, basemap, beforeId)
            : this.addRasterBasemap(map, basemap, beforeId);
        this.basemapLayerIds.set(basemap.id, layerIds);
        const basemapElement = this.createbasemapElement(basemap);
        const isActive = basemap.id === this.options.initialBasemap;
        this.setBasemapVisibility(map, basemap.id, isActive);
        if (isActive) {
            basemapElement.classList.add("active");
        }
        this.container.appendChild(basemapElement);
    }

    private addRasterBasemap(map: maplibregl.Map, basemap: BasemapOption, beforeId?: string): string[] {
        const { id, tiles = [], sourceExtraParams = {}, layerExtraParams = {} } = basemap;
        if (map.getSource(id) === undefined) {
            try {
                map.addSource(id, {
                    ...sourceExtraParams,
                    type: "raster",
                    tiles,
                });
            } catch (error) {
                console.error(`Failed to add source for basemap ${id}:`, error);
            }
        }
        if (map.getLayer(id) === undefined) {
            map.addLayer(
                { ...layerExtraParams, id, source: id, type: "raster" },
                beforeId
            );
        }
        return [id];
    }

    /**
     * Merges a full third-party style (e.g. OpenFreeMap Liberty) into the map's single style
     * object, namespacing every source/layer/sprite under `basemap.id` so it can coexist with the
     * other basemaps and the app's own overlay layers.
     *
     * `glyphs` is deliberately left untouched: MapLibre only supports one global glyphs URL per
     * style, and the app's own label layers (collab tracking, event clusters, participation names)
     * already depend on the local `/fonts/Open Sans Regular` endpoint. The merged style's font
     * (Noto Sans) isn't served there, so `text-field` is stripped from its layers rather than left
     * to fail silently against the wrong glyph server — the basemap renders roads/buildings/land
     * cover correctly, just without its own place/road labels.
     */
    private async addVectorStyleBasemap(map: maplibregl.Map, basemap: BasemapOption, beforeId?: string): Promise<string[]> {
        const { id, vectorStyleUrl } = basemap;
        if (vectorStyleUrl === undefined) return [];
        let style: StyleSpecification;
        try {
            const response = await fetch(vectorStyleUrl);
            style = await response.json() as StyleSpecification;
        } catch (error) {
            console.error(`Failed to load vector style for basemap ${id}:`, error);
            return [];
        }

        const sourceIdMap = new Map<string, string>();
        Object.entries(style.sources ?? {}).forEach(([sourceId, source]: [string, SourceSpecification]) => {
            const prefixedId = `${id}__${sourceId}`;
            sourceIdMap.set(sourceId, prefixedId);
            if (map.getSource(prefixedId) === undefined) {
                try {
                    map.addSource(prefixedId, source);
                } catch (error) {
                    console.error(`Failed to add source ${sourceId} for basemap ${id}:`, error);
                }
            }
        });

        let spriteRuntimeId: string | undefined;
        if (typeof style.sprite === "string") {
            spriteRuntimeId = `${id}-sprite`;
            try {
                map.addSprite(spriteRuntimeId, style.sprite);
            } catch (error) {
                console.error(`Failed to add sprite for basemap ${id}:`, error);
                spriteRuntimeId = undefined;
            }
        }

        const layerIds: string[] = [];
        (style.layers ?? []).forEach((layer: LayerSpecification) => {
            const prefixedLayerId = `${id}__${layer.id}`;
            const newLayer = { ...layer, id: prefixedLayerId } as LayerSpecification;
            if ("source" in newLayer && typeof newLayer.source === "string") {
                newLayer.source = sourceIdMap.get(newLayer.source) ?? newLayer.source;
            }
            if (newLayer.layout !== undefined) {
                const layout = { ...newLayer.layout } as Record<string, unknown>;
                if (spriteRuntimeId !== undefined && layout["icon-image"] !== undefined) {
                    layout["icon-image"] = prefixSpriteIcon(layout["icon-image"], spriteRuntimeId);
                }
                delete layout["text-field"];
                newLayer.layout = layout as typeof newLayer.layout;
            }
            if (map.getLayer(prefixedLayerId) === undefined) {
                try {
                    map.addLayer(newLayer, beforeId);
                    layerIds.push(prefixedLayerId);
                } catch (error) {
                    console.error(`Failed to add layer ${layer.id} for basemap ${id}:`, error);
                }
            }
        });
        return layerIds;
    }

    private setBasemapVisibility(map: maplibregl.Map, basemapId: string, visible: boolean): void {
        const layerIds = this.basemapLayerIds.get(basemapId) ?? [];
        layerIds.forEach((layerId) => {
            if (map.getLayer(layerId) !== undefined) {
                map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
            }
        });
    }

    private createbasemapElement(basemap: BasemapOption): HTMLElement {
        const { id, title, tiles = [], sourceExtraParams = {}, thumbnailUrl } = basemap;
        const basemapElement = document.createElement("div");
        const resolvedThumbnailUrl = thumbnailUrl ?? (tiles.length > 0 ? this.getThumbnailUrl(tiles[0], sourceExtraParams) : "");
        if (resolvedThumbnailUrl.length === 0) {
            basemapElement.style.backgroundColor = "#f0f0f0";
        } else {
            basemapElement.style.backgroundImage = `url('${resolvedThumbnailUrl}')`;
        }
        basemapElement.classList.add("basemap");
        basemapElement.dataset.id = id;

        const basemapTitle = document.createElement("span");
        basemapTitle.textContent = title;
        basemapElement.appendChild(basemapTitle);

        basemapElement.addEventListener("click", () => {
            this.onBasemapClick(id, basemapElement);
        });
        basemapElement.setAttribute("role", "button");
        basemapElement.setAttribute("aria-label", `Select basemap ${title}`);
        basemapElement.setAttribute("tabindex", "0");
        basemapElement.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                this.onBasemapClick(id, basemapElement);
            }
        });
        return basemapElement;
    }

    private getThumbnailUrl(tileUrl: string, sourceParams: Partial<maplibregl.RasterSourceSpecification>): string {
        if (tileUrl.length === 0) {
            return "";
        }
        const minZoom = sourceParams.minzoom ?? 0;
        const thumbnailUrl = tileUrl
            .replace("{x}", "0")
            .replace("{y}", "0")
            .replace("{z}", minZoom.toString());
        const placeholderRegex = /{.*?}/;
        return placeholderRegex.test(thumbnailUrl) ? "" : thumbnailUrl;
    }

    private onBasemapClick(id: string, basemapElement: HTMLElement): void {
        const map = this.map;
        if (map === undefined) return;
        const activeElement = this.container.querySelector(".active");
        if ((activeElement != null) && activeElement instanceof HTMLElement) {
            const activeId = activeElement.dataset.id;
            if (activeId != null) {
                activeElement.classList.remove("active");
                this.setBasemapVisibility(map, activeId, false);
            }
        }
        basemapElement.classList.add("active");
        this.setBasemapVisibility(map, id, true);
    }
}

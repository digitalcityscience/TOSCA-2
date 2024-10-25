import { type IControl } from "maplibre-gl";
interface BasemapOption {
    id: string;
    title: string;
    tiles: string[];
    sourceExtraParams?: Partial<maplibregl.RasterSourceSpecification>;
    layerExtraParams?: Partial<maplibregl.RasterLayerSpecification>;
}
export interface BaseMapControlOptions {
    maps: BasemapOption[];
    initialBasemap: string; // id of the initial basemap
}
export class BaseMapControl implements IControl {
    private readonly options: BaseMapControlOptions;

    private readonly container: HTMLElement;

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
         * Add basemaps to the map.
         * We should check if the map is loaded before adding the basemaps. Also if there is already another layers
         * on the map, we should add the basemaps before the first layer.
         */
        const layers = map.getStyle()?.layers;
        const firstLayerId: string|undefined = layers !== undefined && layers.length > 0 ? layers[0].id : undefined;
        if (map.loaded()) {
            this.initializeBasemaps(map, firstLayerId);
        } else {
            map.on("load", () => {
                this.initializeBasemaps(map, firstLayerId);
            })
        }
        return this.container;
    }

    onRemove(): void {
        this.container.parentNode?.removeChild(this.container);
    }

    private initializeBasemaps(map: maplibregl.Map, firstLayerId?: string): void {
        this.options.maps.forEach((basemap) => {
            this.addBasemapSource(map, basemap);
            this.addBasemapLayer(map, basemap, firstLayerId);
            const basemapElement = this.createbasemapElement(map, basemap);
            const isActive = basemap.id === this.options.initialBasemap;
            map.setLayoutProperty(basemap.id, "visibility", isActive ? "visible" : "none");
            if (isActive) {
                basemapElement.classList.add("active");
            }
            this.container.appendChild(basemapElement);
        });
    }

    private addBasemapSource(map: maplibregl.Map, basemap: BasemapOption): void {
        const { id, tiles, sourceExtraParams = {} } = basemap;
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
    }

    private addBasemapLayer(map: maplibregl.Map, basemap: BasemapOption, beforeId?: string): void {
        const { id, layerExtraParams = {} } = basemap;
        if (map.getLayer(id) === undefined) {
            map.addLayer(
                { ...layerExtraParams, id, source: id, type: "raster" },
                beforeId
            );
        }
    }

    private createbasemapElement(map: maplibregl.Map, basemap: BasemapOption): HTMLElement {
        const { id, title, tiles, sourceExtraParams = {} } = basemap;
        const basemapElement = document.createElement("div");
        const tileUrl = tiles[0];
        const thumbnailUrl = (tileUrl.length > 0) ? this.getThumbnailUrl(tileUrl, sourceExtraParams) : "";
        if (thumbnailUrl.length === 0) {
            basemapElement.style.backgroundColor = "#f0f0f0";
        } else {
            basemapElement.style.backgroundImage = `url('${thumbnailUrl}')`;
        }
        basemapElement.classList.add("basemap");
        basemapElement.dataset.id = id;

        const basemapTitle = document.createElement("span");
        basemapTitle.textContent = title;
        basemapElement.appendChild(basemapTitle);

        basemapElement.addEventListener("click", () => {
            this.onBasemapClick(map, id, basemapElement);
        });
        basemapElement.setAttribute("role", "button");
        basemapElement.setAttribute("aria-label", `Select basemap ${title}`);
        basemapElement.setAttribute("tabindex", "0");
        basemapElement.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                this.onBasemapClick(map, id, basemapElement);
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

    private onBasemapClick(map: maplibregl.Map, id: string, basemapElement: HTMLElement): void {
        const activeElement = this.container.querySelector(".active");
        if ((activeElement != null) && activeElement instanceof HTMLElement) {
            const activeId = activeElement.dataset.id;
            if (activeId != null) {
                activeElement.classList.remove("active");
                map.setLayoutProperty(activeId, "visibility", "none");
            }
        }
        basemapElement.classList.add("active");
        map.setLayoutProperty(id, "visibility", "visible");
    }
}

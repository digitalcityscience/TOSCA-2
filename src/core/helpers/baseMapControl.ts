import { type IControl, type Map } from "maplibre-gl";
import {
    BasemapManager,
    type BasemapManagerOptions,
    type BasemapOption,
} from "./basemapManager";

export type { BasemapOption, RasterBasemapOption, VectorBasemapOption } from "./basemapManager";

export interface BaseMapControlOptions extends BasemapManagerOptions {
    maps: BasemapOption[];
    initialBasemap: string;
    onBasemapLoadError?: (basemap: BasemapOption) => void;
}

export class BaseMapControl implements IControl {
    private readonly container: HTMLElement;
    private manager?: BasemapManager;
    private map?: Map;
    private readonly onMapLoad = (): void => {
        void this.initializeBasemaps();
    };

    constructor(private readonly options: BaseMapControlOptions) {
        this.container = document.createElement("div");
        this.container.classList.add("maplibregl-ctrl", "maplibregl-ctrl-basemaps", "closed", "row");
        this.container.addEventListener("mouseenter", () => {
            this.container.classList.remove("closed");
        });
        this.container.addEventListener("mouseleave", () => {
            this.container.classList.add("closed");
        });
    }

    onAdd(map: Map): HTMLElement {
        this.map = map;
        this.manager = new BasemapManager(map, this.options.maps, {
            terrainOverlayLayerId: this.options.terrainOverlayLayerId,
            fetchStyle: this.options.fetchStyle,
            validateSprite: this.options.validateSprite,
        });
        this.options.maps.forEach((basemap) => {
            this.container.appendChild(this.createBasemapElement(basemap));
        });
        if (map.loaded()) {
            void this.initializeBasemaps();
        } else {
            void map.once("load", this.onMapLoad);
        }
        return this.container;
    }

    onRemove(): void {
        this.map?.off("load", this.onMapLoad);
        this.manager?.destroy();
        this.manager = undefined;
        this.map = undefined;
        this.container.parentNode?.removeChild(this.container);
    }

    private async initializeBasemaps(): Promise<void> {
        try {
            const activated = await this.manager?.activate(this.options.initialBasemap);
            if (activated === true) this.syncActiveElement();
        } catch (error) {
            this.reportLoadFailure(this.options.initialBasemap, error);
        }

        this.options.maps
            .filter(({ id }) => id !== this.options.initialBasemap)
            .forEach(({ id }) => {
                void this.manager?.preload(id).catch((error: unknown) => {
                    console.error(`Failed to preload basemap ${id}:`, error);
                });
            });
    }

    private createBasemapElement(basemap: BasemapOption): HTMLElement {
        const element = document.createElement("div");
        const thumbnailUrl = basemap.thumbnailUrl ?? this.getRasterThumbnailUrl(basemap);
        if (thumbnailUrl === undefined) {
            element.style.backgroundColor = "#f0f0f0";
        } else {
            element.style.backgroundImage = `url('${thumbnailUrl}')`;
        }
        element.classList.add("basemap");
        element.dataset.id = basemap.id;

        const title = document.createElement("span");
        title.textContent = basemap.title;
        element.appendChild(title);
        element.setAttribute("role", "button");
        element.setAttribute("aria-label", `Select basemap ${basemap.title}`);
        element.setAttribute("tabindex", "0");
        element.addEventListener("click", () => {
            void this.activateBasemap(basemap.id, element);
        });
        element.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                void this.activateBasemap(basemap.id, element);
            }
        });
        return element;
    }

    private async activateBasemap(id: string, element: HTMLElement): Promise<void> {
        if (element.getAttribute("aria-busy") === "true") return;
        element.setAttribute("aria-busy", "true");
        try {
            const activated = await this.manager?.activate(id);
            if (activated === true) this.syncActiveElement();
        } catch (error) {
            this.reportLoadFailure(id, error);
        } finally {
            element.removeAttribute("aria-busy");
        }
    }

    private syncActiveElement(): void {
        const activeId = this.manager?.getActiveId();
        this.container.querySelectorAll<HTMLElement>(".basemap").forEach((element) => {
            const isActive = element.dataset.id === activeId;
            element.classList.toggle("active", isActive);
            element.setAttribute("aria-pressed", String(isActive));
        });
    }

    private reportLoadFailure(id: string, error: unknown): void {
        console.error(`Failed to activate basemap ${id}:`, error);
        const basemap = this.options.maps.find((candidate) => candidate.id === id);
        if (basemap !== undefined) this.options.onBasemapLoadError?.(basemap);
    }

    private getRasterThumbnailUrl(basemap: BasemapOption): string | undefined {
        if (basemap.kind !== "raster" || basemap.source.tiles?.[0] === undefined) return undefined;
        const minZoom = basemap.source.minzoom ?? 0;
        const thumbnailUrl = basemap.source.tiles[0]
            .replace("{x}", "0")
            .replace("{y}", "0")
            .replace("{z}", minZoom.toString());
        return /{.*?}/.test(thumbnailUrl) ? undefined : thumbnailUrl;
    }
}

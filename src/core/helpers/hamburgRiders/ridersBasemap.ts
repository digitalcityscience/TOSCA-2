/**
 * The dark basemap of the original HamburgRiders, without touching TOSCA's basemap manager.
 *
 * TOSCA keeps every basemap as an installed style bundle (`basemap:<id>:…` layers) and switches by toggling
 * their visibility. This adapter installs one more bundle with the same public helpers, hides the layers of the
 * basemap that was showing, and on `disable()` puts everything back. If the user picks another basemap in the
 * meantime, that choice wins: the dark bundle is withdrawn and nothing is restored.
 */
import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import {
    compileVectorStyleBundle,
    fetchMapStyle,
    installStyleBundle,
    setStyleBundleVisibility,
    uninstallStyleBundle,
    type InstalledStyleBundle,
} from "@helpers/mapStyleBundle";
import { RIDERS_DARK_BASEMAP_ID, RIDERS_DARK_STYLE_URL } from "./ridersConfig";

const BASEMAP_PREFIX = "basemap:";
const TERRAIN_OVERLAY_LAYER_ID = "terrain-hillshade";

export interface RidersBasemapOptions {
    fetchStyle?: (url: string) => Promise<StyleSpecification>;
    styleUrl?: string;
}

export class RidersDarkBasemap {
    private bundle: InstalledStyleBundle | undefined;
    private hiddenByUs = new Set<string>();
    private absorbInitial = false;
    private superseded = false;
    private desired = false;
    private version = 0;
    private readonly onStyleData = (): void => this.checkUserSwitch();

    constructor(private readonly map: MapLibreMap, private readonly options: RidersBasemapOptions = {}) {}

    get active(): boolean {
        return this.bundle !== undefined && !this.superseded;
    }

    /** True once the user chose another basemap while the dark one was on. */
    get supersededByUser(): boolean {
        return this.superseded;
    }

    async enable(): Promise<void> {
        this.desired = true;
        if (this.bundle !== undefined) return;
        const version = ++this.version;
        const styleUrl = this.options.styleUrl ?? RIDERS_DARK_STYLE_URL;
        const style = await (this.options.fetchStyle ?? fetchMapStyle)(styleUrl);
        if (!this.desired || version !== this.version) return;

        const compiled = compileVectorStyleBundle(RIDERS_DARK_BASEMAP_ID, style, styleUrl, { fontStackOverride: ["Open Sans Regular"] });
        const beforeId = this.map.getLayer(TERRAIN_OVERLAY_LAYER_ID) === undefined ? undefined : TERRAIN_OVERLAY_LAYER_ID;
        const bundle = installStyleBundle(this.map, compiled, beforeId);
        this.bundle = bundle;
        this.superseded = false;

        this.hiddenByUs = new Set(this.foreignBasemapLayers().filter((id) => this.isVisible(id)));
        this.absorbInitial = this.hiddenByUs.size === 0;
        setStyleBundleVisibility(this.map, bundle, true);
        this.hiddenByUs.forEach((id) => this.map.setLayoutProperty(id, "visibility", "none"));
        this.map.on("styledata", this.onStyleData);
    }

    /** Restores the basemap that was showing (unless the user switched) and removes the dark bundle. */
    disable(): void {
        this.desired = false;
        this.version += 1;
        this.map.off("styledata", this.onStyleData);
        const bundle = this.bundle;
        if (bundle === undefined) return;
        this.bundle = undefined;
        if (!this.superseded) {
            this.hiddenByUs.forEach((id) => {
                if (this.map.getLayer(id) !== undefined) this.map.setLayoutProperty(id, "visibility", "visible");
            });
        }
        setStyleBundleVisibility(this.map, bundle, false);
        uninstallStyleBundle(this.map, bundle);
        this.hiddenByUs.clear();
        this.superseded = false;
    }

    private isVisible(layerId: string): boolean {
        return this.map.getLayoutProperty(layerId, "visibility") !== "none";
    }

    private foreignBasemapLayers(): string[] {
        const own = new Set(this.bundle?.layers.map(({ id }) => id));
        return (this.map.getStyle().layers ?? [])
            .map(({ id }) => id)
            .filter((id) => id.startsWith(BASEMAP_PREFIX) && !own.has(id));
    }

    private checkUserSwitch(): void {
        if (this.bundle === undefined || this.superseded) return;
        const newlyVisible = this.foreignBasemapLayers().filter((id) => this.isVisible(id) && !this.hiddenByUs.has(id));
        if (newlyVisible.length === 0) return;
        if (this.absorbInitial) {
            // The first basemap finished loading after the story opened; it is the one to hide and later restore.
            this.absorbInitial = false;
            newlyVisible.forEach((id) => {
                this.hiddenByUs.add(id);
                this.map.setLayoutProperty(id, "visibility", "none");
            });
            return;
        }
        this.superseded = true;
        if (this.bundle !== undefined) setStyleBundleVisibility(this.map, this.bundle, false);
    }
}

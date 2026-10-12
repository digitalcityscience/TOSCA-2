/**
 * Draws HamburgRiders on TOSCA's existing MapLibre map and lists it in TOSCA's layer panel.
 *
 * Uses only public MapLibre API and the public actions of `mapStore` (`add2MapLayerList`,
 * `setLogicalLayerVisibility`, `removeFromMapLayerList`); it adds no behaviour to them. Every source, layer and
 * listener it creates is namespaced `hamburgriders:` and removed again by `destroy()`.
 */
import { Popup, type GeoJSONSource, type LayerSpecification, type Map as MapLibreMap, type MapLayerMouseEvent } from "maplibre-gl";
import type { LayerObjectWithAttributes } from "@store/map";
import { MODE_STYLE, RIDERS_MODES, type RidersMode } from "./ridersConfig";
import type { RidersDataset } from "./ridersData";
import {
    networkLayerId,
    networkLayerSpec,
    RIDERS_LAYER_IDS,
    RIDERS_LAYER_TITLES,
    STOPS_LAYER_ID,
    STOPS_SOURCE_ID,
    stopsLayerSpec,
    VEHICLES_LAYER_ID,
    VEHICLES_SOURCE_ID,
    vehiclesLayerSpec,
} from "./ridersLayers";
import type { RidersEffective } from "./ridersState";
import type { VehicleFrame } from "./ridersVehicles";

/** The slice of `useMapStore()` the adapter relies on. */
export interface RidersMapStore {
    layersOnMap: LayerObjectWithAttributes[];
    add2MapLayerList: (layer: LayerObjectWithAttributes, index?: number, options?: { notify?: boolean }) => void;
    removeFromMapLayerList: (identifier: string, information?: boolean) => void;
    setLogicalLayerVisibility: (layer: LayerObjectWithAttributes, visible: boolean) => void;
}

function layerSpecs(): LayerSpecification[] {
    return [...RIDERS_MODES.map(networkLayerSpec), stopsLayerSpec(), vehiclesLayerSpec()];
}

const EMPTY_VEHICLES: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

function escapeHtml(value: string): string {
    const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };
    return value.replace(/[&<>"']/g, (char) => entities[char] ?? char);
}

export class RidersMapAdapter {
    private installed = false;
    private listeners: Array<{ type: "mousemove" | "mouseleave"; layerId: string; handler: (event: MapLayerMouseEvent) => void }> = [];
    private stopPopup: Popup | undefined;
    private tripPopup: Popup | undefined;

    constructor(
        private readonly map: MapLibreMap,
        private readonly mapStore: RidersMapStore,
        private readonly dataset: RidersDataset
    ) {}

    get isInstalled(): boolean {
        return this.installed && this.map.getSource(STOPS_SOURCE_ID) !== undefined;
    }

    /** Adds sources and layers (all hidden until `applyVisibility`) and registers them in the layer list. */
    install(): void {
        if (this.installed) this.destroy();
        const { map } = this;
        map.addSource(STOPS_SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: this.dataset.stops } });
        map.addSource(VEHICLES_SOURCE_ID, { type: "geojson", data: EMPTY_VEHICLES });

        layerSpecs().forEach((spec) => this.addLayer(spec));
        this.installed = true;
        this.registerPopups();
    }

    /** Adds one layer hidden and lists it; also used to bring back a layer the user removed in the layer panel. */
    private addLayer(spec: LayerSpecification): void {
        this.map.addLayer({ ...spec, layout: { ...(spec.layout ?? {}), visibility: "none" } } as LayerSpecification);
        this.mapStore.add2MapLayerList({
            id: spec.id,
            source: "source" in spec ? spec.source : STOPS_SOURCE_ID,
            sourceType: "geojson",
            type: spec.type as LayerObjectWithAttributes["type"],
            displayName: RIDERS_LAYER_TITLES[spec.id],
            showOnLayerList: true,
            // Hover popups below replace the generic attribute popup of TOSCA.
            attributePopupSuppressed: true,
        }, undefined, { notify: false });
    }

    /** Shows exactly the capabilities in `effective`. Safe to call repeatedly. */
    applyVisibility(effective: RidersEffective): void {
        if (!this.isInstalled) this.install();
        const wanted = new Set<string>([
            ...effective.network.map(networkLayerId),
            ...(effective.stops.length > 0 ? [STOPS_LAYER_ID] : []),
            ...(effective.vehicleGroups.length > 0 ? [VEHICLES_LAYER_ID] : []),
        ]);
        for (const spec of layerSpecs()) {
            if (wanted.has(spec.id) && this.map.getLayer(spec.id) === undefined) this.addLayer(spec);
        }
        for (const mode of RIDERS_MODES) this.setVisible(networkLayerId(mode), effective.network.includes(mode));
        this.setVisible(STOPS_LAYER_ID, effective.stops.length > 0);
        if (effective.stops.length > 0) {
            this.map.setFilter(STOPS_LAYER_ID, ["in", ["get", "mode"], ["literal", effective.stops]]);
        }
        this.setVisible(VEHICLES_LAYER_ID, effective.vehicleGroups.length > 0);
        if (effective.vehicleGroups.length === 0) {
            this.setVehicles(undefined);
            this.tripPopup?.remove();
        }
        if (effective.stops.length === 0) this.stopPopup?.remove();
    }

    /** Visibility the TOSCA layer list currently shows for one of the Riders layers. */
    isListedVisible(layerId: string): boolean | undefined {
        if (this.map.getLayer(layerId) === undefined) return undefined;
        return this.map.getLayoutProperty(layerId, "visibility") !== "none";
    }

    setVehicles(frame: Pick<VehicleFrame, "features"> | undefined): void {
        const source = this.map.getSource(VEHICLES_SOURCE_ID) as GeoJSONSource | undefined;
        source?.setData(frame === undefined ? EMPTY_VEHICLES : { type: "FeatureCollection", features: frame.features });
    }

    /** Ids of Riders layers a user removed through the layer panel. */
    removedLayerIds(): string[] {
        return RIDERS_LAYER_IDS.filter((id) => this.installed && this.map.getLayer(id) === undefined);
    }

    destroy(): void {
        const { map } = this;
        this.listeners.forEach(({ type, layerId, handler }) => map.off(type, layerId, handler));
        this.listeners = [];
        this.stopPopup?.remove();
        this.tripPopup?.remove();
        this.stopPopup = undefined;
        this.tripPopup = undefined;
        for (const id of [...RIDERS_LAYER_IDS].reverse()) {
            if (map.getLayer(id) !== undefined) map.removeLayer(id);
            if (this.mapStore.layersOnMap.some((layer) => layer.id === id)) this.mapStore.removeFromMapLayerList(id);
        }
        for (const id of [VEHICLES_SOURCE_ID, STOPS_SOURCE_ID]) {
            if (map.getSource(id) !== undefined) map.removeSource(id);
        }
        map.getCanvas().style.cursor = "";
        this.installed = false;
    }

    private setVisible(layerId: string, visible: boolean): void {
        if (this.map.getLayer(layerId) === undefined) return;
        const record = this.mapStore.layersOnMap.find((layer) => layer.id === layerId);
        const current = this.map.getLayoutProperty(layerId, "visibility") !== "none";
        if (record === undefined) {
            if (current !== visible) this.map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
            return;
        }
        // The store call keeps TOSCA's shared layer state in step with the map.
        if (current !== visible) this.mapStore.setLogicalLayerVisibility(record, visible);
    }

    private listen(type: "mousemove" | "mouseleave", layerId: string, handler: (event: MapLayerMouseEvent) => void): void {
        this.map.on(type, layerId, handler);
        this.listeners.push({ type, layerId, handler });
    }

    private registerPopups(): void {
        const options = { closeButton: false, closeOnClick: false, offset: 8, className: "hamburgriders-popup" };
        this.stopPopup = new Popup({ ...options, offset: 6 });
        this.tripPopup = new Popup(options);

        this.listen("mousemove", STOPS_LAYER_ID, (event) => {
            const properties = event.features?.[0]?.properties as { id?: string; name?: string; mode?: RidersMode; transit_type?: string } | undefined;
            if (properties?.name === undefined) return;
            const color = MODE_STYLE[properties.mode ?? "bus"].hex;
            this.map.getCanvas().style.cursor = "pointer";
            this.stopPopup?.setLngLat(event.lngLat).setHTML(
                `<div class="popup-title" style="color:${color}">${escapeHtml(properties.name)}</div>`
                + `<div class="popup-row"><span class="popup-key">Type:</span><span class="popup-val">${escapeHtml(properties.transit_type ?? "")}</span></div>`
                + `<div class="popup-row"><span class="popup-key">ID:</span><span class="popup-val">${escapeHtml(properties.id ?? "")}</span></div>`
            ).addTo(this.map);
        });
        this.listen("mouseleave", STOPS_LAYER_ID, () => {
            this.map.getCanvas().style.cursor = "";
            this.stopPopup?.remove();
        });

        this.listen("mousemove", VEHICLES_LAYER_ID, (event) => {
            const index = Number((event.features?.[0]?.properties as { i?: number } | undefined)?.i);
            if (!Number.isInteger(index)) return;
            const { timetable, routes } = this.dataset;
            const route = routes[timetable.tripRoute[index]];
            if (route === undefined) return;
            const color = `#${this.dataset.groups[this.dataset.tripGroup[index]].color}`;
            const headsign = timetable.headsigns[index];
            this.map.getCanvas().style.cursor = "pointer";
            this.tripPopup?.setLngLat(event.lngLat).setHTML(
                `<div class="popup-title"><span class="popup-color-dot" style="background:${color}"></span>`
                + `${route.short_name ? `${escapeHtml(route.short_name)} – ` : ""}${escapeHtml(headsign)}</div>`
                + `<div class="popup-row"><span class="popup-key">Route:</span><span class="popup-val">${escapeHtml(route.long_name || "–")}</span></div>`
                + `<div class="popup-row"><span class="popup-key">Trip ID:</span><span class="popup-val">${escapeHtml(timetable.tripIds[index])}</span></div>`
                + `<div class="popup-row"><span class="popup-key">Agency:</span><span class="popup-val">${escapeHtml(route.agency_id || "–")}</span></div>`
            ).addTo(this.map);
        });
        this.listen("mouseleave", VEHICLES_LAYER_ID, () => {
            this.map.getCanvas().style.cursor = "";
            this.tripPopup?.remove();
        });
    }
}

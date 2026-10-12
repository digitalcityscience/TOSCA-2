import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { AREA_CLASS_INFO, FOCUS_OUTLINE, PLAYGROUND_ICON } from "../../config/urbanStories/styles/greenSpaces/constants";
import { FifteenMinuteOverlays, labelPoint, type AreaOutline } from "./fifteenMinuteOverlays";

/**
 * Overlays of the Green Spaces story that are not catalog layers: the selected building and the outlines of the compared
 * Stadtteile (the 15-Minute City overlay class is reused as it is), the highlighted official green area, the example
 * markers and the playground pictogram. They live in their own `gs-*` GeoJSON sources on the existing map, are added on
 * demand and removed completely by `dispose()`.
 */

const SOURCES = { highlight: "gs-highlight", markers: "gs-markers" } as const;

export const GREEN_OVERLAY_LAYER_IDS = {
    highlightFill: "gs-highlight-fill",
    highlightHalo: "gs-highlight-halo",
    highlightLine: "gs-highlight-line",
    markerCircle: "gs-markers-circle",
    markerLabel: "gs-markers-label",
} as const;

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const FONT = ["Open Sans Regular"];

export interface ExampleMarker {
    center: [number, number];
    /** One letter that ties the marker to its card in the panel. */
    label: string;
    selected: boolean;
}

/** Draws the playground pictogram: a swing set on a round orange badge. Returns `undefined` where no canvas exists. */
export function drawPlaygroundIcon(size = 64): ImageData | undefined {
    if (typeof document === "undefined") return undefined;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (context === null) return undefined;
    const s = size / 64;
    context.scale(s, s);
    context.beginPath();
    context.arc(32, 32, 28, 0, Math.PI * 2);
    context.fillStyle = AREA_CLASS_INFO.playground.color;
    context.fill();
    context.lineWidth = 4;
    context.strokeStyle = "#ffffff";
    context.stroke();
    context.strokeStyle = "#ffffff";
    context.fillStyle = "#ffffff";
    context.lineWidth = 3.4;
    context.lineCap = "round";
    context.lineJoin = "round";
    // A-frame: two legs and the top bar.
    context.beginPath();
    context.moveTo(16, 47);
    context.lineTo(25, 17);
    context.lineTo(39, 17);
    context.lineTo(48, 47);
    context.stroke();
    // Two ropes and the seat.
    context.lineWidth = 2.2;
    context.beginPath();
    context.moveTo(28, 17);
    context.lineTo(28, 38);
    context.moveTo(36, 17);
    context.lineTo(36, 38);
    context.stroke();
    context.lineWidth = 3.4;
    context.beginPath();
    context.moveTo(25, 39);
    context.lineTo(39, 39);
    context.stroke();
    return context.getImageData(0, 0, size, size);
}

export class GreenSpacesOverlays {
    private disposed = false;
    private readonly base: FifteenMinuteOverlays;

    constructor(private readonly map: MapLibreMap) {
        this.base = new FifteenMinuteOverlays(map);
    }

    private source(id: string): GeoJSONSource | undefined {
        return this.map.getSource(id) as GeoJSONSource | undefined;
    }

    private ensureSource(id: string): void {
        if (this.map.getSource(id) === undefined) this.map.addSource(id, { type: "geojson", data: EMPTY } as never);
    }

    private addLayerOnce(layer: Record<string, unknown> & { id: string }): void {
        if (this.map.getLayer(layer.id) === undefined) this.map.addLayer(layer as never);
    }

    /** The playground pictogram the styles refer to. Added once per map. */
    ensurePlaygroundIcon(): void {
        if (this.disposed || this.map.hasImage(PLAYGROUND_ICON)) return;
        const image = drawPlaygroundIcon();
        if (image === undefined) return;
        this.map.addImage(PLAYGROUND_ICON, image, { pixelRatio: 2 });
    }

    setSelectedBuilding(selection: { geometry: GeoJSON.Geometry; height: number } | undefined): void {
        if (!this.disposed) this.base.setSelectedBuilding(selection);
    }

    setAreaOutlines(outlines: readonly AreaOutline[]): void {
        if (!this.disposed) this.base.setAreaOutlines(outlines);
    }

    /** The official green area the reader clicked: its whole polygon, outlined. */
    setHighlightedArea(geometry: GeoJSON.Geometry | undefined): void {
        if (this.disposed) return;
        this.ensureSource(SOURCES.highlight);
        this.addLayerOnce({
            id: GREEN_OVERLAY_LAYER_IDS.highlightFill,
            type: "fill",
            source: SOURCES.highlight,
            paint: { "fill-color": FOCUS_OUTLINE, "fill-opacity": 0.1 },
        });
        this.addLayerOnce({
            id: GREEN_OVERLAY_LAYER_IDS.highlightHalo,
            type: "line",
            source: SOURCES.highlight,
            paint: { "line-color": "#ffffff", "line-width": 6, "line-opacity": 0.9 },
        });
        this.addLayerOnce({
            id: GREEN_OVERLAY_LAYER_IDS.highlightLine,
            type: "line",
            source: SOURCES.highlight,
            paint: { "line-color": FOCUS_OUTLINE, "line-width": 2.6 },
        });
        this.source(SOURCES.highlight)?.setData(geometry === undefined
            ? EMPTY
            : { type: "FeatureCollection", features: [{ type: "Feature", geometry, properties: {} }] });
    }

    /** Lettered markers on the example buildings, so the panel cards can point at them. */
    setMarkers(markers: readonly ExampleMarker[]): void {
        if (this.disposed) return;
        this.ensureSource(SOURCES.markers);
        this.addLayerOnce({
            id: GREEN_OVERLAY_LAYER_IDS.markerCircle,
            type: "circle",
            source: SOURCES.markers,
            paint: {
                "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 8, 16, 12, 18, 14],
                "circle-color": ["case", ["==", ["get", "selected"], true], "#06b6d4", "#ffffff"],
                "circle-stroke-color": "#111827",
                "circle-stroke-width": 2,
            },
        });
        this.addLayerOnce({
            id: GREEN_OVERLAY_LAYER_IDS.markerLabel,
            type: "symbol",
            source: SOURCES.markers,
            layout: { "text-field": ["get", "label"], "text-font": FONT, "text-size": 12, "text-allow-overlap": true, "text-ignore-placement": true },
            paint: { "text-color": "#111827" },
        });
        this.source(SOURCES.markers)?.setData({
            type: "FeatureCollection",
            features: markers.map((marker) => ({
                type: "Feature" as const,
                geometry: { type: "Point" as const, coordinates: marker.center },
                properties: { label: marker.label, selected: marker.selected },
            })),
        });
    }

    /** Layers added to the map later (catalog layers) land on top of ours; this puts every overlay back above them. */
    raise(): void {
        this.base.raise();
        for (const id of Object.values(GREEN_OVERLAY_LAYER_IDS)) {
            if (this.map.getLayer(id) !== undefined) this.map.moveLayer(id);
        }
    }

    /** Removes every overlay layer and source this object added. */
    dispose(): void {
        this.disposed = true;
        this.base.dispose();
        for (const id of Object.values(GREEN_OVERLAY_LAYER_IDS)) if (this.map.getLayer(id) !== undefined) this.map.removeLayer(id);
        for (const id of Object.values(SOURCES)) if (this.map.getSource(id) !== undefined) this.map.removeSource(id);
        // The pictogram stays: the Green Areas layer outlives the run in the Layers list and still refers to it.
    }
}

export { labelPoint };

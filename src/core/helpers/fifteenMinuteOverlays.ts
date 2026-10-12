import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { AREA_COLORS, INK, SELECTION_COLOR, selectionExtrusionHeightExpression } from "../../config/urbanStories/styles/fifteenMinute";

/**
 * Overlays of the 15-Minute City story that are not catalog layers: the selected building and the outlines (with
 * names) of the compared Stadtteile. They live in their own `fm-*` GeoJSON sources on the existing map, are added on
 * demand and removed completely by `dispose()`.
 *
 * @remarks
 * The selection keeps the thematic colour visible: a translucent tint on the building, a white halo and a cyan outline,
 * at the same height as the extruded building (flat below the 3D zoom range), so a selected building is never hidden.
 */

const SOURCES = { selection: "fm-selection", areas: "fm-areas" } as const;

export const OVERLAY_LAYER_IDS = {
    selectionFill: "fm-selection-fill",
    selectionHalo: "fm-selection-halo",
    selectionLine: "fm-selection-line",
    selectionRing: "fm-selection-ring",
    areaLine: "fm-areas-line",
    areaLabel: "fm-areas-label",
} as const;

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const FONT = ["Open Sans Regular"];

export interface AreaOutline {
    geometry: GeoJSON.Geometry;
    /** `a` / `b`: the two compared places; `focus`: a single highlighted place. */
    tone: "a" | "b" | "focus";
    name: string;
}

type Ring = [number, number][];

function polygonRings(geometry: GeoJSON.Geometry): Ring[] {
    if (geometry.type === "Polygon") return [geometry.coordinates[0] as Ring];
    if (geometry.type === "MultiPolygon") return geometry.coordinates.map((polygon) => polygon[0] as Ring);
    return [];
}

function ringArea(ring: Ring): number {
    let sum = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    return sum / 2;
}

function inRing(point: [number, number], ring: Ring): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if ((yi > point[1]) !== (yj > point[1]) && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

/**
 * One label position per shape: the centroid of its largest ring, or, when that lies outside the ring (a crescent
 * such as a river-side Stadtteil), the middle of the ring's widest horizontal chord at the centroid's latitude.
 * Labelling the polygon itself would repeat the name in every tile it crosses.
 */
export function labelPoint(geometry: GeoJSON.Geometry): [number, number] | undefined {
    const rings = polygonRings(geometry);
    if (rings.length === 0) return geometry.type === "Point" ? geometry.coordinates as [number, number] : undefined;
    const ring = rings.reduce((largest, candidate) => (Math.abs(ringArea(candidate)) > Math.abs(ringArea(largest)) ? candidate : largest));
    const area = ringArea(ring);
    if (area === 0) return ring[0];
    let cx = 0;
    let cy = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
        cx += (ring[j][0] + ring[i][0]) * cross;
        cy += (ring[j][1] + ring[i][1]) * cross;
    }
    const centroid: [number, number] = [cx / (6 * area), cy / (6 * area)];
    if (inRing(centroid, ring)) return centroid;
    const crossings: number[] = [];
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if ((yi > centroid[1]) !== (yj > centroid[1])) crossings.push(((xj - xi) * (centroid[1] - yi)) / (yj - yi) + xi);
    }
    crossings.sort((a, b) => a - b);
    let best: [number, number] | undefined;
    for (let i = 0; i + 1 < crossings.length; i += 2) {
        if (best === undefined || crossings[i + 1] - crossings[i] > best[1] - best[0]) best = [crossings[i], crossings[i + 1]];
    }
    return best === undefined ? ring[0] : [(best[0] + best[1]) / 2, centroid[1]];
}

const toneColor = (): unknown[] => ["match", ["get", "tone"], "a", AREA_COLORS.a, "b", AREA_COLORS.b, INK];

export class FifteenMinuteOverlays {
    private disposed = false;

    constructor(private readonly map: MapLibreMap) {}

    private source(id: string): GeoJSONSource | undefined {
        return this.map.getSource(id) as GeoJSONSource | undefined;
    }

    private ensureSource(id: string): void {
        if (this.map.getSource(id) === undefined) this.map.addSource(id, { type: "geojson", data: EMPTY } as never);
    }

    private addLayerOnce(layer: Record<string, unknown> & { id: string }): void {
        if (this.map.getLayer(layer.id) === undefined) this.map.addLayer(layer as never);
    }

    setSelectedBuilding(selection: { geometry: GeoJSON.Geometry; height: number } | undefined): void {
        if (this.disposed) return;
        this.ensureSource(SOURCES.selection);
        this.addLayerOnce({
            id: OVERLAY_LAYER_IDS.selectionFill,
            type: "fill-extrusion",
            source: SOURCES.selection,
            paint: {
                "fill-extrusion-color": SELECTION_COLOR,
                "fill-extrusion-height": selectionExtrusionHeightExpression(),
                "fill-extrusion-base": 0,
                "fill-extrusion-opacity": 0.4,
            },
        });
        this.addLayerOnce({
            id: OVERLAY_LAYER_IDS.selectionHalo,
            type: "line",
            source: SOURCES.selection,
            paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.9 },
        });
        this.addLayerOnce({
            id: OVERLAY_LAYER_IDS.selectionLine,
            type: "line",
            source: SOURCES.selection,
            paint: { "line-color": SELECTION_COLOR, "line-width": 3 },
        });
        // A ring at the building's centre keeps it findable at the neighbourhood scale, where a footprint is a few pixels wide.
        this.addLayerOnce({
            id: OVERLAY_LAYER_IDS.selectionRing,
            type: "circle",
            source: SOURCES.selection,
            filter: ["==", ["geometry-type"], "Point"],
            paint: {
                "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 9, 15, 18, 17, 28],
                "circle-color": SELECTION_COLOR,
                "circle-opacity": ["interpolate", ["linear"], ["zoom"], 15.5, 0.12, 17.5, 0],
                "circle-stroke-color": SELECTION_COLOR,
                "circle-stroke-width": 3,
                "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 16.5, 0.95, 18, 0.35],
            },
        });
        const centre = selection === undefined ? undefined : labelPoint(selection.geometry);
        this.source(SOURCES.selection)?.setData(selection === undefined
            ? EMPTY
            : {
                type: "FeatureCollection",
                features: [
                    { type: "Feature", geometry: selection.geometry, properties: { height: selection.height } },
                    ...(centre === undefined ? [] : [{ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: centre }, properties: {} }]),
                ],
            });
    }

    setAreaOutlines(outlines: readonly AreaOutline[]): void {
        if (this.disposed) return;
        this.ensureSource(SOURCES.areas);
        this.addLayerOnce({
            id: OVERLAY_LAYER_IDS.areaLine,
            type: "line",
            source: SOURCES.areas,
            filter: ["!=", ["geometry-type"], "Point"],
            paint: { "line-color": toneColor(), "line-width": 3, "line-opacity": 0.9 },
        });
        this.addLayerOnce({
            id: OVERLAY_LAYER_IDS.areaLabel,
            type: "symbol",
            source: SOURCES.areas,
            filter: ["==", ["geometry-type"], "Point"],
            layout: {
                "text-field": ["get", "name"],
                "text-font": FONT,
                "text-size": 14,
                "text-allow-overlap": true,
                "text-anchor": "center",
            },
            paint: { "text-color": toneColor(), "text-halo-color": "#ffffff", "text-halo-width": 2 },
        });
        this.source(SOURCES.areas)?.setData({
            type: "FeatureCollection",
            features: outlines.flatMap((outline) => {
                const properties = { tone: outline.tone, name: outline.name };
                const centre = labelPoint(outline.geometry);
                return [
                    { type: "Feature" as const, geometry: outline.geometry, properties },
                    ...(centre === undefined ? [] : [{ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: centre }, properties }]),
                ];
            }),
        });
    }

    /** Layers added to the map later (catalog layers) land on top of ours; this puts every overlay back above them. */
    raise(): void {
        for (const id of [OVERLAY_LAYER_IDS.areaLine, OVERLAY_LAYER_IDS.areaLabel, OVERLAY_LAYER_IDS.selectionFill, OVERLAY_LAYER_IDS.selectionHalo, OVERLAY_LAYER_IDS.selectionLine, OVERLAY_LAYER_IDS.selectionRing]) {
            if (this.map.getLayer(id) !== undefined) this.map.moveLayer(id);
        }
    }

    /** Removes every overlay layer and source this object added. */
    dispose(): void {
        this.disposed = true;
        for (const id of Object.values(OVERLAY_LAYER_IDS)) if (this.map.getLayer(id) !== undefined) this.map.removeLayer(id);
        for (const id of Object.values(SOURCES)) if (this.map.getSource(id) !== undefined) this.map.removeSource(id);
    }
}

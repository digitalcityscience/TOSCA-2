import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import {
    CATCHMENT_MIN_ZOOM,
    FAMILY_COLORS,
    INK,
    SELECTION_COLOR,
    selectionExtrusionHeightExpression,
    STOP_CLUSTER_MAX_ZOOM,
} from "../../config/urbanStories/styles/transitEquity";
import {
    cellsForBounds,
    fetchCatchmentCell,
    fetchStopAreas,
    tooManyCells,
    type CatchmentFeature,
} from "./hvvOfficialData";
import { reportDeveloperError } from "./userFacingError";

/**
 * Overlays of the Public Transport Equity story that are not catalog layers: official HVV stop areas and
 * catchments, the selected building and highlighted Stadtteil outlines. They live in their own `eq-*` GeoJSON
 * sources on the existing map, are added on demand and removed completely by `dispose()`.
 *
 * @remarks
 * Zoom-adaptive: stop areas are clusters (sized by summed departures) up to `STOP_CLUSTER_MAX_ZOOM` and single
 * points above it; catchment polygons are fetched by viewport cell from `CATCHMENT_MIN_ZOOM` on, because the
 * official service delivers whole, unsimplified polygons. Below that zoom the coverage is shown by the building
 * footprints and the Stadtteil shares instead.
 */

const SOURCES = {
    stops: "eq-stops",
    catchments: "eq-catchments",
    selection: "eq-selection",
    areas: "eq-areas",
} as const;

export const OVERLAY_LAYER_IDS = {
    stopCluster: "eq-stops-cluster",
    stopClusterCount: "eq-stops-cluster-count",
    stopPoint: "eq-stops-point",
    stopLines: "eq-stops-lines",
    catchmentFill: "eq-catchments-fill",
    catchmentLine: "eq-catchments-line",
    selectionFill: "eq-selection-fill",
    selectionHalo: "eq-selection-halo",
    selectionLine: "eq-selection-line",
    areaLine: "eq-areas-line",
} as const;

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const FONT = ["Open Sans Regular"];

function familyColor(): unknown[] {
    return ["match", ["get", "family"], "rail", FAMILY_COLORS.rail, "ferry", FAMILY_COLORS.ferry, FAMILY_COLORS.bus];
}

/** Circle radius (px) from official daily departures: area ∝ departures, capped so hubs do not hide the map. */
function pointRadius(): unknown[] {
    const sqrt = ["sqrt", ["get", "abfahrten"]];
    return [
        "interpolate", ["linear"], ["zoom"],
        11, ["min", 8, ["+", 2, ["*", sqrt, 0.18]]],
        16, ["min", 26, ["+", 4, ["*", sqrt, 0.7]]],
    ];
}

export interface AreaOutline {
    geometry: GeoJSON.Geometry;
    tone: "focus" | "context";
}

export class TransitEquityOverlays {
    private stopsOn = false;
    private catchmentsOn = false;
    private disposed = false;
    private readonly onMoveEnd = (): void => { void this.loadCatchments(); };
    private readonly shownCatchments = new Map<string, CatchmentFeature>();

    constructor(private readonly map: MapLibreMap) {}

    private source(id: string): GeoJSONSource | undefined {
        return this.map.getSource(id) as GeoJSONSource | undefined;
    }

    private ensureSource(id: string, options: Record<string, unknown> = {}): void {
        if (this.map.getSource(id) === undefined) this.map.addSource(id, { type: "geojson", data: EMPTY, ...options } as never);
    }

    // --- stop areas -----------------------------------------------------------------------------

    async setStops(on: boolean): Promise<void> {
        this.stopsOn = on;
        if (!on) {
            this.removeLayers([OVERLAY_LAYER_IDS.stopLines, OVERLAY_LAYER_IDS.stopPoint, OVERLAY_LAYER_IDS.stopClusterCount, OVERLAY_LAYER_IDS.stopCluster]);
            this.removeSource(SOURCES.stops);
            return;
        }
        const features = await fetchStopAreas();
        if (this.disposed || !this.stopsOn) return;
        if (this.map.getSource(SOURCES.stops) === undefined) {
            this.map.addSource(SOURCES.stops, {
                type: "geojson",
                data: { type: "FeatureCollection", features },
                cluster: true,
                clusterMaxZoom: STOP_CLUSTER_MAX_ZOOM,
                clusterRadius: 48,
                clusterProperties: { dep: ["+", ["get", "abfahrten"]] },
            } as never);
        }
        this.addLayerOnce({
            id: OVERLAY_LAYER_IDS.stopCluster,
            type: "circle",
            source: SOURCES.stops,
            filter: ["has", "point_count"],
            paint: {
                "circle-color": "#4b5563",
                "circle-opacity": 0.78,
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": 1,
                "circle-radius": ["interpolate", ["linear"], ["sqrt", ["get", "dep"]], 20, 9, 100, 17, 300, 30],
            },
        });
        this.addLayerOnce({
            id: OVERLAY_LAYER_IDS.stopClusterCount,
            type: "symbol",
            source: SOURCES.stops,
            filter: ["has", "point_count"],
            layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": FONT, "text-size": 11 },
            paint: { "text-color": "#ffffff" },
        });
        this.addLayerOnce({
            id: OVERLAY_LAYER_IDS.stopPoint,
            type: "circle",
            source: SOURCES.stops,
            filter: ["!", ["has", "point_count"]],
            paint: {
                "circle-color": familyColor(),
                "circle-opacity": 0.9,
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": 1,
                "circle-radius": pointRadius(),
            },
        });
        this.addLayerOnce({
            id: OVERLAY_LAYER_IDS.stopLines,
            type: "symbol",
            source: SOURCES.stops,
            minzoom: 14.5,
            filter: ["!", ["has", "point_count"]],
            layout: { "text-field": ["to-string", ["get", "linienzahl"]], "text-font": FONT, "text-size": 11, "text-allow-overlap": true },
            paint: { "text-color": "#ffffff" },
        });
    }

    // --- catchments -----------------------------------------------------------------------------

    async setCatchments(on: boolean): Promise<void> {
        this.catchmentsOn = on;
        this.map.off("moveend", this.onMoveEnd);
        if (!on) {
            this.removeLayers([OVERLAY_LAYER_IDS.catchmentLine, OVERLAY_LAYER_IDS.catchmentFill]);
            this.removeSource(SOURCES.catchments);
            this.shownCatchments.clear();
            return;
        }
        this.ensureSource(SOURCES.catchments);
        this.addLayerOnce({
            id: OVERLAY_LAYER_IDS.catchmentFill,
            type: "fill",
            source: SOURCES.catchments,
            minzoom: CATCHMENT_MIN_ZOOM,
            paint: { "fill-color": familyColor(), "fill-opacity": 0.035 },
        });
        this.addLayerOnce({
            id: OVERLAY_LAYER_IDS.catchmentLine,
            type: "line",
            source: SOURCES.catchments,
            minzoom: CATCHMENT_MIN_ZOOM,
            paint: {
                "line-color": familyColor(),
                "line-opacity": 0.85,
                "line-width": ["interpolate", ["linear"], ["zoom"], CATCHMENT_MIN_ZOOM, 0.8, 18, 2],
            },
        });
        this.map.on("moveend", this.onMoveEnd);
        await this.loadCatchments();
    }

    /** Fetches the viewport cells that are not loaded yet and refreshes the source. Skips when zoomed out. */
    private async loadCatchments(): Promise<void> {
        if (!this.catchmentsOn || this.disposed || this.map.getZoom() < CATCHMENT_MIN_ZOOM) return;
        const { west, south, east, north } = this.visibleBounds();
        const cells = cellsForBounds(west, south, east, north);
        if (tooManyCells(cells)) return;
        try {
            const loaded = await Promise.all(cells.map((cell) => fetchCatchmentCell(cell)));
            if (!this.catchmentsOn || this.disposed) return;
            let added = false;
            for (const feature of loaded.flat()) {
                if (!this.shownCatchments.has(feature.properties.fid)) {
                    this.shownCatchments.set(feature.properties.fid, feature);
                    added = true;
                }
            }
            if (added) this.source(SOURCES.catchments)?.setData({ type: "FeatureCollection", features: [...this.shownCatchments.values()] });
        } catch (error) {
            reportDeveloperError("Loading the official HVV catchments", error);
        }
    }

    /**
     * Bounds of the part of the map the reader sees: the padded canvas, without the far strip of a tilted view
     * (the top 30 %), which would pull in cells nobody can make out.
     */
    private visibleBounds(): { west: number, south: number, east: number, north: number } {
        const canvas = this.map.getContainer();
        const padding = this.map.getPadding();
        const [left, right, top, bottom] = [
            padding.left ?? 0, canvas.clientWidth - (padding.right ?? 0), canvas.clientHeight * 0.3 + (padding.top ?? 0), canvas.clientHeight - (padding.bottom ?? 0),
        ];
        const corners = [[left, top], [right, top], [left, bottom], [right, bottom]].map(([x, y]) => this.map.unproject([x, y]));
        return {
            west: Math.min(...corners.map((corner) => corner.lng)),
            east: Math.max(...corners.map((corner) => corner.lng)),
            south: Math.min(...corners.map((corner) => corner.lat)),
            north: Math.max(...corners.map((corner) => corner.lat)),
        };
    }

    // --- selection and area outlines ------------------------------------------------------------

    setSelectedBuilding(selection: { geometry: GeoJSON.Geometry; height: number } | undefined): void {
        this.ensureSource(SOURCES.selection);
        this.addLayerOnce({
            id: OVERLAY_LAYER_IDS.selectionFill,
            type: "fill-extrusion",
            source: SOURCES.selection,
            paint: {
                "fill-extrusion-color": SELECTION_COLOR,
                "fill-extrusion-height": selectionExtrusionHeightExpression(),
                "fill-extrusion-base": 0,
                "fill-extrusion-opacity": 0.85,
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
        this.source(SOURCES.selection)?.setData(selection === undefined
            ? EMPTY
            : { type: "FeatureCollection", features: [{ type: "Feature", geometry: selection.geometry, properties: { height: selection.height } }] });
    }

    setAreaOutlines(outlines: readonly AreaOutline[]): void {
        this.ensureSource(SOURCES.areas);
        this.addLayerOnce({
            id: OVERLAY_LAYER_IDS.areaLine,
            type: "line",
            source: SOURCES.areas,
            paint: {
                "line-color": ["match", ["get", "tone"], "focus", INK, "#6b7280"],
                "line-width": ["match", ["get", "tone"], "focus", 3, 2],
            },
        });
        this.source(SOURCES.areas)?.setData({
            type: "FeatureCollection",
            features: outlines.map((outline) => ({ type: "Feature", geometry: outline.geometry, properties: { tone: outline.tone } })),
        });
    }

    // --- plumbing -------------------------------------------------------------------------------

    private addLayerOnce(layer: Record<string, unknown> & { id: string }): void {
        if (this.map.getLayer(layer.id) === undefined) this.map.addLayer(layer as never);
    }

    private removeLayers(ids: string[]): void {
        for (const id of ids) if (this.map.getLayer(id) !== undefined) this.map.removeLayer(id);
    }

    private removeSource(id: string): void {
        if (this.map.getSource(id) !== undefined) this.map.removeSource(id);
    }

    /** Layers added to the map later (catalog layers) land on top of ours; this puts every overlay back above them. */
    raise(underBuildings?: string): void {
        // The catchment tint sits under the footprints so it never changes a building's thematic colour.
        if (this.map.getLayer(OVERLAY_LAYER_IDS.catchmentFill) !== undefined) {
            this.map.moveLayer(OVERLAY_LAYER_IDS.catchmentFill, underBuildings !== undefined && this.map.getLayer(underBuildings) !== undefined ? underBuildings : undefined);
        }
        const order = [
            OVERLAY_LAYER_IDS.catchmentLine, OVERLAY_LAYER_IDS.areaLine,
            OVERLAY_LAYER_IDS.selectionFill, OVERLAY_LAYER_IDS.selectionHalo, OVERLAY_LAYER_IDS.selectionLine,
            OVERLAY_LAYER_IDS.stopCluster, OVERLAY_LAYER_IDS.stopClusterCount, OVERLAY_LAYER_IDS.stopPoint, OVERLAY_LAYER_IDS.stopLines,
        ];
        for (const id of order) if (this.map.getLayer(id) !== undefined) this.map.moveLayer(id);
    }

    /** Removes every overlay layer, source and listener this object added. */
    dispose(): void {
        this.disposed = true;
        this.map.off("moveend", this.onMoveEnd);
        this.removeLayers(Object.values(OVERLAY_LAYER_IDS));
        for (const id of Object.values(SOURCES)) this.removeSource(id);
        this.shownCatchments.clear();
    }
}

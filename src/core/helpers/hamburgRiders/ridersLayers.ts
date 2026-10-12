/**
 * MapLibre source and layer specifications of HamburgRiders. Paint values are those of the original
 * `MapManager`; ids are namespaced so they can never collide with TOSCA layers.
 */
import type { CircleLayerSpecification, HeatmapLayerSpecification } from "maplibre-gl";
import { MODE_STYLE, RIDERS_MODES, RIDERS_NS, type RidersMode } from "./ridersConfig";

export const STOPS_SOURCE_ID = `${RIDERS_NS}:stops-src`;
export const VEHICLES_SOURCE_ID = `${RIDERS_NS}:vehicles-src`;
export const STOPS_LAYER_ID = `${RIDERS_NS}:stops`;
export const VEHICLES_LAYER_ID = `${RIDERS_NS}:vehicles`;

export function networkLayerId(mode: RidersMode): string {
    return `${RIDERS_NS}:network:${mode}`;
}

/** Every layer HamburgRiders adds, in drawing order (bottom to top). */
export const RIDERS_LAYER_IDS: readonly string[] = [
    ...RIDERS_MODES.map(networkLayerId),
    STOPS_LAYER_ID,
    VEHICLES_LAYER_ID,
];

export function isRidersLayerId(id: string): boolean {
    return RIDERS_LAYER_IDS.includes(id);
}

/** English display names; the listing items of the TOSCA layer panel show these. */
export const RIDERS_LAYER_TITLES: Record<string, string> = {
    [networkLayerId("s-bahn")]: "HamburgRiders · S-Bahn network",
    [networkLayerId("u-bahn")]: "HamburgRiders · U-Bahn network",
    [networkLayerId("bus")]: "HamburgRiders · Bus network",
    [networkLayerId("regional")]: "HamburgRiders · Regional network",
    [STOPS_LAYER_ID]: "HamburgRiders · GTFS stops",
    [VEHICLES_LAYER_ID]: "HamburgRiders · Vehicles (timeline)",
};

function isBusStop(): unknown[] {
    return ["==", ["get", "mode"], "bus"];
}

export function networkLayerSpec(mode: RidersMode): HeatmapLayerSpecification {
    const [r, g, b] = MODE_STYLE[mode].rgb;
    const rgba = (alpha: number): string => `rgba(${r},${g},${b},${alpha})`;
    return {
        id: networkLayerId(mode),
        type: "heatmap",
        source: STOPS_SOURCE_ID,
        maxzoom: 15,
        filter: ["==", ["get", "mode"], mode],
        paint: {
            "heatmap-weight": ["interpolate", ["linear"], ["zoom"], 0, 0.3, 7, 1.0, 10, 1.3, 12, 0.4, 14, 0.08, 15, 0],
            "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 0.5, 10, 1.0, 12, 0.4, 14, 0.1, 15, 0],
            "heatmap-color": [
                "interpolate", ["linear"], ["heatmap-density"],
                0, rgba(0), 0.1, rgba(0.08), 0.3, rgba(0.15), 0.5, rgba(0.22), 0.7, rgba(0.28), 1, rgba(0.38),
            ],
            "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 10, 5, 18, 10, 30, 13, 0],
            "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.7, 7, 0.55, 10, 0.30, 12, 0.10, 14, 0.01, 15, 0],
        },
    } as unknown as HeatmapLayerSpecification;
}

export function stopsLayerSpec(): CircleLayerSpecification {
    const perMode = (pick: (mode: RidersMode) => unknown): unknown[] => [
        "match", ["get", "mode"],
        ...RIDERS_MODES.flatMap((mode) => [mode, pick(mode)]),
        pick("bus"),
    ];
    const sized = (bus: number, other: number): unknown[] => ["case", isBusStop(), bus, other];
    return {
        id: STOPS_LAYER_ID,
        type: "circle",
        source: STOPS_SOURCE_ID,
        minzoom: 10,
        paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, sized(0.5, 1.5), 14, sized(1.5, 3), 16, sized(3, 6)],
            "circle-color": perMode((mode) => MODE_STYLE[mode].hex),
            "circle-opacity": ["interpolate", ["linear"], ["zoom"], 10, 0.08, 12, 0.18, 14, 0.55, 16, 0.75],
            "circle-stroke-width": sized(0.2, 0.8),
            "circle-stroke-color": "#fff",
        },
    } as unknown as CircleLayerSpecification;
}

/**
 * Original vehicles are deck.gl circles of 8 m (4 m for buses), at least 3 px, with a white 1 px outline.
 * Metres are converted to pixels with the Web-Mercator scale at Hamburg's latitude.
 */
export function vehiclesLayerSpec(): CircleLayerSpecification {
    const metresToPixels = (metres: number, zoom: number): number => Math.max(3, metres / (156543.03 * Math.cos((53.55 * Math.PI) / 180) / 2 ** zoom));
    const radiusAt = (zoom: number): unknown[] => ["case", ["==", ["get", "b"], 1], metresToPixels(4, zoom), metresToPixels(8, zoom)];
    return {
        id: VEHICLES_LAYER_ID,
        type: "circle",
        source: VEHICLES_SOURCE_ID,
        paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, 3, 15, 3, 16, radiusAt(16), 17, radiusAt(17), 18, radiusAt(18), 19, radiusAt(19), 20, radiusAt(20)],
            "circle-color": ["get", "c"],
            "circle-opacity": 1,
            "circle-stroke-width": 1,
            "circle-stroke-color": "rgba(255,255,255,0.86)",
        },
    } as unknown as CircleLayerSpecification;
}

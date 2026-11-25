import { CompositeLayer, type DefaultProps, type Layer } from "@deck.gl/core";
import { TripsLayer } from "@deck.gl/geo-layers";
import { BitmapLayer, GeoJsonLayer, IconLayer, LineLayer, PathLayer, TextLayer } from "@deck.gl/layers";

/**
 * One Sionna RT result or input on the map, in 3D: positions are [lon, lat, metres
 * above ground], the scene's own z. Each content is its own entry in the layer list.
 */
export type SionnaContent = "area" | "buildings" | "transmitters" | "receivers" | "paths" | "radioMap";
export type Rgba = [number, number, number, number];
type Feature = GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>>;

export interface SionnaLayerProps {
    content: SionnaContent;
    /** Buildings, devices or (classified, see `classifyPaths`) paths. */
    features: Feature[];
    /** The device drawn larger, by name. */
    selected: string | null;
    /** Radio map: a north-up PNG, its corners (top left, clockwise) and its height above ground. */
    image: string | null;
    corners: number[][] | null;
    height: number;
    /** Paths: nanoseconds since a pulse left the transmitters, or null for no signal flow. */
    time: number | null;
    /** Paths: nanoseconds of fading trail behind each pulse. */
    trail: number;
}

const defaultProps: DefaultProps<SionnaLayerProps> = {
    content: { type: "object", value: "buildings" },
    features: { type: "array", value: [], compare: true },
    selected: { type: "object", value: null },
    image: { type: "object", value: null },
    corners: { type: "array", value: null, compare: true },
    height: { type: "number", value: 0 },
    time: { type: "object", value: null },
    trail: { type: "number", value: 0 },
};

export const DEVICE_COLORS = { transmitters: "#dc2626", receivers: "#2563eb" } as const;

/** Lucide "radio-tower" and "smartphone", as used by the panel buttons. */
const GLYPHS = {
    transmitters: "<path d=\"M4.9 16.1C1 12.2 1 5.8 4.9 1.9m2.9 2.8a6.14 6.14 0 0 0-.8 7.5\"/><circle cx=\"12\" cy=\"9\" r=\"2\"/><path d=\"M16.2 4.8c2 2 2.26 5.11.8 7.47M19.1 1.9a9.96 9.96 0 0 1 0 14.1m-9.6 2h5M8 22l4-11l4 11\"/>",
    receivers: "<rect width=\"14\" height=\"20\" x=\"5\" y=\"2\" rx=\"2\" ry=\"2\"/><path d=\"M12 18h.01\"/>",
} as const;

/** A round badge with the device glyph, as an SVG data URL. */
export function deviceIcon(kind: "transmitters" | "receivers"): string {
    const svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"64\" height=\"64\" viewBox=\"0 0 24 24\">"
        + `<circle cx="12" cy="12" r="11" fill="${DEVICE_COLORS[kind]}" stroke="white" stroke-width="1.5"/>`
        + `<g transform="translate(5.5 5.5) scale(0.54)" fill="none" stroke="white" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[kind]}</g></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Path classes: 10 dB steps below the strongest path, coloured with matplotlib's
 * "plasma" (perceptually uniform, readable with colour vision deficiency). Bright
 * and thick is strong; dark, thin and translucent is weak.
 */
export const PATH_CLASSES: Array<{ below: number; color: Rgba; width: number }> = [
    { below: 10, color: [252, 206, 37, 255], width: 4.5 },
    { below: 20, color: [248, 149, 64, 245], width: 3.5 },
    { below: 30, color: [219, 92, 104, 230], width: 2.5 },
    { below: 40, color: [184, 50, 137, 210], width: 2 },
    { below: 50, color: [126, 3, 168, 180], width: 1.5 },
    { below: Infinity, color: [65, 4, 157, 150], width: 1 },
];

export interface PathClassSummary {
    color: Rgba;
    /** dB range of the class; `min` is null for the open-ended weakest class. */
    max: number;
    min: number | null;
    count: number;
}

/** Adds a `class` (index into PATH_CLASSES) to each path; weakest drawn first. */
export function classifyPaths(features: Feature[]): { features: Feature[]; classes: PathClassSummary[] } {
    const strongest = Math.max(...features.map((feature) => Number(feature.properties.gain_db)));
    const classes: PathClassSummary[] = PATH_CLASSES.map((entry, index) => ({
        color: entry.color,
        max: strongest - (index === 0 ? 0 : PATH_CLASSES[index - 1].below),
        min: Number.isFinite(entry.below) ? strongest - entry.below : null,
        count: 0,
    }));
    const classified = features.map((feature) => {
        const below = strongest - Number(feature.properties.gain_db);
        const index = PATH_CLASSES.findIndex((entry) => below < entry.below);
        classes[index].count += 1;
        return { ...feature, properties: { ...feature.properties, class: index } };
    });
    classified.sort((a, b) => Number(b.properties.class) - Number(a.properties.class));
    return { features: classified, classes };
}

const METRES_PER_DEGREE = 111_320;
/** Metres per nanosecond. */
const SPEED_OF_LIGHT = 0.299792458;

/** When a pulse that leaves the first vertex at 0 passes each vertex of a [lon, lat, z] path, in ns. */
export function pathTimes(coordinates: number[][]): number[] {
    let total = 0;
    return coordinates.map((point, index) => {
        if (index > 0) {
            const previous = coordinates[index - 1];
            // shortcut: flat-earth metres per degree, fine for a few km; use a projection for larger scenes.
            const dx = (point[0] - previous[0]) * METRES_PER_DEGREE * Math.cos((point[1] * Math.PI) / 180);
            const dy = (point[1] - previous[1]) * METRES_PER_DEGREE;
            total += Math.hypot(dx, dy, (point[2] ?? 0) - (previous[2] ?? 0)) / SPEED_OF_LIGHT;
        }
        return total;
    });
}

function position(feature: Feature): number[] {
    return (feature.geometry as GeoJSON.Point).coordinates;
}

export class SionnaLayer extends CompositeLayer<SionnaLayerProps> {
    static layerName = "SionnaLayer";
    static defaultProps = defaultProps;

    renderLayers(): Layer[] {
        const { content, features, selected, image, corners, height, time, trail } = this.props;
        if (content === "radioMap") {
            if (image === null || corners === null) return [];
            const [topLeft, topRight, bottomRight, bottomLeft] = corners.map(([lon, lat]) => [lon, lat, height]);
            return [new BitmapLayer(this.getSubLayerProps({
                id: "image",
                image,
                bounds: [bottomLeft, topLeft, topRight, bottomRight],
                // One radio map cell stays one sharp square.
                textureParameters: { minFilter: "nearest", magFilter: "nearest" },
                // A pixel has no attributes to show; the legend explains the colours.
                pickable: false,
            }))];
        }
        if (features.length === 0) return [];
        if (content === "area") {
            // The outline only, drawn over the buildings: it marks where the radio map goes.
            return [new GeoJsonLayer(this.getSubLayerProps({
                id: "area",
                data: features,
                filled: false,
                getLineColor: [37, 99, 235, 255],
                getLineWidth: 3,
                lineWidthUnits: "pixels",
                parameters: { depthCompare: "always" as const },
                pickable: false,
            }))];
        }
        if (content === "buildings") {
            return [new GeoJsonLayer(this.getSubLayerProps({
                id: "buildings",
                data: features,
                extruded: true,
                getElevation: (feature: Feature) => Number(feature.properties.height),
                getFillColor: [203, 213, 225, 255],
                material: { ambient: 0.45, diffuse: 0.6, shininess: 16 },
                pickable: true,
            }))];
        }
        if (content === "paths") {
            const flowing = time !== null;
            const coordinates = (feature: Feature): number[][] => (feature.geometry as GeoJSON.LineString).coordinates;
            const style = (feature: Feature): (typeof PATH_CLASSES)[number] => PATH_CLASSES[Number(feature.properties.class)];
            const layers: Layer[] = [new PathLayer(this.getSubLayerProps({
                id: "paths",
                data: features,
                getPath: coordinates,
                // While pulses flow, the paths are their faint tracks.
                getColor: (feature: Feature) => {
                    const color = style(feature).color;
                    return flowing ? [color[0], color[1], color[2], color[3] * 0.35] : color;
                },
                updateTriggers: { getColor: flowing },
                getWidth: (feature: Feature) => style(feature).width,
                widthUnits: "pixels",
                jointRounded: true,
                capRounded: true,
                pickable: true,
            }))];
            if (flowing) {
                // One pulse per path, timed by its length: it reaches the receiver after the path's delay.
                layers.push(new TripsLayer(this.getSubLayerProps({
                    id: "flow",
                    data: features,
                    getPath: coordinates,
                    getTimestamps: (feature: Feature) => pathTimes(coordinates(feature)),
                    getColor: (feature: Feature) => [...style(feature).color.slice(0, 3), 255],
                    getWidth: (feature: Feature) => style(feature).width + 2,
                    widthUnits: "pixels",
                    currentTime: time,
                    trailLength: trail,
                    fadeTrail: true,
                    jointRounded: true,
                    capRounded: true,
                })));
            }
            return layers;
        }
        const points = features.filter((feature) => feature.geometry.type === "Point");
        const routes = features.filter((feature) => feature.geometry.type === "LineString");
        const color = [...hexRgb(DEVICE_COLORS[content]), 255] as Rgba;
        const icon = { url: deviceIcon(content), width: 64, height: 64 };
        // Icons and labels stay visible behind buildings: they mark where a device is.
        const onTop = { depthCompare: "always" as const };
        return [
            // A receiver's route, at receiver height.
            new PathLayer(this.getSubLayerProps({
                id: "routes",
                data: routes,
                getPath: (feature: Feature) => (feature.geometry as GeoJSON.LineString).coordinates,
                getColor: [color[0], color[1], color[2], 170],
                getWidth: 3,
                widthUnits: "pixels",
                jointRounded: true,
                capRounded: true,
                pickable: true,
            })),
            // A stem down to the ground shows the height.
            new LineLayer(this.getSubLayerProps({
                id: "stems",
                data: points,
                getSourcePosition: (feature: Feature) => [position(feature)[0], position(feature)[1], 0],
                getTargetPosition: position,
                getColor: color,
                getWidth: 2,
                widthUnits: "pixels",
            })),
            new IconLayer(this.getSubLayerProps({
                id: "icons",
                data: points,
                getPosition: position,
                getIcon: () => icon,
                getSize: (feature: Feature) => (feature.properties.name === selected ? 44 : 32),
                sizeUnits: "pixels",
                updateTriggers: { getSize: selected },
                parameters: onTop,
                pickable: true,
            })),
            new TextLayer(this.getSubLayerProps({
                id: "labels",
                data: points,
                getPosition: position,
                getText: (feature: Feature) => String(feature.properties.name),
                getPixelOffset: (feature: Feature) => [0, feature.properties.name === selected ? -32 : -26],
                updateTriggers: { getPixelOffset: selected },
                getSize: 12,
                fontWeight: 600,
                getColor: [15, 23, 42, 255],
                background: true,
                getBackgroundColor: [255, 255, 255, 230],
                backgroundPadding: [4, 1],
                parameters: onTop,
            })),
        ];
    }
}

function hexRgb(hex: string): [number, number, number] {
    const value = Number.parseInt(hex.slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

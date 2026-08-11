export type MapStyleLegendKind =
    | "circle"
    | "fill"
    | "heatmap"
    | "line"
    | "symbol";

export interface MapStyleLegendEntry {
    id: string;
    label: string;
    kind: MapStyleLegendKind;
    colors: string[];
    opacity: number;
    size?: number;
    memberLabel?: string;
    sprite?: {
        name: string;
        url: string;
        tint?: string;
    };
}

interface MapStyleLegendLayer {
    id?: unknown;
    type?: unknown;
    paint?: unknown;
    layout?: unknown;
    metadata?: unknown;
}

/**
 * A catalog MBStyle color is safe to replace from a single color picker only
 * when the style has one render layer and one literal color declaration.
 * Expressions are deliberately rejected, even if they currently contain one
 * color literal, because they can derive their result from feature attributes.
 */
export function hasSingleEditableMapStyleColor(
    layers: readonly MapStyleLegendLayer[],
    editableColorProperty: string
): boolean {
    if (layers.length !== 1 || editableColorProperty === "") return false;

    const paint = isRecord(layers[0].paint) ? layers[0].paint : {};
    const colorEntries = Object.entries(paint).filter(([property]) =>
        property.endsWith("-color")
    );

    return colorEntries.length === 1 &&
        colorEntries[0][0] === editableColorProperty &&
        typeof colorEntries[0][1] === "string" &&
        isColorLiteral(colorEntries[0][1]);
}

export interface MapStyleLegendContext {
    members: ReadonlyArray<{ id: string; title: string }>;
    styles: Record<string, { sprite_id: string | null }>;
    sprites: Record<string, { url: string }>;
}

const colorProperties: Record<MapStyleLegendKind, string[]> = {
    circle: ["circle-color", "circle-stroke-color"],
    fill: ["fill-color", "fill-outline-color"],
    heatmap: ["heatmap-color"],
    line: ["line-color"],
    symbol: ["icon-color", "text-color", "icon-halo-color", "text-halo-color"],
};

const opacityProperties: Record<MapStyleLegendKind, string[]> = {
    circle: ["circle-opacity"],
    fill: ["fill-opacity"],
    heatmap: ["heatmap-opacity"],
    line: ["line-opacity"],
    symbol: ["icon-opacity", "text-opacity"],
};

const defaultColors: Record<MapStyleLegendKind, string[]> = {
    circle: ["#64748b"],
    fill: ["#94a3b8"],
    heatmap: ["#313695", "#74add1", "#ffffbf", "#f46d43", "#a50026"],
    line: ["#64748b"],
    symbol: ["#64748b"],
};

const supportedKinds = new Set<MapStyleLegendKind>([
    "circle",
    "fill",
    "heatmap",
    "line",
    "symbol",
]);

/** Convert all renderable layers in an MBStyle into compact legend entries. */
export function createMapStyleLegendEntries(
    layers: readonly MapStyleLegendLayer[],
    context?: MapStyleLegendContext
): MapStyleLegendEntry[] {
    return layers.flatMap((layer, index) => {
        if (typeof layer.type !== "string" || !supportedKinds.has(layer.type as MapStyleLegendKind)) {
            return [];
        }

        const kind = layer.type as MapStyleLegendKind;
        const paint = isRecord(layer.paint) ? layer.paint : {};
        const colors = uniqueColors(
            colorProperties[kind].flatMap((property) => collectColorLiterals(paint[property]))
        );
        const id = typeof layer.id === "string" && layer.id !== ""
            ? layer.id
            : `style-layer-${index + 1}`;

        const memberId = isRecord(layer.metadata) && typeof layer.metadata["tosca:member-id"] === "string"
            ? layer.metadata["tosca:member-id"]
            : undefined;
        const styleId = isRecord(layer.metadata) && typeof layer.metadata["tosca:style-id"] === "string"
            ? layer.metadata["tosca:style-id"]
            : undefined;
        const spriteId = styleId === undefined ? undefined : context?.styles[styleId]?.sprite_id;
        const spriteUrl = spriteId === null || spriteId === undefined
            ? undefined
            : context?.sprites[spriteId]?.url;
        const layout = isRecord(layer.layout) ? layer.layout : {};
        const spriteName = typeof layout["icon-image"] === "string"
            ? layout["icon-image"]
            : undefined;
        const memberLabel = memberId === undefined
            ? undefined
            : context?.members.find((member) => member.id === memberId)?.title;

        return [{
            id: memberId === undefined ? id : `${memberId}:${id}`,
            label: resolveLegendLabel(layer.metadata, id),
            kind,
            colors: colors.length > 0 ? colors : defaultColors[kind],
            opacity: resolveNumber(paint, opacityProperties[kind], 1),
            size: resolveLegendSize(kind, paint),
            memberLabel,
            ...(spriteUrl === undefined || spriteName === undefined
                ? {}
                : {
                    sprite: {
                        name: spriteName,
                        url: spriteUrl,
                        tint: colors[0],
                    },
                }),
        }];
    });
}

function resolveLegendLabel(metadata: unknown, id: string): string {
    if (isRecord(metadata)) {
        for (const key of ["tosca:legend-label", "legend-label", "title"]) {
            const value = metadata[key];
            if (typeof value === "string" && value.trim() !== "") return value.trim();
        }
    }
    return id.replaceAll(/[-_]+/g, " ");
}

function resolveLegendSize(kind: MapStyleLegendKind, paint: Record<string, unknown>): number | undefined {
    const property = kind === "circle" ? "circle-radius" : kind === "line" ? "line-width" : undefined;
    if (property === undefined || typeof paint[property] !== "number") return undefined;
    return Math.max(1, Math.min(12, paint[property]));
}

function resolveNumber(
    paint: Record<string, unknown>,
    properties: string[],
    fallback: number
): number {
    for (const property of properties) {
        const value = paint[property];
        if (typeof value === "number") return Math.max(0, Math.min(1, value));
    }
    return fallback;
}

function collectColorLiterals(value: unknown): string[] {
    const colors: string[] = [];
    const seen = new WeakSet<object>();

    function visit(candidate: unknown): void {
        if (colors.length >= 8) return;
        if (typeof candidate === "string") {
            if (isColorLiteral(candidate)) colors.push(candidate);
            return;
        }
        if (candidate === null || typeof candidate !== "object") return;
        if (seen.has(candidate)) return;
        seen.add(candidate);
        if (Array.isArray(candidate)) {
            candidate.forEach(visit);
        } else {
            Object.values(candidate).forEach(visit);
        }
    }

    visit(value);
    return colors;
}

function uniqueColors(colors: string[]): string[] {
    return [...new Set(colors)].slice(0, 6);
}

function isColorLiteral(value: string): boolean {
    return /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ||
        /^rgba?\([^)]+\)$/i.test(value) ||
        /^hsla?\([^)]+\)$/i.test(value) ||
        /^(?:black|blue|brown|cyan|gray|green|grey|lime|magenta|orange|purple|red|transparent|white|yellow)$/i.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

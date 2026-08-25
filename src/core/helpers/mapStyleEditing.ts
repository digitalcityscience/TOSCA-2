export type EditableMapStyleLayerType =
    | "circle"
    | "fill"
    | "fill-extrusion"
    | "line"
    | "symbol";

export type MapStyleFixedReason =
    | "group"
    | "multi-pass"
    | "unsupported-layer"
    | "no-colors";

export type MapStyleColorStatus = "editable" | "data-driven" | "unsupported-format";

export interface MapStyleColorControl {
    property: string;
    label: MapStyleColorLabel;
    value: unknown;
    pickerValue?: string;
    status: MapStyleColorStatus;
}

export type MapStyleColorLabel =
    | "fill"
    | "outline"
    | "line"
    | "circle"
    | "stroke"
    | "text"
    | "text-halo"
    | "icon"
    | "icon-halo"
    | "extrusion";

export type MapStyleEditingCapabilities =
    | { mode: "editable"; colors: MapStyleColorControl[] }
    | { mode: "fixed"; reason: MapStyleFixedReason; colors: MapStyleColorControl[] };

interface StyleLayerLike {
    type?: unknown;
    paint?: unknown;
}

interface ResolveMapStyleEditingOptions {
    logicalKind?: "layer" | "group";
    layerType: string;
    paint?: Record<string, unknown>;
    styleLayers?: readonly StyleLayerLike[];
}

const colorProperties: Partial<Record<EditableMapStyleLayerType, ReadonlyArray<{
    property: string;
    label: MapStyleColorLabel;
}>>> = {
    circle: [
        { property: "circle-color", label: "circle" },
        { property: "circle-stroke-color", label: "stroke" },
    ],
    fill: [
        { property: "fill-color", label: "fill" },
        { property: "fill-outline-color", label: "outline" },
    ],
    "fill-extrusion": [
        { property: "fill-extrusion-color", label: "extrusion" },
    ],
    line: [
        { property: "line-color", label: "line" },
    ],
    symbol: [
        { property: "text-color", label: "text" },
        { property: "text-halo-color", label: "text-halo" },
        { property: "icon-color", label: "icon" },
        { property: "icon-halo-color", label: "icon-halo" },
    ],
};

/**
 * Resolve the style controls from the authored style, rather than MapLibre's
 * implicit paint defaults. This keeps the contract predictable: groups and
 * multi-pass styles are fixed, while each declared color in a one-pass style
 * receives its own control.
 */
export function resolveMapStyleEditingCapabilities(
    options: ResolveMapStyleEditingOptions
): MapStyleEditingCapabilities {
    if (options.logicalKind === "group") {
        return { mode: "fixed", reason: "group", colors: [] };
    }

    if ((options.styleLayers?.length ?? 0) > 1) {
        return { mode: "fixed", reason: "multi-pass", colors: [] };
    }

    const styleLayer = options.styleLayers?.length === 1
        ? options.styleLayers[0]
        : undefined;
    const layerType = typeof styleLayer?.type === "string"
        ? styleLayer.type
        : options.layerType;
    const declarations = colorProperties[layerType as EditableMapStyleLayerType];
    if (declarations === undefined) {
        return { mode: "fixed", reason: "unsupported-layer", colors: [] };
    }

    const paint = isRecord(styleLayer?.paint) ? styleLayer.paint : options.paint ?? {};
    const colors = declarations.flatMap(({ property, label }) => {
        if (!(property in paint)) return [];
        const value = paint[property];
        const pickerValue = normalizeEditableHexColor(value);
        return [{
            property,
            label,
            value,
            ...(pickerValue === undefined ? {} : { pickerValue }),
            status: pickerValue !== undefined
                ? "editable" as const
                : Array.isArray(value) || isRecord(value)
                    ? "data-driven" as const
                    : "unsupported-format" as const,
        }];
    });

    if (colors.length === 0) {
        return { mode: "fixed", reason: "no-colors", colors: [] };
    }

    return { mode: "editable", colors };
}

export function normalizeEditableHexColor(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(value)) {
        return `#${[...value.slice(1)].map((character) => character.repeat(2)).join("")}`.toLowerCase();
    }
    return undefined;
}

export function isEditableMapStyleColorProperty(layerType: string, property: string): boolean {
    return colorProperties[layerType as EditableMapStyleLayerType]
        ?.some((candidate) => candidate.property === property) === true;
}

export function mapStyleColorProperties(layerType: string): string[] {
    return colorProperties[layerType as EditableMapStyleLayerType]
        ?.map(({ property }) => property) ?? [];
}

/** MapLibre does not render native fill outlines while terrain is enabled. */
export function isMapStyleColorControlAvailable(
    property: string,
    terrainEnabled: boolean
): boolean {
    return !(terrainEnabled && property === "fill-outline-color");
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

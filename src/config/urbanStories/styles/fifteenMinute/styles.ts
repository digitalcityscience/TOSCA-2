import type { CatalogGroupStyleLayer } from "@store/geoserver";
import type { MapLayerStyleOption } from "@store/map";
import type { Localized } from "../../types";
import {
    ADMIN_FIELDS,
    ADMIN_FILL_FULL_ZOOM,
    ADMIN_FILL_GONE_ZOOM,
    ADMIN_FILL_OPACITY,
    ALL_MEASURES,
    BUILDING_FADE_FULL_ZOOM,
    BUILDING_MIN_ZOOM,
    BUILDING_OPACITY,
    BUILDING_SOURCE_LAYER,
    ENTRY_BUILDINGS,
    ENTRY_STADTTEILE,
    FIELDS,
    INK,
    STADTTEILE_SOURCE_LAYER,
    styleNameOf,
    type MeasureId,
} from "./constants";
import { adminColor, buildingColor, buildingExtrusionHeightExpression, outlineColor } from "./expressions";
import { measureInfo } from "./measures";
import type { LocalStylingBundle } from "./types";

/**
 * Local style resolver of the 15-Minute City story.
 *
 * @remarks
 * One building layer carries every measure. Footprints appear at the neighbourhood scale and grow into their real
 * height at close zoom inside the same layer (a flat extrusion is a footprint), so 2D and 3D share one geometry, one
 * colour expression and one set of feature ids, and nothing is drawn twice during the transition. The measure is the
 * colour expression; switching it is a style swap through the existing `setStandaloneLayerStyle`, which keeps the
 * camera and the layer state. Stadtteile carry the city scale with the matching summary and fade out as the
 * footprints arrive; their outlines stay at every zoom.
 */

function option(
    name: string,
    title: Localized,
    layers: CatalogGroupStyleLayer[],
    attributes: MapLayerStyleOption["attributes"],
    isDefault: boolean
): MapLayerStyleOption {
    return { id: name, name, title: title.en, isDefault, layers, ...(attributes === undefined ? {} : { attributes }) };
}

function buildingLayers(idPrefix: string, color: unknown[]): CatalogGroupStyleLayer[] {
    const common = { "source-layer": BUILDING_SOURCE_LAYER, minzoom: BUILDING_MIN_ZOOM };
    return [
        {
            ...common,
            id: `${idPrefix}-fill`,
            type: "fill-extrusion",
            paint: {
                "fill-extrusion-color": color,
                "fill-extrusion-height": buildingExtrusionHeightExpression(),
                "fill-extrusion-base": 0,
                // The Stadtteil summary hands over to the footprints between these two zooms.
                "fill-extrusion-opacity": ["interpolate", ["linear"], ["zoom"], BUILDING_MIN_ZOOM, 0, BUILDING_FADE_FULL_ZOOM, BUILDING_OPACITY],
                "fill-extrusion-vertical-gradient": true,
            },
        },
        {
            ...common,
            id: `${idPrefix}-outline`,
            type: "line",
            paint: {
                "line-color": outlineColor(),
                // At the neighbourhood scale the footprints are a few pixels wide: no outline there, it would wash the colour out.
                "line-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0, 15, 0.55],
                "line-width": ["interpolate", ["linear"], ["zoom"], BUILDING_MIN_ZOOM, 0.15, 18, 1],
            },
        },
    ];
}

function buildingAttributes(measure: MeasureId): MapLayerStyleOption["attributes"] {
    const info = measureInfo(measure);
    return [
        { name: info.field, labels: { en: `${info.label.en} (${info.unit.en})`, de: `${info.label.de} (${info.unit.de})` } },
        { name: FIELDS.decay, labels: { en: "Overall accessibility (0–100)", de: "Gesamterreichbarkeit (0–100)" } },
        { name: FIELDS.confidence, labels: { en: "Score confidence", de: "Verlässlichkeit des Scores" } },
    ];
}

export function buildingStyleOptions(): MapLayerStyleOption[] {
    return ALL_MEASURES.map((measure, index) => {
        const info = measureInfo(measure);
        const name = styleNameOf("building", measure);
        return option(name, info.label, buildingLayers(`fifteen-min-buildings-${measure}`, buildingColor(measure)), buildingAttributes(measure), index === 0);
    });
}

function adminOption(measure: MeasureId, index: number): MapLayerStyleOption {
    const info = measureInfo(measure);
    const name = styleNameOf("admin", measure);
    return option(
        name,
        info.label,
        [
            {
                id: `fifteen-min-stadtteile-${measure}-fill`,
                type: "fill",
                "source-layer": STADTTEILE_SOURCE_LAYER,
                paint: {
                    "fill-color": adminColor(measure),
                    "fill-opacity": ["interpolate", ["linear"], ["zoom"], ADMIN_FILL_FULL_ZOOM, ADMIN_FILL_OPACITY, ADMIN_FILL_GONE_ZOOM, 0],
                },
            },
            {
                id: `fifteen-min-stadtteile-${measure}-outline`,
                type: "line",
                "source-layer": STADTTEILE_SOURCE_LAYER,
                paint: { "line-color": INK, "line-opacity": 0.45, "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.6, 14, 1.4] },
            },
        ],
        [
            { name: ADMIN_FIELDS.name, labels: { en: "Name", de: "Name" } },
            { name: info.adminField, labels: { en: info.label.en, de: info.label.de } },
            { name: ADMIN_FIELDS.n, labels: { en: "Residential buildings with a score", de: "Wohngebäude mit Wert" } },
        ],
        index === 0
    );
}

export function adminStyleOptions(): MapLayerStyleOption[] {
    return ALL_MEASURES.map((measure, index) => adminOption(measure, index));
}

function bundle(styles: MapLayerStyleOption[]): LocalStylingBundle {
    return { styles, defaultStyleId: (styles.find((style) => style.isDefault) ?? styles[0]).id };
}

/** The local styling of one 15-Minute City Explore entry, or `undefined` for an unknown key. */
export function resolveFifteenMinuteStyling(entryKey: string): LocalStylingBundle | undefined {
    if (entryKey === ENTRY_BUILDINGS) return bundle(buildingStyleOptions());
    if (entryKey === ENTRY_STADTTEILE) return bundle(adminStyleOptions());
    return undefined;
}

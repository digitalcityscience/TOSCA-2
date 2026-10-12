import type { CatalogGroupStyleLayer, PopupAttributeDefinition } from "@store/geoserver";
import type { MapLayerStyleOption } from "@store/map";
import { URBAN_STORY_LAYERS } from "../../layers";
import { BUILDING_FILL_OPACITY, BUILDING_OUTLINE_COLOR, buildingExtrusionHeightExpression } from "../fifteenMinute/buildingAccessibility";
import type { LocalStylingBundle } from "../fifteenMinute/types";
import { colorExpression, selectedAccent, streetOpacity, streetWidth } from "./cartography";
import { BUILDING_SCALES, STREET_SCALES, localText, metadata, plainMetricDescription, styleName, type WalkScale } from "./metrics";

export * from "./metrics";
export * from "./legends";

function popupAttributes(scales: WalkScale[], building: boolean): PopupAttributeDefinition[] {
    const fields: PopupAttributeDefinition[] = scales.map((scale) => ({
        name: scale.field, labels: localText(`${scale.label.en} (${scale.unit})`, `${scale.label.de} (${scale.unit})`),
        description: plainMetricDescription(scale.field),
        nullLabel: localText(scale.integer === true ? "Not available in this tile; the export expects a non-null count." : metadata[scale.field].null_semantics),
    }));
    const context = building
        ? [["origin_quality", "Network origin"], ["score_null_reason", "Origin unavailable because"], ["safety_null_reason_400m", "Safety unavailable because"], ["comfort_null_reason_400m", "Comfort unavailable because"], ["safety_covered_len_400m_m", "Safety-covered network length (m)"], ["comfort_scored_share_400m", "Scored network share (0–1)"]]
        : [["edge_id", "Street segment ID"], ["highway", "OSM way class"], ["in_hamburg", "Within Hamburg coverage"], ["has_sidewalk_source", "Sidewalk source"], ["comfort_confidence", "Comfort confidence (0–1, not probability)"], ["comfort_null_reason", "Comfort unavailable because"], ["safety_null_reason", "Safety unavailable because"], ["slope_dem_note", "Terrain-model note"], ["comfort_shade_basis", "Shade proxy basis"]];
    return [...fields, ...context.map(([name, label]) => ({ name, labels: localText(label) }))];
}

function styleOption(scale: WalkScale, building: boolean, index: number): MapLayerStyleOption {
    const name = styleName(scale.field);
    const source = building ? URBAN_STORY_LAYERS.buildings : URBAN_STORY_LAYERS.mobility;
    const common = { "source-layer": source.ref.layerName, minzoom: building ? source.minZoom : 9 };
    const color = colorExpression(scale);
    const layers: CatalogGroupStyleLayer[] = building ? [
        {
            ...common, id: `${name}:fill`, type: "fill-extrusion",
            paint: {
                "fill-extrusion-color": selectedAccent(color),
                "fill-extrusion-height": buildingExtrusionHeightExpression(),
                "fill-extrusion-base": 0,
                "fill-extrusion-opacity": BUILDING_FILL_OPACITY,
                "fill-extrusion-vertical-gradient": true,
            },
        },
        { ...common, id: `${name}:outline`, type: "line", paint: { "line-color": selectedAccent(BUILDING_OUTLINE_COLOR), "line-width": ["interpolate", ["linear"], ["zoom"], source.minZoom, 0.2, 18, 1], "line-opacity": 0.6 } },
    ] : scale.render === "positive-count-overlay" ? [
        {
            ...common, id: `${name}:context`, type: "line", layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": selectedAccent("#64748b"), "line-width": streetWidth(), "line-opacity": ["interpolate", ["linear"], ["zoom"], 9, 0.18, 13, 0.27, 16, 0.38] },
        },
        {
            ...common, id: `${name}:records`, type: "line", filter: [">", ["number", ["get", scale.field], -1], 0], layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": selectedAccent(color), "line-width": streetWidth(true), "line-opacity": streetOpacity() },
        },
    ] : [
        { ...common, id: `${name}:casing`, type: "line", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": selectedAccent("#334155"), "line-width": streetWidth(true), "line-opacity": streetOpacity() } },
        { ...common, id: `${name}:line`, type: "line", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": color, "line-width": streetWidth(), "line-opacity": streetOpacity() } },
    ];
    return { id: name, name, title: scale.label.en, isDefault: index === 0, layers, attributes: popupAttributes(building ? BUILDING_SCALES : STREET_SCALES, building) };
}

export function resolveWalkabilityStyling(entryKey: string): LocalStylingBundle | undefined {
    const building = entryKey === "buildings-comfort-safety";
    if (!building && entryKey !== "street-segments") return undefined;
    const styles = (building ? BUILDING_SCALES : STREET_SCALES).map((scale, index) => styleOption(scale, building, index));
    return { styles, defaultStyleId: styles[0].id };
}

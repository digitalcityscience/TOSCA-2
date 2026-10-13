import type { CatalogGroupStyleLayer } from "@store/geoserver";
import type { MapLayerStyleOption } from "@store/map";
import type { LocalStylingBundle } from "../fifteenMinute/types";
import type { Localized } from "../../types";
import {
    ADMIN_FILL_FULL_ZOOM,
    ADMIN_FILL_GONE_ZOOM,
    ADMIN_FILL_OPACITY,
    ADMIN_UNITS_GONE_ZOOM,
    ADMIN_OUTSIDE_SHARE,
    BUILDING_FADE_FULL_ZOOM,
    BUILDING_MIN_ZOOM,
    BUILDING_OPACITY,
    BUILDING_SOURCE_LAYER,
    FIELDS,
    INK,
    OUTLINE_COLOR,
    STADTTEILE_SOURCE_LAYER,
    STYLE_NAMES,
    UNITS_SOURCE_LAYER,
    type BuildingView,
} from "./constants";
import {
    agreementColorExpression,
    buildingExtrusionHeightExpression,
    coverageColorExpression,
    criteriaColorExpression,
    criteriaSignature,
    departuresColorExpression,
    NO_CRITERIA,
    outsideShareColorExpression,
    type Criteria,
} from "./expressions";

/**
 * Local style resolver of the Public Transport Equity story.
 *
 * @remarks
 * One building layer carries every view. Footprints appear at the neighbourhood scale and grow into their real
 * height at close zoom inside the same layer (flat extrusions are footprints), so 2D and 3D share one geometry,
 * one colour expression and one set of feature ids, and nothing is drawn twice during the transition. The view
 * (coverage, agreement, departures, walking time, user criteria) is the colour expression; switching it is a
 * style swap through the existing `setStandaloneLayerStyle`.
 */

export const ENTRY_BUILDINGS = "buildings-pt";
export const ENTRY_STADTTEILE = "stadtteile-pt";
export const ENTRY_UNITS = "units-pt";

function option(
    name: string,
    id: string,
    title: Localized,
    layers: CatalogGroupStyleLayer[],
    attributes: MapLayerStyleOption["attributes"],
    isDefault: boolean
): MapLayerStyleOption {
    return { id, name, title: title.en, isDefault, layers, ...(attributes === undefined ? {} : { attributes }) };
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
                // The city-scale choropleth hands over to the footprints between these two zooms.
                "fill-extrusion-opacity": ["interpolate", ["linear"], ["zoom"], BUILDING_MIN_ZOOM, 0, BUILDING_FADE_FULL_ZOOM, BUILDING_OPACITY],
                "fill-extrusion-vertical-gradient": true,
            },
        },
        {
            ...common,
            id: `${idPrefix}-outline`,
            type: "line",
            paint: {
                "line-color": OUTLINE_COLOR,
                // At the neighbourhood scale the footprints are a few pixels wide: no white outline there, it would wash the colour out.
                "line-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0, 15, 0.55],
                "line-width": ["interpolate", ["linear"], ["zoom"], BUILDING_MIN_ZOOM, 0.15, 18, 1],
            },
        },
    ];
}

const POPUP_ATTRIBUTES: MapLayerStyleOption["attributes"] = [
    { name: FIELDS.inCatchment, labels: { en: "Inside an official catchment", de: "Im amtlichen Einzugsbereich" } },
    { name: FIELDS.walkMin, labels: { en: "Walk to nearest stop (min)", de: "Fußweg zur nächsten Haltestelle (Min.)" } },
    { name: FIELDS.departures, labels: { en: "Daily departures in reach", de: "Tägliche Abfahrten in Reichweite" } },
    { name: FIELDS.lines, labels: { en: "Distinct lines in reach", de: "Erreichbare Linien" } },
];

export const BUILDING_VIEW_TITLES: Record<BuildingView, Localized> = {
    coverage: { en: "Inside an official catchment?", de: "Im amtlichen Einzugsbereich?" },
    agreement: { en: "Official catchment vs walking time", de: "Einzugsbereich und Gehzeit" },
    departures: { en: "Daily departures within reach", de: "Tägliche Abfahrten in Reichweite" },
    criteria: { en: "Buildings matching your criteria", de: "Gebäude nach Ihren Kriterien" },
};

/** The style option id that shows `view` (criteria views carry the user's criteria in their id). */
export function buildingStyleOptionId(view: BuildingView, criteria: Criteria = NO_CRITERIA): string {
    const name = STYLE_NAMES[view];
    const signature = view === "criteria" ? criteriaSignature(criteria) : "";
    return signature === "" ? name : `${name}|${signature}`;
}

export function buildingStyleOptions(criteria: Criteria = NO_CRITERIA): MapLayerStyleOption[] {
    const views: [BuildingView, unknown[]][] = [
        ["coverage", coverageColorExpression()],
        ["agreement", agreementColorExpression()],
        ["departures", departuresColorExpression()],
        ["criteria", criteriaColorExpression(criteria)],
    ];
    return views.map(([view, color], index) => option(
        STYLE_NAMES[view],
        buildingStyleOptionId(view, criteria),
        BUILDING_VIEW_TITLES[view],
        buildingLayers(`equity-buildings-${view}`, color),
        POPUP_ATTRIBUTES,
        index === 0
    ));
}

const ADMIN_POPUP: Record<string, MapLayerStyleOption["attributes"]> = {
    stadtteile: [
        { name: "stadtteil_name", labels: { en: "Name", de: "Name" } },
        { name: ADMIN_OUTSIDE_SHARE, labels: { en: "Residential buildings outside official catchments", de: "Wohngebäude außerhalb amtlicher Einzugsbereiche" } },
    ],
    units: [
        { name: "statistical_unit_id", labels: { en: "Statistical area", de: "Statistisches Gebiet" } },
        { name: ADMIN_OUTSIDE_SHARE, labels: { en: "Residential buildings outside official catchments", de: "Wohngebäude außerhalb amtlicher Einzugsbereiche" } },
    ],
};

/**
 * Stadtteile carry the city scale and fade out as the footprints arrive; statistical areas (scene 6) take over
 * the district scale between them. The outlines stay at every zoom, so the geography never disappears.
 */
function adminOption(level: "stadtteile" | "units"): MapLayerStyleOption {
    const sourceLayer = level === "stadtteile" ? STADTTEILE_SOURCE_LAYER : UNITS_SOURCE_LAYER;
    const fillOpacity = level === "stadtteile"
        ? ["interpolate", ["linear"], ["zoom"], ADMIN_FILL_FULL_ZOOM, ADMIN_FILL_OPACITY, ADMIN_FILL_GONE_ZOOM, 0]
        : ["interpolate", ["linear"], ["zoom"], ADMIN_FILL_FULL_ZOOM - 1, 0, ADMIN_FILL_FULL_ZOOM, ADMIN_FILL_OPACITY, ADMIN_UNITS_GONE_ZOOM - 1, ADMIN_FILL_OPACITY * 0.7, ADMIN_UNITS_GONE_ZOOM, 0];
    const lineWidth = level === "stadtteile"
        ? ["interpolate", ["linear"], ["zoom"], 9, 0.6, 14, 1.4]
        : ["interpolate", ["linear"], ["zoom"], ADMIN_FILL_FULL_ZOOM - 1, 0.2, 14, 0.8];
    const lineOpacity = level === "stadtteile"
        ? 0.45
        : ["interpolate", ["linear"], ["zoom"], ADMIN_FILL_FULL_ZOOM - 1, 0, ADMIN_FILL_FULL_ZOOM, 0.4];
    return option(
        STYLE_NAMES.adminOutside,
        STYLE_NAMES.adminOutside,
        { en: "Residential buildings outside official catchments", de: "Wohngebäude außerhalb amtlicher Einzugsbereiche" },
        [
            {
                id: `equity-${level}-fill`,
                type: "fill",
                "source-layer": sourceLayer,
                paint: { "fill-color": outsideShareColorExpression(ADMIN_OUTSIDE_SHARE), "fill-opacity": fillOpacity },
            },
            {
                id: `equity-${level}-outline`,
                type: "line",
                "source-layer": sourceLayer,
                paint: { "line-color": INK, "line-opacity": lineOpacity, "line-width": lineWidth },
            },
        ],
        ADMIN_POPUP[level],
        true
    );
}

function bundle(styles: MapLayerStyleOption[]): LocalStylingBundle {
    return { styles, defaultStyleId: (styles.find((style) => style.isDefault) ?? styles[0]).id };
}

/** The local styling of one Public Transport Equity Explore entry, or `undefined` for an unknown key. */
export function resolveEquityStyling(entryKey: string, criteria: Criteria = NO_CRITERIA): LocalStylingBundle | undefined {
    if (entryKey === ENTRY_BUILDINGS) return bundle(buildingStyleOptions(criteria));
    if (entryKey === ENTRY_STADTTEILE) return bundle([adminOption("stadtteile")]);
    if (entryKey === ENTRY_UNITS) return bundle([adminOption("units")]);
    return undefined;
}

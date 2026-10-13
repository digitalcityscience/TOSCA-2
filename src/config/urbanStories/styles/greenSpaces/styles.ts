import type { CatalogGroupStyleLayer } from "@store/geoserver";
import type { MapLayerStyleOption } from "@store/map";
import type { Localized } from "../../types";
import {
    ADMIN_FIELDS,
    ADMIN_FILL_FULL_ZOOM,
    ADMIN_FILL_GONE_ZOOM,
    ADMIN_FILL_OPACITY,
    ADMIN_MEASURES,
    AREA_CLASS_INFO,
    AREA_FIELDS,
    AREA_MIN_ZOOM,
    BUILDING_FADE_FULL_ZOOM,
    BUILDING_FIELDS,
    BUILDING_MIN_ZOOM,
    BUILDING_OPACITY,
    CONTEXT_BUILDING_COLOR,
    ENTRY_AREAS,
    ENTRY_BUILDINGS,
    ENTRY_FEATURE_LINE,
    ENTRY_FEATURE_POINT,
    ENTRY_FEATURE_POLYGON,
    ENTRY_PARK_POIS,
    ENTRY_STADTTEILE,
    FEATURE_FIELDS,
    FEATURE_FULL_ZOOM,
    FEATURE_MIN_ZOOM,
    FOCUS_OUTLINE,
    INK,
    OTHER_LABEL_ZOOM,
    OUTLINE_COLOR,
    PARK_LABEL_ZOOM,
    PLAYGROUND_ICON,
    PLAYGROUND_ICON_ZOOM,
    POI_COLOR,
    SOURCE_LAYERS,
    adminFieldOf,
    styleNameOf,
    type AccessMeasure,
    type AdminMeasure,
    type AreaStyle,
    type FeatureStyle,
    type StyleKind,
} from "./constants";
import {
    adminColor,
    areaClassColor,
    areaClassInk,
    buildingExtrusionHeightExpression,
    buildingMinutesColor,
    featureGroupColor,
    isClass,
    isNamed,
} from "./expressions";
import { HIRSCHPARK } from "../../greenSpacesLocations";
import { measureText } from "./measures";

/**
 * Local style resolver of the Green Spaces story. One layer per Explore entry carries every look of that layer: the
 * scene state swaps between them through `setStandaloneLayerStyle`, which keeps the camera, the selection and the layer
 * order. Nothing is fetched from the GeoServer style catalog.
 *
 * @remarks
 * Zoom decides the level of detail, never whether the data is there: Stadtteile (city) → footprints (neighbourhood, from
 * zoom 11, as in the 15-Minute City story) → extruded buildings (zoom 14.5 to 16). The same colour expression colours the
 * flat and the extruded building. Official green areas are drawn from the city view on; the detailed Feinkartierung
 * objects fade in from zoom 14.
 */

type Expression = unknown[];

/** Matches nothing: a hidden look is a style whose only layer draws no feature. (A bare `["==", 1, 0]` reads as a legacy filter.) */
const NEVER: Expression = ["==", ["to-string", ["get", "__never__"]], "__never__"];

function option(
    name: string,
    title: Localized,
    layers: CatalogGroupStyleLayer[],
    attributes: MapLayerStyleOption["attributes"],
    isDefault: boolean
): MapLayerStyleOption {
    return { id: name, name, title: title.en, isDefault, layers, ...(attributes === undefined ? {} : { attributes }) };
}

const label = (en: string, de: string): Localized => ({ en, de });

// --- official green areas --------------------------------------------------------------------------------------------

const SRC_AREAS = SOURCE_LAYERS.areas;
const FONT = ["Open Sans Regular"];

/** Zoom may only be the input of a top-level interpolate, so a dimmed look scales the stops, not the expression. */
const fillOpacity = (dim = 1): Expression => ["interpolate", ["linear"], ["zoom"], AREA_MIN_ZOOM, 0.8 * dim, 12, 0.72 * dim, 15, 0.5 * dim, 17, 0.38 * dim];
const OUTLINE_WIDTH: Expression = ["interpolate", ["linear"], ["zoom"], AREA_MIN_ZOOM, 0.2, 11, 0.6, 14, 1.1, 17, 1.8];

function areaFill(id: string, color: unknown, opacity: unknown, filter?: Expression): CatalogGroupStyleLayer {
    return {
        id, type: "fill", "source-layer": SRC_AREAS, minzoom: AREA_MIN_ZOOM,
        ...(filter === undefined ? {} : { filter }),
        paint: { "fill-color": color, "fill-opacity": opacity },
    };
}

function areaLine(id: string, color: unknown, width: unknown, opacity: unknown, filter?: Expression): CatalogGroupStyleLayer {
    return {
        id, type: "line", "source-layer": SRC_AREAS, minzoom: AREA_MIN_ZOOM,
        ...(filter === undefined ? {} : { filter }),
        paint: { "line-color": color, "line-width": width, "line-opacity": opacity },
    };
}

function areaLabel(id: string, minzoom: number, filter: Expression, color: unknown, size: unknown): CatalogGroupStyleLayer {
    return {
        id, type: "symbol", "source-layer": SRC_AREAS, minzoom,
        filter,
        layout: { "text-field": ["get", AREA_FIELDS.name], "text-font": FONT, "text-size": size, "text-max-width": 7, "text-padding": 4 },
        paint: { "text-color": color, "text-halo-color": "#ffffff", "text-halo-width": 1.6 },
    };
}

/** The playground symbol: a small pictogram badge, added to the map once by the story's overlays. */
function playgroundIcon(id: string): CatalogGroupStyleLayer {
    return {
        id, type: "symbol", "source-layer": SRC_AREAS, minzoom: PLAYGROUND_ICON_ZOOM,
        filter: isClass("playground"),
        layout: {
            "icon-image": PLAYGROUND_ICON,
            "icon-size": ["interpolate", ["linear"], ["zoom"], PLAYGROUND_ICON_ZOOM, 0.32, 14, 0.5, 17, 0.8],
            "icon-allow-overlap": false,
            "icon-padding": 1,
        },
        paint: {},
    };
}

const PARK_LABEL_SIZE: Expression = ["interpolate", ["linear"], ["zoom"], PARK_LABEL_ZOOM, 10, 16, 13];
const OTHER_LABEL_SIZE: Expression = ["interpolate", ["linear"], ["zoom"], OTHER_LABEL_ZOOM, 10, 17, 12];

const GENERAL_CLASSES = ["playground", "sports_area", "cemetery", "protective_green", "other_public_green"];

function classesLayers(prefix: string, dim = 1): CatalogGroupStyleLayer[] {
    const opacity = fillOpacity(dim);
    return [
        areaFill(`${prefix}-fill`, areaClassColor(), opacity),
        areaLine(`${prefix}-line`, areaClassInk(), OUTLINE_WIDTH, dim === 1 ? 0.85 : 0.5),
        areaLabel(`${prefix}-label-park`, PARK_LABEL_ZOOM, ["all", isClass("recreational_park"), isNamed()], AREA_CLASS_INFO.recreational_park.ink, PARK_LABEL_SIZE),
        areaLabel(`${prefix}-label-other`, OTHER_LABEL_ZOOM, ["all", ["match", ["get", AREA_FIELDS.class], GENERAL_CLASSES, true, false], isNamed()], areaClassInk(), OTHER_LABEL_SIZE),
        playgroundIcon(`${prefix}-icon`),
    ];
}

function focusParkLayers(prefix: string): CatalogGroupStyleLayer[] {
    const focus: Expression = ["==", ["get", AREA_FIELDS.id], HIRSCHPARK.areaId];
    return [
        ...classesLayers(prefix, 0.45).slice(0, 2),
        areaFill(`${prefix}-focus-fill`, AREA_CLASS_INFO.recreational_park.color, 0.38, focus),
        areaLine(`${prefix}-focus-line`, FOCUS_OUTLINE, ["interpolate", ["linear"], ["zoom"], 12, 1.4, 16, 3], 0.95, focus),
        areaLabel(`${prefix}-focus-label`, 13, focus, FOCUS_OUTLINE, ["interpolate", ["linear"], ["zoom"], 13, 11, 16, 15]),
        playgroundIcon(`${prefix}-icon`),
    ];
}

function parksOnlyLayers(prefix: string): CatalogGroupStyleLayer[] {
    const park = isClass("recreational_park");
    return [
        areaFill(`${prefix}-fill`, AREA_CLASS_INFO.recreational_park.color, ["interpolate", ["linear"], ["zoom"], AREA_MIN_ZOOM, 0.8, 13, 0.6, 16, 0.4], park),
        areaLine(`${prefix}-line`, AREA_CLASS_INFO.recreational_park.ink, ["interpolate", ["linear"], ["zoom"], AREA_MIN_ZOOM, 0.3, 12, 1, 16, 2.2], 0.9, park),
        areaLabel(`${prefix}-label`, PARK_LABEL_ZOOM, ["all", park, isNamed()], AREA_CLASS_INFO.recreational_park.ink, PARK_LABEL_SIZE),
    ];
}

function playgroundsOnlyLayers(prefix: string): CatalogGroupStyleLayer[] {
    const playground = isClass("playground");
    return [
        areaFill(`${prefix}-fill`, AREA_CLASS_INFO.playground.color, ["interpolate", ["linear"], ["zoom"], AREA_MIN_ZOOM, 0.9, 13, 0.75, 17, 0.55], playground),
        areaLine(`${prefix}-line`, AREA_CLASS_INFO.playground.ink, ["interpolate", ["linear"], ["zoom"], AREA_MIN_ZOOM, 0.4, 13, 1.2, 17, 2.2], 0.95, playground),
        areaLabel(`${prefix}-label`, 14.5, ["all", playground, isNamed()], AREA_CLASS_INFO.playground.ink, OTHER_LABEL_SIZE),
        playgroundIcon(`${prefix}-icon`),
    ];
}

/** Parks as green outlined areas, playgrounds as orange areas with the pictogram; every other class is left out. */
function accessBothLayers(prefix: string): CatalogGroupStyleLayer[] {
    const park = isClass("recreational_park");
    const playground = isClass("playground");
    return [
        areaFill(`${prefix}-park-fill`, AREA_CLASS_INFO.recreational_park.color, ["interpolate", ["linear"], ["zoom"], AREA_MIN_ZOOM, 0.6, 13, 0.4, 16, 0.26], park),
        areaLine(`${prefix}-park-line`, AREA_CLASS_INFO.recreational_park.ink, ["interpolate", ["linear"], ["zoom"], AREA_MIN_ZOOM, 0.3, 12, 1.2, 16, 2.4], 0.95, park),
        areaFill(`${prefix}-playground-fill`, AREA_CLASS_INFO.playground.color, ["interpolate", ["linear"], ["zoom"], AREA_MIN_ZOOM, 0.9, 13, 0.75, 17, 0.55], playground),
        areaLine(`${prefix}-playground-line`, AREA_CLASS_INFO.playground.ink, ["interpolate", ["linear"], ["zoom"], AREA_MIN_ZOOM, 0.4, 13, 1.2, 17, 2.2], 0.95, playground),
        areaLabel(`${prefix}-park-label`, PARK_LABEL_ZOOM, ["all", park, isNamed()], AREA_CLASS_INFO.recreational_park.ink, PARK_LABEL_SIZE),
        playgroundIcon(`${prefix}-icon`),
    ];
}

function noneLayer(prefix: string, sourceLayer: string, minzoom?: number): CatalogGroupStyleLayer[] {
    // A hidden look keeps the layer's zoom floor, so heavy layers request no tiles below it.
    return [{ id: `${prefix}-none`, type: "line", "source-layer": sourceLayer, ...(minzoom === undefined ? {} : { minzoom }), filter: NEVER, paint: { "line-opacity": 0 } }];
}

const AREA_ATTRIBUTES: MapLayerStyleOption["attributes"] = [
    { name: AREA_FIELDS.name, labels: { en: "Name", de: "Name" } },
    { name: AREA_FIELDS.class, labels: { en: "Class", de: "Klasse" } },
    { name: AREA_FIELDS.categoryEn, labels: { en: "Official category", de: "Amtliche Kategorie" } },
    { name: AREA_FIELDS.area, labels: { en: "Area (m²)", de: "Fläche (m²)" } },
];

const AREA_TITLES: Record<AreaStyle, Localized> = {
    "classes": label("Official green areas by class", "Amtliche Grünflächen nach Klasse"),
    "focus-park": label("One park among the official green areas", "Ein Park unter den amtlichen Grünflächen"),
    "parks-only": label("Recreational parks", "Parkanlagen"),
    "playgrounds-only": label("Playgrounds", "Spielplätze"),
    "access-both": label("Parks and playgrounds", "Parks und Spielplätze"),
    "none": label("Hidden", "Ausgeblendet"),
};

export function areaStyleOptions(): MapLayerStyleOption[] {
    const build = (style: AreaStyle): CatalogGroupStyleLayer[] => {
        const prefix = `gs-areas-${style}`;
        switch (style) {
            case "classes": return classesLayers(prefix);
            case "focus-park": return focusParkLayers(prefix);
            case "parks-only": return parksOnlyLayers(prefix);
            case "playgrounds-only": return playgroundsOnlyLayers(prefix);
            case "access-both": return accessBothLayers(prefix);
            default: return noneLayer(prefix, SRC_AREAS);
        }
    };
    return (["classes", "focus-park", "parks-only", "playgrounds-only", "access-both", "none"] as const).map((style, index) => (
        option(styleNameOf("areas", style), AREA_TITLES[style], build(style), AREA_ATTRIBUTES, index === 0)
    ));
}

// --- detailed Feinkartierung objects -----------------------------------------------------------------------------

/** Drawing order inside one layer: vegetation under water under play surfaces under paths under boundaries and fixtures. */
const FEATURE_SORT: Expression = ["match", ["to-number", ["get", FEATURE_FIELDS.code0], -1], [7, 10, 8, 99], 0, 6, 1, 2, 2, 1, 3, 3, 4, [9, 4, 5], 5, 0];

const FEATURE_FADE: Expression = ["interpolate", ["linear"], ["zoom"], FEATURE_MIN_ZOOM, 0, FEATURE_FULL_ZOOM, 1];

/** `play`: only the sports and play surfaces (level 0 = 2), a different thing from an official playground polygon. */
const SPORTS_AND_PLAY_CODE = 2;

const featureFilter = (style: FeatureStyle): Expression | undefined => {
    if (style === "focus") return ["==", ["get", FEATURE_FIELDS.idnr], HIRSCHPARK.idnr];
    return style === "play" ? ["==", ["to-number", ["get", FEATURE_FIELDS.code0], -1], SPORTS_AND_PLAY_CODE] : undefined;
};

function featureLayers(entryKey: string, style: FeatureStyle): CatalogGroupStyleLayer[] {
    const prefix = `gs-${entryKey}-${style}`;
    const filter = featureFilter(style);
    const common = { minzoom: FEATURE_MIN_ZOOM, ...(filter === undefined ? {} : { filter }) };
    if (style === "none") {
        const sourceLayer = entryKey === ENTRY_FEATURE_POLYGON ? SOURCE_LAYERS.featurePolygon : entryKey === ENTRY_FEATURE_LINE ? SOURCE_LAYERS.featureLine : SOURCE_LAYERS.featurePoint;
        return noneLayer(prefix, sourceLayer, FEATURE_MIN_ZOOM);
    }
    if (entryKey === ENTRY_FEATURE_POLYGON) {
        return [
            {
                ...common, id: `${prefix}-fill`, type: "fill", "source-layer": SOURCE_LAYERS.featurePolygon,
                layout: { "fill-sort-key": FEATURE_SORT },
                paint: {
                    "fill-color": featureGroupColor(),
                    "fill-opacity": ["interpolate", ["linear"], ["zoom"], FEATURE_MIN_ZOOM, 0, FEATURE_FULL_ZOOM, 0.78],
                    "fill-outline-color": "rgba(255,255,255,0.55)",
                },
            },
        ];
    }
    if (entryKey === ENTRY_FEATURE_LINE) {
        return [{
            ...common, id: `${prefix}-line`, type: "line", "source-layer": SOURCE_LAYERS.featureLine,
            paint: {
                "line-color": featureGroupColor(),
                "line-width": ["interpolate", ["linear"], ["zoom"], FEATURE_MIN_ZOOM, 0.4, 18, 2.4],
                "line-opacity": ["interpolate", ["linear"], ["zoom"], FEATURE_MIN_ZOOM, 0, FEATURE_FULL_ZOOM, 0.9],
            },
        }];
    }
    return [{
        ...common, id: `${prefix}-point`, type: "circle", "source-layer": SOURCE_LAYERS.featurePoint,
        paint: {
            "circle-color": featureGroupColor(),
            "circle-radius": ["interpolate", ["linear"], ["zoom"], FEATURE_MIN_ZOOM, 1.2, 18, 4.5],
            "circle-opacity": FEATURE_FADE,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 0.6,
            "circle-stroke-opacity": FEATURE_FADE,
        },
    }];
}

const FEATURE_ATTRIBUTES: MapLayerStyleOption["attributes"] = [
    { name: FEATURE_FIELDS.group, labels: { en: "Feature group", de: "Objektgruppe" } },
    { name: FEATURE_FIELDS.type, labels: { en: "Feature type", de: "Objektart" } },
    { name: FEATURE_FIELDS.parentCategory, labels: { en: "Official green-area category", de: "Amtliche Grünflächenkategorie" } },
];

export function featureStyleOptions(entryKey: string): MapLayerStyleOption[] {
    const titles: Record<FeatureStyle, Localized> = {
        all: label("Detailed green objects", "Detaillierte Grünobjekte"),
        focus: label("Detailed objects of one park", "Detailobjekte eines Parks"),
        play: label("Sports and play surfaces", "Sport- und Spielflächen"),
        none: label("Hidden", "Ausgeblendet"),
    };
    // The default is the hidden look: a scene that stages the layer reveals it by a style swap.
    return (["all", "focus", "play", "none"] as const).map((style) => (
        option(styleNameOf(entryKey === ENTRY_FEATURE_POLYGON ? "feature-polygon" : entryKey === ENTRY_FEATURE_LINE ? "feature-line" : "feature-point", style), titles[style], featureLayers(entryKey, style), FEATURE_ATTRIBUTES, style === "none")
    ));
}

// --- OSM park comparison ---------------------------------------------------------------------------------------------

export function poiStyleOptions(): MapLayerStyleOption[] {
    return [
        option(styleNameOf("pois", "outline"), label("Parks from OpenStreetMap / ALKIS", "Parks aus OpenStreetMap / ALKIS"), [
            {
                id: "gs-pois-outline-fill", type: "fill", "source-layer": SOURCE_LAYERS.parkPoi, minzoom: 11,
                paint: { "fill-color": POI_COLOR, "fill-opacity": 0.06 },
            },
            {
                id: "gs-pois-outline-line", type: "line", "source-layer": SOURCE_LAYERS.parkPoi, minzoom: 11,
                layout: { "line-cap": "butt" },
                paint: { "line-color": POI_COLOR, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.8, 16, 2], "line-dasharray": [3, 2], "line-opacity": 0.95 },
            },
        ], [{ name: "name", labels: { en: "Name", de: "Name" } }], false),
        option(styleNameOf("pois", "none"), label("Hidden", "Ausgeblendet"), noneLayer("gs-pois", SOURCE_LAYERS.parkPoi, 11), undefined, true),
    ];
}

// --- buildings -------------------------------------------------------------------------------------------------------

function buildingLayers(idPrefix: string, color: unknown, opacity: number): CatalogGroupStyleLayer[] {
    const common = { "source-layer": SOURCE_LAYERS.buildings, minzoom: BUILDING_MIN_ZOOM };
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
                "fill-extrusion-opacity": ["interpolate", ["linear"], ["zoom"], BUILDING_MIN_ZOOM, 0, BUILDING_FADE_FULL_ZOOM, opacity],
                "fill-extrusion-vertical-gradient": true,
            },
        },
        {
            ...common,
            id: `${idPrefix}-outline`,
            type: "line",
            paint: {
                "line-color": OUTLINE_COLOR,
                "line-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0, 15, 0.55],
                "line-width": ["interpolate", ["linear"], ["zoom"], BUILDING_MIN_ZOOM, 0.15, 18, 1],
            },
        },
    ];
}

export function buildingStyleOptions(): MapLayerStyleOption[] {
    const access = (measure: AccessMeasure): MapLayerStyleOption => {
        const info = measureText(measure);
        const field = measure === "park" ? BUILDING_FIELDS.park : BUILDING_FIELDS.playground;
        const statusField = measure === "park" ? BUILDING_FIELDS.parkStatus : BUILDING_FIELDS.playgroundStatus;
        return option(
            styleNameOf("building", measure),
            info.label,
            buildingLayers(`gs-buildings-${measure}`, buildingMinutesColor(measure), BUILDING_OPACITY),
            [
                { name: field, labels: { en: `${info.label.en} (min)`, de: `${info.label.de} (Min.)` } },
                { name: statusField, labels: { en: "Routing status", de: "Routing-Status" } },
            ],
            false
        );
    };
    return [
        access("park"),
        access("playground"),
        option(styleNameOf("building", "context"), label("Buildings (context)", "Gebäude (Kontext)"), buildingLayers("gs-buildings-context", CONTEXT_BUILDING_COLOR, 0.88), undefined, false),
        option(styleNameOf("building", "none"), label("Hidden", "Ausgeblendet"), noneLayer("gs-buildings", SOURCE_LAYERS.buildings, BUILDING_MIN_ZOOM), undefined, true),
    ];
}

// --- Stadtteile -----------------------------------------------------------------------------------------------------------

function adminLayers(measure: AdminMeasure | "outline"): CatalogGroupStyleLayer[] {
    const prefix = `gs-stadtteile-${measure}`;
    const outline: CatalogGroupStyleLayer = {
        id: `${prefix}-outline`, type: "line", "source-layer": SOURCE_LAYERS.stadtteile,
        paint: {
            "line-color": INK,
            "line-opacity": measure === "outline" ? 0.28 : 0.45,
            "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.6, 14, 1.4],
        },
    };
    if (measure === "outline") return [outline];
    return [
        {
            id: `${prefix}-fill`, type: "fill", "source-layer": SOURCE_LAYERS.stadtteile,
            paint: {
                "fill-color": adminColor(measure),
                "fill-opacity": ["interpolate", ["linear"], ["zoom"], ADMIN_FILL_FULL_ZOOM, ADMIN_FILL_OPACITY, ADMIN_FILL_GONE_ZOOM, 0],
            },
        },
        outline,
        {
            id: `${prefix}-label`, type: "symbol", "source-layer": SOURCE_LAYERS.stadtteile, minzoom: 10.4, maxzoom: 13.6,
            layout: { "text-field": ["get", ADMIN_FIELDS.name], "text-font": FONT, "text-size": ["interpolate", ["linear"], ["zoom"], 10.4, 9, 13, 12], "text-max-width": 7 },
            paint: {
                "text-color": INK,
                "text-halo-color": "#ffffff",
                "text-halo-width": 1.5,
                "text-opacity": ["interpolate", ["linear"], ["zoom"], 12.2, 1, 13.6, 0],
            },
        },
    ];
}

export function adminStyleOptions(): MapLayerStyleOption[] {
    const measures = ADMIN_MEASURES.map((measure): MapLayerStyleOption => {
        const info = measureText(measure);
        return option(
            styleNameOf("admin", measure),
            info.label,
            adminLayers(measure),
            [
                { name: ADMIN_FIELDS.name, labels: { en: "Name", de: "Name" } },
                { name: adminFieldOf(measure), labels: { en: info.label.en, de: info.label.de } },
            ],
            false
        );
    });
    return [
        ...measures,
        option(styleNameOf("admin", "outline"), label("Stadtteil outlines", "Stadtteilgrenzen"), adminLayers("outline"), undefined, true),
    ];
}

// --- bundles ----------------------------------------------------------------------------------------------------------------

export type { StyleKind };

export interface GreenStylingBundle {
    styles: MapLayerStyleOption[];
    defaultStyleId: string;
}

function bundle(styles: MapLayerStyleOption[]): GreenStylingBundle {
    return { styles, defaultStyleId: (styles.find((style) => style.isDefault) ?? styles[0]).id };
}

/** The local styling of one Green Spaces Explore entry, or `undefined` for an unknown key. */
export function resolveGreenSpacesStyling(entryKey: string): GreenStylingBundle | undefined {
    switch (entryKey) {
        case ENTRY_AREAS: return bundle(areaStyleOptions());
        case ENTRY_FEATURE_POLYGON:
        case ENTRY_FEATURE_LINE:
        case ENTRY_FEATURE_POINT: return bundle(featureStyleOptions(entryKey));
        case ENTRY_PARK_POIS: return bundle(poiStyleOptions());
        case ENTRY_BUILDINGS: return bundle(buildingStyleOptions());
        case ENTRY_STADTTEILE: return bundle(adminStyleOptions());
        default: return undefined;
    }
}

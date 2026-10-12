import type { CatalogGroupStyleLayer } from "@store/geoserver";
import type { MapLayerStyleOption } from "@store/map";
import type { Localized } from "../../types";
import {
    ADMIN_FILL_MAX_ZOOM,
    ADMIN_FILL_OPACITY,
    ADMIN_METRIC_SCALES,
    ADMIN_NAME_FIELD,
    ADMIN_OUTLINE_COLOR,
    ADMIN_SOURCE_LAYER,
    adminColorExpression,
} from "./administrativeContext";
import {
    BUILDING_FILL_OPACITY,
    buildingExtrusionHeightExpression,
    BUILDING_OUTLINE_COLOR,
    BUILDING_SCORE_DECAY_FIELD,
    BUILDING_SCORE_FIELD,
    BUILDING_SOURCE_LAYER,
    maxScoreFilter,
    score15minColorExpression,
} from "./buildingAccessibility";
import {
    CATEGORY_FIELDS,
    categoryAccessColorExpression,
    missingCategoryFilter,
} from "./categoryAccessibility";
import { STYLE_NAMES } from "./legends";
import { POI_MIN_ZOOM, POI_STYLES } from "./poiStyles";
import {
    FIFTEEN_MINUTE_CATEGORY_IDS,
    NO_GAP_FILTER,
    type AdministrativeLevel,
    type AdministrativeMetric,
    type FifteenMinuteCategoryId,
    type GapFilterSelection,
    type LocalStylingBundle,
} from "./types";

export * from "./administrativeContext";
export * from "./buildingAccessibility";
export * from "./categoryAccessibility";
export * from "./legends";
export * from "./poiStyles";
export * from "./types";

/**
 * Local style resolver of the 15-Minute City story.
 *
 * @remarks
 * Produces `MapLayerStyleOption`s that the existing layer loader and `setStandaloneLayerStyle`
 * already understand. Nothing here reads a GeoServer style, an assignment or style metadata. The
 * building filter of the accessibility-gap chapter is part of the style layers, so the existing
 * style swap (and the user's attribute filters, which it re-applies) keeps working unchanged.
 */

/**
 * Building footprints appear from here on (the story's own choice; the shared layer floor of the other stories
 * stays 14). Tiles are very heavy below zoom 13, see the implementation document.
 */
export const BUILDING_MIN_ZOOM = 8;

const ENTRY_BUILDINGS = "buildings-15min";

function option(
    name: string,
    id: string,
    title: Localized,
    layers: CatalogGroupStyleLayer[],
    attributes: MapLayerStyleOption["attributes"],
    isDefault: boolean
): MapLayerStyleOption {
    return {
        id,
        name,
        title: title.en,
        isDefault,
        layers,
        ...(attributes === undefined ? {} : { attributes }),
    };
}

/** Compact signature of the gap filter; "" when no filter is set. */
export function gapSignature(gap: GapFilterSelection): string {
    const parts = [
        gap.maxScore === null ? "" : `score<=${gap.maxScore}`,
        gap.missingCategory === null ? "" : `missing:${gap.missingCategory}`,
    ].filter((part) => part !== "");
    return parts.length === 0 ? "" : `|gap:${parts.join(",")}`;
}

/** Filter expression of the gap selection, or `undefined` when nothing is filtered. */
export function buildingGapFilter(gap: GapFilterSelection): unknown[] | undefined {
    const operands: unknown[] = [];
    if (gap.maxScore !== null) operands.push(maxScoreFilter(gap.maxScore));
    if (gap.missingCategory !== null) operands.push(missingCategoryFilter(gap.missingCategory));
    return operands.length === 0 ? undefined : ["all", ...operands];
}

function buildingLayers(idPrefix: string, color: unknown[], gap: GapFilterSelection): CatalogGroupStyleLayer[] {
    const filter = buildingGapFilter(gap);
    const common = {
        "source-layer": BUILDING_SOURCE_LAYER,
        minzoom: BUILDING_MIN_ZOOM,
        ...(filter === undefined ? {} : { filter }),
    };
    return [
        {
            ...common,
            id: `${idPrefix}-fill`,
            // 3D: the footprint is extruded by the building's own height; the colour is the thematic value.
            type: "fill-extrusion",
            paint: {
                "fill-extrusion-color": color,
                "fill-extrusion-height": buildingExtrusionHeightExpression(),
                "fill-extrusion-base": 0,
                "fill-extrusion-opacity": BUILDING_FILL_OPACITY,
                "fill-extrusion-vertical-gradient": true,
            },
        },
        {
            ...common,
            id: `${idPrefix}-outline`,
            type: "line",
            paint: {
                "line-color": BUILDING_OUTLINE_COLOR,
                "line-opacity": 0.6,
                "line-width": ["interpolate", ["linear"], ["zoom"], BUILDING_MIN_ZOOM, 0.2, 18, 1],
            },
        },
    ];
}

const BUILDING_POPUP_ATTRIBUTES = [
    { name: BUILDING_SCORE_FIELD, labels: { en: "Categories reached (0–9)", de: "Erreichte Kategorien (0–9)" } },
    { name: BUILDING_SCORE_DECAY_FIELD, labels: { en: "Decay-weighted score (0–100)", de: "Distanzgewichteter Score (0–100)" } },
    { name: "score_confidence", labels: { en: "Score confidence", de: "Verlässlichkeit des Scores" } },
];

/** One overall style plus one per category, all with the same gap filter. */
export function buildingStyleOptions(gap: GapFilterSelection = NO_GAP_FILTER): MapLayerStyleOption[] {
    const suffix = gapSignature(gap);
    const overallName = STYLE_NAMES.overall;
    const overall = option(
        overallName,
        `${overallName}${suffix}`,
        { en: "Categories reached (0–9)", de: "Erreichte Kategorien (0–9)" },
        buildingLayers("fifteen-min-buildings-overall", score15minColorExpression(), gap),
        BUILDING_POPUP_ATTRIBUTES,
        true
    );
    const categories = FIFTEEN_MINUTE_CATEGORY_IDS.map((id) => {
        const name = STYLE_NAMES.category(id);
        const fields = CATEGORY_FIELDS[id];
        return option(
            name,
            `${name}${suffix}`,
            fields.label,
            buildingLayers(`fifteen-min-buildings-${id}`, categoryAccessColorExpression(id), gap),
            [
                { name: BUILDING_SCORE_FIELD, labels: BUILDING_POPUP_ATTRIBUTES[0].labels },
                { name: fields.accessField, labels: { en: `${fields.label.en}: places within 15 min`, de: `${fields.label.de}: Ziele in 15 Min.` } },
                { name: fields.walkMinField, labels: { en: `${fields.label.en}: walking minutes`, de: `${fields.label.de}: Gehminuten` } },
            ],
            false
        );
    });
    return [overall, ...categories];
}

function adminOptions(level: AdministrativeLevel): MapLayerStyleOption[] {
    const metrics = Object.keys(ADMIN_METRIC_SCALES) as AdministrativeMetric[];
    return metrics.map((metric, index) => {
        const name = STYLE_NAMES.admin(metric);
        const sourceLayer = ADMIN_SOURCE_LAYER[level];
        return option(
            name,
            name,
            ADMIN_METRIC_SCALES[metric].label,
            [
                {
                    id: `fifteen-min-${level}-${metric}-fill`,
                    type: "fill",
                    "source-layer": sourceLayer,
                    maxzoom: ADMIN_FILL_MAX_ZOOM,
                    paint: { "fill-color": adminColorExpression(metric), "fill-opacity": ADMIN_FILL_OPACITY },
                },
                {
                    id: `fifteen-min-${level}-${metric}-outline`,
                    type: "line",
                    "source-layer": sourceLayer,
                    paint: { "line-color": ADMIN_OUTLINE_COLOR, "line-opacity": 0.7, "line-width": 1 },
                },
            ],
            [
                { name: ADMIN_NAME_FIELD[level], labels: { en: "Name", de: "Name" } },
                { name: metric, labels: ADMIN_METRIC_SCALES[metric].label },
                { name: "m15_n", labels: { en: "Residential buildings with a score", de: "Wohngebäude mit Score" } },
            ],
            index === 0
        );
    });
}

function poiOption(id: FifteenMinuteCategoryId): MapLayerStyleOption {
    const style = POI_STYLES[id];
    const name = STYLE_NAMES.poi(id);
    const layers: CatalogGroupStyleLayer[] = style.geometry === "point"
        ? [{
            id: `fifteen-min-poi-${id}`,
            type: "circle",
            "source-layer": style.sourceLayer,
            minzoom: POI_MIN_ZOOM,
            paint: {
                "circle-color": style.color,
                "circle-radius": ["interpolate", ["linear"], ["zoom"], POI_MIN_ZOOM, 2.5, 16, 6],
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": 1,
                "circle-opacity": 0.95,
            },
        }]
        : [
            {
                id: `fifteen-min-poi-${id}-fill`,
                type: "fill",
                "source-layer": style.sourceLayer,
                minzoom: POI_MIN_ZOOM,
                paint: { "fill-color": style.color, "fill-opacity": 0.45 },
            },
            {
                id: `fifteen-min-poi-${id}-outline`,
                type: "line",
                "source-layer": style.sourceLayer,
                minzoom: POI_MIN_ZOOM,
                paint: { "line-color": style.color, "line-width": 1.2 },
            },
        ];
    return option(name, name, CATEGORY_FIELDS[id].label, layers, [
        { name: "name", labels: { en: "Name", de: "Name" } },
        { name: "category", labels: { en: "Category", de: "Kategorie" } },
        { name: "subtype", labels: { en: "Type", de: "Art" } },
    ], true);
}

function bundle(styles: MapLayerStyleOption[]): LocalStylingBundle {
    const defaultStyle = styles.find((style) => style.isDefault) ?? styles[0];
    return { styles, defaultStyleId: defaultStyle.id };
}

/**
 * The local styling of one 15-Minute City Explore entry, or `undefined` for an unknown key.
 * Entry keys are those of `config/urbanStories/fifteenMinute.ts`.
 */
export function resolveFifteenMinuteStyling(
    entryKey: string,
    gap: GapFilterSelection = NO_GAP_FILTER
): LocalStylingBundle | undefined {
    if (entryKey === ENTRY_BUILDINGS) return bundle(buildingStyleOptions(gap));
    if (entryKey === "stadtteile-15min") return bundle(adminOptions("stadtteile"));
    if (entryKey === "bezirke-15min") return bundle(adminOptions("bezirke"));
    const category = FIFTEEN_MINUTE_CATEGORY_IDS.find((id) => CATEGORY_FIELDS[id].poiEntryKey === entryKey);
    return category === undefined ? undefined : bundle([poiOption(category)]);
}

/** The style option id that shows `metricName` under the given gap filter. */
export function buildingStyleOptionId(styleName: string, gap: GapFilterSelection): string {
    return `${styleName}${gapSignature(gap)}`;
}
export * from "./buildingProfile";

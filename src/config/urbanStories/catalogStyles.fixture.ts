/**
 * Catalog style facts recorded on 2026-10-11 (read-only GET of `…/styles` and `…/styles/{id}`).
 * Used by `catalogStyles.contract.test.ts` to check every configured `styleName`.
 * Re-record this file when the GeoServer team changes the styles; do not edit it by hand.
 */
export interface RecordedCatalogStyle {
    id: string;
    name: string;
    qualifiedName: string;
    format: "mbstyle";
    /** `metadata["tosca:metric"]` of the style document. */
    metric: string;
    /** `source-layer` of its single style layer (= the published layer name it renders on). */
    sourceLayer: string;
    /** `metadata["tosca:transform"]`, when the style does not show the raw attribute. */
    transform?: string;
    hasMinzoom: boolean;
    /** Assigned as default or alternate of any layer at recording time. */
    assignedToLayer: boolean;
}

export const CATALOG_STYLES_RECORDED_ON = "2026-10-11";

export const RECORDED_URBAN_STORY_STYLES: readonly RecordedCatalogStyle[] = [
    {
        id: "01a12bb2-bf36-7233-b057-bcef041fc91c",
        name: "urbanstories-15-minute-city",
        qualifiedName: "HAMBURG-BUILDINGS:urbanstories-15-minute-city",
        format: "mbstyle",
        metric: "score_15min_decay",
        sourceLayer: "hamburg_buildings",
        hasMinzoom: false,
        assignedToLayer: false,
    },
    {
        id: "01a12bb2-c01b-75d8-ad14-248c6670441b",
        name: "urbanstories-15-minute-city-areas",
        qualifiedName: "HAMBURG-ADMINISTRATIVE:urbanstories-15-minute-city-areas",
        format: "mbstyle",
        metric: "m15_decay_mean",
        sourceLayer: "hamburg_bezirke",
        hasMinzoom: false,
        assignedToLayer: false,
    },
    {
        id: "01a12bb2-c06b-7642-83d1-43378d8c1cf0",
        name: "urbanstories-green-access",
        qualifiedName: "HAMBURG-ADMINISTRATIVE:urbanstories-green-access",
        format: "mbstyle",
        metric: "grn_mean",
        sourceLayer: "hamburg_stadtteile",
        hasMinzoom: false,
        assignedToLayer: false,
    },
    {
        id: "01a12bb2-c0c7-75f6-8618-8af7e2e577f7",
        name: "urbanstories-public-transport-equity",
        qualifiedName: "HAMBURG-ADMINISTRATIVE:urbanstories-public-transport-equity",
        format: "mbstyle",
        metric: "pt_in_catchment_share",
        sourceLayer: "hamburg_statistical_units",
        hasMinzoom: false,
        assignedToLayer: false,
    },
    {
        id: "01a12bb2-bf91-77c1-99dc-c39b2579282e",
        name: "urbanstories-walkability",
        qualifiedName: "HAMBURG-MOBILITY:urbanstories-walkability",
        format: "mbstyle",
        metric: "comfort_score",
        sourceLayer: "hamburg_mobility",
        hasMinzoom: false,
        assignedToLayer: false,
    },
    {
        id: "01a12bb2-bfe3-75dc-9b6f-c892b8ea455f",
        name: "urbanstories-safety-deficit",
        qualifiedName: "HAMBURG-MOBILITY:urbanstories-safety-deficit",
        format: "mbstyle",
        metric: "safety_index",
        sourceLayer: "hamburg_mobility",
        transform: "100 - safety_index",
        hasMinzoom: false,
        assignedToLayer: false,
    },
    {
        id: "01a12bb2-c11a-7160-aef5-0ec4ef3beff6",
        name: "urbanstories-green-inventory",
        qualifiedName: "HAMBURG-GREEN-SPACES:urbanstories-green-inventory",
        format: "mbstyle",
        metric: "reported_area_ha",
        sourceLayer: "hamburg_green_areas",
        hasMinzoom: false,
        assignedToLayer: false,
    },
];

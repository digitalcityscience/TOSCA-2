/**
 * Configuration contract for the Urban Stories panel (architecture plan §6, Revision 3).
 * Pure data types: nothing here talks to the map, the catalog or the backend.
 */

export interface Localized {
    en: string;
    de: string;
}

export const URBAN_STORY_KEYS = [
    "fifteen-minute",
    "walkability-safety",
    "building-walking",
    "transit-equity",
    "green-spaces",
] as const;

export type UrbanStoryKey = typeof URBAN_STORY_KEYS[number];

/** Static floor of an entry's readiness. The runtime probe (UST-05) may only downgrade it. */
export type Readiness =
    | "unavailable"   // no publication planned / data missing
    | "planned"       // named in a plan, not yet verified in the catalog
    | "published"     // present in the catalog
    | "verified";     // published + styles + attributes checked

/** MVT availability recorded by the UST-00 verification. */
export type MvtStatus = "verified" | "pending" | "unavailable";

/** The only rendering path: catalog → WMTS/MVT → mapStore (decision F1, WMS excluded). */
export type UrbanStoryRendering = "vector-tiles";

export type ExploreGroup = "building" | "street" | "admin" | "poi" | "green";

export type ExploreGeometry = "polygon" | "line" | "point";

export interface CatalogLayerRef {
    providerId: string;
    /** GeoServer workspace. */
    workspace: string;
    /** GeoServer feature type name (not the table name). */
    layerName: string;
}

/** One published GeoServer layer, as verified by UST-00. Defined once in `layers.ts`. */
export interface UrbanStoryLayer {
    ref: CatalogLayerRef;
    geometry: ExploreGeometry;
    rendering: UrbanStoryRendering;
    mvt: MvtStatus;
    /** Tile weight requires a zoom floor (buildings, mobility, green features). */
    heavy: boolean;
    /** Zoom floor from the UST-00 tile measurements. */
    minZoom?: number;
    source: {
        dataset: string;
        release: string;
        /** Relative to `SUMO-15/geoStories/`. */
        metadataPath: string;
    };
}

export interface MetricOption {
    /** Stable id, e.g. "score_15min_decay". */
    key: string;
    label: Localized;
    /** Actual column in the published layer. */
    attribute: string;
    /**
     * Catalog style that visualises this metric. Stays null until the style is verified in
     * the catalog (UST-05/UST-10). Names are never guessed.
     */
    styleName: string | null;
    /** ISO date of the UST-00 check that verified `styleName`. Required when `styleName` is set. */
    styleVerifiedOn?: string;
    unit?: Localized;
    nullMeaning?: Localized;
    caveats?: Localized[];
}

export interface ExploreEntry {
    key: string;
    title: Localized;
    group: ExploreGroup;
    geometry: ExploreGeometry;
    layer: CatalogLayerRef;
    rendering: UrbanStoryRendering;
    mvt: MvtStatus;
    /** Empty = the layer's single default style. */
    metrics: MetricOption[];
    defaultMetric?: string;
    /** Must match the style's minzoom. Required on heavy layers. */
    minZoom?: number;
    maxZoom?: number;
    /** Attributes probed against the published feature type (UST-05). */
    requiredAttributes: string[];
    source: UrbanStoryLayer["source"];
    caveats?: Localized[];
    readiness: Readiness;
    knownAvailability?: "temporarily-unavailable";
    /**
     * `frontend`: the thematic style is built locally (`styles/`), no catalog style is fetched or applied,
     * and the catalog is asked only for the layer detail (the tile endpoint). Metric `styleName`s are then
     * local style names, never catalog styles. Absent = the catalog style path.
     */
    styleSource?: "frontend";
}

/**
 * What the user can do on the map in a chapter of a story with interactive chapters (15-Minute City).
 * `overall`: building score only. `category`: pick one of the nine categories. `building`: select and
 * inspect a building. `neighbourhoods`: building-to-area transition. `gaps`: low-score filter + category.
 */
export type ChapterInteraction = "overall" | "category" | "building" | "neighbourhoods" | "gaps";

/** An Explore entry a chapter puts on the map when it becomes active. */
export interface ChapterLayer {
    /** `ExploreEntry.key` of the same story. */
    entryKey: string;
    /** `MetricOption.key` of that entry; omitted = the entry's default style. */
    metricKey?: string;
}

/**
 * One step of a story. Chapters are frontend-defined: a run needs no backend GeoStory.
 *
 * @remarks
 * Every field except `chapterKey`, `title` and `relatedExploreEntries` is optional, so a chapter
 * without `camera`, `narrative` and `show` is a title that prioritises its related Explore entries.
 */
export interface StoryChapter {
    /** Stable, e.g. "parks-within-reach". */
    chapterKey: string;
    title: Localized;
    /** Plain-text narrative shown under the title. */
    narrative?: Localized;
    /** Where the map goes when the chapter becomes active; omitted = the camera stays. */
    camera?: OverviewCamera;
    /** Explore entries added (if needed) and made visible on activation. Never removed again by the run. */
    show?: ChapterLayer[];
    /**
     * Only read when `UrbanStoryConfig.geostory.id` is set: pairs the chapter with a scene of that
     * optional backend GeoStory by id, otherwise by order.
     */
    scene: { id: string | null; order: number };
    /** ExploreEntry.key values of the same story. */
    relatedExploreEntries: string[];
    /** Map interaction the story panel offers while the chapter is active. Absent = none. */
    interaction?: ChapterInteraction;
}

export interface OverviewCamera {
    center: [number, number];
    zoom: number;
    bearing?: number;
    pitch?: number;
}

export interface UrbanStoryConfig {
    key: UrbanStoryKey;
    title: Localized;
    intro: Localized;
    caveats: Localized[];
    /**
     * Optional backend GeoStory UUID. `null` (the default) runs the story from `chapters`; when set,
     * the run plays that published GeoStory through the existing scene engine instead.
     */
    geostory: { id: string | null; campaignId?: string };
    overviewCamera: OverviewCamera;
    explore: ExploreEntry[];
    chapters: StoryChapter[];
}

export type RuntimeReadiness =
    | "available"
    | "unstyled"
    | "metric-style-pending"
    | "attributes-missing"
    | "temporarily-unavailable"
    | "error"
    | "tiles-unavailable";

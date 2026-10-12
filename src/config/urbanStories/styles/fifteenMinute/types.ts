import type { MapLayerStyleOption } from "@store/map";
import type { Localized } from "../../types";

/**
 * Types of the frontend-owned Urban Story styling shared by the 15-Minute City and the walkability stories.
 *
 * @remarks
 * Nothing here is fetched from GeoServer: every style, expression, filter and legend of these stories is built
 * from constants. GeoServer only supplies geometries, tiles and attributes.
 */

export interface LegendItem {
    color: string;
    label: Localized;
    /** The attribute value (or lower class limit) the colour stands for; absent for the no-data row. */
    value?: number;
}

export interface LegendSpec {
    /** Same string as the local style name the legend belongs to. */
    styleName: string;
    title: Localized;
    kind: "classes" | "gradient" | "ramp";
    /** Captions under the two ends of a `ramp`. */
    rampEnds?: { low: Localized; high: Localized };
    items: LegendItem[];
    /** Colour of buildings or areas without a value, when the style draws them. */
    noData: LegendItem;
    note?: Localized;
    /** What the legend counts, one row per category: name and what it contains. */
    categories?: { label: Localized; description: Localized }[];
    categoriesTitle?: Localized;
}

/** A locally built set of styles for one catalog layer, in the shape the layer loader already accepts. */
export interface LocalStylingBundle {
    styles: MapLayerStyleOption[];
    defaultStyleId: string;
}

/** Every local style name of the 15-Minute City story starts with this, so catalog styles can never be mistaken for them. */
export const FRONTEND_STYLE_PREFIX = "frontend:15min:";

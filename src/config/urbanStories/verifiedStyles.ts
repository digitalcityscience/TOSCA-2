import { URBAN_STORY_LAYERS, type UrbanStoryLayerId } from "./layers";
import type { ExploreEntry, MetricOption } from "./types";

/**
 * Metric → catalog style associations that were verified against the live catalog.
 *
 * @remarks
 * Source of truth: each style document declares its metric (`metadata["tosca:metric"]`) and its
 * layer (`source-layer`). A row exists only where both match one configured metric of one
 * published layer. Admin metrics that several layers share (for example `grn_mean`) get a style
 * only on the layer the style document names, because the document cannot render on the others.
 * Not listed on purpose: `urbanstories-15-minute-city` and `urbanstories-15-minute-city-areas` (the 15-Minute City
 * story owns its styling in the frontend, `styles/fifteenMinute`, and applies no catalog style; they stay recorded
 * in `catalogStyles.fixture.ts` as catalog evidence only), `urbanstories-public-transport-equity` (Public Transport Equity
 * owns its styling in the frontend, `styles/transitEquity`; recorded as evidence only), `urbanstories-walkability` (Walkability now also owns its styles locally), `urbanstories-safety-deficit` (shows `100 - safety_index`, not the
 * index) and `urbanstories-green-inventory` (no configured metric, other layer name).
 * `catalogStyles.fixture.ts` records the evidence and `catalogStyles.contract.test.ts` checks it.
 */
export const STYLE_VERIFIED_ON = "2026-10-11";

export interface VerifiedMetricStyle {
    layer: UrbanStoryLayerId;
    attribute: string;
    styleName: string;
}

export const VERIFIED_METRIC_STYLES: readonly VerifiedMetricStyle[] = [
    { layer: "stadtteile", attribute: "grn_mean", styleName: "urbanstories-green-access" },
];

function verifiedStyleFor(entry: ExploreEntry, option: MetricOption): VerifiedMetricStyle | undefined {
    return VERIFIED_METRIC_STYLES.find((candidate) => {
        const { ref } = URBAN_STORY_LAYERS[candidate.layer];
        return ref.workspace === entry.layer.workspace
            && ref.layerName === entry.layer.layerName
            && candidate.attribute === option.attribute;
    });
}

/** Return the entries with `styleName` and `styleVerifiedOn` set where a verified association exists. */
export function withVerifiedStyles(entries: ExploreEntry[]): ExploreEntry[] {
    return entries.map((entry) => ({
        ...entry,
        metrics: entry.metrics.map((option) => {
            const verified = verifiedStyleFor(entry, option);
            return verified === undefined
                ? option
                : { ...option, styleName: verified.styleName, styleVerifiedOn: STYLE_VERIFIED_ON };
        }),
    }));
}

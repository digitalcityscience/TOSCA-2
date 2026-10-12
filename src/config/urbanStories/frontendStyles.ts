import { NO_GAP_FILTER, resolveFifteenMinuteStyling, type GapFilterSelection, type LocalStylingBundle } from "./styles/fifteenMinute";
import type { ExploreEntry } from "./types";
import { resolveWalkabilityStyling } from "./styles/walkabilitySafety";

/**
 * Local (frontend-owned) styling of Explore entries marked `styleSource: "frontend"`.
 * Returns `undefined` for catalog-styled entries, which keep using the catalog styles.
 */
export function frontendStylingFor(entry: ExploreEntry, gap: GapFilterSelection = NO_GAP_FILTER): LocalStylingBundle | undefined {
    return entry.styleSource === "frontend"
        ? resolveWalkabilityStyling(entry.key) ?? resolveFifteenMinuteStyling(entry.key, gap)
        : undefined;
}

export function isFrontendStyled(entry: ExploreEntry): boolean {
    return entry.styleSource === "frontend";
}

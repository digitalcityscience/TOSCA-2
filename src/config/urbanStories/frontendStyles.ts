import { resolveFifteenMinuteStyling, type LocalStylingBundle } from "./styles/fifteenMinute";
import type { ExploreEntry } from "./types";
import { resolveEquityStyling } from "./styles/transitEquity";
import { resolveWalkabilityStyling } from "./styles/walkabilitySafety";

/**
 * Local (frontend-owned) styling of Explore entries marked `styleSource: "frontend"`.
 * Returns `undefined` for catalog-styled entries, which keep using the catalog styles.
 */
export function frontendStylingFor(entry: ExploreEntry): LocalStylingBundle | undefined {
    return entry.styleSource === "frontend"
        ? resolveWalkabilityStyling(entry.key) ?? resolveEquityStyling(entry.key) ?? resolveFifteenMinuteStyling(entry.key)
        : undefined;
}

export function isFrontendStyled(entry: ExploreEntry): boolean {
    return entry.styleSource === "frontend";
}

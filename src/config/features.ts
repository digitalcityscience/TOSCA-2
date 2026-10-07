/**
 * Deployment-level feature switches. Set VITE_ENABLED_FEATURES at build time to a
 * comma-separated list of feature ids; leaving it unset enables every feature.
 */
export const FEATURE_IDS = ["datastores", "events", "geostories"] as const;

export type FeatureId = typeof FEATURE_IDS[number];

function isFeatureId(value: string): value is FeatureId {
    return (FEATURE_IDS as readonly string[]).includes(value);
}

export function resolveEnabledFeatures(
    environment: Record<string, string | undefined>
): ReadonlySet<FeatureId> {
    const raw = environment.VITE_ENABLED_FEATURES?.trim();
    if (raw === undefined || raw.length === 0) return new Set(FEATURE_IDS);
    const requested = raw.split(",").map((value) => value.trim()).filter((value) => value.length > 0);
    const unknown = requested.filter((value) => !isFeatureId(value));
    if (unknown.length > 0) {
        throw new Error(
            `Unknown feature(s) in VITE_ENABLED_FEATURES: ${unknown.join(", ")}. Expected: ${FEATURE_IDS.join(", ")}`
        );
    }
    return new Set(requested.filter(isFeatureId));
}

export const enabledFeatures = resolveEnabledFeatures(import.meta.env);

export function isFeatureEnabled(id: FeatureId): boolean {
    return enabledFeatures.has(id);
}

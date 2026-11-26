import { pickConfig } from "../core/config";

/**
 * Deployment-level branding. Set VITE_APP_BRAND_NAME in the deployment to change the
 * name shown in the app header; leaving it unset keeps the default.
 */
export const DEFAULT_BRAND_NAME = "TOSCA";

export function resolveBrandName(environment: Record<string, string | undefined>): string {
    const value = environment.VITE_APP_BRAND_NAME?.trim();
    return value === undefined || value.length === 0 ? DEFAULT_BRAND_NAME : value;
}

export const brandName = resolveBrandName(pickConfig("VITE_APP_BRAND_NAME"));

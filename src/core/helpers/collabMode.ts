/**
 * Whether the Collab (tangible table) module is enabled for this build.
 * Driven by the build-time `VITE_COLLAB_MODE` flag (see `.env.collab`) so the
 * normal build and the table build share one codebase with no second Vite entry.
 */
export function isCollabModeEnabled(): boolean {
    return import.meta.env.VITE_COLLAB_MODE === "true"
}

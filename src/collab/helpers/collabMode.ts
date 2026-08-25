/**
 * Whether the Collab (tangible table) module is enabled for this build.
 * Driven by the build-time `VITE_COLLAB_MODE` flag (see `.env.collab`) so the
 * normal build and the table build share one codebase with no second Vite entry.
 */
export function isCollabModeEnabled(): boolean {
    return import.meta.env.VITE_COLLAB_MODE === "true"
}

/**
 * The tracking host's WebSocket URL (`ws://<table-host>:8053`, `server.py --client web`,
 * plan §5a/§14, ticket 09), driven by `VITE_COLLAB_TRACKING_WS_URL`. `undefined` when unset —
 * callers fall back to `MockTrackingSource` (no real table configured, e.g. normal dev).
 */
export function resolveCollabTrackingWsUrl(): string | undefined {
    const raw = String(import.meta.env.VITE_COLLAB_TRACKING_WS_URL ?? "").trim()
    return raw === "" ? undefined : raw
}

export type CollabTrackingMode = "mock" | "real"

/**
 * Explicit `TrackingSource` switch (ticket 03), driven by `VITE_COLLAB_TRACKING_MODE`. `"mock"`
 * is the only value that opts in to forcing `MockTrackingSource` — every other value, including
 * unset, resolves to `"real"` so a bare `VITE_COLLAB_TRACKING_WS_URL` keeps behaving as it did
 * before this switch existed (callers still fall back to mock when that URL is absent). This
 * makes the no-hardware dev path (`.env.collab.mock`) an intentional opt-in rather than something
 * that happens only by omitting the URL.
 */
export function resolveCollabTrackingMode(): CollabTrackingMode {
    const raw = String(import.meta.env.VITE_COLLAB_TRACKING_MODE ?? "").trim().toLowerCase()
    return raw === "mock" ? "mock" : "real"
}

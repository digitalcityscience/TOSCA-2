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

/**
 * Whether this build is actually wired to a real Python transport (ticket 09: "the real-table
 * route") — the explicit tracking-mode switch resolves to `"real"` AND a WS URL is configured.
 * Mirrors the exact condition `collabTrackingRender`'s transport wiring already uses, as a single
 * static source of truth both windows can read: Control's own `pythonConnectionState` only starts
 * reflecting "real" once its transport has actually been wired up on mount, and the Table window
 * never owns a transport at all (ticket 11), so neither can serve as this check on its own.
 */
export function isRealTableRoute(): boolean {
    return resolveCollabTrackingMode() === "real" && resolveCollabTrackingWsUrl() !== undefined
}

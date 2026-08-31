// TEMPORARY — live AOI/marker-size diagnostic session. Safe to delete once resolved.
// Mirrors console.log lines to a local relay (localhost:8091) so both the Control and Table
// windows' debug output lands in one grep-able file, regardless of which physical monitor
// each window is on.
export function collabDebugLog(windowKind: "control" | "table", tag: string, data: unknown): void {
    // eslint-disable-next-line no-console
    console.log(`[COLLAB-DBG:${windowKind}:${tag}]`, data)
    try {
        void fetch("http://localhost:8091/log", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ window: windowKind, tag, data }),
        }).catch(() => {})
    } catch {
        // best-effort only
    }
}

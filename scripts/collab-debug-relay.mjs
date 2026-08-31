// TEMPORARY — live AOI/marker-size diagnostic session (2026-08-31). Safe to delete once resolved.
//
// Standalone relay for `collabDebugLog()` (src/collab/helpers/collabDebugLog.ts): both the
// Control and Table browser windows POST here so their logs land in one place regardless of
// which physical monitor/machine each window runs on. Zero dependencies — plain Node `http`.
//
// Usage:  node scripts/collab-debug-relay.mjs
// Then trigger the bug (confirm AOI #1, wait for Table to present, confirm AOI #2) and read
// the console output live, or open `collab-debug-log.ndjson` afterwards for the full trace.
//
// CORS note: the Vite dev server (localhost:5173 or similar) and this relay (localhost:8091)
// are different origins, so the browser preflights the POST with OPTIONS. Without the
// Access-Control-Allow-* headers below, every collabDebugLog() call fails silently (its fetch
// has a bare `.catch(() => {})`) and this relay would sit there looking like it works while
// receiving nothing.

import { createServer } from "node:http";
import { appendFile } from "node:fs/promises";

const PORT = 8091;
const LOG_FILE = new URL("../collab-debug-log.ndjson", import.meta.url);

/** Tracks the most recent AOI checksum seen per window, purely to print a "NEW AOI" separator
 * in the live console output — makes it visually obvious where AOI #1's log lines end and
 * AOI #2's begin without waiting to read the ndjson file afterwards. */
const lastAoiChecksumByWindow = new Map();

function aoiChecksumFromPayload(payload) {
    const aoi = payload?.data?.aoi;
    if (aoi?.corners === undefined) {
        return undefined;
    }
    return JSON.stringify(aoi.corners);
}

function corsHeaders() {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };
}

const server = createServer((req, res) => {
    if (req.method === "OPTIONS") {
        res.writeHead(204, corsHeaders());
        res.end();
        return;
    }

    if (req.method !== "POST" || req.url !== "/log") {
        res.writeHead(404, corsHeaders());
        res.end();
        return;
    }

    let body = "";
    req.on("data", (chunk) => {
        body += chunk;
    });
    req.on("end", () => {
        const receivedAt = new Date().toISOString();
        res.writeHead(204, corsHeaders());
        res.end();

        let payload;
        try {
            payload = JSON.parse(body);
        } catch {
            console.error(`[relay] failed to parse body: ${body}`);
            return;
        }

        const { window: windowKind, tag, data } = payload;
        const checksum = aoiChecksumFromPayload(payload);
        if (checksum !== undefined && lastAoiChecksumByWindow.get(windowKind) !== checksum) {
            lastAoiChecksumByWindow.set(windowKind, checksum);
            console.log(`\n=== [${windowKind}] NEW AOI observed (checksum ${checksum.slice(0, 40)}...) ===`);
        }

        console.log(`[${receivedAt}] [${windowKind}:${tag}]`, JSON.stringify(data));
        void appendFile(LOG_FILE, JSON.stringify({ receivedAt, window: windowKind, tag, data }) + "\n").catch((error) => {
            console.error("[relay] failed to write to log file:", error);
        });
    });
});

server.listen(PORT, () => {
    console.log(`[relay] collab-debug-relay listening on http://localhost:${PORT}/log`);
    console.log(`[relay] appending full trace to ${LOG_FILE.pathname}`);
    console.log("[relay] trigger the bug now: confirm AOI #1, let Table present, then confirm AOI #2.");
});

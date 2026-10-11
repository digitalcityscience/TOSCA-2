import type { ReplayData } from "./simulationReplay";

export type ReplayLoaderRequest = { type: "load"; url: string };
export type ReplayLoaderResponse =
    | { type: "progress"; loadedBytes: number }
    | { type: "done"; data: ReplayData }
    | { type: "error"; message: string; status?: number };

/** HTTP failures keep their status, so callers can refresh an expired URL on 403. */
export class ReplayLoadError extends Error {
    constructor(message: string, readonly status?: number) {
        super(message);
    }
}

/**
 * Download and flatten a replay bundle in a worker. The storage serves it
 * with `Content-Encoding: gzip`, so the worker receives plain JSON;
 * `loadedBytes` therefore counts decompressed bytes.
 */
export async function loadSimulationReplay(
    url: string,
    { signal, onProgress }: { signal?: AbortSignal; onProgress?: (loadedBytes: number) => void } = {}
): Promise<ReplayData> {
    if (signal?.aborted === true) throw new DOMException("Aborted", "AbortError");
    const worker = new Worker(new URL("../workers/simulationReplay.worker.ts", import.meta.url), { type: "module" });
    try {
        return await new Promise<ReplayData>((resolve, reject) => {
            const onAbort = (): void => reject(new DOMException("Aborted", "AbortError"));
            signal?.addEventListener("abort", onAbort, { once: true });
            worker.onerror = (event) => {
                signal?.removeEventListener("abort", onAbort);
                reject(new ReplayLoadError(event.message || "Replay worker failed"));
            };
            worker.onmessage = (event: MessageEvent<ReplayLoaderResponse>) => {
                const message = event.data;
                if (message.type === "progress") {
                    onProgress?.(message.loadedBytes);
                    return;
                }
                signal?.removeEventListener("abort", onAbort);
                if (message.type === "done") resolve(message.data);
                else reject(new ReplayLoadError(message.message, message.status));
            };
            worker.postMessage({ type: "load", url } satisfies ReplayLoaderRequest);
        });
    } finally {
        worker.terminate();
    }
}

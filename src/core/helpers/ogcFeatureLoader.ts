import type { DeckGeoJsonChunk } from "./deckGeoJsonChunk";

export type OgcLoaderRequest =
    | { type: "load", firstPageUrl: string, concurrency: number, maxFeatures?: number }
    | { type: "cancel" };

export type OgcLoaderResponse =
    | { type: "meta", total?: number }
    | { type: "chunk", chunk: DeckGeoJsonChunk, loaded: number }
    | { type: "done" }
    | { type: "error", message: string, status?: number };

export class OgcLoadError extends Error {
    constructor(message: string, readonly status?: number) {
        super(message);
        this.name = "OgcLoadError";
    }
}

export interface LoadAllOgcFeaturesOptions {
    /** URL of the first `items` page, including filter/properties and `limit`. */
    firstPageUrl: string;
    concurrency?: number;
    /** Stop after emitting this many features, even when more pages exist. */
    maxFeatures?: number;
    signal?: AbortSignal;
    onTotal?: (total: number | undefined) => void;
    onChunk: (chunk: DeckGeoJsonChunk, loaded: number) => void;
}

export const OGC_LOAD_ALL_CONCURRENCY = 6;

/**
 * Streams every feature of an OGC API query through a dedicated worker.
 * Resolves when all pages arrived; rejects with OgcLoadError on failure and
 * with an AbortError when `signal` aborts. The worker is always terminated.
 */
export async function loadAllOgcFeatures(options: LoadAllOgcFeaturesOptions): Promise<void> {
    const { firstPageUrl, concurrency = OGC_LOAD_ALL_CONCURRENCY, maxFeatures, signal, onTotal, onChunk } = options;
    if (signal?.aborted === true) throw new DOMException("Aborted", "AbortError");
    const worker = new Worker(new URL("../workers/ogcFeatureLoader.worker.ts", import.meta.url), { type: "module" });
    try {
        await new Promise<void>((resolve, reject) => {
            const onAbort = (): void => {
                worker.postMessage({ type: "cancel" } satisfies OgcLoaderRequest);
                reject(new DOMException("Aborted", "AbortError"));
            };
            signal?.addEventListener("abort", onAbort, { once: true });
            worker.onerror = (event) => {
                signal?.removeEventListener("abort", onAbort);
                reject(new OgcLoadError(event.message || "Feature loader worker failed"));
            };
            worker.onmessage = (event: MessageEvent<OgcLoaderResponse>) => {
                const message = event.data;
                if (message.type === "meta") onTotal?.(message.total);
                else if (message.type === "chunk") onChunk(message.chunk, message.loaded);
                else {
                    signal?.removeEventListener("abort", onAbort);
                    if (message.type === "done") resolve();
                    else reject(new OgcLoadError(message.message, message.status));
                }
            };
            worker.postMessage({ type: "load", firstPageUrl, concurrency, maxFeatures } satisfies OgcLoaderRequest);
        });
    } finally {
        worker.terminate();
    }
}

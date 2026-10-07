/**
 * Loads every page of an OGC API Features query off the main thread.
 *
 * Pages are fetched with limited concurrency (when the server pages by
 * offset), parsed here, converted to deck.gl's binary layout and transferred
 * to the page chunk by chunk, so a 260k-polygon collection never exists as
 * GeoJSON objects on the main thread.
 */
import { chunkTransferables, featuresToDeckChunk } from "../helpers/deckGeoJsonChunk";
import { isSameOrigin, nextPageLink, remainingPageUrls, type OgcLinkLike } from "../helpers/ogcPaging";
import type { OgcLoaderRequest, OgcLoaderResponse } from "../helpers/ogcFeatureLoader";

interface WorkerScope {
    postMessage: (message: OgcLoaderResponse, transfer?: Transferable[]) => void;
    onmessage: ((event: MessageEvent<OgcLoaderRequest>) => void) | null;
}

interface ItemsPage {
    features?: GeoJSON.Feature[];
    numberMatched?: number;
    links?: OgcLinkLike[];
}

const scope = self as unknown as WorkerScope;
let controller: AbortController | undefined;

class PageRequestError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
    }
}

async function fetchPage(url: string, signal: AbortSignal): Promise<ItemsPage> {
    const response = await fetch(url, {
        headers: { Accept: "application/geo+json, application/json" },
        signal,
    });
    if (!response.ok) {
        throw new PageRequestError(`Features request failed (${response.status} ${response.statusText})`, response.status);
    }
    return await response.json() as ItemsPage;
}

function emitPage(page: ItemsPage, progress: { loaded: number }, maxFeatures?: number): boolean {
    const remaining = maxFeatures === undefined ? undefined : Math.max(0, maxFeatures - progress.loaded);
    const features = remaining === undefined ? (page.features ?? []) : (page.features ?? []).slice(0, remaining);
    if (features.length === 0) return maxFeatures !== undefined && progress.loaded >= maxFeatures;
    const chunk = featuresToDeckChunk(features);
    progress.loaded += features.length;
    scope.postMessage({ type: "chunk", chunk, loaded: progress.loaded }, chunkTransferables(chunk));
    return maxFeatures !== undefined && progress.loaded >= maxFeatures;
}

async function load(request: OgcLoaderRequest & { type: "load" }, signal: AbortSignal): Promise<void> {
    const progress = { loaded: 0 };
    const first = await fetchPage(request.firstPageUrl, signal);
    const total = typeof first.numberMatched === "number" ? first.numberMatched : undefined;
    scope.postMessage({ type: "meta", total });
    if (emitPage(first, progress, request.maxFeatures)) return;

    const pageSize = first.features?.length ?? 0;
    let next = nextPageLink(first.links);
    if (next === undefined || pageSize === 0) return;
    if (!isSameOrigin(next, request.firstPageUrl)) throw new Error(`Refusing to follow paging link to another origin: ${next}`);

    const loadTotal = total === undefined || request.maxFeatures === undefined
        ? total
        : Math.min(total, request.maxFeatures);
    const urls = loadTotal === undefined ? undefined : remainingPageUrls(next, pageSize, loadTotal);
    if (urls !== undefined) {
        let cursor = 0;
        const runNext = async (): Promise<void> => {
            while (cursor < urls.length && (request.maxFeatures === undefined || progress.loaded < request.maxFeatures)) {
                const url = urls[cursor++];
                emitPage(await fetchPage(url, signal), progress, request.maxFeatures);
            }
        };
        await Promise.all(Array.from({ length: Math.min(request.concurrency, urls.length) }, runNext));
        return;
    }
    // No offset paging: follow `next` links sequentially.
    while (next !== undefined && (request.maxFeatures === undefined || progress.loaded < request.maxFeatures)) {
        const page = await fetchPage(next, signal);
        if ((page.features?.length ?? 0) === 0) return;
        if (emitPage(page, progress, request.maxFeatures)) return;
        next = nextPageLink(page.links);
        if (next !== undefined && !isSameOrigin(next, request.firstPageUrl)) {
            throw new Error(`Refusing to follow paging link to another origin: ${next}`);
        }
    }
}

scope.onmessage = (event) => {
    const request = event.data;
    if (request.type === "cancel") {
        controller?.abort();
        return;
    }
    controller?.abort();
    const current = new AbortController();
    controller = current;
    load(request, current.signal).then(() => {
        if (!current.signal.aborted) scope.postMessage({ type: "done" });
    }).catch((error: unknown) => {
        if (current.signal.aborted) return;
        scope.postMessage({
            type: "error",
            message: error instanceof Error ? error.message : String(error),
            status: error instanceof PageRequestError ? error.status : undefined,
        });
        // Stop the other in-flight page requests of this load.
        current.abort();
    });
};

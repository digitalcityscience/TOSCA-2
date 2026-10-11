/**
 * Downloads a `tosca-trips` replay and flattens it into transferable typed
 * arrays (see helpers/simulationReplay.ts), so parsing about 10 MB of JSON and
 * 300k+ vertices happens off the main thread.
 */
import { flattenTripsBundle, replayTransferables, type TripsBundle } from "../helpers/simulationReplay";
import type { ReplayLoaderRequest, ReplayLoaderResponse } from "../helpers/simulationReplayLoader";

interface WorkerScope {
    postMessage: (message: ReplayLoaderResponse, transfer?: Transferable[]) => void;
    onmessage: ((event: MessageEvent<ReplayLoaderRequest>) => void) | null;
}

const scope = self as unknown as WorkerScope;
const PROGRESS_STEP_BYTES = 512 * 1024;

async function readText(response: Response): Promise<string> {
    if (response.body === null) return await response.text();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    let loaded = 0;
    let reported = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        loaded += value.byteLength;
        text += decoder.decode(value, { stream: true });
        if (loaded - reported >= PROGRESS_STEP_BYTES) {
            reported = loaded;
            scope.postMessage({ type: "progress", loadedBytes: loaded });
        }
    }
    return text + decoder.decode();
}

async function load(url: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
        scope.postMessage({ type: "error", message: `Replay request failed (${response.status})`, status: response.status });
        return;
    }
    const data = flattenTripsBundle(JSON.parse(await readText(response)) as TripsBundle);
    scope.postMessage({ type: "done", data }, replayTransferables(data));
}

scope.onmessage = (event) => {
    if (event.data.type !== "load") return;
    load(event.data.url).catch((error: unknown) => {
        scope.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
    });
};

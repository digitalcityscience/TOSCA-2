import { authSession } from "../../auth/session";

/**
 * Anonymous runs and comparisons this browser started, kept in `localStorage`.
 * They are only readable by id (backend `link` visibility), so their ids must
 * be remembered here to list them again.
 *
 * Runs started while signed in are not stored: they belong to the account
 * (the backend lists them), and their titles must not stay readable on a
 * shared device after logout.
 */

const STORAGE_KEY = "tosca.geosimulations.myRuns.v1";
const MAX_RUNS = 50;

export interface MyRun {
    id: string;
    modelId: string;
    title: string;
    startedAt: string;
    /** Missing in entries from before comparisons: a run. */
    kind?: "run" | "comparison";
}

function read(): MyRun[] {
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
        return Array.isArray(parsed)
            ? parsed.filter((item): item is MyRun => typeof item?.id === "string" && typeof item?.modelId === "string")
            : [];
    } catch {
        return [];
    }
}

function write(runs: MyRun[]): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(runs.slice(0, MAX_RUNS)));
    } catch {
        // Private mode or full storage: the run still opens, it just is not remembered.
    }
}

/** Newest first. */
export function myRuns(modelId?: string): MyRun[] {
    const runs = read();
    return modelId === undefined ? runs : runs.filter((run) => run.modelId === modelId);
}

export function rememberRun(run: MyRun): void {
    if (authSession.status.value === "authenticated") return;
    write([run, ...read().filter((item) => item.id !== run.id)]);
}

export function forgetRun(runId: string): void {
    write(read().filter((item) => item.id !== runId));
}

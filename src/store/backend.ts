import { getConfig } from "../core/config";
import { authFetch } from "../auth/authFetch";
function trimTrailingSlash(value: string): string {
    return value.replace(/\/+$/, "");
}

function normalizeRootUrl(value: string): string {
    const normalized = trimTrailingSlash(value.trim());
    if (normalized === "" || /^https?:\/\//i.test(normalized)) {
        return normalized;
    }
    throw new Error(
        `VITE_BACKEND_ROOT_URL must be an absolute URL including protocol. Received: ${value}`
    );
}

function getConfiguredBackendRootUrl(): string {
    const backendRoot = normalizeRootUrl(String(getConfig("VITE_BACKEND_ROOT_URL") ?? ""));
    if (backendRoot !== "") {
        return backendRoot;
    }

    const geonodeRestUrl = normalizeRootUrl(String(getConfig("VITE_GEONODE_REST_URL") ?? ""));
    if (geonodeRestUrl !== "") {
        return geonodeRestUrl.replace(/\/api$/, "");
    }

    return "";
}

function usesDevelopmentProxy(): boolean {
    return import.meta.env.DEV &&
        import.meta.env.MODE !== "test" &&
        typeof window !== "undefined";
}

export function getBackendRootUrl(): string {
    const configuredRoot = getConfiguredBackendRootUrl();
    if (configuredRoot !== "") {
        return usesDevelopmentProxy()
            ? trimTrailingSlash(window.location.origin)
            : configuredRoot;
    }

    return typeof window === "undefined"
        ? ""
        : trimTrailingSlash(window.location.origin);
}

export function resolveBackendUrl(urlOrPath: string): URL {
    const configuredRoot = getConfiguredBackendRootUrl();
    const resolvedUrl = new URL(
        urlOrPath,
        configuredRoot === "" ? getBackendRootUrl() : configuredRoot
    );

    if (
        usesDevelopmentProxy() &&
        configuredRoot !== "" &&
        resolvedUrl.origin === new URL(configuredRoot).origin
    ) {
        return new URL(
            `${resolvedUrl.pathname}${resolvedUrl.search}${resolvedUrl.hash}`,
            getBackendRootUrl()
        );
    }

    return resolvedUrl;
}

export function resolveBackendMediaUrl(url?: string | null): string | undefined {
    if (url === undefined || url === null || url === "") {
        return undefined;
    }
    return resolveBackendUrl(url).toString();
}

/** A backend answer that was not 2xx; keeps the HTTP status for callers. */
export class BackendRequestError extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = "BackendRequestError";
        this.status = status;
    }
}

/**
 * The backend answers 404 for items the caller may not read (private or
 * draft), the same as for missing ones.
 */
export function isNotFoundError(error: unknown): boolean {
    return error instanceof BackendRequestError && error.status === 404;
}

export async function fetchBackendJson<T>(url: URL, resourceName: string): Promise<T> {
    const response = await authFetch(url, {
        method: "GET",
        redirect: "follow",
        headers: new Headers({
            "Content-Type": "application/json",
        }),
    });

    if (!response.ok) {
        const body = await response.text();
        const message = body === "" ? response.statusText : body;
        throw new BackendRequestError(
            `${resourceName} request failed (${response.status} ${response.statusText}): ${message}`,
            response.status
        );
    }

    return await response.json() as T;
}

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
    const backendRoot = normalizeRootUrl(String(import.meta.env.VITE_BACKEND_ROOT_URL ?? ""));
    if (backendRoot !== "") {
        return backendRoot;
    }

    const geonodeRestUrl = normalizeRootUrl(String(import.meta.env.VITE_GEONODE_REST_URL ?? ""));
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

export async function fetchBackendJson<T>(url: URL, resourceName: string): Promise<T> {
    const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: new Headers({
            "Content-Type": "application/json",
        }),
    });

    if (!response.ok) {
        const body = await response.text();
        const message = body === "" ? response.statusText : body;
        throw new Error(
            `${resourceName} request failed (${response.status} ${response.statusText}): ${message}`
        );
    }

    return await response.json() as T;
}

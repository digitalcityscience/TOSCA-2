import { getBackendRootUrl } from "../store/backend";
import { authSession, type AuthSession } from "./session";

function originOf(url: string | URL | undefined): string | undefined {
    if (url === undefined || url === "") return undefined;
    try {
        const parsed = new URL(url, typeof window === "undefined" ? undefined : window.location.href);
        return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.origin : undefined;
    } catch {
        return undefined;
    }
}

function requestUrl(input: RequestInfo | URL): string {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.toString();
    return input.url;
}

function withBearer(init: RequestInit | undefined, token: string): RequestInit {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return { ...init, headers };
}

/**
 * The hosts that may receive the user's access token: the Django backend and
 * the GeoServer providers it lists. Third-party services (MapTiler, HVV,
 * external OGC/SensorThings catalogs) never get it.
 */
export function createTokenOrigins(initial: () => Array<string | undefined>) {
    const registered = new Set<string>();
    let defaults: Set<string> | undefined;

    function defaultOrigins(): Set<string> {
        defaults ??= new Set(initial().map(originOf).filter((origin): origin is string => origin !== undefined));
        return defaults;
    }

    return {
        register(url: string | URL | undefined): void {
            const origin = originOf(url);
            if (origin !== undefined) registered.add(origin);
        },
        includes(url: string | URL): boolean {
            const origin = originOf(url);
            return origin !== undefined && (registered.has(origin) || defaultOrigins().has(origin));
        },
    };
}

export const tokenOrigins = createTokenOrigins(() => [
    getBackendRootUrl(),
    String(import.meta.env.VITE_BACKEND_ROOT_URL ?? ""),
    String(import.meta.env.VITE_GEOSERVER_BASE_URL ?? ""),
]);

/** Allows a GeoServer provider (from Django's catalog) to receive the access token. */
export function registerTokenOrigin(url: string | URL | undefined): void {
    tokenOrigins.register(url);
}

export function shouldSendToken(url: string | URL): boolean {
    return tokenOrigins.includes(url);
}

function isRepeatable(input: RequestInfo | URL, init: RequestInit): boolean {
    const method = (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    return (method === "GET" || method === "HEAD") && init.body == null;
}

/** How often a read is repeated because the user signed in/out while it ran. */
const MAX_SESSION_RETRIES = 2;

/**
 * `fetch` for the backend and GeoServer:
 * - signs requests with the user's access token (trusted hosts only);
 * - never sends cookies (bearer token only) and never lets the browser's
 *   HTTP cache keep an answer that was given to a signed-in user, so it
 *   cannot be shown again after logout;
 * - on 401 refreshes the token once and retries; when the refresh token is no
 *   longer valid the user is logged out and the request is repeated
 *   anonymously, so public content still loads;
 * - when the user signs in or out while a read is running, the answer belongs
 *   to the old session: it is dropped and the read is repeated for the new one.
 */
export function createAuthFetch(
    session: Pick<AuthSession, "getAccessToken" | "refreshAccessToken" | "currentSessionKey">,
    sendsToken: (url: string) => boolean,
    fetchImpl: typeof fetch = (...args) => fetch(...args)
): typeof fetch {
    async function once(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
        const token = await session.getAccessToken();
        if (token === undefined) return await fetchImpl(input, init);

        const signed = (value: string): RequestInit => ({ ...withBearer(init, value), cache: init.cache ?? "no-store" });
        const response = await fetchImpl(input, signed(token));
        // A consumed stream body cannot be sent twice.
        if (response.status !== 401 || init.body instanceof ReadableStream) return response;

        const refreshed = await session.refreshAccessToken();
        if (refreshed !== undefined) {
            const retried = await fetchImpl(input, signed(refreshed));
            if (retried.status !== 401) return retried;
            // A fresh token is still refused: the server does not accept this
            // client's tokens (audience/issuer config). Keep the session; use
            // the anonymous answer.
            console.warn(`Access token refused by ${originOf(requestUrl(input)) ?? requestUrl(input)}`);
        }
        // refreshAccessToken already logged the user out if the refresh token
        // was refused or expired.
        return await fetchImpl(input, init);
    }

    return async (input: RequestInfo | URL, originalInit?: RequestInit): Promise<Response> => {
        // Third-party requests are passed through untouched.
        if (!sendsToken(requestUrl(input))) {
            return await (originalInit === undefined ? fetchImpl(input) : fetchImpl(input, originalInit));
        }
        // Bearer token only: no cookies (anything set for the same host, e.g.
        // a local WordPress on another localhost port, stays out).
        const init: RequestInit = { ...originalInit, credentials: originalInit?.credentials ?? "omit" };
        const repeatable = isRepeatable(input, init);
        for (let attempt = 0; ; attempt += 1) {
            const sessionKey = session.currentSessionKey();
            const response = await once(input, init);
            if (!repeatable || attempt >= MAX_SESSION_RETRIES || sessionKey === session.currentSessionKey()) {
                return response;
            }
            void response.body?.cancel().catch(() => undefined);
        }
    };
}

export const authFetch: typeof fetch = createAuthFetch(authSession, shouldSendToken);

/** MapLibre `transformRequest`: adds the token to tile, style and sprite requests for trusted hosts. */
export function transformMapRequest(url: string): { url: string; headers?: Record<string, string>; cache?: RequestCache } {
    const token = shouldSendToken(url) ? authSession.getCurrentAccessToken() : undefined;
    // Signed-in answers (possibly private tiles) are not kept in the
    // browser's HTTP cache, so they cannot reappear after logout.
    return token === undefined
        ? { url }
        : { url, cache: "no-store", headers: { Authorization: `Bearer ${token}` } };
}

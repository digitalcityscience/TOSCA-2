import { ErrorResponse, UserManager, type User } from "oidc-client-ts";
import { computed, readonly, ref, shallowRef } from "vue";
import { createUserManagerSettings, readAuthConfig } from "./config";

export type AuthStatus = "disabled" | "initializing" | "anonymous" | "authenticated";
/** Why the signed-in identity changed. Token refreshes are not a change. */
export type SessionChangeReason = "login" | "logout" | "expired";
export type LoginResult = "signed-in" | "cancelled" | "blocked" | "failed";

/** The part of oidc-client-ts' UserManager the session uses (mockable in tests). */
export type SessionUserManager = Pick<
    UserManager,
    "getUser" | "removeUser" | "signinPopup" | "signinSilent" | "events" | "metadataService" | "settings"
>;

export interface UserProfile {
    displayName: string;
    initials: string;
    email?: string;
    username?: string;
    organizations: string[];
}

const LOGIN_HINT_KEY = "tosca-auth-signed-in";
/** Tells the app's other tabs that the user logged out. */
const LOGOUT_CHANNEL = "tosca-auth";

/** The part of BroadcastChannel the session uses (mockable in tests). */
export interface SessionChannel {
    postMessage(message: unknown): void;
    addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
}

function openLogoutChannel(): SessionChannel | undefined {
    try {
        return typeof BroadcastChannel === "undefined" ? undefined : new BroadcastChannel(LOGOUT_CHANNEL);
    } catch {
        return undefined;
    }
}
/** A token this close to expiry is refreshed before it is sent. */
const MIN_TOKEN_VALIDITY_SECONDS = 30;

function decodeJwtPayload(token: string | undefined): Record<string, unknown> | undefined {
    const payload = token?.split(".")[1];
    if (payload === undefined) return undefined;
    try {
        const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
        const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
        const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
        const decoded: unknown = JSON.parse(new TextDecoder().decode(bytes));
        return typeof decoded === "object" && decoded !== null ? decoded as Record<string, unknown> : undefined;
    } catch {
        return undefined;
    }
}

/** Keycloak refresh tokens are JWTs; an expired one cannot be used, so skip the request. */
export function isRefreshTokenExpired(user: User, nowSeconds = Date.now() / 1000): boolean {
    if (!user.refresh_token) return true;
    const exp = decodeJwtPayload(user.refresh_token)?.exp;
    // Offline tokens use exp 0 (no expiry); non-JWT tokens are left to the server.
    return typeof exp === "number" && exp > 0 && exp <= nowSeconds;
}

/** Keycloak's `organization` claim is a list of aliases, one alias, or a map keyed by alias. */
function organizationsFrom(claim: unknown): string[] {
    if (typeof claim === "string" && claim !== "") return [claim];
    if (Array.isArray(claim)) return claim.filter((item): item is string => typeof item === "string" && item !== "");
    if (typeof claim === "object" && claim !== null) return Object.keys(claim);
    return [];
}

export function profileFromUser(user: User): UserProfile {
    const profile = user.profile;
    const accessClaims = decodeJwtPayload(user.access_token) ?? {};
    const fullName = [profile.given_name, profile.family_name]
        .filter((part): part is string => typeof part === "string" && part.trim() !== "")
        .join(" ");
    const email = typeof profile.email === "string" ? profile.email : undefined;
    const username = typeof profile.preferred_username === "string" ? profile.preferred_username : undefined;
    const displayName = fullName || (typeof profile.name === "string" ? profile.name : "") || username || email || "Account";
    const initials = displayName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("");
    const organizations = organizationsFrom(profile.organization ?? accessClaims.organization);
    const defaultOrganization = profile.default_organization ?? accessClaims.default_organization;
    if (typeof defaultOrganization === "string" && defaultOrganization !== "" && !organizations.includes(defaultOrganization)) {
        organizations.unshift(defaultOrganization);
    }
    return { displayName, initials: initials || "?", email, username, organizations };
}

function classifyLoginError(error: unknown): LoginResult {
    const message = error instanceof Error ? error.message : String(error);
    if (/closed/i.test(message)) return "cancelled";
    if (/open(ing)? popup|blocked/i.test(message)) return "blocked";
    return "failed";
}

function storage(): Storage | undefined {
    try {
        return typeof window === "undefined" ? undefined : window.localStorage;
    } catch {
        return undefined;
    }
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve(undefined), milliseconds);
        promise.then(
            (value) => { clearTimeout(timer); resolve(value); },
            (error: unknown) => { clearTimeout(timer); reject(error instanceof Error ? error : new Error(String(error))); }
        );
    });
}

/**
 * The browser's sign-in session: popup login, silent restore, refresh-token
 * renewal and logout, without ever navigating the app away from its page.
 */
export function createAuthSession(
    manager: SessionUserManager | undefined,
    channel?: SessionChannel
) {
    const status = ref<AuthStatus>(manager === undefined ? "disabled" : "initializing");
    const user = shallowRef<User | null>(null);
    const loginPending = ref(false);
    /** Increments whenever the signed-in identity changes; key views on it to refetch. */
    const sessionKey = ref(0);
    const listeners = new Set<(reason: SessionChangeReason) => void>();
    let initPromise: Promise<void> | undefined;
    let refreshPromise: Promise<string | undefined> | undefined;

    function applyUser(next: User | null, reason?: SessionChangeReason): void {
        const previousSubject = user.value?.profile.sub;
        user.value = next;
        if (status.value !== "initializing") {
            status.value = next === null ? "anonymous" : "authenticated";
        }
        if (previousSubject === next?.profile.sub) return;
        sessionKey.value += 1;
        const changeReason = reason ?? (next === null ? "logout" : "login");
        for (const listener of [...listeners]) {
            try {
                listener(changeReason);
            } catch (error) {
                console.error("Session change listener failed", error);
            }
        }
    }

    async function clearSession(reason: SessionChangeReason): Promise<void> {
        storage()?.removeItem(LOGIN_HINT_KEY);
        try {
            await manager?.removeUser();
        } finally {
            applyUser(null, reason);
        }
    }

    /** Logs the user out locally when their refresh token can no longer be used. */
    async function expireSession(): Promise<void> {
        if (user.value === null) return;
        await clearSession("expired");
    }

    function refreshAccessToken(): Promise<string | undefined> {
        const current = user.value;
        if (manager === undefined || current === null) return Promise.resolve(undefined);
        if (isRefreshTokenExpired(current)) {
            return expireSession().then(() => undefined);
        }
        refreshPromise ??= (async () => {
            try {
                // With a refresh token, oidc-client-ts uses the token endpoint (no iframe).
                const renewed = await manager.signinSilent();
                if (renewed === null) {
                    await expireSession();
                    return undefined;
                }
                applyUser(renewed);
                return renewed.access_token;
            } catch (error) {
                // The server refused the refresh token (expired, revoked, session ended).
                if (error instanceof ErrorResponse || isRefreshTokenExpired(current)) {
                    await expireSession();
                } else {
                    console.warn("Refreshing the access token failed", error);
                }
                return undefined;
            } finally {
                refreshPromise = undefined;
            }
        })();
        return refreshPromise;
    }

    async function restoreSession(): Promise<void> {
        if (manager === undefined) return;
        let restored = await manager.getUser();
        if (restored !== null && restored.expired === true) {
            user.value = restored;
            await refreshAccessToken();
            restored = user.value;
        }
        if (restored === null && storage()?.getItem(LOGIN_HINT_KEY) === "1") {
            // A new tab of a signed-in user: ask Keycloak silently (hidden
            // iframe, prompt=none). Anonymous visitors skip this request.
            restored = await manager.signinSilent().catch(() => null);
            if (restored === null) storage()?.removeItem(LOGIN_HINT_KEY);
        }
        if (status.value === "initializing") {
            user.value = restored;
        } else if (restored !== null && user.value === null) {
            // Finished after the start-up timeout: sign the user in now.
            applyUser(restored, "login");
        }
    }

    /**
     * Restores a previous session. Resolves within `timeoutMs` even when
     * Keycloak does not answer, so the public app never waits on it.
     */
    function initialize({ timeoutMs = 4000 } = {}): Promise<void> {
        if (manager === undefined) return Promise.resolve();
        initPromise ??= withTimeout(restoreSession(), timeoutMs)
            .then(() => undefined)
            .catch((error: unknown) => {
                console.warn("Restoring the sign-in session failed", error);
            })
            .finally(() => {
                status.value = user.value === null ? "anonymous" : "authenticated";
            });
        return initPromise;
    }

    /**
     * Opens Keycloak's login page in a popup. Call it directly from a click
     * handler: browsers only allow popups opened during a user gesture.
     */
    async function login(): Promise<LoginResult> {
        if (manager === undefined || loginPending.value) return "failed";
        loginPending.value = true;
        try {
            const signedIn = await manager.signinPopup({
                popupWindowFeatures: { width: 480, height: 680 },
            });
            storage()?.setItem(LOGIN_HINT_KEY, "1");
            applyUser(signedIn, "login");
            return "signed-in";
        } catch (error) {
            const result = classifyLoginError(error);
            if (result === "failed") console.error("Sign-in failed", error);
            return result;
        } finally {
            loginPending.value = false;
        }
    }

    /**
     * Ends the Keycloak session with the refresh token (a form POST, no page
     * change) and forgets the local tokens.
     */
    async function logout(): Promise<void> {
        const current = user.value;
        await clearSession("logout");
        // Each tab keeps its own tokens; log the other tabs out too.
        channel?.postMessage({ type: "logout" });
        if (manager === undefined || !current?.refresh_token) return;
        try {
            const endpoint = await manager.metadataService.getEndSessionEndpoint();
            if (endpoint === undefined) return;
            // A urlencoded POST is a CORS "simple request": Keycloak ends the
            // session even when the response is not readable from this origin.
            await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    client_id: manager.settings.client_id,
                    refresh_token: current.refresh_token,
                }),
            });
        } catch (error) {
            console.warn("Ending the Keycloak session failed", error);
        }
    }

    /** A valid access token, refreshed first when it is about to expire. */
    async function getAccessToken(): Promise<string | undefined> {
        if (initPromise !== undefined) await initPromise;
        const current = user.value;
        if (current === null) return undefined;
        if ((current.expires_in ?? 0) > MIN_TOKEN_VALIDITY_SECONDS) return current.access_token;
        return await refreshAccessToken();
    }

    /** The current access token without waiting, for synchronous hooks such as MapLibre's. */
    function getCurrentAccessToken(): string | undefined {
        const current = user.value;
        return current !== null && current.expired !== true ? current.access_token : undefined;
    }

    function onSessionChange(listener: (reason: SessionChangeReason) => void): () => void {
        listeners.add(listener);
        return () => listeners.delete(listener);
    }

    if (manager !== undefined) {
        // Renewal (and popup sign-in) store a new user.
        manager.events.addUserLoaded((loaded) => {
            if (user.value !== null || status.value === "initializing") applyUser(loaded);
        });
        // Renew ahead of expiry and, as a fallback, at expiry. Both go through
        // refreshAccessToken, so firing together sends one request.
        manager.events.addAccessTokenExpiring(() => void refreshAccessToken());
        manager.events.addAccessTokenExpired(() => void refreshAccessToken());
        channel?.addEventListener("message", (event) => {
            const message = event.data as { type?: unknown } | null;
            if (message?.type === "logout" && user.value !== null) void clearSession("logout");
        });
    }

    /** Changes with every sign-in/out; compare it before and after a request to spot a stale answer. */
    function currentSessionKey(): number {
        return sessionKey.value;
    }

    const accountUrl = computed(() => manager === undefined ? undefined : `${manager.settings.authority}/account`);
    const profile = computed(() => user.value === null ? undefined : profileFromUser(user.value));

    return {
        status: readonly(status),
        isAuthenticated: computed(() => status.value === "authenticated"),
        loginPending: readonly(loginPending),
        sessionKey: readonly(sessionKey),
        profile,
        accountUrl,
        /** Claims useful to check backend/GeoServer configuration (no tokens). */
        diagnostics: computed(() => {
            const claims = decodeJwtPayload(user.value?.access_token) ?? {};
            return {
                status: status.value,
                issuer: claims.iss,
                audience: claims.aud,
                authorizedParty: claims.azp,
                scope: claims.scope,
                organization: claims.organization,
                realmRoles: (claims.realm_access as { roles?: unknown } | undefined)?.roles ?? [],
                accessTokenExpiresIn: user.value?.expires_in,
            };
        }),
        initialize,
        login,
        logout,
        getAccessToken,
        getCurrentAccessToken,
        refreshAccessToken,
        expireSession,
        onSessionChange,
        currentSessionKey,
    };
}

export type AuthSession = ReturnType<typeof createAuthSession>;

const authConfig = typeof window === "undefined" ? undefined : readAuthConfig();

/** The app-wide session. Sign-in is off when the Keycloak settings are missing. */
export const authSession: AuthSession = authConfig === undefined
    ? createAuthSession(undefined)
    : createAuthSession(new UserManager(createUserManagerSettings(authConfig)), openLogoutChannel());

export function useAuth(): AuthSession {
    return authSession;
}

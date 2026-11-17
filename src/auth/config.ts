import { WebStorageStateStore, type UserManagerSettings } from "oidc-client-ts";

/** Public OIDC settings for the browser client. No secrets belong here. */
export interface AuthConfig {
    /** Keycloak realm issuer, e.g. `https://auth.example.org/realms/example-realm`. */
    authority: string;
    clientId: string;
    scope: string;
    /** Static page that finishes popup and silent sign-in (`auth-callback.html`). */
    callbackUrl: string;
}

type AuthEnvironment = Partial<Record<
    "VITE_KEYCLOAK_URL" | "VITE_KEYCLOAK_REALM" | "VITE_KEYCLOAK_CLIENT_ID" | "VITE_KEYCLOAK_SCOPE" | "BASE_URL",
    string | boolean | undefined
>>;

function text(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

/**
 * Reads the Keycloak settings from the build environment. Returns undefined
 * when they are missing, which turns sign-in off: the app keeps working for
 * anonymous visitors instead of failing to start.
 */
export function readAuthConfig(
    environment: AuthEnvironment = import.meta.env as AuthEnvironment,
    origin: string = typeof window === "undefined" ? "http://localhost" : window.location.origin
): AuthConfig | undefined {
    const url = text(environment.VITE_KEYCLOAK_URL).replace(/\/+$/, "");
    const realm = text(environment.VITE_KEYCLOAK_REALM);
    const clientId = text(environment.VITE_KEYCLOAK_CLIENT_ID);
    if (url === "" || realm === "" || clientId === "") {
        return undefined;
    }
    const base = text(environment.BASE_URL) || "/";
    return {
        authority: `${url}/realms/${encodeURIComponent(realm)}`,
        clientId,
        scope: text(environment.VITE_KEYCLOAK_SCOPE) || "openid profile email",
        callbackUrl: new URL(`${base.replace(/\/?$/, "/")}auth-callback.html`, origin).toString(),
    };
}

/** Settings shared by the app and the callback page, so both read the same state store. */
export function createUserManagerSettings(config: AuthConfig): UserManagerSettings {
    return {
        authority: config.authority,
        client_id: config.clientId,
        redirect_uri: config.callbackUrl,
        popup_redirect_uri: config.callbackUrl,
        silent_redirect_uri: config.callbackUrl,
        response_type: "code",
        scope: config.scope,
        // Tokens live in this tab's sessionStorage: a reload keeps the user
        // signed in, closing the tab forgets them.
        userStore: new WebStorageStateStore({ store: window.sessionStorage }),
        // The session renews on the "expiring" event itself (one de-duplicated
        // refresh path); the library's own renewal would race it.
        automaticSilentRenew: false,
        accessTokenExpiringNotificationTimeInSeconds: 60,
        silentRequestTimeoutInSeconds: 5,
        // The id token already carries the profile; skip the userinfo round trip.
        loadUserInfo: false,
        // The session-check iframe is unreliable with third-party cookie blocking.
        monitorSession: false,
    };
}

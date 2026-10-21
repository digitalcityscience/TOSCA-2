import Keycloak, { type KeycloakTokenParsed } from "keycloak-js";
import { computed, ref } from "vue";

function trimTrailingSlash(value: string): string {
    return value.trim().replace(/\/+$/, "");
}

function requiredEnvironmentValue(name: "VITE_KEYCLOAK_URL" | "VITE_KEYCLOAK_REALM" | "VITE_KEYCLOAK_CLIENT_ID"): string {
    const value = String(import.meta.env[name] ?? "").trim();
    if (value === "") {
        throw new Error(`${name} must be configured in the deployment environment.`);
    }
    return value;
}

// These public OIDC identifiers are intentionally supplied by the deployment
// environment, never hard-coded into the browser bundle.
const keycloak = new Keycloak({
    url: trimTrailingSlash(requiredEnvironmentValue("VITE_KEYCLOAK_URL")),
    realm: requiredEnvironmentValue("VITE_KEYCLOAK_REALM"),
    clientId: requiredEnvironmentValue("VITE_KEYCLOAK_CLIENT_ID"),
});

const isReady = ref(false);
const isAuthenticated = ref(false);
const initializationError = ref<Error>();

function updateAuthenticationState(): void {
    isAuthenticated.value = keycloak.authenticated === true;
}

export const username = computed(() => {
    const token = keycloak.tokenParsed as KeycloakTokenParsed | undefined;
    return token?.preferred_username ?? token?.name ?? token?.email;
});

export const userProfile = computed(() => {
    const token = keycloak.tokenParsed as KeycloakTokenParsed | undefined;
    const nameParts: unknown[] = [token?.given_name, token?.family_name];
    const fullName = nameParts
        .filter((part): part is string => typeof part === "string" && part.trim() !== "")
        .join(" ");
    const name = typeof token?.name === "string" ? token.name : undefined;
    const preferredUsername = typeof token?.preferred_username === "string" ? token.preferred_username : undefined;
    const email = typeof token?.email === "string" ? token.email : undefined;
    const displayName = fullName || name || preferredUsername || email || "Account";
    const initials = displayName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("");

    return {
        displayName,
        email,
        initials: initials || "?",
        realmRoles: token?.realm_access?.roles ?? [],
    };
});

/**
 * Safe claim summary for the temporary `?auth-debug=1` diagnostic panel.
 * Deliberately excludes access, refresh and ID tokens.
 */
export const authDiagnostics = computed(() => {
    const token = keycloak.tokenParsed as KeycloakTokenParsed | undefined;
    return {
        authenticated: isAuthenticated.value,
        initializationError: initializationError.value?.message,
        issuer: token?.iss,
        audience: token?.aud,
        authorizedParty: token?.azp,
        subject: token?.sub,
        username: token?.preferred_username ?? token?.email,
        realmRoles: token?.realm_access?.roles ?? [],
    };
});

/** Initialize once before Vue Router handles a possible OIDC callback URL. */
export async function initializeKeycloak(): Promise<boolean> {
    if (isReady.value) return isAuthenticated.value;

    try {
        const authenticated = await keycloak.init({
            onLoad: "check-sso",
            pkceMethod: "S256",
            // Keep authorization-code callback parameters out of the URL
            // fragment used by client-side UI state. The adapter removes this
            // query callback immediately after it exchanges the code.
            responseMode: "query",
            // Modern browser privacy restrictions make this iframe unreliable;
            // tokens are refreshed explicitly before authenticated API calls.
            checkLoginIframe: false,
        });
        isAuthenticated.value = authenticated;
        return authenticated;
    } catch (error) {
        initializationError.value = error instanceof Error ? error : new Error(String(error));
        console.error("Keycloak initialization failed", error);
        return false;
    } finally {
        isReady.value = true;
    }
}

export function getLoginRedirectUri(currentUrl = window.location.href): string {
    // Never feed an OIDC callback fragment back into the next authorization
    // request. A failed/retried login otherwise nests `#code`, `state`, and
    // `session_state` inside redirect_uri.
    const current = new URL(currentUrl);
    const redirect = new URL(String(import.meta.env.BASE_URL ?? "/"), current.origin);
    // Keep only the explicit local diagnostic switch; never copy arbitrary
    // callback query/fragment parameters into a new OIDC request.
    if (current.searchParams.get("auth-debug") === "1") {
        redirect.searchParams.set("auth-debug", "1");
    }
    return redirect.toString();
}

export async function login(): Promise<void> {
    await keycloak.login({ redirectUri: getLoginRedirectUri() });
}

export async function logout(): Promise<void> {
    await keycloak.logout({ redirectUri: window.location.origin });
}

export async function openAccountManagement(): Promise<void> {
    await keycloak.accountManagement();
}

/** Use this before protected Django or GeoServer calls in a later API layer. */
export async function getAccessToken(): Promise<string | undefined> {
    if (!isAuthenticated.value) return undefined;
    await keycloak.updateToken(30);
    updateAuthenticationState();
    return keycloak.token;
}

export function useKeycloakAuth() {
    return {
        isReady,
        isAuthenticated,
        initializationError,
        username,
        userProfile,
        authDiagnostics,
        login,
        logout,
        openAccountManagement,
    };
}

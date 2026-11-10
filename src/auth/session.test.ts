import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorResponse, type User } from "oidc-client-ts";
import { createAuthSession, isRefreshTokenExpired, profileFromUser, type SessionUserManager } from "./session";
import { readAuthConfig } from "./config";

function jwt(payload: Record<string, unknown>): string {
    const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
    return `${encode({ alg: "none" })}.${encode(payload)}.sig`;
}

function makeUser(overrides: Partial<{ sub: string; expiresIn: number; refreshExp: number; access: string }> = {}): User {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = overrides.expiresIn ?? 300;
    return {
        access_token: overrides.access ?? jwt({ organization: ["gq2"] }),
        refresh_token: jwt({ exp: overrides.refreshExp ?? now + 1800 }),
        expires_in: expiresIn,
        expired: expiresIn <= 0,
        profile: { sub: overrides.sub ?? "user-1", given_name: "Ada", family_name: "Lovelace", email: "ada@example.org" },
    } as unknown as User;
}

function fakeManager(stored: User | null = null) {
    const handlers: Record<string, (value?: unknown) => void> = {};
    const manager = {
        getUser: vi.fn(async () => stored),
        removeUser: vi.fn(async () => undefined),
        signinPopup: vi.fn(async () => makeUser()),
        signinSilent: vi.fn(async () => makeUser({ access: "renewed" })),
        settings: { client_id: "web", authority: "https://kc.test/realms/ngcn-prod" },
        metadataService: { getEndSessionEndpoint: vi.fn(async () => "https://kc.test/logout") },
        events: {
            addUserLoaded: (cb: (value?: unknown) => void) => { handlers.userLoaded = cb; },
            addSilentRenewError: (cb: (value?: unknown) => void) => { handlers.renewError = cb; },
            addAccessTokenExpired: (cb: (value?: unknown) => void) => { handlers.expired = cb; },
        },
    };
    return { manager: manager as unknown as SessionUserManager, raw: manager, handlers };
}

describe("createAuthSession", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("is disabled without a Keycloak configuration", async () => {
        const session = createAuthSession(undefined);
        await session.initialize();
        expect(session.status.value).toBe("disabled");
        expect(await session.getAccessToken()).toBeUndefined();
    });

    it("starts anonymous without a stored user and without asking Keycloak", async () => {
        const { manager, raw } = fakeManager();
        const session = createAuthSession(manager);
        await session.initialize();
        expect(session.status.value).toBe("anonymous");
        expect(raw.signinSilent).not.toHaveBeenCalled();
    });

    it("restores a stored user and refreshes an expired access token", async () => {
        const { manager, raw } = fakeManager(makeUser({ expiresIn: 0 }));
        const session = createAuthSession(manager);
        await session.initialize();
        expect(session.status.value).toBe("authenticated");
        expect(raw.signinSilent).toHaveBeenCalledTimes(1);
        expect(await session.getAccessToken()).toBe("renewed");
    });

    it("signs in with a popup and notifies listeners", async () => {
        const { manager } = fakeManager();
        const session = createAuthSession(manager);
        await session.initialize();
        const listener = vi.fn();
        session.onSessionChange(listener);

        expect(await session.login()).toBe("signed-in");
        expect(session.isAuthenticated.value).toBe(true);
        expect(session.profile.value?.displayName).toBe("Ada Lovelace");
        expect(listener).toHaveBeenCalledWith("login");
        expect(session.sessionKey.value).toBe(1);
    });

    it("reports a closed or blocked popup without signing in", async () => {
        const { manager, raw } = fakeManager();
        const session = createAuthSession(manager);
        await session.initialize();

        raw.signinPopup.mockRejectedValueOnce(new Error("Popup closed by user"));
        expect(await session.login()).toBe("cancelled");
        raw.signinPopup.mockRejectedValueOnce(new Error("Error opening popup window"));
        expect(await session.login()).toBe("blocked");
        expect(session.status.value).toBe("anonymous");
    });

    it("refreshes a token close to expiry before handing it out, once for concurrent callers", async () => {
        const { manager, raw } = fakeManager(makeUser({ expiresIn: 10 }));
        const session = createAuthSession(manager);
        await session.initialize();

        const tokens = await Promise.all([session.getAccessToken(), session.getAccessToken()]);

        expect(tokens).toEqual(["renewed", "renewed"]);
        expect(raw.signinSilent).toHaveBeenCalledTimes(1);
    });

    it("logs out when Keycloak refuses the refresh token", async () => {
        const { manager, raw } = fakeManager(makeUser());
        const session = createAuthSession(manager);
        await session.initialize();
        const listener = vi.fn();
        session.onSessionChange(listener);
        raw.signinSilent.mockRejectedValueOnce(new ErrorResponse({ error: "invalid_grant" }));

        expect(await session.refreshAccessToken()).toBeUndefined();
        expect(session.status.value).toBe("anonymous");
        expect(raw.removeUser).toHaveBeenCalled();
        expect(listener).toHaveBeenCalledWith("expired");
    });

    it("logs out without a request when the refresh token has expired", async () => {
        const { manager, raw } = fakeManager(makeUser({ expiresIn: 0, refreshExp: Math.floor(Date.now() / 1000) - 10 }));
        const session = createAuthSession(manager);
        await session.initialize();

        expect(session.status.value).toBe("anonymous");
        expect(raw.signinSilent).not.toHaveBeenCalled();
    });

    it("keeps the session on a network error during refresh", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const { manager, raw } = fakeManager(makeUser());
        const session = createAuthSession(manager);
        await session.initialize();
        raw.signinSilent.mockRejectedValueOnce(new TypeError("Failed to fetch"));

        expect(await session.refreshAccessToken()).toBeUndefined();
        expect(session.status.value).toBe("authenticated");
        warn.mockRestore();
    });

    it("logs out when automatic renewal is refused by the server", async () => {
        const { manager, handlers } = fakeManager(makeUser());
        const session = createAuthSession(manager);
        await session.initialize();

        handlers.renewError(new ErrorResponse({ error: "invalid_grant" }));
        await vi.waitFor(() => expect(session.status.value).toBe("anonymous"));
    });

    it("ends the Keycloak session with a form POST on logout", async () => {
        const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
        vi.stubGlobal("fetch", fetchMock);
        const { manager } = fakeManager(makeUser());
        const session = createAuthSession(manager);
        await session.initialize();
        const listener = vi.fn();
        session.onSessionChange(listener);

        await session.logout();

        expect(session.status.value).toBe("anonymous");
        expect(listener).toHaveBeenCalledWith("logout");
        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe("https://kc.test/logout");
        expect(init.method).toBe("POST");
        const body = init.body as URLSearchParams;
        expect(body.get("client_id")).toBe("web");
        expect(body.get("refresh_token")).toBeTruthy();
        vi.unstubAllGlobals();
    });

    it("logs the other tabs out and follows their logout", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
        let deliver: (event: MessageEvent) => void = () => undefined;
        const channel = { postMessage: vi.fn(), addEventListener: vi.fn((_type: "message", listener: (event: MessageEvent) => void) => { deliver = listener; }) };
        const thisTab = createAuthSession(fakeManager(makeUser()).manager, channel);
        await thisTab.initialize();

        await thisTab.logout();
        expect(channel.postMessage).toHaveBeenCalledWith({ type: "logout" });

        const otherChannel = { postMessage: vi.fn(), addEventListener: vi.fn((_type: "message", listener: (event: MessageEvent) => void) => { deliver = listener; }) };
        const otherTab = createAuthSession(fakeManager(makeUser()).manager, otherChannel);
        await otherTab.initialize();
        const listener = vi.fn();
        otherTab.onSessionChange(listener);

        deliver(new MessageEvent("message", { data: { type: "logout" } }));
        await vi.waitFor(() => expect(otherTab.status.value).toBe("anonymous"));
        expect(listener).toHaveBeenCalledWith("logout");
        expect(otherChannel.postMessage).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });

    it("changes the session key only when the identity changes", async () => {
        const { manager, handlers } = fakeManager(makeUser());
        const session = createAuthSession(manager);
        await session.initialize();
        const before = session.currentSessionKey();

        handlers.userLoaded(makeUser({ access: "renewed" }));
        expect(session.currentSessionKey()).toBe(before);

        await session.expireSession();
        expect(session.currentSessionKey()).toBe(before + 1);
    });

    it("does not notify listeners for a token refresh of the same user", async () => {
        const { manager, handlers } = fakeManager(makeUser());
        const session = createAuthSession(manager);
        await session.initialize();
        const listener = vi.fn();
        session.onSessionChange(listener);

        handlers.userLoaded(makeUser({ access: "renewed" }));

        expect(listener).not.toHaveBeenCalled();
        expect(session.getCurrentAccessToken()).toBe("renewed");
    });
});

describe("helpers", () => {
    it("reads organizations from the access token claim", () => {
        expect(profileFromUser(makeUser()).organizations).toEqual(["gq2"]);
    });

    it("treats a missing refresh token as expired", () => {
        expect(isRefreshTokenExpired({ refresh_token: undefined } as unknown as User)).toBe(true);
    });

    it("builds the callback URL under the base path and disables auth without settings", () => {
        expect(readAuthConfig({
            VITE_KEYCLOAK_URL: "https://kc.test/",
            VITE_KEYCLOAK_REALM: "ngcn-prod",
            VITE_KEYCLOAK_CLIENT_ID: "web",
            BASE_URL: "/tosca/",
        }, "https://app.test")).toEqual({
            authority: "https://kc.test/realms/ngcn-prod",
            clientId: "web",
            scope: "openid profile email",
            callbackUrl: "https://app.test/tosca/auth-callback.html",
        });
        expect(readAuthConfig({ VITE_KEYCLOAK_URL: "", VITE_KEYCLOAK_REALM: "r", VITE_KEYCLOAK_CLIENT_ID: "c" })).toBeUndefined();
    });
});

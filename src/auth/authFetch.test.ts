import { describe, expect, it, vi } from "vitest";
import { createAuthFetch, createTokenOrigins } from "./authFetch";

function response(status: number): Response {
    return new Response(null, { status });
}

function authorizationOf(init: RequestInit | undefined): string | null {
    return new Headers(init?.headers).get("Authorization");
}

function setup(options: { token?: string; refreshed?: string; statuses: number[] }) {
    const statuses = [...options.statuses];
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response(statuses.shift() ?? 200));
    const session = {
        key: 0,
        getAccessToken: vi.fn(async () => options.token),
        refreshAccessToken: vi.fn(async () => options.refreshed),
        currentSessionKey: vi.fn(() => session.key),
    };
    const authFetch = createAuthFetch(session, (url) => url.startsWith("https://api.test/"), fetchImpl);
    return { authFetch, fetchImpl, session };
}

describe("createAuthFetch", () => {
    it("adds the bearer token to trusted hosts and keeps existing headers", async () => {
        const { authFetch, fetchImpl } = setup({ token: "t1", statuses: [200] });

        await authFetch("https://api.test/api/v1/events/", { headers: { Accept: "application/json" } });

        const init = fetchImpl.mock.calls[0][1];
        expect(authorizationOf(init)).toBe("Bearer t1");
        expect(new Headers(init?.headers).get("Accept")).toBe("application/json");
    });

    it("never sends the token to other hosts", async () => {
        const { authFetch, fetchImpl, session } = setup({ token: "t1", statuses: [200] });

        await authFetch("https://api.maptiler.com/tiles.json");

        expect(session.getAccessToken).not.toHaveBeenCalled();
        expect(authorizationOf(fetchImpl.mock.calls[0][1])).toBeNull();
    });

    it("omits cookies on backend/GeoServer requests, signed in or not, unless the caller asks", async () => {
        const { authFetch, fetchImpl } = setup({ statuses: [200, 200, 200] });

        await authFetch("https://api.test/api/v1/catalog/");
        await authFetch("https://api.test/api/v1/catalog/", { credentials: "include" });
        await authFetch("https://api.maptiler.com/tiles.json");

        expect(fetchImpl.mock.calls.map(([, init]) => init?.credentials)).toEqual(["omit", "include", undefined]);
    });

    it("keeps answers to signed-in requests out of the browser's HTTP cache", async () => {
        const { authFetch, fetchImpl } = setup({ token: "t1", statuses: [200] });
        const anonymous = setup({ statuses: [200] });

        await authFetch("https://api.test/api/v1/catalog/");
        await anonymous.authFetch("https://api.test/api/v1/catalog/");

        expect(fetchImpl.mock.calls[0][1]?.cache).toBe("no-store");
        expect(anonymous.fetchImpl.mock.calls[0][1]?.cache).toBeUndefined();
    });

    it("repeats a read for the new session when the user signs in or out while it runs", async () => {
        const { authFetch, fetchImpl, session } = setup({ token: "t1", statuses: [200, 200] });
        fetchImpl.mockImplementationOnce(async () => {
            session.key += 1; // logout happens while the first answer is on its way
            return response(200);
        });

        await authFetch("https://api.test/api/v1/geostories/");

        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it("never repeats a write after a session change", async () => {
        const { authFetch, fetchImpl, session } = setup({ token: "t1", statuses: [201] });
        fetchImpl.mockImplementationOnce(async () => {
            session.key += 1;
            return response(201);
        });

        const result = await authFetch("https://api.test/api/v1/feedback/", { method: "POST", body: "{}" });

        expect(result.status).toBe(201);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("sends anonymous requests when nobody is signed in", async () => {
        const { authFetch, fetchImpl } = setup({ statuses: [200] });

        await authFetch("https://api.test/api/v1/events/");

        expect(authorizationOf(fetchImpl.mock.calls[0][1])).toBeNull();
    });

    it("refreshes once and retries with the new token after a 401", async () => {
        const { authFetch, fetchImpl, session } = setup({ token: "old", refreshed: "new", statuses: [401, 200] });

        const result = await authFetch("https://api.test/api/v1/geostories/");

        expect(result.status).toBe(200);
        expect(session.refreshAccessToken).toHaveBeenCalledTimes(1);
        expect(fetchImpl.mock.calls.map(([, init]) => authorizationOf(init))).toEqual(["Bearer old", "Bearer new"]);
    });

    it("retries anonymously when the refresh fails (the session logs out)", async () => {
        const { authFetch, fetchImpl } = setup({ token: "old", statuses: [401, 200] });

        const result = await authFetch("https://api.test/api/v1/geostories/");

        expect(result.status).toBe(200);
        expect(fetchImpl.mock.calls.map(([, init]) => authorizationOf(init))).toEqual(["Bearer old", null]);
    });

    it("falls back to anonymous when even a fresh token is refused", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const { authFetch, fetchImpl } = setup({ token: "old", refreshed: "new", statuses: [401, 401, 200] });

        const result = await authFetch("https://api.test/api/v1/catalog/providers");

        expect(result.status).toBe(200);
        expect(fetchImpl.mock.calls.map(([, init]) => authorizationOf(init))).toEqual(["Bearer old", "Bearer new", null]);
        warn.mockRestore();
    });

    it("does not refresh on other errors", async () => {
        const { authFetch, session } = setup({ token: "t1", statuses: [403] });

        expect((await authFetch("https://api.test/x")).status).toBe(403);
        expect(session.refreshAccessToken).not.toHaveBeenCalled();
    });
});

describe("createTokenOrigins", () => {
    it("trusts configured and registered origins only", () => {
        const origins = createTokenOrigins(() => ["https://api.test/root/", "", undefined]);
        origins.register("https://geoserver.test/geoserver");
        origins.register("not a url");

        expect(origins.includes("https://api.test/api/v1/")).toBe(true);
        expect(origins.includes("https://geoserver.test/geoserver/wms?x=1")).toBe(true);
        expect(origins.includes("https://geoserver.test.evil.com/geoserver")).toBe(false);
        expect(origins.includes("http://api.test/api/v1/")).toBe(false);
    });
});

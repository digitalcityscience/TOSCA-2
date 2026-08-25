import { afterEach, describe, expect, test, vi } from "vitest";
import { isCollabModeEnabled, isRealTableRoute, resolveCollabTrackingMode } from "./collabMode";

describe("isCollabModeEnabled", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    test("is false when VITE_COLLAB_MODE is unset", () => {
        vi.stubEnv("VITE_COLLAB_MODE", undefined);
        expect(isCollabModeEnabled()).toBe(false);
    });

    test("is false when VITE_COLLAB_MODE is \"false\"", () => {
        vi.stubEnv("VITE_COLLAB_MODE", "false");
        expect(isCollabModeEnabled()).toBe(false);
    });

    test("is true when VITE_COLLAB_MODE is \"true\"", () => {
        vi.stubEnv("VITE_COLLAB_MODE", "true");
        expect(isCollabModeEnabled()).toBe(true);
    });
});

describe("resolveCollabTrackingMode", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    test("is \"real\" when VITE_COLLAB_TRACKING_MODE is unset (preserves today's URL-driven default)", () => {
        vi.stubEnv("VITE_COLLAB_TRACKING_MODE", undefined);
        expect(resolveCollabTrackingMode()).toBe("real");
    });

    test("is \"mock\" when VITE_COLLAB_TRACKING_MODE is \"mock\"", () => {
        vi.stubEnv("VITE_COLLAB_TRACKING_MODE", "mock");
        expect(resolveCollabTrackingMode()).toBe("mock");
    });

    test("is \"real\" when VITE_COLLAB_TRACKING_MODE is \"real\"", () => {
        vi.stubEnv("VITE_COLLAB_TRACKING_MODE", "real");
        expect(resolveCollabTrackingMode()).toBe("real");
    });

    test("is \"real\" for an unrecognized value (only \"mock\" opts into the mock override)", () => {
        vi.stubEnv("VITE_COLLAB_TRACKING_MODE", "bogus");
        expect(resolveCollabTrackingMode()).toBe("real");
    });

    test("is case-insensitive and trims whitespace", () => {
        vi.stubEnv("VITE_COLLAB_TRACKING_MODE", "  MOCK  ");
        expect(resolveCollabTrackingMode()).toBe("mock");
    });
});

describe("isRealTableRoute", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    test("is false with no WS URL configured, even in real mode (dev with no table)", () => {
        vi.stubEnv("VITE_COLLAB_TRACKING_MODE", "real");
        vi.stubEnv("VITE_COLLAB_TRACKING_WS_URL", undefined);
        expect(isRealTableRoute()).toBe(false);
    });

    test("is false when tracking mode is forced to mock, even with a WS URL configured", () => {
        vi.stubEnv("VITE_COLLAB_TRACKING_MODE", "mock");
        vi.stubEnv("VITE_COLLAB_TRACKING_WS_URL", "ws://table-host:8053");
        expect(isRealTableRoute()).toBe(false);
    });

    test("is true when real mode resolves and a WS URL is configured", () => {
        vi.stubEnv("VITE_COLLAB_TRACKING_MODE", "real");
        vi.stubEnv("VITE_COLLAB_TRACKING_WS_URL", "ws://table-host:8053");
        expect(isRealTableRoute()).toBe(true);
    });
});

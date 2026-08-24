import { afterEach, describe, expect, test, vi } from "vitest";
import { isCollabModeEnabled } from "./collabMode";

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

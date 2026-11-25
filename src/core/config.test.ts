import { afterEach, describe, expect, it, vi } from "vitest";
import { getConfig, pickConfig } from "./config";

describe("deployment configuration", () => {
    afterEach(() => {
        delete window.__TOSCA_CONFIG__;
        vi.unstubAllEnvs();
    });

    it("prefers the value from the generated config.js", () => {
        vi.stubEnv("VITE_BACKEND_ROOT_URL", "http://build.test");
        window.__TOSCA_CONFIG__ = { VITE_BACKEND_ROOT_URL: "http://runtime.test" };
        expect(getConfig("VITE_BACKEND_ROOT_URL")).toBe("http://runtime.test");
    });

    it("falls back to the Vite environment when config.js has no usable value", () => {
        vi.stubEnv("VITE_BACKEND_ROOT_URL", "http://build.test");
        expect(getConfig("VITE_BACKEND_ROOT_URL")).toBe("http://build.test");
        window.__TOSCA_CONFIG__ = { VITE_BACKEND_ROOT_URL: "  " };
        expect(getConfig("VITE_BACKEND_ROOT_URL")).toBe("http://build.test");
    });

    it("returns undefined for a value set nowhere", () => {
        expect(getConfig("VITE_NOT_SET_ANYWHERE")).toBeUndefined();
    });

    it("picks several values into one object", () => {
        window.__TOSCA_CONFIG__ = { VITE_APP_BRAND_NAME: "City Lab" };
        expect(pickConfig("VITE_APP_BRAND_NAME", "VITE_NOT_SET_ANYWHERE")).toEqual({
            VITE_APP_BRAND_NAME: "City Lab",
            VITE_NOT_SET_ANYWHERE: undefined,
        });
    });
});

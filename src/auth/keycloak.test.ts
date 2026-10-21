import { describe, expect, it } from "vitest";
import { getLoginRedirectUri } from "./keycloak";

describe("getLoginRedirectUri", () => {
    it("removes an OIDC callback fragment before starting a retry", () => {
        expect(getLoginRedirectUri(
            "http://localhost:5173/#state=old-state&session_state=old-session&code=one-time-code"
        )).toBe("http://localhost:5173/");
    });

    it("keeps the explicit local diagnostic switch without keeping callback data", () => {
        expect(getLoginRedirectUri("http://localhost:5173/?auth-debug=1#code=one-time-code"))
            .toBe("http://localhost:5173/?auth-debug=1");
    });
});

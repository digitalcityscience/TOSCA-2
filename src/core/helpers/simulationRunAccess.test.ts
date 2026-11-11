import { describe, expect, it } from "vitest";
import { runAccessDenial } from "./simulationRunAccess";

describe("runAccessDenial", () => {
    it("says nothing when the backend allows or does not say", () => {
        expect(runAccessDenial({ can_run: true, run_access: "editors" }, false)).toBeUndefined();
        expect(runAccessDenial({}, false)).toBeUndefined();
    });

    it("asks signed-out visitors to sign in", () => {
        expect(runAccessDenial({ can_run: false, run_access: "organization" }, false)).toBe("signIn");
    });

    it("names the audience for signed-in visitors", () => {
        expect(runAccessDenial({ can_run: false, run_access: "organization" }, true)).toBe("members");
        expect(runAccessDenial({ can_run: false, run_access: "editors" }, true)).toBe("editors");
        expect(runAccessDenial({ can_run: false, run_access: "anyone" }, true)).toBe("notAllowed");
    });
});

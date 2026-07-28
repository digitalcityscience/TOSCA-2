import { describe, expect, test, vi } from "vitest";
import {
    reportDeveloperError,
    serviceUnavailableMessage,
} from "./userFacingError";

describe("userFacingError", () => {
    test("returns service-specific copy without exposing an exception", () => {
        Object.defineProperty(navigator, "onLine", {
            configurable: true,
            value: true,
        });

        expect(serviceUnavailableMessage("event")).toBe(
            "We couldn't reach the event service. Please try again in a moment."
        );
    });

    test("keeps technical details in the developer console", () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        const error = new TypeError("Load failed");

        reportDeveloperError("Loading events", error);

        expect(consoleError).toHaveBeenCalledWith(
            "[TOSCA] Loading events",
            error
        );
    });
});

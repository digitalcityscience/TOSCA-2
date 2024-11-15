import { expect, test, describe } from "vitest";
import { isNullOrEmpty } from "./functions";

describe("functions.isNullOrEmpty", () => {
    test("should be true for undefined", () => {
        expect(isNullOrEmpty(undefined)).toBe(true);
    });

    test("should be true for null", () => {
        expect(isNullOrEmpty(null)).toBe(true);
    });

    test("should be true for empty string", () => {
        expect(isNullOrEmpty("")).toBe(true);
    });

    test("should be false for an object", () => {
    // Arrange
        const obj = { name: "John" };
        // Act
        const result = isNullOrEmpty(obj);
        // Assert
        expect(result).toBe(false);
    });
});

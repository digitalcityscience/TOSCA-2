import { expect, test, describe } from "vitest";
import { getRandomHexColor, isNullOrEmpty } from "./functions";

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

describe("getRandomHexColor", () => {
    test("should return a string", () => {
        const result = getRandomHexColor();
        const hexColorRegex = /^#[0-9a-f]{6}$/i;
        expect(typeof result).toBe("string");
        expect(result).toMatch(hexColorRegex);
    });
});

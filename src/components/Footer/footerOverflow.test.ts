import { describe, expect, test } from "vitest";
import { countFittingItems } from "./footerOverflow";

describe("countFittingItems", () => {
    test("keeps every item when the whole row fits, without reserving the More control", () => {
        expect(countFittingItems([50, 50, 50], 170, 10, 40)).toBe(3);
        expect(countFittingItems([], 0, 10, 40)).toBe(0);
    });

    test("moves trailing items out and reserves room for the More control", () => {
        // 50 + 10 + 50 + 10 + More (40) = 160 fits; a third item would need 220.
        expect(countFittingItems([50, 50, 50, 50], 200, 10, 40)).toBe(2);
    });

    test("never skips a wide item to fit a later narrow one", () => {
        expect(countFittingItems([50, 200, 20], 150, 10, 40)).toBe(1);
    });

    test("can leave only the More control on a very narrow row", () => {
        expect(countFittingItems([80, 80], 100, 10, 40)).toBe(0);
    });
});

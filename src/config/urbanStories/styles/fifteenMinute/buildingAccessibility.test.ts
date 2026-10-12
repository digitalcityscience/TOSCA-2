import { describe, expect, test } from "vitest";
import {
    isValidScore15min,
    maxScoreFilter,
    NO_DATA_COLOR,
    SCORE_15MIN_CLASSES,
    score15minColor,
    score15minColorExpression,
    scoreLegendItems,
} from "./buildingAccessibility";
import { colorAt, passesFilter } from "./__fixtures__/evaluate";

describe("score_15min colour expression", () => {
    const expression = score15minColorExpression();

    test("draws each integer 0–9 with exactly its class colour", () => {
        expect(SCORE_15MIN_CLASSES.map((item) => item.value)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        for (const item of SCORE_15MIN_CLASSES) {
            expect(colorAt(expression, { score_15min: item.value }), `score ${item.value}`).toBe(item.color);
        }
    });

    test("the ten classes are distinct and none equals the no-data grey", () => {
        const colors = SCORE_15MIN_CLASSES.map((item) => item.color);
        expect(new Set(colors).size).toBe(10);
        expect(colors).not.toContain(NO_DATA_COLOR);
    });

    test("neighbouring classes are visibly different and the scale runs from warm (little) to teal (much)", () => {
        const rgb = (hex: string) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
        for (let index = 1; index < SCORE_15MIN_CLASSES.length; index += 1) {
            const [a, b] = [rgb(SCORE_15MIN_CLASSES[index - 1].color), rgb(SCORE_15MIN_CLASSES[index].color)];
            const distance = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
            expect(distance, `class ${index - 1} vs ${index}`).toBeGreaterThan(35);
        }
        const [low, high] = [rgb(SCORE_15MIN_CLASSES[0].color), rgb(SCORE_15MIN_CLASSES[9].color)];
        expect(low[0]).toBeGreaterThan(low[2]); // brown: red above blue
        expect(high[1]).toBeGreaterThan(high[0]); // teal: green above red
    });

    test("NULL (a missing property in a vector tile) is grey and is not the colour of 0", () => {
        expect(colorAt(expression, {})).toBe(NO_DATA_COLOR);
        expect(colorAt(expression, { score_15min: null })).toBe(NO_DATA_COLOR);
        expect(colorAt(expression, {})).not.toBe(SCORE_15MIN_CLASSES[0].color);
    });

    test("invalid values are grey, never a class colour", () => {
        for (const value of [-1, 10, 9.5, 2.5, "3", "", true, Number.NaN, 100]) {
            expect(colorAt(expression, { score_15min: value }), String(value)).toBe(NO_DATA_COLOR);
        }
    });

    test("the JS twin agrees with the expression for every probe value", () => {
        for (const value of [0, 1, 5, 9, -1, 10, 2.5, null, undefined, "4"]) {
            expect(score15minColor(value), String(value)).toBe(colorAt(expression, value === undefined ? {} : { score_15min: value }));
        }
        expect(isValidScore15min(0)).toBe(true);
        expect(isValidScore15min(null)).toBe(false);
    });

    test("an expression on another field name reads that field", () => {
        expect(colorAt(score15minColorExpression("other"), { other: 9, score_15min: 0 })).toBe(SCORE_15MIN_CLASSES[9].color);
    });

    test("the legend lists exactly the classes the expression draws, in order, with the same colours", () => {
        const items = scoreLegendItems();
        expect(items.map((item) => item.value)).toEqual(SCORE_15MIN_CLASSES.map((item) => item.value));
        for (const item of items) expect(colorAt(expression, { score_15min: item.value })).toBe(item.color);
    });

    test("the legend never calls the score a percentage", () => {
        for (const item of scoreLegendItems()) {
            expect(item.label.en).not.toContain("%");
            expect(item.label.de).not.toContain("%");
        }
    });
});

describe("max-score filter", () => {
    const filter = maxScoreFilter(3);

    test("keeps scores up to the threshold, drops higher ones", () => {
        expect(passesFilter(filter, { score_15min: 0 })).toBe(true);
        expect(passesFilter(filter, { score_15min: 3 })).toBe(true);
        expect(passesFilter(filter, { score_15min: 4 })).toBe(false);
    });

    test("NULL and non-numbers are not treated as 0", () => {
        expect(passesFilter(filter, {})).toBe(false);
        expect(passesFilter(filter, { score_15min: null })).toBe(false);
        expect(passesFilter(filter, { score_15min: "0" })).toBe(false);
    });
});

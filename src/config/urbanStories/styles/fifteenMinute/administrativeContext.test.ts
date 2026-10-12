import { describe, expect, test } from "vitest";
import { NO_DATA_COLOR } from "./buildingAccessibility";
import { ADMIN_METRIC_SCALES, adminColorAtStop, adminColorExpression } from "./administrativeContext";
import { adminLegend } from "./legends";
import type { AdministrativeMetric } from "./types";
import { colorAt } from "./__fixtures__/evaluate";

const METRICS = Object.keys(ADMIN_METRIC_SCALES) as AdministrativeMetric[];

describe("administrative context expressions", () => {
    test.each(METRICS)("%s: draws each legend stop with its own colour", (metric) => {
        const expression = adminColorExpression(metric);
        for (const stop of ADMIN_METRIC_SCALES[metric].stops) {
            expect(colorAt(expression, { [metric]: stop.value }), `${metric}=${stop.value}`).toBe(stop.color);
            expect(adminColorAtStop(metric, stop.value)).toBe(stop.color);
        }
    });

    test.each(METRICS)("%s: NULL, missing and non-numeric values are grey", (metric) => {
        const expression = adminColorExpression(metric);
        for (const value of [null, "5", undefined]) {
            expect(colorAt(expression, value === undefined ? {} : { [metric]: value })).toBe(NO_DATA_COLOR);
        }
    });

    test("the two aggregates use different scales: 0–9 count versus 0–100 decay", () => {
        const count = ADMIN_METRIC_SCALES.m15_categories_mean.stops;
        const decay = ADMIN_METRIC_SCALES.m15_decay_mean.stops;
        expect([count[0].value, count.at(-1)!.value]).toEqual([0, 9]);
        expect([decay[0].value, decay.at(-1)!.value]).toEqual([0, 100]);
        expect(count.map((stop) => stop.color)).not.toEqual(decay.map((stop) => stop.color));
        expect(ADMIN_METRIC_SCALES.m15_decay_mean.unit.en).toMatch(/not the mean of the 0–9 count/);
    });

    test("the legend lists the same stops as the expression", () => {
        for (const metric of METRICS) {
            const legend = adminLegend(metric);
            const expression = adminColorExpression(metric);
            expect(legend.items.map((item) => item.value)).toEqual(ADMIN_METRIC_SCALES[metric].stops.map((stop) => stop.value));
            for (const item of legend.items) expect(colorAt(expression, { [metric]: item.value })).toBe(item.color);
        }
    });
});

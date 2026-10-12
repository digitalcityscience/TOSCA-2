import { describe, expect, test } from "vitest";
import { colorAt, numberAt, styleErrors } from "../fifteenMinute/__fixtures__/evaluate";
import { colorExpression, streetWidth } from "./cartography";
import { BUILDING_SCALES, STREET_SCALES, NO_DATA_COLOR, metadata, metricOptions, plainMetricDescription, resolveWalkabilityStyling, walkLegend } from "./index";
import { popupPropertyRows } from "@helpers/popupAttributes";

const scales = [...STREET_SCALES, ...BUILDING_SCALES];
describe("metadata-driven walking cartography", () => {
    test.each(scales)("$field: expressions agree with every legend class and metadata", (scale) => {
        const info = metadata[scale.field];
        const metric = metricOptions([scale])[0];
        expect(metric.caveats?.some((caveat) => caveat.en === plainMetricDescription(scale.field).en)).toBe(true);
        expect(metric.nullMeaning?.en).toBe(info.null_semantics);
        const expression = colorExpression(scale);
        const legend = walkLegend(scale);
        scale.values.forEach((value, i) => {
            expect(colorAt(expression, { [scale.field]: value })).toBe(legend.items[i].color);
            if (typeof value === "number" && i > 0) {
                expect(colorAt(expression, { [scale.field]: value - (scale.integer ? 1 : 0.001) })).toBe(scale.colors[i - 1]);
            }
        });
        for (const properties of [{}, { [scale.field]: null }, { [scale.field]: false }, { [scale.field]: "" }, { [scale.field]: "unknown" }]) {
            expect(colorAt(expression, properties)).toBe(NO_DATA_COLOR);
        }
        if (typeof scale.values[0] === "number") {
            expect(colorAt(expression, { [scale.field]: -1 })).toBe(NO_DATA_COLOR);
            expect(colorAt(expression, { [scale.field]: "20" })).toBe(NO_DATA_COLOR);
            if (scale.max !== undefined) expect(colorAt(expression, { [scale.field]: scale.max + 1 })).toBe(NO_DATA_COLOR);
            if (scale.integer) expect(colorAt(expression, { [scale.field]: 1.5 })).toBe(NO_DATA_COLOR);
            expect(colorAt(expression, { [scale.field]: 0 })).not.toBe(NO_DATA_COLOR);
        }
    });

    test("safety direction stays native and matches the export definition", () => {
        for (const field of ["safety_index", "safety_index_400m"]) {
            const scale = scales.find((scale) => scale.field === field)!;
            expect(scale.direction).toBe("higher-lower-concentration");
            expect(metadata[scale.field].description).toMatch(/[Hh]igher = lower modelled/);
            expect(colorAt(colorExpression(scale), { [field]: 0 })).toBe("#922b57");
            expect(colorAt(colorExpression(scale), { [field]: 100 })).toBe("#244c83");
        }
    });

    test("visible pixel widths increase by zoom; casing surrounds the thematic pass", () => {
        for (const [zoom, width] of [[9, 0.8], [11, 1.25], [13, 2], [15, 3.6], [16, 5], [18, 8], [20, 12]]) {
            expect(numberAt(streetWidth(), {}, zoom)).toBe(width);
            expect(numberAt(streetWidth(true), {}, zoom)).toBeCloseTo(width + 1.7);
        }
    });

    test.each(["street-segments", "buildings-comfort-safety"])("%s: all local render passes validate, use the right source and preserve zoom floors", (key) => {
        const bundle = resolveWalkabilityStyling(key)!;
        const building = key === "buildings-comfort-safety";
        for (const style of bundle.styles) {
            expect(styleErrors(style.layers, [])).toEqual([]);
            expect(style.layers.every((layer) => layer.minzoom === (building ? 14 : 9))).toBe(true);
            expect(style.layers.every((layer) => layer["source-layer"] === (building ? "hamburg_buildings" : "hamburg_mobility"))).toBe(true);
            expect(style.spriteUrl).toBeUndefined();
            if (building) {
                const fill = style.layers[0];
                expect(fill.type).toBe("fill-extrusion");
                for (const field of ["safety_index_400m", "comfort_mean_400m"]) {
                    expect(numberAt(fill.paint?.["fill-extrusion-height"], { building_height_m: 18.5, [field]: 60 }, 16)).toBe(18.5);
                }
                for (const height of [null, undefined, -1, 0, "18.5"]) {
                    expect(numberAt(fill.paint?.["fill-extrusion-height"], { building_height_m: height }, 16)).toBe(0);
                }
            } else {
                const scale = STREET_SCALES.find((scale) => style.name.endsWith(scale.field))!;
                if (scale.render === "positive-count-overlay") {
                    expect(style.layers[0].id).toContain("context");
                    expect(style.layers[1].id).toContain("records");
                    expect(style.layers[1].filter).toEqual([">", ["number", ["get", scale.field], -1], 0]);
                } else {
                    expect(style.layers[0].id).toContain("casing");
                    expect(style.layers[1].paint?.["line-color"]).toEqual(colorExpression(scale));
                }
            }
        }
    });

    test("inspection distinguishes zero, NULL and missing MVT keys with plain explanations", () => {
        const style = resolveWalkabilityStyling("street-segments")!.styles[0];
        const rows = popupPropertyRows({ source: "streets", properties: { comfort_score: 0, safety_index: null, has_sidewalk: "not_applicable" }, attributeContributions: [{ order: 0, attributes: style.attributes! }] }, "en");
        expect(rows.find((row) => row.name === "comfort_score")?.value).toBe("0");
        expect(rows.find((row) => row.name === "safety_index")?.value).toBe(metadata.safety_index.null_semantics);
        expect(rows.find((row) => row.name === "comfort_shade")?.description).toBe(plainMetricDescription("comfort_shade").en);
        expect(rows.find((row) => row.name === "has_sidewalk")?.value).toBe("not_applicable");
        expect(rows.some((row) => row.name === "safety_index_400m")).toBe(false);
    });
});

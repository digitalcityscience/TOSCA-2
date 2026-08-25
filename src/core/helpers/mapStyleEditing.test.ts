import { describe, expect, test } from "vitest";
import {
    isMapStyleColorControlAvailable,
    normalizeEditableHexColor,
    resolveMapStyleEditingCapabilities,
} from "./mapStyleEditing";

describe("resolveMapStyleEditingCapabilities", () => {
    test("keeps layer groups fixed", () => {
        expect(resolveMapStyleEditingCapabilities({
            logicalKind: "group",
            layerType: "fill",
            paint: { "fill-color": "#ff0000" },
        })).toEqual({ mode: "fixed", reason: "group", colors: [] });
    });

    test("keeps multi-pass catalog styles fixed", () => {
        expect(resolveMapStyleEditingCapabilities({
            layerType: "fill",
            styleLayers: [
                { type: "fill", paint: { "fill-color": "#ff0000" } },
                { type: "line", paint: { "line-color": "#880000" } },
            ],
        })).toEqual({ mode: "fixed", reason: "multi-pass", colors: [] });
    });

    test("exposes fill and outline independently in a one-pass style", () => {
        const capabilities = resolveMapStyleEditingCapabilities({
            layerType: "fill",
            styleLayers: [{
                type: "fill",
                paint: {
                    "fill-color": "#4C78A8",
                    "fill-outline-color": "#f00",
                },
            }],
        });

        expect(capabilities).toMatchObject({
            mode: "editable",
            colors: [
                { property: "fill-color", pickerValue: "#4c78a8", status: "editable" },
                { property: "fill-outline-color", pickerValue: "#ff0000", status: "editable" },
            ],
        });
    });

    test("exposes symbol text and halo colors", () => {
        const capabilities = resolveMapStyleEditingCapabilities({
            layerType: "symbol",
            styleLayers: [{
                type: "symbol",
                paint: {
                    "text-color": "#17324D",
                    "text-halo-color": "#FFFFFF",
                },
            }],
        });

        expect(capabilities.mode).toBe("editable");
        expect(capabilities.colors.map(({ property }) => property)).toEqual([
            "text-color",
            "text-halo-color",
        ]);
    });

    test("shows expressions as data-driven and locked", () => {
        const capabilities = resolveMapStyleEditingCapabilities({
            layerType: "circle",
            paint: {
                "circle-color": ["match", ["get", "kind"], "park", "#00ff00", "#64748b"],
            },
        });

        expect(capabilities).toMatchObject({
            mode: "editable",
            colors: [{ property: "circle-color", status: "data-driven" }],
        });
    });
});

describe("isMapStyleColorControlAvailable", () => {
    test("only hides MapLibre's native fill outline while terrain is active", () => {
        expect(isMapStyleColorControlAvailable("fill-outline-color", true)).toBe(false);
        expect(isMapStyleColorControlAvailable("fill-outline-color", false)).toBe(true);
        expect(isMapStyleColorControlAvailable("line-color", true)).toBe(true);
    });
});

describe("normalizeEditableHexColor", () => {
    test("normalizes picker-safe colors without discarding alpha", () => {
        expect(normalizeEditableHexColor("#ABC")).toBe("#aabbcc");
        expect(normalizeEditableHexColor("#AABBCC")).toBe("#aabbcc");
        expect(normalizeEditableHexColor("#AABBCC80")).toBeUndefined();
        expect(normalizeEditableHexColor("rgb(1, 2, 3)")).toBeUndefined();
    });
});

import { describe, expect, test } from "vitest";
import {
    createMapStyleLegendEntries,
    hasSingleEditableMapStyleColor,
} from "./mapStyleLegend";

describe("createMapStyleLegendEntries", () => {
    test("creates one entry for every renderable layer in a group MBStyle", () => {
        const entries = createMapStyleLegendEntries([
            { id: "background", type: "background", paint: { "background-color": "#fff" } },
            {
                id: "district-fill",
                type: "fill",
                metadata: { "tosca:legend-label": "Districts" },
                paint: { "fill-color": "#4338ca", "fill-opacity": 0.25 },
            },
            {
                id: "pharmacies",
                type: "circle",
                paint: {
                    "circle-color": ["match", ["get", "open"], true, "#16a34a", "#dc2626"],
                    "circle-radius": 6,
                },
            },
            { id: "transit-lines", type: "line", paint: { "line-color": "#2563eb", "line-width": 3 } },
        ]);

        expect(entries).toHaveLength(3);
        expect(entries[0]).toMatchObject({
            id: "district-fill",
            label: "Districts",
            kind: "fill",
            colors: ["#4338ca"],
            opacity: 0.25,
        });
        expect(entries[1].colors).toEqual(["#16a34a", "#dc2626"]);
        expect(entries[2]).toMatchObject({ label: "transit lines", kind: "line", size: 3 });
    });

    test("connects a selected symbol rule to its member and real sprite", () => {
        const entries = createMapStyleLegendEntries([{
            id: "daycare-icons",
            type: "symbol",
            layout: { "icon-image": "kindergarten" },
            paint: { "icon-color": "#16a34a" },
            metadata: {
                "tosca:member-id": "daycare-member",
                "tosca:style-id": "city-style",
            },
        }], {
            members: [{ id: "daycare-member", title: "Daycare" }],
            styles: { "city-style": { sprite_id: "city-icons" } },
            sprites: { "city-icons": { url: "https://example.test/city-icons" } },
        });

        expect(entries[0]).toMatchObject({
            id: "daycare-member:daycare-icons",
            memberLabel: "Daycare",
            sprite: {
                name: "kindergarten",
                url: "https://example.test/city-icons",
                tint: "#16a34a",
            },
        });
    });
});

describe("hasSingleEditableMapStyleColor", () => {
    test("allows one literal color in one catalog style layer", () => {
        expect(hasSingleEditableMapStyleColor([{
            id: "district-fill",
            type: "fill",
            paint: { "fill-color": "#4338ca", "fill-opacity": 0.5 },
        }], "fill-color")).toBe(true);
    });

    test("rejects colors derived from feature attributes", () => {
        expect(hasSingleEditableMapStyleColor([{
            id: "district-fill",
            type: "fill",
            paint: {
                "fill-color": ["match", ["get", "category"], "park", "#16a34a", "#64748b"],
            },
        }], "fill-color")).toBe(false);
    });

    test("rejects a style containing more than one color", () => {
        expect(hasSingleEditableMapStyleColor([{
            id: "district-fill",
            type: "fill",
            paint: {
                "fill-color": "#4338ca",
                "fill-outline-color": "#1e1b4b",
            },
        }], "fill-color")).toBe(false);
    });

    test("rejects catalog styles composed from multiple render layers", () => {
        expect(hasSingleEditableMapStyleColor([
            { id: "district-fill", type: "fill", paint: { "fill-color": "#4338ca" } },
            { id: "district-border", type: "line", paint: { "line-color": "#4338ca" } },
        ], "fill-color")).toBe(false);
    });
});

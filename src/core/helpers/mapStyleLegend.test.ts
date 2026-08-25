import { describe, expect, test } from "vitest";
import { createMapStyleLegendEntries } from "./mapStyleLegend";

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

import { describe, expect, test } from "vitest";
import { previewTaxonomyChips, taxonomyChipLabels } from "./taxonomyChips";

const assignments = [
    {
        dimension_code: "topic",
        dimension_label: "Topic",
        terms: [
            { code: "activity", label: "Sports and Physical Activity" },
            { code: "training", label: "Training" },
        ],
    },
    {
        dimension_code: "audience",
        dimension_label: "Audience",
        terms: [
            { code: "adults", label: "Adults" },
            { code: "seniors", label: "Seniors" },
            { code: "parents", label: "Parents" },
        ],
    },
];

describe("taxonomyChips", () => {
    test("extracts labels from arrays and serialized map feature values", () => {
        const labels = [
            "Sports and Physical Activity",
            "Training",
            "Adults",
            "Seniors",
            "Parents",
        ];
        expect(taxonomyChipLabels(assignments)).toEqual(labels);
        expect(taxonomyChipLabels(JSON.stringify(assignments))).toEqual(labels);
    });

    test("returns a compact preview with a hidden count", () => {
        expect(previewTaxonomyChips(assignments, 3)).toEqual({
            visible: ["Sports and Physical Activity", "Training", "Adults"],
            hiddenCount: 2,
        });
    });
});

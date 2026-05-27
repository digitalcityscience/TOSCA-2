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
    test("extracts labels from array and serialized map feature values", () => {
        expect(taxonomyChipLabels(assignments)).toEqual([
            "Sports and Physical Activity",
            "Training",
            "Adults",
            "Seniors",
            "Parents",
        ]);
        expect(taxonomyChipLabels(JSON.stringify(assignments))).toEqual([
            "Sports and Physical Activity",
            "Training",
            "Adults",
            "Seniors",
            "Parents",
        ]);
    });

    test("returns a compact preview with hidden count", () => {
        expect(previewTaxonomyChips(assignments, 3)).toEqual({
            visible: ["Sports and Physical Activity", "Training", "Adults"],
            hiddenCount: 2,
        });
    });
});

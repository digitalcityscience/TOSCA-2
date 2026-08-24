import { polygon } from "@turf/helpers";
import { describe, expect, test } from "vitest";
import type { FeatureCollection, MultiPolygon, Polygon } from "@helpers/geojson";
import { maskContextAroundPhysicalFootprints } from "./collabMasking";

function fc(features: ReturnType<typeof polygon>[]): FeatureCollection<Polygon | MultiPolygon> {
    return { type: "FeatureCollection", features } as FeatureCollection<Polygon | MultiPolygon>;
}

describe("maskContextAroundPhysicalFootprints", () => {
    test("cuts an overlapping physical footprint out of the context polygon as a hole", () => {
        const context = fc([polygon([[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]], { id: "context-1" })]);
        const footprint = fc([polygon([[[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]])]);

        const result = maskContextAroundPhysicalFootprints(context, footprint);

        expect(result.features).toHaveLength(1);
        expect(result.features[0].geometry.coordinates).toHaveLength(2);
        expect(result.features[0].geometry.coordinates[0]).toEqual(context.features[0].geometry.coordinates[0]);
        expect(result.features[0].properties).toEqual({ id: "context-1" });
    });

    test("leaves a context polygon untouched when no footprint overlaps it", () => {
        const context = fc([polygon([[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]])]);
        const footprint = fc([polygon([[[50, 50], [51, 50], [51, 51], [50, 51], [50, 50]]])]);

        const result = maskContextAroundPhysicalFootprints(context, footprint);

        expect(result.features).toHaveLength(1);
        expect(result.features[0].geometry.coordinates).toHaveLength(1);
    });

    test("passes context through unmasked when there are no physical footprints", () => {
        const context = fc([polygon([[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]])]);

        const result = maskContextAroundPhysicalFootprints(context, { type: "FeatureCollection", features: [] });

        expect(result.features).toHaveLength(1);
        expect(result.features[0].geometry.coordinates).toHaveLength(1);
    });

    test("adds one hole ring per overlapping footprint when several overlap the same context polygon", () => {
        const context = fc([polygon([[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]])]);
        const footprints = fc([
            polygon([[[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]]]),
            polygon([[[5, 5], [6, 5], [6, 6], [5, 6], [5, 5]]]),
        ]);

        const result = maskContextAroundPhysicalFootprints(context, footprints);

        expect(result.features[0].geometry.coordinates).toHaveLength(3);
    });
});

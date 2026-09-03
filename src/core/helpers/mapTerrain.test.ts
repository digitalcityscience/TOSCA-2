import { describe, expect, test, vi } from "vitest";
import { type Map } from "maplibre-gl";
import { syncTerrainHillshadeVisibility } from "./mapTerrain";

describe("syncTerrainHillshadeVisibility", () => {
    test.each([
        [{ source: "terrain-dem" }, "visible", true],
        [null, "none", false],
    ] as const)(
        "sets hillshade visibility from the current terrain state",
        (terrain, visibility, expectedEnabled) => {
            const setLayoutProperty = vi.fn();
            const map = {
                getTerrain: () => terrain,
                getLayer: () => ({}),
                setLayoutProperty,
            } as unknown as Map;

            expect(syncTerrainHillshadeVisibility(map, "terrain-hillshade"))
                .toBe(expectedEnabled);
            expect(setLayoutProperty).toHaveBeenCalledWith(
                "terrain-hillshade",
                "visibility",
                visibility
            );
        }
    );

    test("still reports terrain state when the hillshade layer is unavailable", () => {
        const setLayoutProperty = vi.fn();
        const map = {
            getTerrain: () => null,
            getLayer: () => undefined,
            setLayoutProperty,
        } as unknown as Map;

        expect(syncTerrainHillshadeVisibility(map, "terrain-hillshade")).toBe(false);
        expect(setLayoutProperty).not.toHaveBeenCalled();
    });
});

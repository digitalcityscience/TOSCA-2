import { describe, expect, test, vi } from "vitest";
import { GREEN_OVERLAY_LAYER_IDS, GreenSpacesOverlays } from "./greenSpacesOverlays";
import { OVERLAY_LAYER_IDS } from "./fifteenMinuteOverlays";

/** A map that only remembers which layers, sources and images exist. */
function fakeMap() {
    const layers = new Map<string, unknown>();
    const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
    const images = new Set<string>();
    return {
        layers, sources, images,
        addSource: (id: string) => { sources.set(id, { setData: vi.fn() }); },
        getSource: (id: string) => sources.get(id),
        removeSource: (id: string) => { sources.delete(id); },
        addLayer: (layer: { id: string }) => { layers.set(layer.id, layer); },
        getLayer: (id: string) => layers.get(id),
        removeLayer: (id: string) => { layers.delete(id); },
        moveLayer: vi.fn(),
        hasImage: (id: string) => images.has(id),
        addImage: (id: string) => { images.add(id); },
    };
}

describe("GreenSpacesOverlays", () => {
    test("adds its layers and sources on demand, never twice, and removes every one of them on dispose", () => {
        const map = fakeMap();
        const overlays = new GreenSpacesOverlays(map as never);
        const building: GeoJSON.Geometry = { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
        for (let round = 0; round < 2; round += 1) {
            overlays.setSelectedBuilding({ geometry: building, height: 8 });
            overlays.setHighlightedArea(building);
            overlays.setMarkers([{ center: [0, 0], label: "A", selected: true }]);
            overlays.setAreaOutlines([{ geometry: building, tone: "a", name: "X" }]);
        }
        expect(map.layers.size).toBe(Object.keys(GREEN_OVERLAY_LAYER_IDS).length + Object.keys(OVERLAY_LAYER_IDS).length);
        expect([...map.sources.keys()].sort()).toEqual(["fm-areas", "fm-selection", "gs-highlight", "gs-markers"]);
        overlays.raise();
        expect(map.moveLayer).toHaveBeenCalled();

        overlays.dispose();
        expect(map.layers.size).toBe(0);
        expect(map.sources.size).toBe(0);
        // A disposed overlay ignores late updates instead of re-adding layers (repeated story opening).
        overlays.setMarkers([{ center: [0, 0], label: "A", selected: false }]);
        overlays.setHighlightedArea(building);
        expect(map.layers.size).toBe(0);
    });

    test("clearing a selection empties the source without removing it", () => {
        const map = fakeMap();
        const overlays = new GreenSpacesOverlays(map as never);
        overlays.setHighlightedArea({ type: "Point", coordinates: [0, 0] });
        overlays.setHighlightedArea(undefined);
        expect(map.sources.get("gs-highlight")!.setData).toHaveBeenLastCalledWith({ type: "FeatureCollection", features: [] });
    });

    test("without a canvas no playground icon is added and nothing throws", () => {
        const map = fakeMap();
        const overlays = new GreenSpacesOverlays(map as never);
        expect(() => overlays.ensurePlaygroundIcon()).not.toThrow();
    });
});

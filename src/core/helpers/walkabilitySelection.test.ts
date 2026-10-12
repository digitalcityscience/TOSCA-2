import { expect, test, vi } from "vitest";
import { highlightWalkabilitySelection } from "./walkabilitySelection";
import { resolveWalkabilityStyling } from "../../config/urbanStories/styles/walkabilitySafety";
import type { LayerObjectWithAttributes } from "@store/map";

test("selection uses source feature IDs, deduplicates casing hits and ignores unrelated layers", () => {
    const bundle = resolveWalkabilityStyling("street-segments")!;
    const owner = { source: "runtime-source", activeStyleId: bundle.defaultStyleId, availableStyles: bundle.styles } as LayerObjectWithAttributes;
    const map = { setFeatureState: vi.fn(), removeFeatureState: vi.fn(), getSource: vi.fn(() => ({})) };
    const feature = { source: owner.source, sourceLayer: "hamburg_mobility", id: 605, properties: {} };
    const clear = highlightWalkabilitySelection(map as never, [feature, feature, { ...feature, source: "other" }], [owner]);
    expect(map.setFeatureState).toHaveBeenCalledExactlyOnceWith({ source: owner.source, sourceLayer: feature.sourceLayer, id: 605 }, { "walkability-selected": true });
    // The metric can change its render IDs; the source/feature identity remains stable.
    owner.activeStyleId = bundle.styles[1].id;
    clear();
    expect(map.removeFeatureState).toHaveBeenCalledWith({ source: owner.source, sourceLayer: feature.sourceLayer, id: 605 }, "walkability-selected");
});

test("closing the popup after removing its source is harmless", () => {
    const bundle = resolveWalkabilityStyling("buildings-comfort-safety")!;
    const owner = { source: "buildings", activeStyleId: bundle.defaultStyleId, availableStyles: bundle.styles } as LayerObjectWithAttributes;
    const map = { setFeatureState: vi.fn(), removeFeatureState: vi.fn(), getSource: vi.fn(() => undefined) };
    const clear = highlightWalkabilitySelection(map as never, [{ source: owner.source, sourceLayer: "hamburg_buildings", id: 1, properties: {} }], [owner]);
    expect(clear).not.toThrow();
    expect(map.removeFeatureState).not.toHaveBeenCalled();
});

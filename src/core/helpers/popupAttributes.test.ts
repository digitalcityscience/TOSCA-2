import { describe, expect, it } from "vitest";
import { popupPropertyRows, withPopupAttributes } from "./popupAttributes";
import { deduplicatePopupAttributeFeatures, type PopupAttributeFeature } from "../../store/geoserver";
import type { LayerObjectWithAttributes } from "../../store/map";

describe("popup attributes", () => {
    it("merges contributions in member order without letting an empty list hide fields", () => {
        const feature = { source: "a", id: 1, properties: { rate: 0, flag: false, unrelated: 9 }, attributeContributions: [
            { order: 2, attributes: [] },
            { order: 1, attributes: [{ name: "rate", labels: { en: "Later", de: "Rate" } }, { name: "flag" }] },
            { order: 0, attributes: [{ name: "rate", labels: { en: "Prevalence", de: "" } }, { name: "missing" }] },
        ] };
        expect(popupPropertyRows(feature, "de-DE")).toEqual([
            { name: "rate", label: "Rate", value: "0" }, { name: "flag", label: "flag", value: "false" },
        ]);
        expect(popupPropertyRows(feature, "tr")[0].label).toBe("Prevalence");
    });
    it("distinguishes missing metadata, empty lists and unavailable values", () => {
        const feature = { source: "a", properties: { a: 1, b: null, c: "" } };
        expect(popupPropertyRows(feature, "en")).toHaveLength(1);
        expect(popupPropertyRows({ ...feature, attributeContributions: [{ order: 0, attributes: [] }] }, "en")).toEqual([]);
        expect(popupPropertyRows({ ...feature, attributeContributions: [{ order: 0, attributes: [{ name: "missing" }] }] }, "en")).toEqual([]);
    });
    it("combines duplicate dataset members only when their render passes were hit", () => {
        const owner = {
            id: "render-a", source: "source-a", companionLayerIds: ["render-b", "render-c"],
            groupSourceIds: { a: "source-a", b: "source-b", c: "source-c" },
            groupManifest: {
                layers: ["a", "b", "c"].map((id) => ({ id, metadata: { "tosca:member-id": id } })),
                members: ["a", "b", "c"].map((id, order) => ({ id, order, layer_id: "same-data", source_alias: id, style_assignment: { style_id: id } })),
                styles: { a: { attributes: [{ name: "a" }] }, b: { attributes: [] }, c: { attributes: [{ name: "c" }] } },
            },
        } as unknown as LayerObjectWithAttributes;
        const features: PopupAttributeFeature[] = ["a", "b"].map((id) => ({ id: 1, source: `source-${id}`, layer: { id: `render-${id}` }, properties: { a: 1, c: 2 } }));
        const merged = deduplicatePopupAttributeFeatures(features.map((feature) => withPopupAttributes(feature, [owner])));
        expect(merged).toHaveLength(1);
        expect(popupPropertyRows(merged[0], "en").map((row) => row.name)).toEqual(["a"]);
        expect(features[0].attributeContributions).toBeUndefined();
    });
});

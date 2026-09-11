import { describe, expect, it, vi } from "vitest";
import { resolveGroupPopupAttributes } from "./groupPopupAttributes";
import type { CatalogLayerGroupManifest } from "../../store/geoserver";

const style = (extra: Record<string, unknown> = {}) => ({
    id: "s", name: "s", title: "s", format: "mbstyle", href: "/styles/s", content_hash: "x", sprite_id: null, ...extra,
}) as CatalogLayerGroupManifest["styles"][string];

describe("group popup metadata loading", () => {
    it("reads original JSON metadata once per URL and preserves empty lists", async () => {
        const load = vi.fn().mockResolvedValue({ metadata: { "tosca:attributes": [] } });
        const result = await resolveGroupPopupAttributes({ a: style(), b: style() }, load);
        expect(load).toHaveBeenCalledTimes(1);
        expect(result.a.attributes).toEqual([]);
        expect(result.b.attributes).toEqual([]);
    });
    it("keeps explicit manifest lists and skips SLD styles", async () => {
        const load = vi.fn();
        const styles = { a: style({ attributes: [] }), b: style({ attributes: [{ name: "POP" }] }), c: style({ format: "sld" }) };
        expect(await resolveGroupPopupAttributes(styles, load)).toEqual(styles);
        expect(load).not.toHaveBeenCalled();
    });
    it("does not prevent loading the group when optional style metadata fails", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        try {
            const styles = { a: style() };
            expect(await resolveGroupPopupAttributes(styles, vi.fn().mockRejectedValue(new Error("offline")))).toEqual(styles);
            expect(warn).toHaveBeenCalledOnce();
        } finally { warn.mockRestore(); }
    });
    it("ignores malformed metadata rather than breaking the popup", async () => {
        const styles = { a: style() };
        expect(await resolveGroupPopupAttributes(styles, async () => ({ metadata: { "tosca:attributes": [{ name: "POP", labels: { en: 123 } }] } }))).toEqual(styles);
    });
});

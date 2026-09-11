import type { PopupAttributeDefinition, PopupAttributeFeature } from "../../store/geoserver";
import type { LayerObjectWithAttributes } from "../../store/map";

/**
 * Capture the matching style's popup contribution before deduplicating features.
 *
 * @remarks
 * Call for hit features from visible render passes. Group members resolve through
 * `tosca:member-id` metadata or their render/effective layer IDs; raster hits can
 * supply `popupMemberId`. A member's `style_assignment.attributes` overrides its
 * style's manifest attributes, including when the override is an empty array.
 *
 * Copies of one dataset in a group share the first member's runtime source,
 * identified by `layer_id`, so subsequent feature deduplication can combine their
 * contributions. Different datasets and separately added logical layers retain
 * separate source identities. An empty list contributes nothing and never removes
 * fields contributed by another style.
 *
 * Configuration is captured on map click. Reopen the popup after changing style
 * or visibility; locale changes are resolved reactively when formatting rows.
 * This only controls presentation and does not remove downloaded properties.
 *
 * @param feature - A feature retaining its matched render layer or raster member.
 * @param owners - Logical map layers that own the rendered sources and styles.
 * @returns A feature copy with normalized source and optional style contribution.
 */
export function withPopupAttributes(feature: PopupAttributeFeature, owners: LayerObjectWithAttributes[]): PopupAttributeFeature {
    const owner = owners.find((layer) => [layer.id, ...(layer.companionLayerIds ?? [])].includes(feature.layer?.id ?? "") ||
        (feature.layer === undefined && (layer.source === feature.source || layer.managedSourceIds?.includes(feature.source))));
    if (owner === undefined) return { ...feature };
    let attributes = owner.availableStyles?.find((style) => style.id === owner.activeStyleId)?.attributes ?? owner.attributes;
    let source = feature.source;
    let order = 0;
    if (owner.groupManifest !== undefined) {
        const manifest = owner.groupManifest;
        const index = [owner.id, ...(owner.companionLayerIds ?? [])].indexOf(feature.layer?.id ?? "");
        const raw = manifest.layers[index];
        const member = manifest.members.find((candidate) => candidate.id === (feature.popupMemberId ?? raw?.metadata?.["tosca:member-id"]) ||
            (raw !== undefined && (candidate.render_layer_ids ?? candidate.effective_style_layer_ids ?? []).includes(raw.id))) ??
            (feature.layer === undefined ? manifest.members.find((candidate) => owner.groupSourceIds?.[candidate.source_key ?? candidate.source_alias] === feature.source) : undefined);
        if (member !== undefined) {
            attributes = member.style_assignment.attributes ?? manifest.styles[member.style_assignment.style_id]?.attributes;
            order = member.order;
            // Use the first member's runtime source for the same dataset inside this group.
            const first = manifest.members.find((candidate) => candidate.layer_id === member.layer_id)!;
            source = owner.groupSourceIds?.[first.source_key ?? first.source_alias] ?? source;
        }
    }
    return { ...feature, source, ...(attributes === undefined ? {} : { attributeContributions: [{ order, attributes }] }) };
}

/**
 * Merge style contributions and format the feature's visible attribute rows.
 *
 * @remarks
 * Fields are unioned by exact property name, in group-member `order` and then
 * configured attribute order. The first nonblank translation for each language
 * wins. Labels resolve by current locale, base language, English, then exact
 * attribute name; blank translations count as missing.
 *
 * An empty array contributes no fields and cannot suppress another member's
 * contribution. Missing metadata contributes nothing when any participant defines
 * a list. All properties are shown only when every participant omits metadata.
 *
 * Missing properties, null, undefined, and empty strings are skipped; zero and
 * false remain visible. If no configured fields have values, the returned empty
 * array lets the modal show its empty-attributes message without exposing
 * unrelated fields. The caller can recompute rows on locale changes.
 *
 * @param feature - A feature with any deduplicated style contributions.
 * @param locale - Current UI locale, such as `de-DE`.
 * @returns Ordered rows with raw names, resolved labels, and formatted values.
 */
export function popupPropertyRows(feature: PopupAttributeFeature, locale: string): Array<{ name: string; label: string; value: string }> {
    const definitions = new Map<string, PopupAttributeDefinition>();
    const contributions = feature.attributeContributions;
    for (const contribution of [...(contributions ?? [])].sort((a, b) => a.order - b.order)) {
        for (const attribute of contribution.attributes) {
            const previous = definitions.get(attribute.name);
            const labels = { ...(previous?.labels ?? {}) };
            for (const [language, label] of Object.entries(attribute.labels ?? {})) {
                if (label.trim() !== "" && !labels[language]?.trim()) labels[language] = label;
            }
            definitions.set(attribute.name, { name: attribute.name, labels });
        }
    }
    const fields = contributions === undefined ? Object.keys(feature.properties) : [...definitions.keys()];
    return fields.flatMap((name) => {
        if (!Object.prototype.hasOwnProperty.call(feature.properties, name)) return [];
        const value = feature.properties[name];
        if (value === undefined || value === null || value === "") return [];
        const labels = definitions.get(name)?.labels;
        const label = [locale, locale.split("-")[0], "en"].map((language) => labels?.[language]).find((value) => value?.trim());
        const displayValue = typeof value === "string" || typeof value === "number" || typeof value === "boolean" || typeof value === "bigint"
            ? String(value)
            : JSON.stringify(value) ?? "";
        return [{ name, label: label ?? name, value: displayValue }];
    });
}

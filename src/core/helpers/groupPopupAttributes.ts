import type { CatalogLayerGroupManifest, PopupAttributeDefinition } from "../../store/geoserver";

/**
 * Load popup attribute metadata omitted by older group manifests.
 *
 * @remarks
 * Reads top-level `metadata["tosca:attributes"]` from each referenced MBStyle
 * document when `styles[styleId].attributes` is absent. Explicit manifest lists,
 * including empty arrays, take precedence. Requests for the same URL are shared
 * within this call; SLD styles are skipped. Missing or malformed metadata leaves
 * the style unchanged, and a failed request is logged without blocking the group.
 * Member-specific overrides are applied by `withPopupAttributes`.
 *
 * Style JSON metadata works for both standalone layers and groups without a
 * separate manifest attributes field. The catalog backend must persist and serve
 * the documents; this frontend consumes them and supplies no catalog editing UI
 * or database migration.
 *
 * @param styles - Styles indexed by their group manifest keys.
 * @param loadStyle - Loader for the original catalog style document.
 * @returns Style records enriched with their configured popup attributes.
 */
export async function resolveGroupPopupAttributes(
    styles: CatalogLayerGroupManifest["styles"],
    loadStyle: (href: string) => Promise<unknown>,
): Promise<CatalogLayerGroupManifest["styles"]> {
    const requests = new Map<string, Promise<unknown>>();
    const entries = await Promise.all(Object.entries(styles).map(async ([key, style]) => {
        if (style.attributes !== undefined || style.format !== "mbstyle") return [key, style] as const;
        try {
            let request = requests.get(style.href);
            if (request === undefined) {
                request = loadStyle(style.href);
                requests.set(style.href, request);
            }
            const document = await request;
            if (!isRecord(document) || !isRecord(document.metadata)) return [key, style] as const;
            const attributes = document.metadata["tosca:attributes"];
            if (!isAttributeList(attributes)) return [key, style] as const;
            return [key, { ...style, attributes }] as const;
        } catch (error) {
            console.warn(`Could not load popup attributes for group style ${style.name}`, error);
            return [key, style] as const;
        }
    }));
    return Object.fromEntries(entries);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isAttributeList(value: unknown): value is PopupAttributeDefinition[] {
    return Array.isArray(value) && value.every((attribute: unknown) => isRecord(attribute) &&
        typeof attribute.name === "string" &&
        (attribute.labels === undefined || (isRecord(attribute.labels) &&
            Object.values(attribute.labels).every((label) => typeof label === "string"))));
}

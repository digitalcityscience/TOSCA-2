import {
    buildCatalogStyleUrl,
    catalogLayerStyleReferences,
    selectCatalogStyleLayers,
    type CatalogGroupStyleLayer,
    type CatalogLayerStyleReference,
    type CatalogStyleListItem,
    type GeoServerVectorTypeLayerDetail,
    type GeoserverLayerInfo,
    type GeoserverRasterTypeLayerDetail,
    useGeoserverStore,
} from "@store/geoserver";
import {
    createMapRuntimeId,
    mbStyleLayerOptions,
    rewriteSpriteLayout,
    rewriteSpritePaint,
    useMapStore,
    type GeoServerSourceParams,
    type LayerParams,
    type MapLayerStyleOption,
    type MapLibreLayerTypes,
} from "@store/map";
import type { AddLayerObject } from "maplibre-gl";
import { reportDeveloperError } from "./userFacingError";

/**
 * Headless "Add as Layer" logic for catalog layers (UST-03).
 *
 * @remarks
 * Moved out of the Datastores components so the Datastores listing and the Urban Stories
 * panel share one implementation. Nothing here opens sidebars or shows toasts: callers decide.
 * Vector layers only use the catalog → WMTS/MVT path; there is no WMS fallback for them.
 */

export interface LayerStylingBundle {
    styles: MapLayerStyleOption[];
    defaultStyleId: string;
}

export type ResolvedCatalogLayer =
    | { ok: true; info: GeoserverLayerInfo; detail: GeoServerVectorTypeLayerDetail | GeoserverRasterTypeLayerDetail }
    | { ok: false; reason: "not-found" | "error"; error?: unknown };

export interface AddCatalogVectorLayerOptions {
    detail: GeoServerVectorTypeLayerDetail;
    workspace: string;
    styling?: LayerStylingBundle;
    displayName?: string;
    /** Zoom floor for heavy layers. */
    minZoom?: number;
    /** Catalog style name to select instead of the default (UST-05). Unknown names are ignored. */
    preferredStyleName?: string;
}

export interface AddCatalogVectorLayerResult {
    runtimeId: string;
    /** True when a catalog style was used and it lacks a `minzoom` at or above the requested floor. */
    minZoomWarning: boolean;
}

export interface AddCatalogRasterLayerOptions {
    detail: GeoserverRasterTypeLayerDetail;
    workspace: string;
    attributes?: GeoserverLayerInfo["defaultStyle"]["attributes"];
    time?: string;
}

/**
 * A catalog style the caller wants on a layer although the layer does not list it (M4).
 *
 * @remarks
 * The style is fetched by name from the provider style list and used only when its document
 * proves it belongs to the layer, see `loadSupplementalStyle`.
 */
export interface SupplementalStyleRequest {
    /** Catalog style `name` (or `qualified_name`). */
    name: string;
    /** The attribute the style visualises; checked against `metadata["tosca:metric"]` when the style declares one. */
    attribute?: string;
}

const NOT_FOUND_PATTERN = /\(404\b/;

/** Resolve a catalog layer and its resource detail without throwing on a missing layer. */
export async function resolveCatalogLayer(
    ref: { providerId: string; workspace: string; layerName: string }
): Promise<ResolvedCatalogLayer> {
    const geoserver = useGeoserverStore();
    try {
        const response = await geoserver.getLayerInformation(
            { name: ref.layerName, href: "" },
            ref.workspace,
            ref.providerId
        );
        const detail = await geoserver.getLayerDetail(response.layer.resource.href);
        return { ok: true, info: response.layer, detail };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (NOT_FOUND_PATTERN.test(message)) return { ok: false, reason: "not-found", error };
        return { ok: false, reason: "error", error };
    }
}

/** Why a supplemental style was refused, for the developer log. `undefined` = usable. */
function supplementalStyleProblem(
    style: { layers?: unknown; metadata?: Record<string, unknown> } | undefined,
    layerName: string,
    attribute: string | undefined
): string | undefined {
    if (!Array.isArray(style?.layers) || style.layers.length === 0) return "it is not a usable MBStyle document";
    const layers = style.layers as CatalogGroupStyleLayer[];
    if (!layers.some((layer) => layer["source-layer"] === layerName)) {
        return `none of its style layers has source-layer "${layerName}"`;
    }
    const declared = style.metadata?.["tosca:metric"];
    if (attribute !== undefined && typeof declared === "string" && declared !== attribute) {
        return `it declares metric "${declared}", not "${attribute}"`;
    }
    return undefined;
}

/**
 * Load a catalog style that is registered with the provider but not assigned to the layer.
 *
 * Returns `undefined` (and logs why) unless the style is an MBStyle that targets this layer's
 * `source-layer` and, when it declares `tosca:metric`, the requested attribute. A wrong style is
 * never applied to a layer it was not written for.
 */
async function loadSupplementalStyle(
    request: SupplementalStyleRequest,
    catalogStyles: CatalogStyleListItem[],
    providerId: string,
    workspaceName: string,
    layerName: string
): Promise<MapLayerStyleOption | undefined> {
    const geoserver = useGeoserverStore();
    const catalogStyle = catalogStyles.find((style) => (
        style.format === "mbstyle"
        && (style.qualified_name === request.name
            || (style.name === request.name && (style.scope === "global" || style.workspace?.name === workspaceName)))
    ));
    if (catalogStyle === undefined) return undefined;
    try {
        const style = await geoserver.getLayerStyling(buildCatalogStyleUrl(providerId, catalogStyle.id).toString());
        const problem = supplementalStyleProblem(style, layerName, request.attribute);
        if (problem !== undefined) {
            reportDeveloperError(`Style ${request.name} is not applied to ${workspaceName}:${layerName}`, new Error(problem));
            return undefined;
        }
        const reference = { id: catalogStyle.id, name: catalogStyle.name, href: "", format: catalogStyle.format } as CatalogLayerStyleReference;
        return {
            id: catalogStyle.id,
            name: catalogStyle.name,
            title: catalogStyle.title || catalogStyle.name,
            isDefault: false,
            layers: selectCatalogStyleLayers(style.layers as CatalogGroupStyleLayer[], reference, layerName)
                .map((layer: CatalogGroupStyleLayer) => ({ ...layer })),
            attributes: catalogStyle.attributes ?? style.metadata?.["tosca:attributes"],
            ...(typeof style.sprite === "string" ? { spriteUrl: style.sprite } : {}),
        } satisfies MapLayerStyleOption;
    } catch (error) {
        reportDeveloperError(`Loading style ${request.name} for ${workspaceName}:${layerName}`, error);
        return undefined;
    }
}

/**
 * Load the MBStyles registered for a catalog layer.
 *
 * Failures of individual styles are logged and skipped, so a layer with a missing style still
 * resolves with the generated fallback paint (`undefined`).
 */
export async function loadCatalogLayerStyling(
    layerInfo: GeoserverLayerInfo,
    workspaceName: string,
    providerId: string,
    layerName: string,
    /** Provider style list when the caller already holds it (avoids a second lookup). */
    knownCatalogStyles?: CatalogStyleListItem[],
    /** Extra provider styles to offer next to the layer's own, e.g. styles not yet assigned as alternates. */
    supplementalStyles: SupplementalStyleRequest[] = []
): Promise<LayerStylingBundle | undefined> {
    const geoserver = useGeoserverStore();
    try {
        let catalogStyles: CatalogStyleListItem[] = knownCatalogStyles ?? [];
        if (knownCatalogStyles === undefined) {
            try {
                catalogStyles = await geoserver.getStyleList(providerId);
            } catch (styleListError) {
                reportDeveloperError(`Loading style catalog for provider ${providerId}`, styleListError);
            }
        }
        const references = catalogLayerStyleReferences(layerInfo, catalogStyles, providerId, workspaceName);
        const loadedStyles = await Promise.all(references.map(async (reference, index) => {
            try {
                const style = await geoserver.getLayerStyling(reference.href);
                if (!Array.isArray(style?.layers) || style.layers.length === 0) return undefined;
                const selectedLayers = selectCatalogStyleLayers(
                    style.layers as CatalogGroupStyleLayer[],
                    reference,
                    layerName
                );
                const optionId = reference.id ?? reference.assignmentId ?? reference.href;
                return {
                    id: optionId,
                    name: reference.name,
                    title: reference.title ?? reference.name,
                    isDefault: index === 0,
                    layers: selectedLayers.map((layer: CatalogGroupStyleLayer) => ({ ...layer })),
                    attributes: reference.attributes ?? style.metadata?.["tosca:attributes"],
                    ...(typeof style.sprite === "string" ? { spriteUrl: style.sprite } : {}),
                } satisfies MapLayerStyleOption;
            } catch (styleError) {
                reportDeveloperError(
                    `Loading optional style ${reference.name} for ${workspaceName}:${layerName}`,
                    styleError
                );
                return undefined;
            }
        }));
        const assignedNames = new Set(references.map((reference) => reference.name));
        // Supplemental styles are alternates only: without a loaded default they would become it.
        const requested = loadedStyles.every((style) => style === undefined) ? [] : supplementalStyles.filter((request, index, all) => (
            !assignedNames.has(request.name) && all.findIndex((other) => other.name === request.name) === index
        ));
        const loadedSupplemental = await Promise.all(requested.map(async (request) => (
            await loadSupplementalStyle(request, catalogStyles, providerId, workspaceName, layerName)
        )));
        const availableStyles: MapLayerStyleOption[] = [...loadedStyles, ...loadedSupplemental].flatMap(
            (style) => style === undefined ? [] : [style]
        );
        if (availableStyles.length === 0) return undefined;
        // The reference flagged isDefault may have failed to load and been dropped above;
        // fall back to the first survivor so one option is always marked default.
        if (!availableStyles.some((style) => style.isDefault)) {
            availableStyles[0].isDefault = true;
        }
        const defaultStyle = availableStyles.find((style) => style.isDefault) ?? availableStyles[0];
        return { styles: availableStyles, defaultStyleId: defaultStyle.id };
    } catch (styleError) {
        reportDeveloperError(`Loading optional style for ${workspaceName}:${layerName}`, styleError);
        return undefined;
    }
}

function geometryTypeOf(detail: GeoServerVectorTypeLayerDetail): string {
    const geometryAttributes = detail.featureType.attributes.attribute.filter(
        (attribute) => attribute.name.includes("geom")
    );
    if (geometryAttributes.length === 0) return "";
    return geometryAttributes[0].binding.split(".").slice(-1)[0].replace(/multi|string/gi, "");
}

/**
 * Add a catalog vector layer through the catalog → WMTS/MVT path and return its runtime id.
 *
 * @throws The underlying map-store error. A sprite acquired for the layer is released first.
 */
export async function addCatalogVectorLayer(
    options: AddCatalogVectorLayerOptions
): Promise<AddCatalogVectorLayerResult> {
    const { detail, workspace, styling, minZoom, preferredStyleName } = options;
    const mapStore = useMapStore();
    const displayTitle = detail.featureType.title;
    const cleanLayerName = (displayTitle != null ? displayTitle : detail.featureType.name).replaceAll("_", " ");
    const resourceKey = `${detail.catalog?.provider.id ?? "provider"}:${workspace}:${detail.featureType.name}`;
    const runtimeId = createMapRuntimeId("layer", resourceKey);
    const sourceParams: GeoServerSourceParams = {
        sourceType: "geoserver",
        identifier: runtimeId,
        isFilterLayer: false,
        workspaceName: workspace,
        layer: detail,
        sourceDataType: "vector",
        sourceProtocol: "wmts",
    };
    let spriteRuntimeId: string | undefined;
    let spriteRegisteredOnLayer = false;
    let minZoomWarning = false;
    try {
        await mapStore.addMapDataSource(sourceParams);
        const preferredStyle = preferredStyleName === undefined
            ? undefined
            : styling?.styles.find((style) => style.name === preferredStyleName);
        const selectedStyle = preferredStyle ?? styling?.styles.find(
            (style) => style.id === styling.defaultStyleId
        ) ?? styling?.styles[0];
        const selectedStyleLayers = (selectedStyle?.layers ?? []).map((layer) => ({
            ...layer,
            metadata: {
                ...(layer.metadata ?? {}),
                "tosca:member-id": "standalone",
                "tosca:style-id": "standalone-style",
            },
        }));
        if (selectedStyle?.spriteUrl !== undefined) {
            spriteRuntimeId = await mapStore.acquireMapSprite(
                selectedStyle.spriteUrl,
                `sprite-${runtimeId.replace(/[^a-zA-Z0-9_-]+/g, "-")}`
            );
        }
        const firstStyleLayer = selectedStyleLayers[0];
        let layerStyle = firstStyleLayer === undefined
            ? undefined
            : mbStyleLayerOptions(firstStyleLayer, spriteRuntimeId);
        if (minZoom !== undefined) {
            if (firstStyleLayer === undefined) {
                // Generated fallback style: the floor is ours to set.
                layerStyle = { ...(layerStyle ?? {}), minzoom: minZoom };
            } else if (firstStyleLayer.minzoom === undefined || firstStyleLayer.minzoom < minZoom) {
                // Catalog style documents are never mutated; report instead.
                minZoomWarning = true;
            }
        }
        const layerParams: LayerParams = {
            sourceType: "geoserver",
            identifier: runtimeId,
            sourceIdentifier: runtimeId,
            layerType: (firstStyleLayer?.type as MapLibreLayerTypes | undefined) ?? mapStore.geometryConversion(geometryTypeOf(detail)),
            layerStyle,
            geoserverLayerDetails: detail,
            sourceLayer: `${detail.featureType.name}`,
            displayName: options.displayName ?? detail.featureType.title ?? undefined,
            sourceDataType: "vector",
            sourceProtocol: "wmts",
            workspaceName: workspace,
        };
        await mapStore.addMapLayer(layerParams);
        const logicalLayer = mapStore.layersOnMap.find((layer) => layer.id === runtimeId);
        if (logicalLayer !== undefined && selectedStyleLayers.length > 0) {
            logicalLayer.mbStyleLayers = selectedStyleLayers;
            logicalLayer.mbStyleLegendContext = {
                members: [{ id: "standalone", title: cleanLayerName }],
                styles: {
                    "standalone-style": {
                        sprite_id: selectedStyle?.spriteUrl === undefined ? null : "standalone-sprite",
                    },
                },
                sprites: selectedStyle?.spriteUrl === undefined
                    ? {}
                    : { "standalone-sprite": { url: selectedStyle.spriteUrl } },
            };
            logicalLayer.availableStyles = styling?.styles;
            logicalLayer.activeStyleId = selectedStyle?.id;
            if (spriteRuntimeId !== undefined) {
                logicalLayer.spriteRuntimeIds = [spriteRuntimeId];
                spriteRegisteredOnLayer = true;
            }
        }
        selectedStyleLayers.slice(1).forEach((styleLayer, index) => {
            mapStore.addCompanionLayer(runtimeId, {
                ...styleLayer,
                id: `${runtimeId}:style:${index + 1}`,
                type: styleLayer.type as MapLibreLayerTypes,
                source: runtimeId,
                "source-layer": detail.featureType.name,
                ...(styleLayer.paint === undefined
                    ? {}
                    : { paint: rewriteSpritePaint(styleLayer.paint, spriteRuntimeId) }),
                ...(styleLayer.layout === undefined
                    ? {}
                    : { layout: rewriteSpriteLayout(styleLayer.layout, spriteRuntimeId) }),
            } as AddLayerObject);
        });
        if (spriteRuntimeId !== undefined && !spriteRegisteredOnLayer) {
            // The sprite was acquired but never attached to a logical layer (e.g. the layer
            // record could not be resolved), so its owning layer will never release it.
            // Drop the reference now to avoid leaking the sprite.
            mapStore.releaseMapSprite(spriteRuntimeId);
            spriteRuntimeId = undefined;
        }
        return { runtimeId, minZoomWarning };
    } catch (error) {
        if (spriteRuntimeId !== undefined && !spriteRegisteredOnLayer) {
            mapStore.releaseMapSprite(spriteRuntimeId);
        }
        throw error;
    }
}

/**
 * Add a standalone raster layer (WMS path, as the Datastores listing always did).
 *
 * @remarks
 * Popup attributes come from the default catalog style reference's `attributes` array.
 * Omission preserves the all-properties fallback; an empty array explicitly contributes no fields.
 */
export async function addCatalogRasterLayer(options: AddCatalogRasterLayerOptions): Promise<string> {
    const { detail, workspace, attributes, time } = options;
    const mapStore = useMapStore();
    const resourceKey = `${detail.catalog?.provider.id ?? "provider"}:${workspace}:${detail.coverage.name}`;
    const runtimeId = createMapRuntimeId("layer", resourceKey);
    const sourceParams: GeoServerSourceParams = {
        sourceType: "geoserver",
        identifier: runtimeId,
        isFilterLayer: false,
        workspaceName: workspace,
        layer: detail,
        sourceDataType: "raster",
        sourceProtocol: "wms",
        time,
    };
    await mapStore.addMapDataSource(sourceParams);
    const layerParams: LayerParams = {
        sourceType: "geoserver",
        identifier: runtimeId,
        sourceIdentifier: runtimeId,
        layerType: "raster",
        geoserverLayerDetails: detail,
        sourceLayer: `${detail.coverage.name}`,
        displayName: detail.coverage.title ?? undefined,
        sourceDataType: "raster",
        sourceProtocol: "wms",
        workspaceName: workspace,
        time,
    };
    await mapStore.addMapLayer(layerParams);
    const logicalLayer = mapStore.layersOnMap.find((layer) => layer.id === layerParams.identifier);
    if (logicalLayer !== undefined) logicalLayer.attributes = attributes;
    return runtimeId;
}

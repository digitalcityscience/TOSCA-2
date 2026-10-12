import type { CatalogStyleListItem, GeoserverLayerInfo } from "@store/geoserver";
import { useGeoserverStore } from "@store/geoserver";
import type { LayerObjectWithAttributes } from "@store/map";
import {
    loadCatalogLayerStyling,
    resolveCatalogLayer,
    type LayerStylingBundle,
    type ResolvedCatalogLayer,
    type SupplementalStyleRequest,
} from "./catalogLayerLoader";
import { reportDeveloperError } from "./userFacingError";
import { frontendStylingFor, URBAN_STORIES } from "../../config/urbanStories";
import type {
    CatalogLayerRef,
    ExploreEntry,
    MetricOption,
    RuntimeReadiness,
} from "../../config/urbanStories/types";

/**
 * Runtime readiness of Urban Stories entries and metrics (UST-05).
 *
 * @remarks
 * Truth comes from the live catalog only: a configured `styleName` is never turned into a style
 * request unless the catalog already lists it for the layer. There is no WMS fallback; an entry
 * whose vector tiles are unavailable is reported as such and nothing else is requested.
 * Probe requests are bounded: one style list per provider and one detail + styling load per
 * layer per session, until `resetUrbanStoryProbes` ("Refresh status").
 */

export type MetricPendingReason =
    | "no-style-name"
    | "style-not-in-catalog"
    | "style-not-applicable"
    | "not-mbstyle";

export interface MetricReadiness {
    key: string;
    readiness: "available" | "metric-style-pending" | "attributes-missing";
    reason?: MetricPendingReason;
}

export interface EntryReadiness {
    readiness: RuntimeReadiness;
    /** Required columns the published feature type lacks (`attributes-missing`). */
    missingAttributes: string[];
    metrics: Record<string, MetricReadiness>;
}

/** Everything one catalog layer contributes to the probe; cached per layer. */
export interface LayerProbe {
    resolved: ResolvedCatalogLayer;
    /** MBStyles registered for the layer; `undefined` = only the generic default. */
    styling?: LayerStylingBundle;
    /** Style names the catalog knows for the layer (assignments) or provider (list). */
    assignedStyleNames: ReadonlySet<string>;
    providerStyleNames: ReadonlySet<string>;
    attributes: ReadonlySet<string>;
}

export function catalogLayerKey(ref: CatalogLayerRef): string {
    return `${ref.providerId}:${ref.workspace}:${ref.layerName}`;
}

/**
 * Probe-cache key of an entry. Frontend-styled entries get their own key: their probe never loads a
 * catalog style, so it must not be shared with (or replace) the probe of a catalog-styled story.
 */
export function probeKeyOf(entry: Pick<ExploreEntry, "layer" | "styleSource" | "key">): string {
    return `${catalogLayerKey(entry.layer)}${entry.styleSource === "frontend" ? `#frontend:${entry.key}` : ""}`;
}

// --- bounded, cached probing -------------------------------------------------------------

const layerProbes = new Map<string, Promise<LayerProbe>>();
const providerStyleLists = new Map<string, Promise<CatalogStyleListItem[]>>();
const loggedProblems = new Set<string>();
const MAX_CONCURRENT_PROBES = 4;
let activeProbes = 0;
const probeQueue: Array<() => void> = [];

async function withProbeSlot<T>(task: () => Promise<T>): Promise<T> {
    if (activeProbes >= MAX_CONCURRENT_PROBES) {
        await new Promise<void>((resolve) => probeQueue.push(resolve));
    }
    activeProbes += 1;
    try {
        return await task();
    } finally {
        activeProbes -= 1;
        probeQueue.shift()?.();
    }
}

/** One developer log per problem per session, so a missing layer cannot spam the console. */
export function logOnce(key: string, context: string, error?: unknown): void {
    if (loggedProblems.has(key)) return;
    loggedProblems.add(key);
    reportDeveloperError(context, error ?? new Error(context));
}

/** Drop every cached probe so the next probe asks the catalog again. */
export function resetUrbanStoryProbes(): void {
    layerProbes.clear();
    providerStyleLists.clear();
    loggedProblems.clear();
}

function providerStyleList(providerId: string): Promise<CatalogStyleListItem[]> {
    let request = providerStyleLists.get(providerId);
    if (request === undefined) {
        request = useGeoserverStore().getStyleList(providerId).catch((error: unknown) => {
            logOnce(`styles:${providerId}`, `Loading style catalog for provider ${providerId}`, error);
            return [] as CatalogStyleListItem[];
        });
        providerStyleLists.set(providerId, request);
    }
    return request;
}

function assignedNames(info: GeoserverLayerInfo): Set<string> {
    const styles = Array.isArray(info.styles) ? info.styles : info.styles?.style;
    const alternates = styles === undefined ? [] : Array.isArray(styles) ? styles : [styles];
    return new Set([info.defaultStyle?.name, ...alternates.map((style) => style.name)].filter(
        (name): name is string => typeof name === "string" && name !== ""
    ));
}

/**
 * Styles the configs name for a layer, so the probe can load them even when the layer does not
 * list them as alternates. The loader still verifies each one against the layer and the metric.
 */
export function supplementalStylesFor(ref: CatalogLayerRef): SupplementalStyleRequest[] {
    const requests = new Map<string, SupplementalStyleRequest>();
    for (const story of URBAN_STORIES) {
        for (const entry of story.explore) {
            if (entry.layer.workspace !== ref.workspace || entry.layer.layerName !== ref.layerName) continue;
            // Local styles are not catalog styles: never ask the catalog for them.
            if (entry.styleSource === "frontend") continue;
            for (const metric of entry.metrics) {
                if (metric.styleName !== null && !requests.has(metric.styleName)) {
                    requests.set(metric.styleName, { name: metric.styleName, attribute: metric.attribute });
                }
            }
        }
    }
    return [...requests.values()];
}

async function runLayerProbe(ref: CatalogLayerRef): Promise<LayerProbe> {
    const resolved = await resolveCatalogLayer(ref);
    if (!resolved.ok) {
        if (resolved.reason === "not-found") {
            logOnce(`missing:${catalogLayerKey(ref)}`, `Catalog layer ${ref.workspace}:${ref.layerName} is not published yet`);
        } else {
            logOnce(`error:${catalogLayerKey(ref)}`, `Probing ${ref.workspace}:${ref.layerName}`, resolved.error);
        }
        return { resolved, assignedStyleNames: new Set(), providerStyleNames: new Set(), attributes: new Set() };
    }
    const catalogStyles = await providerStyleList(ref.providerId);
    const providerStyleNames = new Set(catalogStyles.flatMap((style) => [style.name, style.qualified_name]));
    const attributes = "featureType" in resolved.detail
        ? new Set(resolved.detail.featureType.attributes.attribute.map((attribute) => attribute.name))
        : new Set<string>();
    const styling = await loadCatalogLayerStyling(
        resolved.info, ref.workspace, ref.providerId, ref.layerName, catalogStyles, supplementalStylesFor(ref)
    );
    return { resolved, styling, assignedStyleNames: assignedNames(resolved.info), providerStyleNames, attributes };
}

/**
 * Probe a frontend-styled layer: the catalog is asked for the layer and its resource detail only
 * (tile endpoint and attribute list). No style list, no style document, no assignment is requested,
 * and the probe's styling is the locally built bundle.
 */
async function runFrontendProbe(ref: CatalogLayerRef, styling: LayerStylingBundle): Promise<LayerProbe> {
    const resolved = await resolveCatalogLayer(ref);
    if (!resolved.ok) {
        if (resolved.reason === "not-found") {
            logOnce(`missing:${catalogLayerKey(ref)}`, `Catalog layer ${ref.workspace}:${ref.layerName} is not published yet`);
        } else {
            logOnce(`error:${catalogLayerKey(ref)}`, `Probing ${ref.workspace}:${ref.layerName}`, resolved.error);
        }
        return { resolved, assignedStyleNames: new Set(), providerStyleNames: new Set(), attributes: new Set() };
    }
    const attributes = "featureType" in resolved.detail
        ? new Set(resolved.detail.featureType.attributes.attribute.map((attribute) => attribute.name))
        : new Set<string>();
    return { resolved, styling, assignedStyleNames: new Set(), providerStyleNames: new Set(), attributes };
}

/** Probe one catalog layer (cached; concurrent callers share the same request). */
export function probeLayer(ref: CatalogLayerRef): Promise<LayerProbe> {
    const key = catalogLayerKey(ref);
    let probe = layerProbes.get(key);
    if (probe === undefined) {
        probe = withProbeSlot(async () => await runLayerProbe(ref));
        layerProbes.set(key, probe);
    }
    return probe;
}

/** Probe the layer of an entry on its own styling path (catalog or frontend). */
export function probeEntryLayer(entry: ExploreEntry): Promise<LayerProbe> {
    const styling = frontendStylingFor(entry);
    if (styling === undefined) return probeLayer(entry.layer);
    const key = probeKeyOf(entry);
    let probe = layerProbes.get(key);
    if (probe === undefined) {
        probe = withProbeSlot(async () => await runFrontendProbe(entry.layer, styling));
        layerProbes.set(key, probe);
    }
    return probe;
}

/** The already-requested probe of an entry's layer, for add flows that must not trigger new requests. */
export function cachedEntryProbe(entry: Pick<ExploreEntry, "layer" | "styleSource" | "key">): Promise<LayerProbe> | undefined {
    return layerProbes.get(probeKeyOf(entry));
}

/** The already-requested probe, for add flows that must not trigger new requests. */
export function cachedLayerProbe(ref: CatalogLayerRef): Promise<LayerProbe> | undefined {
    return layerProbes.get(catalogLayerKey(ref));
}

// --- pure evaluation ---------------------------------------------------------------------

function evaluateMetric(metric: MetricOption, probe: LayerProbe): MetricReadiness {
    if (metric.attribute !== "" && probe.attributes.size > 0 && !probe.attributes.has(metric.attribute)) {
        return { key: metric.key, readiness: "attributes-missing" };
    }
    if (metric.styleName === null) {
        return { key: metric.key, readiness: "metric-style-pending", reason: "no-style-name" };
    }
    if (probe.styling?.styles.some((style) => style.name === metric.styleName) === true) {
        return { key: metric.key, readiness: "available" };
    }
    if (probe.assignedStyleNames.has(metric.styleName)) {
        // Known to the layer but its document was not usable MBStyle JSON.
        return { key: metric.key, readiness: "metric-style-pending", reason: "not-mbstyle" };
    }
    if (probe.providerStyleNames.has(metric.styleName)) {
        // Registered with the provider, but the loader refused it for this layer or metric.
        return { key: metric.key, readiness: "metric-style-pending", reason: "style-not-applicable" };
    }
    return { key: metric.key, readiness: "metric-style-pending", reason: "style-not-in-catalog" };
}

/**
 * Combine the static entry config with a layer probe (architecture plan §8.4).
 *
 * @param probe - The layer probe; `undefined` when no request was allowed (tiles unavailable).
 */
export function evaluateEntry(
    entry: ExploreEntry,
    probe: LayerProbe | undefined,
    options: { tilesFailed?: boolean } = {}
): EntryReadiness {
    const metrics: Record<string, MetricReadiness> = {};
    const pendingMetrics = (): void => {
        entry.metrics.forEach((metric) => {
            metrics[metric.key] = { key: metric.key, readiness: "metric-style-pending", reason: "no-style-name" };
        });
    };
    // Rule 0: no switch to WMS or any other protocol, ever.
    if (entry.mvt !== "verified" || options.tilesFailed === true || probe === undefined) {
        pendingMetrics();
        return { readiness: "tiles-unavailable", missingAttributes: [], metrics };
    }
    if (!probe.resolved.ok) {
        pendingMetrics();
        return {
            readiness: probe.resolved.reason === "not-found" ? "temporarily-unavailable" : "error",
            missingAttributes: [],
            metrics,
        };
    }
    const missingAttributes = probe.attributes.size === 0
        ? []
        : entry.requiredAttributes.filter((attribute) => !probe.attributes.has(attribute));
    entry.metrics.forEach((metric) => { metrics[metric.key] = evaluateMetric(metric, probe); });
    if (missingAttributes.length > 0) {
        return { readiness: "attributes-missing", missingAttributes, metrics };
    }
    return { readiness: probe.styling === undefined ? "unstyled" : "available", missingAttributes, metrics };
}

/** Probe an entry's layer and evaluate it. Entries without verified tiles make no request. */
export async function probeEntry(
    entry: ExploreEntry,
    options: { force?: boolean; tilesFailed?: boolean } = {}
): Promise<EntryReadiness> {
    if (entry.mvt !== "verified" || options.tilesFailed === true) {
        return evaluateEntry(entry, undefined, options);
    }
    if (options.force === true) layerProbes.delete(probeKeyOf(entry));
    return evaluateEntry(entry, await probeEntryLayer(entry), options);
}

// --- style option lookup -----------------------------------------------------------------

/** The `availableStyles` option id that carries this metric's catalog style, if loaded. */
export function metricStyleOptionId(
    record: Pick<LayerObjectWithAttributes, "availableStyles">,
    metric: Pick<MetricOption, "styleName">
): string | undefined {
    if (metric.styleName === null) return undefined;
    return record.availableStyles?.find((style) => style.name === metric.styleName)?.id;
}

/** The metric whose catalog style is currently active on the record, if any. */
export function activeMetricKey(
    record: Pick<LayerObjectWithAttributes, "availableStyles" | "activeStyleId">,
    metrics: readonly MetricOption[]
): string | undefined {
    const active = record.availableStyles?.find((style) => style.id === record.activeStyleId);
    if (active === undefined) return undefined;
    return metrics.find((metric) => metric.styleName === active.name)?.key;
}

/**
 * Give every style layer without a `minzoom` at or above the floor the entry's zoom floor.
 *
 * @remarks
 * No published style has a `minzoom` (third pass), so heavy layers would request tiles at city
 * zoom. This changes the caller's own copy only (never the cached catalog document), and because
 * the copy is what `availableStyles` holds, the floor also survives metric switches.
 */
export function withZoomFloor(styling: LayerStylingBundle, minZoom: number | undefined): LayerStylingBundle {
    if (minZoom === undefined) return styling;
    return {
        ...styling,
        styles: styling.styles.map((style) => ({
            ...style,
            layers: style.layers.map((layer) => (
                layer.minzoom === undefined || layer.minzoom < minZoom ? { ...layer, minzoom: minZoom } : layer
            )),
        })),
    };
}

/** True when the style has no `minzoom` at or above the entry's zoom floor (QA aid for heavy layers). */
export function styleLacksZoomFloor(
    record: Pick<LayerObjectWithAttributes, "availableStyles" | "activeStyleId">,
    minZoom: number | undefined
): boolean {
    if (minZoom === undefined) return false;
    const active = record.availableStyles?.find((style) => style.id === record.activeStyleId);
    if (active === undefined) return false;
    return active.layers.some((layer) => layer.minzoom === undefined || layer.minzoom < minZoom);
}

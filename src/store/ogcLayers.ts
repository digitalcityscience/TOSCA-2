import { acceptHMRUpdate, defineStore } from "pinia";
import { ref, watch } from "vue";
import type {
    ExternalDataSourceCapabilities,
    ExternalDataSourceConfig,
} from "../config/externalDataSources";
import {
    ExternalRequestError,
    OGC_API_MAX_FEATURES,
    OGC_API_MAX_PAGE_SIZE,
    buildOgcApiItemsUrl,
    useExternalDataSourcesStore,
    type OgcApiCollection,
    type OgcApiDataset,
    type OgcApiFeatureQuery,
    type OgcApiQueryable,
    type ExternalCategoryItem,
} from "./externalDataSources";
import { useMapStore } from "./map";
import type { PopupAttributeDefinition } from "./geoserver";
import {
    addExternalGeoJSONLayer,
    externalCategoryLayerId,
    fitMapToFeatures,
    ogcCollectionLayerId,
    setExternalLayerFeatures,
} from "@helpers/externalLayers";
import { buildCql2Filter, type OgcFilterCondition } from "@helpers/ogcCql2";
import { OGC_LOAD_ALL_CONCURRENCY, OgcLoadError, loadAllOgcFeatures } from "@helpers/ogcFeatureLoader";
import { reportDeveloperError } from "@helpers/userFacingError";
import { featuresToDeckChunk } from "@helpers/deckGeoJsonChunk";
import { mapStyleColorProperties } from "@helpers/mapStyleEditing";
import type { FeatureCollection } from "@helpers/geojson";

type Bbox = [number, number, number, number];

/**
 * "all": every matching feature fits in one load, fetched once (MapLibre).
 * "viewport": too many features, so only the map view is loaded and reloaded
 * whenever the map stops moving (MapLibre).
 * "full": the user chose to load everything; pages stream through a worker
 * into a deck.gl layer.
 */
export type OgcLayerLoadMode = "all" | "viewport" | "full";

export type OgcLayerErrorKind = "filter" | "request";

export interface OgcLayerState {
    layerId: string;
    collection: OgcApiCollection;
    queryables: OgcApiQueryable[];
    /** Selected non-geometry properties; undefined returns all of them. */
    properties?: string[];
    conditions: OgcFilterCondition[];
    mode: OgcLayerLoadMode;
    /** Features matching the filter in the whole collection. */
    totalMatched?: number;
    /** Features matching the filter inside the current view (viewport mode). */
    viewMatched?: number;
    loadedCount: number;
    loading: boolean;
    errorKind?: OgcLayerErrorKind;
    /** A full load was cancelled before every page arrived. */
    stopped?: boolean;
    minZoom?: number;
    belowMinZoom?: boolean;
    color?: string;
    sourceId?: string;
    capabilities?: ExternalDataSourceCapabilities;
    /** Service-specific upper bound for one layer load. */
    maxFeatures?: number;
}

export interface OgcLayerQueryUpdate {
    properties?: string[];
    conditions: OgcFilterCondition[];
}

const VIEWPORT_RELOAD_DELAY_MS = 350;

function clampBbox([minX, minY, maxX, maxY]: Bbox): Bbox {
    return [Math.max(minX, -180), Math.max(minY, -90), Math.min(maxX, 180), Math.min(maxY, 90)];
}

/** Intersection of two CRS84 boxes, or undefined when they do not overlap. */
export function intersectBbox(a: Bbox, b: number[] | undefined): Bbox | undefined {
    if (b === undefined || b.length < 4) return a;
    const box: Bbox = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
    return box[0] <= box[2] && box[1] <= box[3] ? box : undefined;
}

/**
 * Popup/table labels from the collection's queryable titles (e.g.
 * "Straßenname" for `strassenname`). Servers give one language, stored under
 * `en`, which the popup uses as the fallback for every UI locale. Limited to
 * the selected properties when a selection is active.
 */
export function queryableAttributeLabels(
    queryables: OgcApiQueryable[],
    selected?: string[]
): PopupAttributeDefinition[] | undefined {
    const attributes = queryables
        .filter((item) => !item.isGeometry && (selected === undefined || selected.includes(item.name)))
        .map((item) => ({ name: item.name, labels: { en: item.title } }));
    return attributes.length === 0 ? undefined : attributes;
}


function isAbort(error: unknown): boolean {
    return error instanceof DOMException && error.name === "AbortError";
}

export const useOgcLayersStore = defineStore("ogcLayers", () => {
    const externalSources = useExternalDataSourcesStore();
    const mapStore = useMapStore();
    const layers = ref<Record<string, OgcLayerState>>({});
    const controllers = new Map<string, AbortController>();
    /** Layers being swapped from MapLibre to deck.gl; their state must survive the swap. */
    const replacing = new Set<string>();
    let listenedMap: any;
    /** Viewport layers that missed a reload while hidden. */
    const staleLayerIds = new Set<string>();
    let reloadTimer: ReturnType<typeof setTimeout> | undefined;

    function currentViewBbox(): Bbox | undefined {
        const bounds = mapStore.map?.getBounds?.();
        if (bounds === undefined) return undefined;
        return clampBbox([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]);
    }

    function isLayerVisible(layerId: string): boolean {
        return mapStore.map?.getLayoutProperty?.(layerId, "visibility") !== "none";
    }

    function belowMinimumZoom(state: OgcLayerState): boolean {
        return state.minZoom !== undefined &&
            (mapStore.map?.getZoom?.() ?? state.minZoom) < state.minZoom;
    }

    function onMapMoveEnd(): void {
        clearTimeout(reloadTimer);
        reloadTimer = setTimeout(() => {
            for (const state of Object.values(layers.value)) {
                if (state.mode !== "viewport") continue;
                if (isLayerVisible(state.layerId)) {
                    void refreshLayer(state.layerId);
                } else {
                    // Skip hidden layers, but reload them once they are shown.
                    staleLayerIds.add(state.layerId);
                }
            }
        }, VIEWPORT_RELOAD_DELAY_MS);
    }

    /** Visibility toggles fire `styledata`; reload stale layers that became visible. */
    function onMapStyleData(): void {
        for (const layerId of [...staleLayerIds]) {
            if (layers.value[layerId]?.mode !== "viewport") {
                staleLayerIds.delete(layerId);
            } else if (isLayerVisible(layerId)) {
                staleLayerIds.delete(layerId);
                void refreshLayer(layerId);
            }
        }
    }

    function ensureMapListener(): void {
        const map = mapStore.map;
        if (map === undefined || map === listenedMap) return;
        listenedMap?.off?.("moveend", onMapMoveEnd);
        listenedMap?.off?.("styledata", onMapStyleData);
        map.on("moveend", onMapMoveEnd);
        map.on("styledata", onMapStyleData);
        listenedMap = map;
    }

    function stopListeningIfIdle(): void {
        if (Object.values(layers.value).some((state) => state.mode === "viewport")) return;
        listenedMap?.off?.("moveend", onMapMoveEnd);
        listenedMap?.off?.("styledata", onMapStyleData);
        listenedMap = undefined;
        staleLayerIds.clear();
    }

    function applyAttributeLabels(layerId: string): void {
        const state = layers.value[layerId];
        const record = mapStore.layersOnMap.find((layer) => layer.id === layerId);
        if (state === undefined || record === undefined) return;
        record.attributes = queryableAttributeLabels(state.queryables, state.properties);
    }

    function selectedProperties(state: OgcLayerState): string[] | undefined {
        if (state.properties === undefined) return undefined;
        // Without its geometry property a feature comes back with `geometry: null`.
        const geometryNames = state.queryables.filter((item) => item.isGeometry).map((item) => item.name);
        return [...new Set([...state.properties, ...geometryNames])];
    }

    function featureQuery(
        state: OgcLayerState,
        signal?: AbortSignal,
        maxFeatures = state.maxFeatures ?? OGC_API_MAX_FEATURES
    ): OgcApiFeatureQuery {
        return {
            maxFeatures,
            properties: selectedProperties(state),
            filter: buildCql2Filter(state.conditions, state.queryables),
            signal,
        };
    }

    const defaultCapabilities: ExternalDataSourceCapabilities = {
        show_uncurated: true,
        full_load: true,
        live_updates: true,
        server_filters: true,
        max_features: null,
    };

    function capabilitiesForState(state: OgcLayerState): ExternalDataSourceCapabilities {
        return externalSources.sources.find((source) => source.id === state.sourceId)?.capabilities ??
            state.capabilities ?? defaultCapabilities;
    }

    function capabilitiesForLayer(layerId: string): ExternalDataSourceCapabilities {
        const state = layers.value[layerId];
        return state === undefined ? defaultCapabilities : capabilitiesForState(state);
    }

    function replaceLayerFeatures(layerId: string, features: FeatureCollection): void {
        const record = mapStore.layersOnMap.find((layer) => layer.id === layerId);
        if (record?.renderer === "deckgl") {
            mapStore.clearDeckGeoJsonChunks(layerId);
            if (features.features.length > 0) {
                mapStore.appendDeckGeoJsonChunk(layerId, featuresToDeckChunk(features.features));
            }
            record.layerData = features;
            return;
        }
        setExternalLayerFeatures(mapStore, layerId, features);
    }

    async function loadCollection(
        state: OgcLayerState,
        signal: AbortSignal,
        view?: Bbox
    ): Promise<{ features: FeatureCollection, numberMatched?: number }> {
        const query = featureQuery(state, signal);
        if (view !== undefined) {
            const bbox = intersectBbox(view, state.collection.bbox);
            if (bbox === undefined) {
                return {
                    features: { type: "FeatureCollection" as const, features: [] },
                    numberMatched: 0,
                };
            }
            query.bbox = bbox;
        }
        return await externalSources.getOgcApiCollectionFeatures(state.collection, query);
    }

    /** Reloads a layer's features for its current query (and view). */
    async function refreshLayer(layerId: string): Promise<void> {
        const state = layers.value[layerId];
        if (state?.mode === "full") {
            await runFullLoad(layerId);
            return;
        }
        if (state === undefined || !mapStore.layersOnMap.some((layer) => layer.id === layerId)) return;
        controllers.get(layerId)?.abort();
        const controller = new AbortController();
        controllers.set(layerId, controller);
        state.loading = true;
        state.errorKind = undefined;
        try {
            state.belowMinZoom = state.mode === "viewport" && belowMinimumZoom(state);
            if (state.belowMinZoom) {
                replaceLayerFeatures(layerId, { type: "FeatureCollection", features: [] });
                state.viewMatched = undefined;
                state.loadedCount = 0;
                return;
            }
            let view: Bbox | undefined;
            if (state.mode === "viewport") {
                view = currentViewBbox();
            }
            const result = await loadCollection(state, controller.signal, view);
            if (controller.signal.aborted) return;
            replaceLayerFeatures(layerId, result.features);
            state.loadedCount = result.features.features.length;
            if (state.mode === "viewport") {
                state.viewMatched = result.numberMatched;
            } else {
                state.totalMatched = result.numberMatched ?? state.loadedCount;
            }
        } catch (error) {
            if (isAbort(error) || controller.signal.aborted) return;
            state.errorKind = error instanceof ExternalRequestError && error.status === 400 ? "filter" : "request";
            reportDeveloperError(`Loading OGC API features for ${layerId}`, error);
        } finally {
            if (controllers.get(layerId) === controller) {
                controllers.delete(layerId);
                state.loading = false;
            }
        }
    }

    /** Streams every matching feature into the layer's deck.gl chunks. */
    async function runFullLoad(layerId: string): Promise<void> {
        const state = layers.value[layerId];
        if (state === undefined || !mapStore.layersOnMap.some((layer) => layer.id === layerId)) return;
        if (!capabilitiesForState(state).full_load) return;
        controllers.get(layerId)?.abort();
        const controller = new AbortController();
        controllers.set(layerId, controller);
        state.loading = true;
        state.errorKind = undefined;
        state.stopped = false;
        state.loadedCount = 0;
        mapStore.clearDeckGeoJsonChunks(layerId);
        try {
            const { properties, filter } = featureQuery(state);
            const pageSize = Math.max(1, Math.min(
                OGC_API_MAX_PAGE_SIZE,
                state.maxFeatures ?? OGC_API_MAX_PAGE_SIZE
            ));
            await loadAllOgcFeatures({
                firstPageUrl: buildOgcApiItemsUrl(
                    state.collection,
                    { properties, filter },
                    pageSize
                ).toString(),
                concurrency: OGC_LOAD_ALL_CONCURRENCY,
                maxFeatures: state.maxFeatures,
                signal: controller.signal,
                onTotal: (total) => {
                    state.totalMatched = total ?? state.totalMatched;
                },
                onChunk: (chunk, loaded) => {
                    mapStore.appendDeckGeoJsonChunk(layerId, chunk);
                    state.loadedCount = loaded;
                },
            });
        } catch (error) {
            if (isAbort(error) || controller.signal.aborted) return;
            state.errorKind = error instanceof OgcLoadError && error.status === 400 ? "filter" : "request";
            reportDeveloperError(`Loading all OGC API features for ${layerId}`, error);
        } finally {
            if (controllers.get(layerId) === controller) {
                controllers.delete(layerId);
                state.loading = false;
            }
        }
    }

    /**
     * Switches a layer to deck.gl and loads every matching feature. The
     * MapLibre layer is replaced in place, keeping its list position.
     */
    async function loadAll(layerId: string): Promise<void> {
        const state = layers.value[layerId];
        const record = mapStore.layersOnMap.find((layer) => layer.id === layerId);
        if (state === undefined || record === undefined) return;
        if (!capabilitiesForState(state).full_load) return;
        if (state.mode !== "full") {
            controllers.get(layerId)?.abort();
            if (record.renderer !== "deckgl") {
                const index = mapStore.layersOnMap.indexOf(record);
                const { displayName, externalSource } = record;
                replacing.add(layerId);
                try {
                    await mapStore.deleteMapLayer(layerId, false);
                    if (mapStore.map?.getSource(layerId) !== undefined) mapStore.deleteMapDataSource(layerId);
                    mapStore.addDeckGeoJsonLayer({ identifier: layerId, displayName, index, externalSource });
                    // The swap mounts a new list item; keep its panel (and progress) open.
                    mapStore.requestLayerPanelExpansion(layerId);
                    applyAttributeLabels(layerId);
                } finally {
                    replacing.delete(layerId);
                }
            }
            if (state.color !== undefined) {
                mapStore.setDeckGeoJsonStyle(layerId, {
                    fillColor: state.color,
                    lineColor: state.color,
                });
            }
            state.mode = "full";
            state.viewMatched = undefined;
            stopListeningIfIdle();
        }
        await runFullLoad(layerId);
    }

    /** Stops a running full load, keeping the features that already arrived. */
    function cancelFullLoad(layerId: string): void {
        const state = layers.value[layerId];
        if (state?.mode !== "full" || !state.loading) return;
        controllers.get(layerId)?.abort();
        controllers.delete(layerId);
        state.loading = false;
        state.stopped = true;
    }

    function modeFor(totalMatched: number | undefined, maxFeatures = OGC_API_MAX_FEATURES): OgcLayerLoadMode {
        return totalMatched !== undefined && totalMatched <= maxFeatures ? "all" : "viewport";
    }

    function applyLayerColor(layerId: string, color: string | undefined): void {
        if (color === undefined) return;
        const record = mapStore.layersOnMap.find((layer) => layer.id === layerId);
        if (record?.renderer === "deckgl") {
            mapStore.setDeckGeoJsonStyle(layerId, { fillColor: color, lineColor: color });
            return;
        }
        const property = record === undefined ? undefined : mapStyleColorProperties(record.type)[0];
        if (property !== undefined) {
            mapStore.setStandaloneLayerPaintColor(layerId, property, color);
        }
    }

    async function addLayer(params: {
        source: ExternalDataSourceConfig
        dataset: OgcApiDataset
        collection: OgcApiCollection
        layerId: string
        displayName: string
        initialProperties?: string[]
        initialConditions?: OgcFilterCondition[]
        minZoom?: number
        color?: string
        fallbackTotal?: number
    }): Promise<OgcLayerState> {
        const {
            source,
            dataset,
            collection,
            layerId,
            displayName,
            minZoom,
            color,
            fallbackTotal,
        } = params;

        const capabilities = source.capabilities;
        const maxFeatures = capabilities.max_features ?? OGC_API_MAX_FEATURES;
        const queryables = capabilities.server_filters
            ? await externalSources.getOgcApiQueryables(collection).catch((error: unknown) => {
                reportDeveloperError(`Loading queryables for ${collection.id}`, error);
                return [] as OgcApiQueryable[];
            })
            : [];
        const selectable = new Set(queryables.filter((item) => !item.isGeometry).map((item) => item.name));
        const initialProperties = params.initialProperties?.filter((name) => selectable.has(name));
        const properties = initialProperties !== undefined && initialProperties.length > 0
            ? initialProperties
            : undefined;
        const conditions = (params.initialConditions ?? [])
            .filter((condition) => selectable.has(condition.property));
        const filter = buildCql2Filter(conditions, queryables);
        const totalMatched = await externalSources.countOgcApiFeatures(collection, { filter })
            .catch(() => collection.itemCount) ?? fallbackTotal;
        const mode = modeFor(totalMatched, maxFeatures);
        const extent = collection.bbox;
        if (mode === "viewport" && extent !== undefined) {
            mapStore.map?.fitBounds(
                [[extent[0], extent[1]], [extent[2], extent[3]]],
                { padding: 40, duration: 0 }
            );
        }

        const state: OgcLayerState = {
            layerId,
            collection,
            queryables,
            properties,
            conditions,
            mode,
            totalMatched,
            loadedCount: 0,
            loading: false,
            minZoom,
            color,
            sourceId: source.id,
            capabilities,
            maxFeatures: capabilities.max_features ?? undefined,
        };
        state.belowMinZoom = mode === "viewport" && belowMinimumZoom(state);
        const view = mode === "viewport" && !state.belowMinZoom
            ? currentViewBbox()
            : undefined;
        const result = state.belowMinZoom
            ? { features: { type: "FeatureCollection" as const, features: [] } }
            : await loadCollection(state, new AbortController().signal, view);

        const externalSource = {
            type: "ogc-api" as const,
            sourceId: source.id,
            sourceTitle: `${source.title} · ${dataset.title}`,
            totalCount: totalMatched,
            bbox: extent,
        };
        const useDeck = state.belowMinZoom === true;
        if (useDeck) {
            const record = mapStore.addDeckGeoJsonLayer({
                identifier: layerId,
                displayName,
                externalSource,
            });
            if (result.features.features.length > 0) {
                mapStore.appendDeckGeoJsonChunk(layerId, featuresToDeckChunk(result.features.features));
            }
            record.layerData = result.features;
            if (mode === "all") fitMapToFeatures(mapStore.map, result.features);
        } else {
            await addExternalGeoJSONLayer(mapStore, {
                identifier: layerId,
                displayName,
                features: result.features,
                externalSource,
                fitToFeatures: mode === "all",
            });
        }
        state.loadedCount = result.features.features.length;
        state.viewMatched = mode === "viewport" ? result.numberMatched : undefined;
        state.totalMatched ??= mode === "all" ? state.loadedCount : undefined;
        layers.value[layerId] = state;
        applyLayerColor(layerId, color);
        if (mode === "viewport") ensureMapListener();
        applyAttributeLabels(layerId);
        return state;
    }

    /**
     * Adds a collection as one map layer. Small collections are loaded in
     * full; large ones (or ones without a count) load by map view.
     */
    async function addCollectionLayer(params: {
        source: ExternalDataSourceConfig
        dataset: OgcApiDataset
        collection: OgcApiCollection
    }): Promise<OgcLayerState> {
        const { source, dataset, collection } = params;
        return await addLayer({
            source,
            dataset,
            collection,
            layerId: ogcCollectionLayerId(source.id, dataset.id, collection.id),
            displayName: collection.title,
        });
    }

    async function addCategoryItemLayer(
        item: ExternalCategoryItem,
        source: ExternalDataSourceConfig
    ): Promise<OgcLayerState> {
        if (item.service_type !== "ogc_api_features" || item.ogc === undefined) {
            throw new Error(`${item.title} is not an OGC API category item`);
        }
        const datasets = await externalSources.getOgcApiDatasets(source);
        const dataset = item.ogc.dataset_id === ""
            ? datasets[0]
            : datasets.find((candidate) => candidate.id === item.ogc?.dataset_id);
        if (dataset === undefined) {
            throw new Error(`OGC dataset ${item.ogc.dataset_id || "(default)"} was not found`);
        }
        const availableCollections = await externalSources.getOgcApiCollections(dataset);
        const collection = availableCollections.find((candidate) => candidate.id === item.ogc?.collection_id);
        if (collection === undefined) {
            throw new Error(`OGC collection ${item.ogc.collection_id} was not found`);
        }
        return await addLayer({
            source,
            dataset,
            collection,
            layerId: externalCategoryLayerId(source.id, item.id),
            displayName: item.title,
            initialProperties: item.defaults?.properties,
            initialConditions: item.defaults?.filter.map((condition) => ({
                ...condition,
                value: String(condition.value),
            })),
            minZoom: item.loading.min_zoom ?? undefined,
            color: item.style.color,
            fallbackTotal: item.availability.feature_count ?? undefined,
        });
    }

    /**
     * Applies a new property selection / filter. Re-counts matches so a
     * narrow filter can switch a large collection back to a single full load.
     *
     * @throws {OgcFilterValueError} when a condition value is invalid.
     */
    async function updateLayerQuery(layerId: string, update: OgcLayerQueryUpdate): Promise<void> {
        const state = layers.value[layerId];
        if (state === undefined) return;
        if (!capabilitiesForState(state).server_filters) return;
        // Validate before touching state so an invalid value keeps the old query.
        const filter = buildCql2Filter(update.conditions, state.queryables);
        state.properties = update.properties;
        state.conditions = update.conditions;
        applyAttributeLabels(layerId);
        state.errorKind = undefined;
        state.loading = true;
        try {
            state.totalMatched = await externalSources.countOgcApiFeatures(state.collection, { filter });
        } catch (error) {
            state.loading = false;
            state.errorKind = error instanceof ExternalRequestError && error.status === 400 ? "filter" : "request";
            reportDeveloperError(`Counting OGC API features for ${layerId}`, error);
            return;
        }
        const previousMode = state.mode;
        // Once loaded in full (deck.gl), stay in full mode and reload everything.
        state.mode = previousMode === "full" ? "full" : modeFor(
            state.totalMatched,
            state.maxFeatures ?? OGC_API_MAX_FEATURES
        );
        state.viewMatched = undefined;
        if (state.mode === "viewport") ensureMapListener();
        else stopListeningIfIdle();
        await refreshLayer(layerId);
        const record = mapStore.layersOnMap.find((layer) => layer.id === layerId);
        if (record?.externalSource !== undefined) {
            record.externalSource = { ...record.externalSource, totalCount: state.totalMatched };
        }
        if (previousMode === "viewport" && state.mode === "all" && record?.layerData !== undefined) {
            fitMapToFeatures(mapStore.map, record.layerData);
        }
    }

    // Forget layers the user removed from the map.
    watch(
        () => mapStore.layersOnMap.map((layer) => layer.id),
        (ids) => {
            const present = new Set(ids);
            for (const layerId of Object.keys(layers.value)) {
                if (present.has(layerId) || replacing.has(layerId)) continue;
                controllers.get(layerId)?.abort();
                controllers.delete(layerId);
                staleLayerIds.delete(layerId);
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete layers.value[layerId];
            }
            stopListeningIfIdle();
        }
    );

    return {
        layers,
        addCollectionLayer,
        addCategoryItemLayer,
        updateLayerQuery,
        refreshLayer,
        loadAll,
        cancelFullLoad,
        capabilitiesForLayer,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useOgcLayersStore, import.meta.hot));
}

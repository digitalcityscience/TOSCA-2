import { acceptHMRUpdate, defineStore } from "pinia";
import { ref, watch } from "vue";
import type { ExternalDataSourceConfig } from "../config/externalDataSources";
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
    /** One entry for normal layers; several for curated merged layers. */
    collections?: OgcApiCollection[];
    /** Per-collection schemas retain geometry names that need not be shared. */
    collectionQueryables?: Record<string, OgcApiQueryable[]>;
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

/** Queryables present in every collection, keeping the first collection's labels. */
export function commonQueryables(collections: OgcApiQueryable[][]): OgcApiQueryable[] {
    if (collections.length === 0) return [];
    return collections[0].filter((queryable) =>
        collections.slice(1).every((items) => items.some((item) => item.name === queryable.name))
    );
}

function combinedBbox(collections: OgcApiCollection[]): Bbox | undefined {
    const boxes = collections
        .map((collection) => collection.bbox)
        .filter((bbox): bbox is number[] => bbox !== undefined && bbox.length >= 4);
    if (boxes.length === 0) return undefined;
    return [
        Math.min(...boxes.map((bbox) => bbox[0])),
        Math.min(...boxes.map((bbox) => bbox[1])),
        Math.max(...boxes.map((bbox) => bbox[2])),
        Math.max(...boxes.map((bbox) => bbox[3])),
    ];
}

function sumCounts(counts: Array<number | undefined>): number | undefined {
    return counts.every((count) => count !== undefined)
        ? counts.reduce((sum, count) => sum + (count ?? 0), 0)
        : undefined;
}

function mergeFeatureResults(results: Array<{ features: FeatureCollection, numberMatched?: number }>): {
    features: FeatureCollection
    numberMatched?: number
} {
    return {
        features: {
            type: "FeatureCollection",
            features: results.flatMap((result) => result.features.features),
        },
        numberMatched: sumCounts(results.map((result) => result.numberMatched)),
    };
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

    function stateCollections(state: OgcLayerState): OgcApiCollection[] {
        return state.collections ?? [state.collection];
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

    function selectedProperties(
        state: OgcLayerState,
        collection: OgcApiCollection
    ): string[] | undefined {
        if (state.properties === undefined) return undefined;
        // Without its geometry property a feature comes back with `geometry: null`.
        const queryables = state.collectionQueryables?.[collection.id] ?? state.queryables;
        const geometryNames = queryables.filter((item) => item.isGeometry).map((item) => item.name);
        return [...new Set([...state.properties, ...geometryNames])];
    }

    function featureQuery(
        state: OgcLayerState,
        collection: OgcApiCollection,
        signal?: AbortSignal
    ): OgcApiFeatureQuery {
        return {
            properties: selectedProperties(state, collection),
            filter: buildCql2Filter(state.conditions, state.queryables),
            signal,
        };
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

    async function loadCollections(
        state: OgcLayerState,
        signal: AbortSignal,
        view?: Bbox
    ): Promise<{ features: FeatureCollection, numberMatched?: number }> {
        const results = await Promise.all(stateCollections(state).map(async (collection) => {
            const query = featureQuery(state, collection, signal);
            if (view !== undefined) {
                const bbox = intersectBbox(view, collection.bbox);
                if (bbox === undefined) {
                    return {
                        features: { type: "FeatureCollection" as const, features: [] },
                        numberMatched: 0,
                    };
                }
                query.bbox = bbox;
            }
            return await externalSources.getOgcApiCollectionFeatures(collection, query);
        }));
        return mergeFeatureResults(results);
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
            const result = await loadCollections(state, controller.signal, view);
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
        controllers.get(layerId)?.abort();
        const controller = new AbortController();
        controllers.set(layerId, controller);
        state.loading = true;
        state.errorKind = undefined;
        state.stopped = false;
        state.loadedCount = 0;
        mapStore.clearDeckGeoJsonChunks(layerId);
        try {
            const collections = stateCollections(state);
            const loadedByCollection = new Map<string, number>();
            const totalsByCollection = new Map<string, number | undefined>();
            const concurrency = Math.max(1, Math.floor(OGC_LOAD_ALL_CONCURRENCY / collections.length));
            await Promise.all(collections.map(async (collection) => {
                const { properties, filter } = featureQuery(state, collection);
                await loadAllOgcFeatures({
                    firstPageUrl: buildOgcApiItemsUrl(
                        collection,
                        { properties, filter },
                        OGC_API_MAX_PAGE_SIZE
                    ).toString(),
                    concurrency,
                    signal: controller.signal,
                    onTotal: (total) => {
                        totalsByCollection.set(collection.id, total);
                        state.totalMatched = sumCounts(collections.map((item) =>
                            totalsByCollection.get(item.id)
                        )) ?? state.totalMatched;
                    },
                    onChunk: (chunk, loaded) => {
                        loadedByCollection.set(collection.id, loaded);
                        mapStore.appendDeckGeoJsonChunk(layerId, chunk);
                        state.loadedCount = [...loadedByCollection.values()]
                            .reduce((sum, count) => sum + count, 0);
                    },
                });
            }));
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

    function modeFor(totalMatched: number | undefined): OgcLayerLoadMode {
        return totalMatched !== undefined && totalMatched <= OGC_API_MAX_FEATURES ? "all" : "viewport";
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

    async function addCollectionsLayer(params: {
        source: ExternalDataSourceConfig
        dataset: OgcApiDataset
        collections: OgcApiCollection[]
        layerId: string
        displayName: string
        initialProperties?: string[]
        initialConditions?: OgcFilterCondition[]
        minZoom?: number
        color?: string
        fallbackTotal?: number
        forceDeck?: boolean
    }): Promise<OgcLayerState> {
        const {
            source,
            dataset,
            collections,
            layerId,
            displayName,
            minZoom,
            color,
            fallbackTotal,
            forceDeck = false,
        } = params;
        if (collections.length === 0) throw new Error(`No OGC collections configured for ${displayName}`);

        const queryableLists = await Promise.all(collections.map(async (collection) =>
            await externalSources.getOgcApiQueryables(collection).catch((error: unknown) => {
                reportDeveloperError(`Loading queryables for ${collection.id}`, error);
                return [] as OgcApiQueryable[];
            })
        ));
        const queryables = commonQueryables(queryableLists);
        const selectable = new Set(queryables.filter((item) => !item.isGeometry).map((item) => item.name));
        const initialProperties = params.initialProperties?.filter((name) => selectable.has(name));
        const properties = initialProperties !== undefined && initialProperties.length > 0
            ? initialProperties
            : undefined;
        const conditions = (params.initialConditions ?? [])
            .filter((condition) => selectable.has(condition.property));
        const filter = buildCql2Filter(conditions, queryables);
        const counts = await Promise.all(collections.map(async (collection) =>
            await externalSources.countOgcApiFeatures(collection, { filter })
                .catch(() => collection.itemCount)
        ));
        const totalMatched = sumCounts(counts) ?? fallbackTotal;
        const mode = modeFor(totalMatched);
        const extent = combinedBbox(collections);
        if (mode === "viewport" && extent !== undefined) {
            mapStore.map?.fitBounds(
                [[extent[0], extent[1]], [extent[2], extent[3]]],
                { padding: 40, duration: 0 }
            );
        }

        const collectionQueryables = Object.fromEntries(
            collections.map((collection, index) => [collection.id, queryableLists[index]])
        );
        const state: OgcLayerState = {
            layerId,
            collection: collections[0],
            collections,
            collectionQueryables,
            queryables,
            properties,
            conditions,
            mode,
            totalMatched,
            loadedCount: 0,
            loading: false,
            minZoom,
            color,
        };
        state.belowMinZoom = mode === "viewport" && belowMinimumZoom(state);
        const view = mode === "viewport" && !state.belowMinZoom
            ? currentViewBbox()
            : undefined;
        const result = state.belowMinZoom
            ? { features: { type: "FeatureCollection" as const, features: [] } }
            : await loadCollections(state, new AbortController().signal, view);

        const externalSource = {
            type: "ogc-api" as const,
            sourceId: source.id,
            sourceTitle: `${source.title} · ${dataset.title}`,
            totalCount: totalMatched,
            bbox: extent,
        };
        // Merged collections use deck.gl from the outset: one binary layer can
        // render mixed point, line and polygon geometries without hiding a family.
        const useDeck = forceDeck || state.belowMinZoom === true;
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
        return await addCollectionsLayer({
            source,
            dataset,
            collections: [collection],
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
        const byId = new Map(availableCollections.map((collection) => [collection.id, collection]));
        const collections = item.ogc.collection_ids.map((id) => {
            const collection = byId.get(id);
            if (collection === undefined) throw new Error(`OGC collection ${id} was not found`);
            return collection;
        });
        return await addCollectionsLayer({
            source,
            dataset,
            collections,
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
            forceDeck: collections.length > 1,
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
        // Validate before touching state so an invalid value keeps the old query.
        const filter = buildCql2Filter(update.conditions, state.queryables);
        state.properties = update.properties;
        state.conditions = update.conditions;
        applyAttributeLabels(layerId);
        state.errorKind = undefined;
        state.loading = true;
        try {
            const counts = await Promise.all(stateCollections(state).map(async (collection) =>
                await externalSources.countOgcApiFeatures(collection, { filter })
            ));
            state.totalMatched = sumCounts(counts);
        } catch (error) {
            state.loading = false;
            state.errorKind = error instanceof ExternalRequestError && error.status === 400 ? "filter" : "request";
            reportDeveloperError(`Counting OGC API features for ${layerId}`, error);
            return;
        }
        const previousMode = state.mode;
        // Once loaded in full (deck.gl), stay in full mode and reload everything.
        state.mode = previousMode === "full" ? "full" : modeFor(state.totalMatched);
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
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useOgcLayersStore, import.meta.hot));
}

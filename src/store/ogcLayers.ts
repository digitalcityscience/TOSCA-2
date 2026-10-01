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
} from "./externalDataSources";
import { useMapStore } from "./map";
import {
    addExternalGeoJSONLayer,
    findExternalLayer,
    fitMapToFeatures,
    ogcCollectionLayerId,
    setExternalLayerFeatures,
} from "@helpers/externalLayers";
import { buildCql2Filter, type OgcFilterCondition } from "@helpers/ogcCql2";
import { OgcLoadError, loadAllOgcFeatures } from "@helpers/ogcFeatureLoader";
import { reportDeveloperError } from "@helpers/userFacingError";

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
    let reloadTimer: ReturnType<typeof setTimeout> | undefined;

    function currentViewBbox(): Bbox | undefined {
        const bounds = mapStore.map?.getBounds?.();
        if (bounds === undefined) return undefined;
        return clampBbox([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]);
    }

    function isLayerVisible(layerId: string): boolean {
        return mapStore.map?.getLayoutProperty?.(layerId, "visibility") !== "none";
    }

    function onMapMoveEnd(): void {
        clearTimeout(reloadTimer);
        reloadTimer = setTimeout(() => {
            for (const state of Object.values(layers.value)) {
                if (state.mode === "viewport" && isLayerVisible(state.layerId)) {
                    void refreshLayer(state.layerId);
                }
            }
        }, VIEWPORT_RELOAD_DELAY_MS);
    }

    function ensureMapListener(): void {
        const map = mapStore.map;
        if (map === undefined || map === listenedMap) return;
        listenedMap?.off?.("moveend", onMapMoveEnd);
        map.on("moveend", onMapMoveEnd);
        listenedMap = map;
    }

    function stopListeningIfIdle(): void {
        if (Object.values(layers.value).some((state) => state.mode === "viewport")) return;
        listenedMap?.off?.("moveend", onMapMoveEnd);
        listenedMap = undefined;
    }

    function selectedProperties(state: OgcLayerState): string[] | undefined {
        if (state.properties === undefined) return undefined;
        // Without its geometry property a feature comes back with `geometry: null`.
        const geometryNames = state.queryables.filter((item) => item.isGeometry).map((item) => item.name);
        return [...state.properties, ...geometryNames];
    }

    function featureQuery(state: OgcLayerState, signal?: AbortSignal): OgcApiFeatureQuery {
        return {
            properties: selectedProperties(state),
            filter: buildCql2Filter(state.conditions, state.queryables),
            signal,
        };
    }

    /** Reloads a layer's features for its current query (and view). */
    async function refreshLayer(layerId: string): Promise<void> {
        const state = layers.value[layerId];
        if (state?.mode === "full") {
            await runFullLoad(layerId);
            return;
        }
        if (state === undefined || findExternalLayer(mapStore, layerId) === undefined) return;
        controllers.get(layerId)?.abort();
        const controller = new AbortController();
        controllers.set(layerId, controller);
        state.loading = true;
        state.errorKind = undefined;
        try {
            const query = featureQuery(state, controller.signal);
            if (state.mode === "viewport") {
                const view = currentViewBbox();
                const bbox = view === undefined ? undefined : intersectBbox(view, state.collection.bbox);
                if (view !== undefined && bbox === undefined) {
                    setExternalLayerFeatures(mapStore, layerId, { type: "FeatureCollection", features: [] });
                    state.viewMatched = 0;
                    state.loadedCount = 0;
                    return;
                }
                query.bbox = bbox;
            }
            const result = await externalSources.getOgcApiCollectionFeatures(state.collection, query);
            if (controller.signal.aborted) return;
            setExternalLayerFeatures(mapStore, layerId, result.features);
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
            const { properties, filter } = featureQuery(state);
            await loadAllOgcFeatures({
                firstPageUrl: buildOgcApiItemsUrl(state.collection, { properties, filter }, OGC_API_MAX_PAGE_SIZE).toString(),
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
        if (state.mode !== "full") {
            controllers.get(layerId)?.abort();
            const index = mapStore.layersOnMap.indexOf(record);
            const { displayName, externalSource } = record;
            replacing.add(layerId);
            try {
                await mapStore.deleteMapLayer(layerId, false);
                if (mapStore.map?.getSource(layerId) !== undefined) mapStore.deleteMapDataSource(layerId);
                mapStore.addDeckGeoJsonLayer({ identifier: layerId, displayName, index, externalSource });
                // The swap mounts a new list item; keep its panel (and progress) open.
                mapStore.requestLayerPanelExpansion(layerId);
            } finally {
                replacing.delete(layerId);
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
        const layerId = ogcCollectionLayerId(source.id, dataset.id, collection.id);
        const [queryables, totalMatched] = await Promise.all([
            externalSources.getOgcApiQueryables(collection).catch((error: unknown) => {
                reportDeveloperError(`Loading queryables for ${collection.id}`, error);
                return [] as OgcApiQueryable[];
            }),
            externalSources.countOgcApiFeatures(collection).catch(() => collection.itemCount),
        ]);
        const mode = modeFor(totalMatched ?? collection.itemCount);
        let bbox: Bbox | undefined;
        if (mode === "viewport") {
            // Frame the collection first so the initial view load is meaningful.
            const extent = collection.bbox;
            if (extent !== undefined && extent.length >= 4) {
                mapStore.map?.fitBounds([[extent[0], extent[1]], [extent[2], extent[3]]], { padding: 40, duration: 0 });
            }
            const view = currentViewBbox();
            bbox = view === undefined ? undefined : intersectBbox(view, extent);
        }
        const result = await externalSources.getOgcApiCollectionFeatures(collection, { bbox });
        await addExternalGeoJSONLayer(mapStore, {
            identifier: layerId,
            displayName: collection.title,
            features: result.features,
            externalSource: {
                type: "ogc-api",
                sourceTitle: `${source.title} · ${dataset.title}`,
                totalCount: totalMatched,
                bbox: collection.bbox,
            },
            fitToFeatures: mode === "all",
        });
        layers.value[layerId] = {
            layerId,
            collection,
            queryables,
            conditions: [],
            mode,
            totalMatched: totalMatched ?? (mode === "all" ? result.features.features.length : undefined),
            viewMatched: mode === "viewport" ? result.numberMatched : undefined,
            loadedCount: result.features.features.length,
            loading: false,
        };
        if (mode === "viewport") ensureMapListener();
        return layers.value[layerId];
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
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete layers.value[layerId];
            }
            stopListeningIfIdle();
        }
    );

    return {
        layers,
        addCollectionLayer,
        updateLayerQuery,
        refreshLayer,
        loadAll,
        cancelFullLoad,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useOgcLayersStore, import.meta.hot));
}

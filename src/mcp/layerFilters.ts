/**
 * Filters of the AI map commands, kept in the filter store like the filter panels keep theirs.
 *
 * Everything runs in the browser. The filter store's own functions hold and build the filters
 * (`addAttributeFilter`, `populateLayerFilter`, `createGeometryFilter`, `addGeometryFilter`, ...);
 * nothing in the store or the panels is changed for the commands. Putting the result on the map
 * follows the style switch in `map.ts` (`reapplyUserFilters`): the user filter goes on every
 * render pass of the layer, combined with that pass's own style filter.
 */
import bbox from "@turf/bbox";
import bboxPolygon from "@turf/bbox-polygon";
import booleanWithin from "@turf/boolean-within";
import { type FeatureCollection } from "@helpers/geojson";
import { combineStyleAndUserFilter } from "@helpers/maplibreExpressions";
import { type AppliedFiltersListItem, type RelationTypes, useFilterStore } from "@store/filter";
import { type LayerObjectWithAttributes, useMapStore } from "@store/map";

/** Longest wait for the map to settle after a move or a filter change. */
const SETTLE_TIMEOUT_MS = 10000;

export function appliedFiltersOf(layerId: string): AppliedFiltersListItem | undefined {
    return useFilterStore().appliedFiltersList.find((item) => item.layerName === layerId);
}

/** Puts the layer's stored filters (or, without any, its style filters alone) on all its render passes. */
export async function showLayerFilters(layer: LayerObjectWithAttributes): Promise<void> {
    const map = useMapStore().map;
    if (map === undefined || map === null) return;
    const applied = appliedFiltersOf(layer.id);
    const expression = applied === undefined
        ? undefined
        : await useFilterStore().populateLayerFilter(applied, applied.attributeRelation ?? "AND");
    // `populateLayerFilter` answers ["all"] when there is nothing to filter.
    const userFilter = expression !== undefined && expression.length > 1 ? expression : undefined;
    [layer.id, ...(layer.companionLayerIds ?? [])].forEach((passId, index) => {
        if (map.getLayer(passId) === undefined) return;
        const styleFilter = layer.mbStyleLayers?.[index]?.filter ?? (index === 0 ? layer.filter : undefined);
        map.setFilter(passId, combineStyleAndUserFilter(styleFilter, userFilter) ?? null);
    });
}

/** Sets how the layer's attribute filters are combined; the layer must have some. */
export function setAttributeRelation(layerId: string, relation: RelationTypes): boolean {
    const applied = appliedFiltersOf(layerId);
    if (applied?.attributeFilters === undefined || applied.attributeFilters.length === 0) return false;
    applied.attributeRelation = relation;
    return true;
}

/** Removes every attribute and geometry filter of a layer through the store's remove functions. */
export async function clearLayerFilters(layerId: string): Promise<void> {
    const filterStore = useFilterStore();
    const applied = appliedFiltersOf(layerId);
    if (applied === undefined) return;
    for (const filter of [...(applied.attributeFilters ?? [])]) await filterStore.removeAttributeFilter(layerId, filter);
    if (applied.geometryFilters !== undefined) await filterStore.removeGeometryFilter(layerId);
}

/** Waits for the map's next `idle` (all tiles loaded, nothing left to draw), at most the settle timeout. */
async function settled(start: (map: any) => void = (map) => map.triggerRepaint?.()): Promise<void> {
    const map = useMapStore().map;
    await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, SETTLE_TIMEOUT_MS);
        map.once("idle", () => {
            clearTimeout(timer);
            resolve();
        });
        start(map);
    });
}

/** Whether one feature of the area lies wholly in the current view (as `GeometryFiltering.vue` `isFilterLayerInView`). */
function isAreaInView(area: FeatureCollection): boolean {
    const bounds = useMapStore().map.getBounds();
    const view = bboxPolygon([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]);
    return area.features.some((feature) => booleanWithin(bboxPolygon(bbox(feature)), view));
}

/**
 * Shows an area on the map (as `GeometryFiltering.vue` `fitToFilterLayer`) and waits until the map
 * has drawn it, so `createGeometryFilter` sees the features there.
 */
export async function fitMapToArea(area: FeatureCollection, options: { onlyIfOutOfView?: boolean } = {}): Promise<void> {
    if (area.features.length === 0) return;
    const map = useMapStore().map;
    if (options.onlyIfOutOfView === true && isAreaInView(area)) {
        if (typeof map.areTilesLoaded === "function" && map.areTilesLoaded() !== true) await settled();
        return;
    }
    await settled((target) => target.fitBounds(bbox(area), { padding: { top: 40, bottom: 40, left: 40, right: 40 } }));
}

/**
 * Filters a layer to its features drawn inside an area, as the geometry filter panel does
 * (`createGeometryFilter` + `addGeometryFilter`), and answers how many there are. The panel only
 * offers this while the layer has no area filter; a command replaces the old one, which must be
 * off the map first, or the map would only draw (and the new area only find) features in both.
 *
 * @throws {Error} When no drawn feature of the layer lies in the area (the old area filter stays).
 */
export async function applyAreaFilter(
    layer: LayerObjectWithAttributes & { type: "fill" | "circle" | "line" },
    area: FeatureCollection,
    identifier: string,
): Promise<number> {
    const filterStore = useFilterStore();
    const previous = appliedFiltersOf(layer.id)?.geometryFilters;
    if (previous !== undefined) {
        await filterStore.removeGeometryFilter(layer.id);
        await showLayerFilters(layer);
        await settled();
    }
    const filterArray = filterStore.createGeometryFilter(layer.id, { filterGeoJSON: area, identifier });
    if (filterArray.length === 0) {
        if (previous !== undefined) {
            await filterStore.addGeometryFilter(layer.id, previous);
            await showLayerFilters(layer);
        }
        throw new Error("No feature of the layer drawn on the map lies inside the area. The layer may not be drawn at this zoom level.");
    }
    await filterStore.addGeometryFilter(layer.id, { filterGeoJSON: area, targetLayerSourceType: layer.type, identifier, filterArray });
    await showLayerFilters(layer);
    return filterArray.length;
}

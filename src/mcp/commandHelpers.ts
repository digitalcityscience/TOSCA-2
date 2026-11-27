/**
 * Shared pieces of the AI map commands: parameter checks, finding layers, describing the map.
 */
import { useFilterStore } from "@store/filter";
import { type GeoServerFeatureTypeAttribute, type GeoServerVectorTypeLayerDetail } from "@store/geoserver";
import { type LayerObjectWithAttributes, useMapStore } from "@store/map";
import { appliedFiltersOf } from "./layerFilters";

/** Who asked for a command. `"ui"` is reserved for the app's own controls. */
export type CommandOrigin = "mcp" | "ui";
export type CommandParams = Record<string, unknown>;
export type CommandHandler = (params: CommandParams) => Promise<unknown> | unknown;

/** An error whose message is safe and useful to show to the assistant. */
export class CommandError extends Error {}

export const MOVE_TIMEOUT_MS = 6000;

export function text(params: CommandParams, key: string): string {
    const value = params[key];
    if (typeof value !== "string" || value.trim() === "") throw new CommandError(`"${key}" must be a non-empty text.`);
    return value;
}

export function finite(value: unknown, key: string): number {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new CommandError(`"${key}" must be a number.`);
    return value;
}

export function integer(params: CommandParams, key: string, fallback: number, min: number, max: number): number {
    const value = params[key];
    if (value === undefined || value === null) return fallback;
    if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
        throw new CommandError(`"${key}" must be a whole number from ${min} to ${max}.`);
    }
    return value;
}

export function readyMap(): any {
    const map = useMapStore().map;
    if (map === undefined || map === null) throw new CommandError("The map is not ready yet.");
    return map;
}

export function findLayer(layerId: string): LayerObjectWithAttributes {
    const layer = useMapStore().layersOnMap.find((item) => item.id === layerId);
    if (layer === undefined) {
        throw new CommandError(`There is no layer "${layerId}" on the map. Read the map state for the current layer ids.`);
    }
    return layer;
}

export function vectorDetail(layer: LayerObjectWithAttributes): GeoServerVectorTypeLayerDetail | undefined {
    return layer.details !== undefined && "featureType" in layer.details ? layer.details : undefined;
}

export function filterableAttributes(layer: LayerObjectWithAttributes): GeoServerFeatureTypeAttribute[] {
    const allowed = useFilterStore().allowedBindings;
    return (vectorDetail(layer)?.featureType.attributes.attribute ?? []).filter((item) => allowed.includes(item.binding));
}

export function attributeType(attribute: GeoServerFeatureTypeAttribute): "text" | "number" {
    return attribute.binding === "java.lang.String" ? "text" : "number";
}

export function describeView(): Record<string, unknown> {
    const map = readyMap();
    const center = map.getCenter();
    const bounds = map.getBounds();
    return {
        center: [center.lng, center.lat],
        zoom: Number(map.getZoom().toFixed(2)),
        bearing: map.getBearing(),
        pitch: map.getPitch(),
        bounds: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
    };
}

export function describeLayer(layer: LayerObjectWithAttributes): Record<string, unknown> {
    const mapStore = useMapStore();
    const state = mapStore.getLayerUiState(layer.id) ?? { visible: true, opacity: 1 };
    const applied = appliedFiltersOf(layer.id);
    const detail = vectorDetail(layer);
    return {
        id: layer.id,
        title: layer.displayName ?? layer.id,
        kind: layer.logicalKind === "group" ? "group" : layer.type,
        source: layer.sourceType,
        visible: state.visible,
        opacity: state.opacity,
        catalog: layer.workspaceName === undefined || detail === undefined
            ? undefined
            : { workspace: layer.workspaceName, name: detail.featureType.name },
        filters: (applied?.attributeFilters ?? []).map((filter) => ({
            attribute: filter.attribute.name,
            operator: filter.operand,
            value: filter.value,
        })),
        filterRelation: applied?.attributeRelation,
        hasGeometryFilter: applied?.geometryFilters !== undefined,
        // The layer list's style dropdown (MapLayerListingItem.vue styleSelectItems): shown with two or more.
        styles: (layer.availableStyles?.length ?? 0) > 1
            ? layer.availableStyles!.map((style) => ({
                id: style.id,
                title: style.title ?? style.name,
                active: style.id === layer.activeStyleId,
            }))
            : undefined,
        time: layer.time,
    };
}

export function describeMap(): Record<string, unknown> {
    return {
        view: describeView(),
        layers: useMapStore().layersOnMap.filter((layer) => layer.showOnLayerList !== false).map(describeLayer),
    };
}

/** Starts a camera move and answers with the view once the map has settled. */
export async function moveMap(start: (map: any) => void): Promise<Record<string, unknown>> {
    const map = readyMap();
    await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, MOVE_TIMEOUT_MS);
        map.once("moveend", () => {
            clearTimeout(timer);
            resolve();
        });
        start(map);
    });
    return { view: describeView() };
}

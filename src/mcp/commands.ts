/**
 * The commands an AI assistant may run on the open map.
 *
 * Every command is a named function with plain JSON parameters. It calls the
 * same store functions and helpers as the user interface (the comment on each
 * command names the UI code it mirrors), so the map, the layer list and the
 * filter panel stay in step whoever made the change.
 *
 * `dispatch` is the only entry point. Nothing else on the map is reachable
 * from outside: a name that is not in `mapCommands` is refused.
 */
import { type Feature, type FeatureCollection } from "geojson";
import {
    addCatalogRasterLayer,
    addCatalogVectorLayer,
    loadCatalogLayerStyling,
    resolveCatalogLayer,
} from "@helpers/catalogLayerLoader";
import { fitMapToFeatures } from "@helpers/externalLayers";
import { type AttributeFilterItem, type RelationTypes, useFilterStore } from "@store/filter";
import {
    type GeoServerFeatureTypeAttribute,
    type GeoServerVectorTypeLayerDetail,
    type GeoserverRasterTypeLayerDetail,
} from "@store/geoserver";
import { type GeoJSONSourceParams, type LayerObjectWithAttributes, type LayerParams, useMapStore } from "@store/map";

/** Who asked for a command. `"ui"` is reserved for the app's own controls. */
export type CommandOrigin = "mcp" | "ui";
export type CommandParams = Record<string, unknown>;
type CommandHandler = (params: CommandParams) => Promise<unknown> | unknown;

/** An error whose message is safe and useful to show to the assistant. */
export class CommandError extends Error {}

const MOVE_TIMEOUT_MS = 6000;
const OPERATORS = [">", ">=", "<", "<=", "==", "!=", "in"] as const;
type Operator = typeof OPERATORS[number];
type Bounds = [[number, number], [number, number]];

function text(params: CommandParams, key: string): string {
    const value = params[key];
    if (typeof value !== "string" || value.trim() === "") throw new CommandError(`"${key}" must be a non-empty text.`);
    return value;
}

function finite(value: unknown, key: string): number {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new CommandError(`"${key}" must be a number.`);
    return value;
}

function readyMap(): any {
    const map = useMapStore().map;
    if (map === undefined || map === null) throw new CommandError("The map is not ready yet.");
    return map;
}

function findLayer(layerId: string): LayerObjectWithAttributes {
    const layer = useMapStore().layersOnMap.find((item) => item.id === layerId);
    if (layer === undefined) {
        throw new CommandError(`There is no layer "${layerId}" on the map. Read the map state for the current layer ids.`);
    }
    return layer;
}

function vectorDetail(layer: LayerObjectWithAttributes): GeoServerVectorTypeLayerDetail | undefined {
    return layer.details !== undefined && "featureType" in layer.details ? layer.details : undefined;
}

function filterableAttributes(layer: LayerObjectWithAttributes): GeoServerFeatureTypeAttribute[] {
    const allowed = useFilterStore().allowedBindings;
    return (vectorDetail(layer)?.featureType.attributes.attribute ?? []).filter((item) => allowed.includes(item.binding));
}

function attributeType(attribute: GeoServerFeatureTypeAttribute): "text" | "number" {
    return attribute.binding === "java.lang.String" ? "text" : "number";
}

function describeView(): Record<string, unknown> {
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

function describeLayer(layer: LayerObjectWithAttributes): Record<string, unknown> {
    const mapStore = useMapStore();
    const state = mapStore.getLayerUiState(layer.id) ?? { visible: true, opacity: 1 };
    const applied = useFilterStore().appliedFiltersList.find((item) => item.layerName === layer.id);
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
    };
}

function describeMap(): Record<string, unknown> {
    return {
        view: describeView(),
        layers: useMapStore().layersOnMap.filter((layer) => layer.showOnLayerList !== false).map(describeLayer),
    };
}

/** Starts a camera move and answers with the view once the map has settled. */
async function moveMap(start: (map: any) => void): Promise<Record<string, unknown>> {
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

/** Extent of a layer, as `MapLayerListingItem.vue` `zoomToLayer` finds it. */
function layerBounds(layer: LayerObjectWithAttributes): Bounds | undefined {
    type Box = { minx: number, miny: number, maxx: number, maxy: number };
    const boxOf = (details: LayerObjectWithAttributes["details"]): Box | undefined => {
        if (details === undefined) return undefined;
        return "coverage" in details
            ? (details as GeoserverRasterTypeLayerDetail).coverage.latLonBoundingBox
            : (details as GeoServerVectorTypeLayerDetail).featureType.latLonBoundingBox;
    };
    const simulationBounds = layer.simulationOutput?.bounds;
    if (simulationBounds) return [[simulationBounds[0], simulationBounds[1]], [simulationBounds[2], simulationBounds[3]]];
    if (layer.logicalKind === "group") {
        const boxes = (layer.groupManifest?.members ?? []).flatMap((member) => {
            const box = boxOf(member.details);
            return box === undefined ? [] : [box];
        });
        if (boxes.length === 0) return undefined;
        return [
            [Math.min(...boxes.map((box) => box.minx)), Math.min(...boxes.map((box) => box.miny))],
            [Math.max(...boxes.map((box) => box.maxx)), Math.max(...boxes.map((box) => box.maxy))],
        ];
    }
    const extent = layer.externalSource?.bbox;
    if (layer.renderer === "deckgl" && extent !== undefined && extent.length >= 4) {
        return [[extent[0], extent[1]], [extent[2], extent[3]]];
    }
    const box = boxOf(layer.details);
    return box === undefined ? undefined : [[box.minx, box.miny], [box.maxx, box.maxy]];
}

/** Puts the layer's filters (kept by the filter store) on the map, as `AttributeFiltering.vue` does. */
async function applyLayerFilter(layerId: string, relation: RelationTypes): Promise<void> {
    const filterStore = useFilterStore();
    const map = readyMap();
    const applied = filterStore.appliedFiltersList.find((item) => item.layerName === layerId);
    if (applied === undefined || (applied.attributeFilters === undefined && applied.geometryFilters === undefined)) {
        map.setFilter(layerId, null);
        return;
    }
    const expression = await filterStore.populateLayerFilter(applied, relation);
    map.setFilter(layerId, expression.length > 1 ? expression : null);
}

function geometryFamily(type: string): string {
    return type.replace(/^Multi/, "");
}

export const mapCommands: Record<string, CommandHandler> = {
    getMapState: () => describeMap(),

    setView: async (params) => {
        const center = params.center;
        if (!Array.isArray(center) || center.length !== 2) throw new CommandError("\"center\" must be [longitude, latitude].");
        const target: { center: [number, number], zoom?: number } = {
            center: [finite(center[0], "longitude"), finite(center[1], "latitude")],
        };
        if (params.zoom !== undefined && params.zoom !== null) target.zoom = finite(params.zoom, "zoom");
        return await moveMap((map) => map.flyTo(target));
    },

    fitBounds: async (params) => {
        const bounds = params.bounds;
        if (!Array.isArray(bounds) || bounds.length !== 4) throw new CommandError("\"bounds\" must be [west, south, east, north].");
        const [west, south, east, north] = bounds.map((value, index) => finite(value, `bounds[${index}]`));
        return await moveMap((map) => map.fitBounds([[west, south], [east, north]], { padding: 20 }));
    },

    // MapLayerListingItem.vue: zoomToLayer
    zoomToLayer: async (params) => {
        const layer = findLayer(text(params, "layerId"));
        if (layer.details === undefined && layer.layerData !== undefined && layer.renderer !== "deckgl") {
            return await moveMap((map) => fitMapToFeatures(map, layer.layerData!));
        }
        const bounds = layerBounds(layer);
        if (bounds === undefined) throw new CommandError(`The extent of "${layer.id}" is not known.`);
        return await moveMap((map) => map.fitBounds(bounds, { padding: 20 }));
    },

    // WorkspaceVectorLayerListingItem.vue / WorkspaceRasterLayerListingItem.vue: add2Map
    addCatalogLayer: async (params) => {
        const providerId = text(params, "providerId");
        const workspace = text(params, "workspace");
        const layerName = text(params, "layerName");
        const resolved = await resolveCatalogLayer({ providerId, workspace, layerName });
        if (!resolved.ok) {
            throw new CommandError(resolved.reason === "not-found"
                ? `Catalog layer "${workspace}:${layerName}" was not found (or this user may not see it).`
                : `Catalog layer "${workspace}:${layerName}" could not be loaded.`);
        }
        let layerId: string;
        if ("coverage" in resolved.detail) {
            layerId = await addCatalogRasterLayer({
                detail: resolved.detail,
                workspace,
                attributes: resolved.info.defaultStyle?.attributes,
            });
        } else {
            const styling = await loadCatalogLayerStyling(resolved.info, workspace, providerId, layerName);
            layerId = (await addCatalogVectorLayer({ detail: resolved.detail, workspace, styling })).runtimeId;
        }
        return { layer: describeLayer(findLayer(layerId)) };
    },

    // store/draw.ts: saveAsLayer
    addGeoJsonLayer: async (params) => {
        const mapStore = useMapStore();
        const title = text(params, "title").trim();
        const geojson = params.geojson as FeatureCollection | undefined;
        const features: Feature[] = geojson?.type === "FeatureCollection" && Array.isArray(geojson.features) ? geojson.features : [];
        if (features.length === 0 || features.some((feature) => feature?.geometry?.type === undefined)) {
            throw new CommandError("\"geojson\" must be a FeatureCollection whose features all have a geometry.");
        }
        const family = geometryFamily(features[0].geometry.type);
        if (features.some((feature) => geometryFamily(feature.geometry.type) !== family)) {
            throw new CommandError("All features must be of one kind: points, lines or polygons.");
        }
        const identifier = title.toLowerCase().replaceAll(" ", "_");
        if (mapStore.layersOnMap.some((layer) => layer.id === identifier) || readyMap().getSource(identifier) !== undefined) {
            throw new CommandError(`A layer named "${title}" is already on the map. Choose another title.`);
        }
        const isFilterLayer = features[0].geometry.type === "Polygon";
        const source: GeoJSONSourceParams = { sourceType: "geojson", identifier, isFilterLayer, geoJSONSrc: geojson! };
        await mapStore.addMapDataSource(source);
        try {
            const layer: LayerParams = {
                sourceType: "geojson",
                identifier,
                layerType: mapStore.geometryConversion(features[0].geometry.type),
                geoJSONSrc: geojson!,
                isFilterLayer,
                displayName: title,
            };
            await mapStore.addMapLayer(layer);
        } catch (error) {
            mapStore.deleteMapDataSource(identifier);
            throw error;
        }
        return { layer: describeLayer(findLayer(identifier)) };
    },

    // MapLayerListingItem.vue: deleteLayerConfirmation
    removeLayer: async (params) => {
        const mapStore = useMapStore();
        const layer = findLayer(text(params, "layerId"));
        await mapStore.deleteMapLayer(layer.id, true);
        if (layer.logicalKind !== "group" && layer.renderer !== "deckgl") mapStore.deleteMapDataSource(layer.source);
        return { removed: layer.id };
    },

    // MapLayerListingItem.vue: changeLayerVisibility
    setLayerVisibility: (params) => {
        const mapStore = useMapStore();
        const layer = findLayer(text(params, "layerId"));
        if (typeof params.visible !== "boolean") throw new CommandError("\"visible\" must be true or false.");
        if (layer.renderer === "deckgl") mapStore.setDeckLayerVisibility(layer.id, params.visible);
        else mapStore.setLogicalLayerVisibility(layer, params.visible);
        return { layer: describeLayer(layer) };
    },

    // MapLayerListingItem.vue: changeLayerOpac
    setLayerOpacity: (params) => {
        const mapStore = useMapStore();
        const layer = findLayer(text(params, "layerId"));
        const opacity = finite(params.opacity, "opacity");
        if (opacity < 0 || opacity > 1) throw new CommandError("\"opacity\" must be between 0 and 1.");
        if (layer.renderer === "deckgl") mapStore.setDeckLayerOpacity(layer.id, opacity);
        else mapStore.setLogicalLayerOpacity(layer, opacity);
        return { layer: describeLayer(layer) };
    },

    getLayerAttributes: (params) => {
        const layer = findLayer(text(params, "layerId"));
        return {
            layerId: layer.id,
            attributes: filterableAttributes(layer).map((item) => ({ name: item.name, type: attributeType(item) })),
        };
    },

    // Map/Layer/Filter/AttributeFiltering.vue: applyAttributeFilter
    addAttributeFilter: async (params) => {
        const layer = findLayer(text(params, "layerId"));
        const name = text(params, "attribute");
        const operator = text(params, "operator") as Operator;
        const value = text(params, "value");
        const relation: RelationTypes = params.relation === "OR" ? "OR" : "AND";
        const attribute = filterableAttributes(layer).find((item) => item.name === name);
        if (attribute === undefined) {
            throw new CommandError(`Layer "${layer.id}" has no filterable attribute "${name}". List its attributes first.`);
        }
        const allowed: readonly string[] = attributeType(attribute) === "text" ? ["==", "!=", "in"] : [">", ">=", "<", "<=", "==", "!="];
        if (!OPERATORS.includes(operator) || !allowed.includes(operator)) {
            throw new CommandError(`"${name}" is a ${attributeType(attribute)} attribute; allowed operators: ${allowed.join(", ")}.`);
        }
        if (attributeType(attribute) === "number" && !Number.isFinite(Number.parseFloat(value))) {
            throw new CommandError(`"${name}" is a number attribute; "${value}" is not a number.`);
        }
        const filter: AttributeFilterItem = { attribute, operand: operator as AttributeFilterItem["operand"], value };
        const applied = await useFilterStore().addAttributeFilter(layer.id, filter, relation);
        await applyLayerFilter(layer.id, applied.attributeRelation ?? relation);
        return { layer: describeLayer(layer) };
    },

    // Map/Layer/Filter/AttributeFiltering.vue: deleteAttributeFilter
    removeAttributeFilter: async (params) => {
        const filterStore = useFilterStore();
        const layer = findLayer(text(params, "layerId"));
        const name = text(params, "attribute");
        const operator = text(params, "operator");
        const applied = filterStore.appliedFiltersList.find((item) => item.layerName === layer.id);
        const target = applied?.attributeFilters?.find((item) => item.attribute.name === name && item.operand === operator);
        if (target === undefined) throw new CommandError(`Layer "${layer.id}" has no filter "${name} ${operator}".`);
        const relation = applied?.attributeRelation ?? "AND";
        await filterStore.removeAttributeFilter(layer.id, target);
        await applyLayerFilter(layer.id, relation);
        return { layer: describeLayer(layer) };
    },
};

/** Runs one named command. The only way a command reaches the map. */
export async function dispatch(method: string, params: CommandParams = {}, _origin: CommandOrigin = "mcp"): Promise<unknown> {
    const handler = Object.prototype.hasOwnProperty.call(mapCommands, method) ? mapCommands[method] : undefined;
    if (handler === undefined) throw new CommandError(`Unknown map command: ${method}`);
    return await handler(params);
}

/** Text of an error for the assistant: own messages as they are, anything else without internals. */
export function commandErrorMessage(error: unknown): string {
    if (error instanceof CommandError) return error.message;
    if (error instanceof Error && error.message !== "") return error.message;
    return typeof error === "string" && error !== "" ? error : "The map could not run the command.";
}

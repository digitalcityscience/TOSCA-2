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
import bboxPolygon from "@turf/bbox-polygon";
import {
    addCatalogRasterLayer,
    addCatalogVectorLayer,
    loadCatalogLayerStyling,
    resolveCatalogLayer,
} from "@helpers/catalogLayerLoader";
import { fitMapToFeatures } from "@helpers/externalLayers";
import { type AttributeFilterItem, type RelationTypes, useFilterStore } from "@store/filter";
import { type GeoServerVectorTypeLayerDetail, type GeoserverRasterTypeLayerDetail } from "@store/geoserver";
import { type GeoJSONSourceParams, type LayerObjectWithAttributes, type LayerParams, useMapStore } from "@store/map";
import {
    type CommandHandler,
    type CommandOrigin,
    type CommandParams,
    CommandError,
    MOVE_TIMEOUT_MS,
    attributeType,
    describeLayer,
    describeMap,
    describeView,
    filterableAttributes,
    finite,
    findLayer,
    integer,
    moveMap,
    readyMap,
    text,
    vectorDetail,
} from "./commandHelpers";
import { dataCommands, rasterTime } from "./dataCommands";
import { layerDisplayCommands } from "./layerDisplayCommands";
import { describeBasemaps, mapViewCommands } from "./mapCommands";
import { loadedTileFeatures, primitiveText, propertyNames, renderedLayerFeatures } from "./layerFeatures";
import { recentSelections } from "./selection";

export { CommandError, type CommandOrigin, type CommandParams } from "./commandHelpers";
import {
    appliedFiltersOf,
    applyAreaFilter,
    clearLayerFilters,
    fitMapToArea,
    setAttributeRelation,
    showLayerFilters,
} from "./layerFilters";

const DEFAULT_FEATURE_PAGE = 50;
const MAX_PITCH = 85;
const MAX_FEATURE_PAGE = 500;
/** Largest answer of getLayerFeatures; it goes through the bridge and into the conversation. */
const MAX_FEATURE_PAGE_BYTES = 1_000_000;
const OPERATORS = [">", ">=", "<", "<=", "==", "!=", "in"] as const;
type Operator = typeof OPERATORS[number];
type Bounds = [[number, number], [number, number]];

function relationParam(value: unknown): RelationTypes {
    if (value !== "AND" && value !== "OR") throw new CommandError("\"relation\" must be AND or OR.");
    return value;
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

/** Text the way the filter panel compares it. */
function sameText(left: unknown, right: string): boolean {
    return primitiveText(left)?.toLowerCase() === right.toLowerCase();
}

/** The id attribute a geometry filter needs, as `GeometryFiltering.vue` `identifierChecker` picks it. */
function identifierAttribute(layer: LayerObjectWithAttributes): string | undefined {
    const allowed = useFilterStore().allowedIDBindings;
    const names = (vectorDetail(layer)?.featureType.attributes.attribute ?? [])
        .filter((item) => allowed.includes(item.binding))
        .map((item) => item.name);
    return ["gid", "id"].find((candidate) => names.includes(candidate));
}

/** A GeoServer layer drawn from vector tiles (its features exist in the browser only as loaded tiles). */
function isTileLayer(layer: LayerObjectWithAttributes): boolean {
    return readyMap().getSource(layer.source)?.type === "vector";
}

/** Refuses a hidden tile layer: MapLibre loads no tiles for it, so there is nothing to read. */
function requireShown(layer: LayerObjectWithAttributes): void {
    if (useMapStore().getLayerUiState(layer.id)?.visible === false) {
        throw new CommandError(`Layer "${layer.id}" is hidden, so the map holds none of its features. Show it first (set_layer_visibility).`);
    }
}

/** Waits until the map has loaded the tiles of the current view. */
async function tilesLoaded(): Promise<void> {
    const map = readyMap();
    if (typeof map.areTilesLoaded !== "function" || map.areTilesLoaded() === true) return;
    await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, MOVE_TIMEOUT_MS);
        map.once("idle", () => {
            clearTimeout(timer);
            resolve();
        });
    });
}

/** "Features of a layer whose attribute equals a value", checked and ready to look up. */
interface FeatureMatch {
    layer: LayerObjectWithAttributes;
    attribute: string;
    value: string;
    isNumber: boolean;
}

function featureMatch(params: CommandParams): FeatureMatch {
    const layer = findLayer(text(params, "layerId"));
    const attribute = text(params, "attribute");
    if (typeof params.value !== "string") throw new CommandError("\"value\" must be a text.");
    const value = params.value;
    if (vectorDetail(layer) !== undefined) {
        const known = filterableAttributes(layer).find((item) => item.name === attribute);
        if (known === undefined) {
            throw new CommandError(`Layer "${layer.id}" has no attribute "${attribute}" to match. List its attributes first.`);
        }
        const isNumber = attributeType(known) === "number";
        if (isNumber && !Number.isFinite(Number.parseFloat(value))) {
            throw new CommandError(`"${attribute}" is a number attribute; "${value}" is not a number.`);
        }
        return { layer, attribute, value, isNumber };
    }
    if (layer.layerData === undefined) throw new CommandError(`The features of "${layer.id}" cannot be searched.`);
    if (!propertyNames(layer.layerData).includes(attribute)) {
        throw new CommandError(`Layer "${layer.id}" has no attribute "${attribute}".`);
    }
    return { layer, attribute, value, isNumber: false };
}

/**
 * The matching features the browser holds: all of a GeoJSON layer, or those in the vector tiles
 * loaded for a GeoServer layer (unfiltered, with their tile pieces joined). Nothing is downloaded.
 */
function matchedFeatures(match: FeatureMatch): Feature[] {
    const { layer, attribute, value, isNumber } = match;
    const features = isTileLayer(layer)
        ? loadedTileFeatures(readyMap(), layer, identifierAttribute(layer))
        : layer.layerData?.features ?? [];
    return features.filter((feature) => {
        const actual = feature.properties?.[attribute];
        return isNumber ? actual !== null && actual !== "" && Number(actual) === Number.parseFloat(value) : sameText(actual, value);
    });
}

/**
 * Looks a match up, e.g. the district bezirk_name == Altona. For a tile layer that has no match in
 * its loaded tiles, the map shows the layer's whole extent once (if it is not already in view) and
 * looks again: tiles are only loaded around the view.
 */
async function findMatchingFeatures(match: FeatureMatch): Promise<Feature[]> {
    if (!isTileLayer(match.layer)) return matchedFeatures(match);
    requireShown(match.layer);
    await tilesLoaded();
    const features = matchedFeatures(match);
    const extent = layerBounds(match.layer);
    if (features.length > 0 || extent === undefined) return features;
    const extentArea: FeatureCollection = { type: "FeatureCollection", features: [bboxPolygon([...extent[0], ...extent[1]])] };
    await fitMapToArea(extentArea, { onlyIfOutOfView: true });
    return matchedFeatures(match);
}

function noMatch(match: FeatureMatch): CommandError {
    const where = isTileLayer(match.layer)
        ? " among the features the map has loaded (the layer may not be drawn at this zoom; move the map there and try again)"
        : "";
    return new CommandError(`No feature of "${match.layer.id}" has ${match.attribute} == ${match.value}${where}.`);
}

function isPolygon(feature: Feature): boolean {
    return feature.geometry?.type === "Polygon" || feature.geometry?.type === "MultiPolygon";
}

/** Whether a layer can take a geometry filter, as `GeometryFiltering.vue` `isPolygonTiles` decides. */
function takesGeometryFilter(layer: LayerObjectWithAttributes): layer is LayerObjectWithAttributes & { type: "fill" | "circle" | "line" } {
    const source = readyMap().getSource(layer.source);
    return layer.filterLayer !== true && source?.type === "vector"
        && (layer.type === "fill" || layer.type === "circle" || layer.type === "line");
}

function geometryFamily(type: string): string {
    return type.replace(/^Multi/, "");
}

export const mapCommands: Record<string, CommandHandler> = {
    getMapState: () => ({ ...describeMap(), basemaps: describeBasemaps(), terrain: useMapStore().terrainEnabled }),

    setView: async (params) => {
        const center = params.center;
        if (!Array.isArray(center) || center.length !== 2) throw new CommandError("\"center\" must be [longitude, latitude].");
        const target: { center: [number, number], zoom?: number, bearing?: number, pitch?: number } = {
            center: [finite(center[0], "longitude"), finite(center[1], "latitude")],
        };
        if (params.zoom !== undefined && params.zoom !== null) target.zoom = finite(params.zoom, "zoom");
        if (params.bearing !== undefined && params.bearing !== null) target.bearing = finite(params.bearing, "bearing");
        if (params.pitch !== undefined && params.pitch !== null) {
            // MapContainer.vue creates the map with maxPitch 85.
            target.pitch = finite(params.pitch, "pitch");
            if (target.pitch < 0 || target.pitch > MAX_PITCH) throw new CommandError(`"pitch" must be from 0 to ${MAX_PITCH}.`);
        }
        return await moveMap((map) => map.flyTo(target));
    },

    fitBounds: async (params) => {
        const bounds = params.bounds;
        if (!Array.isArray(bounds) || bounds.length !== 4) throw new CommandError("\"bounds\" must be [west, south, east, north].");
        const [west, south, east, north] = bounds.map((value, index) => finite(value, `bounds[${index}]`));
        if (west >= east || south >= north) {
            throw new CommandError("The bounding box is empty: west must be below east and south below north.");
        }
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
        const wantedTime = params.time === undefined || params.time === null ? undefined : text(params, "time");
        let layerId: string;
        if ("coverage" in resolved.detail) {
            // WorkspaceRasterLayerListingItem.vue: add2Map(withTime) checks the time against the layer's times.
            const time = wantedTime === undefined ? undefined : await rasterTime(resolved.detail, workspace, wantedTime);
            layerId = await addCatalogRasterLayer({
                detail: resolved.detail,
                workspace,
                attributes: resolved.info.defaultStyle?.attributes,
                time,
            });
        } else {
            if (wantedTime !== undefined) throw new CommandError(`"${layerName}" is a vector layer; only raster layers take a time.`);
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
        // Polygons and multipolygons can be the area of a geometry filter (draw.ts saves drawn polygons the same way).
        const isFilterLayer = family === "Polygon";
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

    // MapLayerListingItem.vue: changeLayerVisibility, and toggleGroupMember for one member of a group
    setLayerVisibility: (params) => {
        const mapStore = useMapStore();
        const layer = findLayer(text(params, "layerId"));
        if (typeof params.visible !== "boolean") throw new CommandError("\"visible\" must be true or false.");
        if (params.memberId !== undefined && params.memberId !== null) {
            const memberId = text(params, "memberId");
            if (layer.logicalKind !== "group" || layer.groupMemberLayerIds?.[memberId] === undefined) {
                throw new CommandError(`Layer "${layer.id}" has no group member "${memberId}"; get_map_state lists the members.`);
            }
            mapStore.setGroupMemberVisibility(layer, memberId, params.visible);
            return { layer: describeLayer(layer) };
        }
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
        // The filter panel holds the value as typed text; a number arrives as 1960, not "1960".
        const value = typeof params.value === "number" ? String(finite(params.value, "value")) : text(params, "value");
        // Left out: the layer keeps its current relation (the one the filter panel shows).
        const relation = params.relation === undefined || params.relation === null ? undefined : relationParam(params.relation);
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
        // The store keeps the relation of a layer's first filter; a given relation is set afterwards.
        await useFilterStore().addAttributeFilter(layer.id, filter, relation ?? "AND");
        if (relation !== undefined) setAttributeRelation(layer.id, relation);
        await showLayerFilters(layer);
        return { layer: describeLayer(layer) };
    },

    // Map/Layer/Filter/AttributeFiltering.vue: deleteAttributeFilter
    removeAttributeFilter: async (params) => {
        const layer = findLayer(text(params, "layerId"));
        const name = text(params, "attribute");
        const operator = text(params, "operator");
        const target = appliedFiltersOf(layer.id)?.attributeFilters?.find((item) => item.attribute.name === name && item.operand === operator);
        if (target === undefined) throw new CommandError(`Layer "${layer.id}" has no filter "${name} ${operator}".`);
        await useFilterStore().removeAttributeFilter(layer.id, target);
        await showLayerFilters(layer);
        return { layer: describeLayer(layer) };
    },

    // Map/Layer/Filter/AttributeFiltering.vue: the AND / OR choice (relationType)
    setFilterRelation: async (params) => {
        const layer = findLayer(text(params, "layerId"));
        const relation = relationParam(params.relation);
        if (!setAttributeRelation(layer.id, relation)) {
            throw new CommandError(`Layer "${layer.id}" has no attribute filters to combine.`);
        }
        await showLayerFilters(layer);
        return { layer: describeLayer(layer) };
    },

    // No single UI control: the same as deleting each filter in the attribute and geometry panels.
    clearLayerFilters: async (params) => {
        const layer = findLayer(text(params, "layerId"));
        await clearLayerFilters(layer.id);
        await showLayerFilters(layer);
        return { layer: describeLayer(layer) };
    },

    // Map/Layer/Filter/GeometryFiltering.vue: applyGeometryFilter (area = a GeoJSON polygon layer, or some of its features)
    applyGeometryFilter: async (params) => {
        const layer = findLayer(text(params, "layerId"));
        const hasAreaLayer = params.areaLayerId !== undefined && params.areaLayerId !== null;
        const hasAreaMatch = params.areaMatch !== undefined && params.areaMatch !== null;
        if (hasAreaLayer === hasAreaMatch) throw new CommandError("Give exactly one of \"areaLayerId\" and \"areaMatch\".");
        if (!takesGeometryFilter(layer)) {
            throw new CommandError(`Layer "${layer.id}" cannot be filtered by an area; only catalog vector layers can.`);
        }
        const identifier = identifierAttribute(layer);
        if (identifier === undefined) {
            throw new CommandError(`Layer "${layer.id}" has no "gid" or "id" attribute, which an area filter needs.`);
        }
        const areaMatch = params.areaMatch as CommandParams;
        if (hasAreaMatch && (typeof areaMatch !== "object" || Array.isArray(areaMatch))) {
            throw new CommandError("\"areaMatch\" must be an object.");
        }
        const areaLayer = findLayer(hasAreaLayer ? text(params, "areaLayerId") : text(areaMatch, "layerId"));
        // The area needs whole geometries: a catalog layer exists on the map only as vector tiles,
        // which cut and simplify them, so only GeoJSON layers (drawn, buffer, added GeoJSON) can be one.
        if (areaLayer.id === layer.id || isTileLayer(areaLayer) || areaLayer.layerData === undefined) {
            throw new CommandError(`Layer "${areaLayer.id}" cannot be the area: it must be a GeoJSON polygon layer `
                + "(drawn, buffer or added with add_geo_json_layer).");
        }
        let area: FeatureCollection;
        if (hasAreaLayer) {
            if (areaLayer.layerData.features.length === 0 || !areaLayer.layerData.features.every(isPolygon)) {
                throw new CommandError(`Layer "${areaLayer.id}" is not a polygon layer that can be the area.`);
            }
            area = areaLayer.layerData;
        } else {
            const match = featureMatch(areaMatch);
            const features = matchedFeatures(match);
            const polygons = features.filter(isPolygon);
            if (polygons.length === 0) {
                if (features.length === 0) throw noMatch(match);
                throw new CommandError(`The matching features of "${match.layer.id}" are not polygons.`);
            }
            area = { type: "FeatureCollection", features: polygons };
        }
        // createGeometryFilter reads the features drawn on screen: show the whole area and let tiles load.
        await fitMapToArea(area);
        let inside: number;
        try {
            inside = await applyAreaFilter(layer, area, identifier);
        } catch (error) {
            throw new CommandError(error instanceof Error ? error.message : String(error));
        }
        return {
            layer: describeLayer(layer),
            featuresInArea: inside,
            view: describeView(),
            note: "Only features drawn on the map when the filter was made are included.",
        };
    },

    // Map/Layer/Filter/GeometryFiltering.vue: removeGeometryFilter
    removeGeometryFilter: async (params) => {
        const layer = findLayer(text(params, "layerId"));
        if (appliedFiltersOf(layer.id)?.geometryFilters === undefined) throw new CommandError(`Layer "${layer.id}" has no area filter.`);
        await useFilterStore().removeGeometryFilter(layer.id);
        await showLayerFilters(layer);
        return { layer: describeLayer(layer) };
    },

    // No single UI control: what the map shows of a layer (the click popup reads features the same way).
    getLayerFeatures: async (params) => {
        const layer = findLayer(text(params, "layerId"));
        const limit = integer(params, "limit", DEFAULT_FEATURE_PAGE, 1, MAX_FEATURE_PAGE);
        const offset = integer(params, "offset", 0, 0, Number.MAX_SAFE_INTEGER);
        const withGeometry = params.withGeometry === true;
        const applied = appliedFiltersOf(layer.id);
        let all: Feature[];
        const inView = isTileLayer(layer);
        if (inView) {
            // Vector tiles: the features drawn in the current view, after the layer's filters.
            requireShown(layer);
            await tilesLoaded();
            all = renderedLayerFeatures(readyMap(), layer, identifierAttribute(layer));
        } else if (layer.layerData !== undefined) {
            all = layer.layerData.features;
        } else {
            throw new CommandError(`Layer "${layer.id}" has no features the map can read (raster and 3D layers have none).`);
        }
        const page = all.slice(offset, offset + limit);
        const features = page.map((feature) => (withGeometry
            ? { properties: feature.properties ?? {}, geometry: feature.geometry }
            : { properties: feature.properties ?? {} }));
        if (JSON.stringify(features).length > MAX_FEATURE_PAGE_BYTES) {
            throw new CommandError("This page is larger than 1 MB. Ask for fewer features"
                + (withGeometry ? " or leave out the geometries." : "."));
        }
        return {
            layerId: layer.id,
            scope: inView ? "view" : "all",
            total: all.length,
            offset,
            returned: features.length,
            filtersApplied: inView && applied !== undefined,
            features,
            ...(inView
                ? { note: "Only the features drawn in the current map view, after the layer's filters. Move the map to read others. Geometries come from the map tiles and are simplified when zoomed out." }
                : {}),
        };
    },

    // MapContainer.vue: showAttributePopup, for the clicks the user made (recorded by ./selection)
    getSelectedFeatures: () => {
        const selections = recentSelections();
        return {
            latest: selections[0] ?? null,
            earlier: selections.slice(1),
            note: selections.length === 0
                ? "The user has not clicked on the map since the assistant connected."
                : "What the user clicked, newest first, with the attributes the click popup showed then.",
        };
    },

    // New (no UI control): features the browser holds + the map's fitBounds
    zoomToFeatures: async (params) => {
        const match = featureMatch(params);
        const features = await findMatchingFeatures(match);
        if (features.length === 0) throw noMatch(match);
        const result = await moveMap((map) => fitMapToFeatures(map, { type: "FeatureCollection", features }));
        return { ...result, matched: features.length };
    },

    ...layerDisplayCommands,
    ...dataCommands,
    ...mapViewCommands,
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

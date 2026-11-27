/**
 * AI map commands that add data from other services and query OGC API layers: external OGC API
 * Features collections, SensorThings layers, catalog layer groups, and time-enabled rasters.
 * Each calls the stores the data panels use (named on each command); nothing in the stores or
 * components changes.
 */
import { ogcCollectionLayerId } from "@helpers/externalLayers";
import { OgcFilterValueError, operatorsForType } from "@helpers/ogcCql2";
import { type ExternalDataSourceConfig } from "../config/externalDataSources";
import { isOgcApiFeatureCollection, useExternalDataSourcesStore } from "@store/externalDataSources";
import {
    type GeoserverRasterTypeLayerDetail,
    getTimeDimension,
    resolveTimeDomain,
    useGeoserverStore,
} from "@store/geoserver";
import { type LayerObjectWithAttributes, useMapStore } from "@store/map";
import { useOgcLayersStore } from "@store/ogcLayers";
import { useSensorThingsLayersStore } from "@store/sensorThingsLayers";
import { type CommandHandler, type CommandParams, CommandError, describeLayer, findLayer, text } from "./commandHelpers";

/** How many allowed times an answer lists when a time is refused. */
const TIMES_SHOWN = 20;

/** An external service the user may see, as the data panel lists them (`WorkspaceListing.vue`). */
async function externalService(serviceId: string, type: ExternalDataSourceConfig["type"]): Promise<ExternalDataSourceConfig> {
    const services = await useExternalDataSourcesStore().loadExternalServices();
    const service = services.find((item) => item.id === serviceId && item.type === type);
    if (service === undefined) {
        const kind = type === "ogc-api" ? "OGC API" : "SensorThings";
        const known = services.filter((item) => item.type === type).map((item) => item.id);
        throw new CommandError(`There is no ${kind} service "${serviceId}" for this user.`
            + (known.length > 0 ? ` Known: ${known.join(", ")}.` : ""));
    }
    return service;
}

function rasterDetail(layer: LayerObjectWithAttributes): GeoserverRasterTypeLayerDetail | undefined {
    return layer.details !== undefined && "coverage" in layer.details ? layer.details as GeoserverRasterTypeLayerDetail : undefined;
}

/**
 * The times a raster layer offers, as its time slider loads them (`RasterLayerTimeControl.vue`),
 * and the time to use: the default for "default", else the given one, checked against the list
 * when the server published one.
 */
export async function rasterTime(detail: GeoserverRasterTypeLayerDetail, workspace: string, wanted: string): Promise<string> {
    if (getTimeDimension(detail.coverage) === null) throw new CommandError(`"${detail.coverage.name}" has no time dimension.`);
    const geoserver = useGeoserverStore();
    const domain = await resolveTimeDomain(
        async (name) => await geoserver.fetchWmsCapabilities(name, false, detail.catalog?.provider.id),
        workspace,
        detail.coverage.name,
        detail.coverage,
    );
    if (wanted === "default") return domain.default;
    if (domain.source === "capabilities" && !wanted.includes("/") && !domain.values.includes(wanted)) {
        const shown = domain.values.length > TIMES_SHOWN
            ? [...domain.values.slice(0, TIMES_SHOWN / 2), "…", ...domain.values.slice(-TIMES_SHOWN / 2)]
            : domain.values;
        throw new CommandError(`"${wanted}" is not one of the layer's times: ${shown.join(", ")}.`);
    }
    return wanted;
}

/** The OGC layer state of a layer on the map, refusing layers whose service takes no queries. */
function queryableOgcLayer(layerId: string) {
    const layer = findLayer(layerId);
    const state = useOgcLayersStore().layers[layer.id];
    if (state === undefined) throw new CommandError(`Layer "${layer.id}" is not an OGC API layer.`);
    if (state.capabilities?.server_filters !== true) {
        throw new CommandError(`The service of "${layer.id}" does not take queries.`);
    }
    if (state.loading) throw new CommandError(`Layer "${layer.id}" is still loading; try again in a moment.`);
    return { layer, state };
}

/** Runs an OGC layer query (`OgcLayerQueryControls.vue` apply) and reports what the service answered. */
async function runOgcQuery(layerId: string, properties: string[] | undefined, conditions: Array<{ property: string, operator: string, value: string }>) {
    const ogcLayers = useOgcLayersStore();
    try {
        await ogcLayers.updateLayerQuery(layerId, { properties, conditions: conditions as never });
    } catch (error) {
        if (error instanceof OgcFilterValueError) throw new CommandError(`"${error.value}" is not a valid value for ${error.property}.`);
        throw error;
    }
    const state = ogcLayers.layers[layerId];
    if (state?.errorKind === "filter") throw new CommandError("The service refused the query.");
    if (state?.errorKind === "request") throw new CommandError("The service could not be reached; the layer was not reloaded.");
    return {
        layer: describeLayer(findLayer(layerId)),
        matched: state?.totalMatched,
        loaded: state?.loadedCount,
        mode: state?.mode,
    };
}

export const dataCommands: Record<string, CommandHandler> = {
    // OgcApiCollectionListingItem.vue: add (the service → dataset → collection listing)
    addOgcCollection: async (params) => {
        const externalSources = useExternalDataSourcesStore();
        const service = await externalService(text(params, "serviceId"), "ogc-api");
        const datasetId = typeof params.datasetId === "string" ? params.datasetId : "";
        const datasets = await externalSources.getOgcApiDatasets(service);
        // A plain landing page is one dataset; search_sources then gives an empty dataset id.
        const dataset = datasets.find((item) => item.id === datasetId)
            ?? (datasetId === "" && datasets.length === 1 ? datasets[0] : undefined);
        if (dataset === undefined) throw new CommandError(`Service "${service.id}" has no dataset "${datasetId}".`);
        const collectionId = text(params, "collectionId");
        const collection = (await externalSources.getOgcApiCollections(dataset)).find((item) => item.id === collectionId);
        if (collection === undefined) throw new CommandError(`Dataset "${dataset.id}" has no collection "${collectionId}".`);
        if (!isOgcApiFeatureCollection(collection)) throw new CommandError(`Collection "${collectionId}" has no features to show.`);
        const layerId = ogcCollectionLayerId(service.id, dataset.id, collection.id);
        if (useMapStore().layersOnMap.some((layer) => layer.id === layerId)) {
            throw new CommandError(`This collection is already on the map as "${layerId}".`);
        }
        const state = await useOgcLayersStore().addCollectionLayer({ source: service, dataset, collection });
        return {
            layer: describeLayer(findLayer(state.layerId)),
            loaded: state.loadedCount,
            matched: state.totalMatched,
            mode: state.mode,
            note: state.mode === "viewport"
                ? "The collection is large: only the features in the current view are loaded, and more load as the map moves."
                : undefined,
        };
    },

    // SensorThingsLayerListingItem.vue: add (the layers of a SensorThings service)
    addSensorThingsLayer: async (params) => {
        const service = await externalService(text(params, "serviceId"), "sensorthings");
        const serviceName = text(params, "serviceName");
        const layerName = text(params, "layerName");
        const catalog = await useExternalDataSourcesStore().getSensorThingsLayerCatalog(service);
        const entry = catalog.find((item) => item.serviceName === serviceName && item.layerName === layerName);
        if (entry === undefined) {
            throw new CommandError(`Service "${service.id}" has no layer "${layerName}" in "${serviceName}". `
                + "list_sensor_things_layers lists them.");
        }
        const layer = await useSensorThingsLayersStore().addServiceLayer({
            source: service,
            serviceName,
            layerName,
            displayName: layerName,
            totalCount: entry.datastreamCount,
        });
        return { layer: describeLayer(layer), live: service.mqttUrl !== undefined && service.capabilities.live_updates };
    },

    // Not a planned command of its own: the listing addSensorThingsLayer needs (SensorThingsSourceListing.vue).
    listSensorThingsLayers: async (params) => {
        const service = await externalService(text(params, "serviceId"), "sensorthings");
        const catalog = await useExternalDataSourcesStore().getSensorThingsLayerCatalog(service);
        return {
            serviceId: service.id,
            layers: catalog.map((item) => ({ serviceName: item.serviceName, layerName: item.layerName, sensors: item.datastreamCount })),
        };
    },

    // WorkspaceLayerGroupListingItem.vue: add2Map
    addCatalogLayerGroup: async (params) => {
        const geoserver = useGeoserverStore();
        const providerId = text(params, "providerId");
        const workspace = text(params, "workspace");
        const groupName = text(params, "groupName");
        const list = await geoserver.getLayerList(workspace, providerId);
        const item = list.groups?.group.find((group) => group.name === groupName);
        if (item === undefined) throw new CommandError(`Workspace "${workspace}" has no layer group "${groupName}" (or this user may not see it).`);
        const group = await useMapStore().addMapGroup(await geoserver.getLayerGroup(item));
        return { layer: describeLayer(group) };
    },

    // RasterLayerTimeControl.vue: the time slider (setRasterLayerTime)
    setLayerTime: async (params) => {
        const layer = findLayer(text(params, "layerId"));
        const detail = rasterDetail(layer);
        if (layer.logicalKind === "group" || layer.type !== "raster" || detail === undefined || layer.workspaceName === undefined) {
            throw new CommandError(`Layer "${layer.id}" is not a catalog raster layer.`);
        }
        const time = await rasterTime(detail, layer.workspaceName, text(params, "time"));
        useMapStore().setRasterLayerTime(layer.id, time);
        return { layer: describeLayer(layer) };
    },

    // OgcLayerQueryControls.vue: apply
    setOgcLayerQuery: async (params) => {
        const { layer, state } = queryableOgcLayer(text(params, "layerId"));
        const queryables = state.queryables.filter((item) => !item.isGeometry);
        const names = queryables.map((item) => item.name);
        const wanted = Array.isArray(params.properties) ? params.properties.map(String) : [];
        const unknown = wanted.filter((name) => !names.includes(name));
        if (unknown.length > 0) throw new CommandError(`Layer "${layer.id}" has no attribute ${unknown.join(", ")}. Known: ${names.join(", ")}.`);
        // As the panel: no selection, or all of them, loads every attribute.
        const properties = wanted.length === 0 || wanted.length === names.length ? undefined : wanted;
        const conditions = (Array.isArray(params.conditions) ? params.conditions as CommandParams[] : []).map((condition) => {
            const attribute = text(condition, "attribute");
            const queryable = queryables.find((item) => item.name === attribute);
            if (queryable === undefined) throw new CommandError(`Layer "${layer.id}" has no attribute "${attribute}". Known: ${names.join(", ")}.`);
            const operator = text(condition, "operator");
            const allowed: string[] = operatorsForType(queryable.type);
            if (!allowed.includes(operator)) {
                throw new CommandError(`"${attribute}" (${queryable.type}) takes the operators ${allowed.join(", ")}.`);
            }
            if (typeof condition.value !== "string" || condition.value === "") throw new CommandError(`The condition on "${attribute}" needs a value.`);
            return { property: attribute, operator, value: condition.value };
        });
        return await runOgcQuery(layer.id, properties, conditions);
    },

    // OgcLayerQueryControls.vue: reset (no conditions, every attribute)
    resetOgcLayerQuery: async (params) => {
        const { layer } = queryableOgcLayer(text(params, "layerId"));
        return await runOgcQuery(layer.id, undefined, []);
    },
};

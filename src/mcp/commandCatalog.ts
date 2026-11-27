/**
 * The list of map commands: one entry per thing an AI assistant may do on the
 * open map, with the description and parameters it is shown.
 *
 * This file is the single list. `commands.ts` holds the code of the commands
 * marked `available`; a test keeps the two in step. Commands marked `planned`
 * are agreed but not written yet; they are not offered to the assistant.
 * Plan and order: TOSCA_Planining/2026-11-27-tosca-komut-envanteri.md.
 *
 * Scope: basic WebGIS work (find, add, move, filter, read). App modules such
 * as urban stories or simulations come later, each as a few entries here.
 *
 * Parameters are JSON Schema, exactly as the command receives them.
 * Descriptions are written for the assistant, in English. They name other
 * commands and server tools by their MCP tool name (snake_case, e.g.
 * get_map_state, search_layers), because that is what the assistant sees.
 *
 * The MCP server builds one tool per `available` entry from an export of this
 * file (`npm run mcp:export -- <path>`, see `exportedCommands`). After any
 * change here, export again into the backend's
 * `tosca_api/apps/mcp_server/map_commands.json`.
 */

/** What a command does to the user's map. */
export type CommandEffect =
    /** Reads only. */
    | "read"
    /** Changes what the user's tab shows (view, visibility, filters); repeatable. */
    | "view"
    /** Adds something new to the map (a layer); not repeatable without a duplicate. */
    | "add";

export type CommandStatus = "available" | "planned";

export type CommandGroup = "layers" | "manage" | "view" | "read" | "filter" | "analysis";

type JsonType = "object" | "string" | "number" | "integer" | "boolean" | "array";

export interface JsonSchema {
    type?: JsonType | JsonType[];
    description?: string;
    properties?: Record<string, JsonSchema>;
    required?: string[];
    items?: JsonSchema;
    enum?: readonly (string | number)[];
    minimum?: number;
    maximum?: number;
    minItems?: number;
    maxItems?: number;
    minLength?: number;
    maxLength?: number;
    additionalProperties?: boolean;
}

export interface CommandSpec {
    /** Name of the command in `commands.ts` and on the bridge. */
    name: string;
    group: CommandGroup;
    title: string;
    description: string;
    params: JsonSchema;
    effect: CommandEffect;
    /** How long the server waits for the browser's answer. */
    timeoutSeconds: number;
    status: CommandStatus;
}

const LAYER_ID: JsonSchema = {
    type: "string",
    minLength: 1,
    description: "Id of a layer on the map, from get_map_state (not its title).",
};
const LONGITUDE: JsonSchema = { type: "number", minimum: -180, maximum: 180 };
const LATITUDE: JsonSchema = { type: "number", minimum: -90, maximum: 90 };
const BBOX: JsonSchema = {
    type: "array",
    items: { type: "number" },
    minItems: 4,
    maxItems: 4,
    description: "WGS84 [west, south, east, north].",
};
const ATTRIBUTE_OPERATORS = ["==", "!=", ">", ">=", "<", "<=", "in"] as const;
const OGC_OPERATORS = ["eq", "neq", "contains", "lt", "lte", "gt", "gte"] as const;

function object(properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
    return { type: "object", properties, required, additionalProperties: false };
}

/** A condition "attribute operator value" that picks features of a layer, e.g. bezirk_name == Altona. */
const FEATURE_MATCH: JsonSchema = object({
    layerId: LAYER_ID,
    attribute: { type: "string", minLength: 1, description: "Attribute name from get_layer_attributes." },
    value: { type: "string", description: "Value the attribute must equal (text compared ignoring case)." },
}, ["layerId", "attribute", "value"]);

export const commandCatalog: readonly CommandSpec[] = [
    // ---------------------------------------------------------------- layers
    {
        name: "addCatalogLayer",
        group: "layers",
        title: "Add a catalog layer to the map",
        description: "Show a TOSCA catalog layer on the user's map, with its catalog style. A vector layer comes as "
            + "vector tiles and takes attribute and area filters; a raster layer is an image and takes no filters. "
            + "Take providerId, workspace and layerName from search_layers (its provider_id, workspace and name). "
            + "Returns the new layer's id on the map.",
        params: object({
            providerId: { type: "string", minLength: 1, description: "provider_id from search_layers." },
            workspace: { type: "string", minLength: 1, description: "Workspace name from search_layers." },
            layerName: { type: "string", minLength: 1, description: "Layer name from search_layers (not the title)." },
            time: {
                type: "string",
                minLength: 4,
                description: "Time-enabled raster layers only: ISO 8601 time or \"default\"; leave out for the server's default.",
            },
        }, ["providerId", "workspace", "layerName"]),
        effect: "add",
        timeoutSeconds: 60,
        status: "available",
    },
    {
        name: "addCatalogLayerGroup",
        group: "layers",
        title: "Add a catalog layer group to the map",
        description: "Show a TOSCA catalog layer group: several layers shown as one entry in the layer list. Take "
            + "providerId and workspace from search_layers and the group's name.",
        params: object({
            providerId: { type: "string", minLength: 1 },
            workspace: { type: "string", minLength: 1 },
            groupName: { type: "string", minLength: 1 },
        }, ["providerId", "workspace", "groupName"]),
        effect: "add",
        timeoutSeconds: 60,
        status: "available",
    },
    {
        name: "addOgcCollection",
        group: "layers",
        title: "Add an OGC API collection to the map",
        description: "Show a collection of an external OGC API Features service (e.g. Hamburg's) on the map, as TOSCA's "
            + "data panel does. From search_sources / describe_source_item: serviceId = the source id, datasetId = "
            + "the item_id (may be empty), collectionId = one of the item's collections with geojson true. The "
            + "browser loads it as GeoJSON: all features when small, otherwise the features in view. The map moves "
            + "to the data.",
        params: object({
            serviceId: { type: "string", minLength: 1, description: "External service id." },
            datasetId: { type: "string", description: "Dataset id within the service; empty for a single API." },
            collectionId: { type: "string", minLength: 1 },
        }, ["serviceId", "collectionId"]),
        effect: "add",
        timeoutSeconds: 60,
        status: "available",
    },
    {
        name: "addSensorThingsLayer",
        group: "layers",
        title: "Add a SensorThings layer to the map",
        description: "Show live sensor data of an external SensorThings service on the map; values update live where the "
            + "service offers it. Take serviceId, serviceName and layerName from search_sources (its `show_on_map`) "
            + "or from list_sensor_things_layers.",
        params: object({
            serviceId: { type: "string", minLength: 1, description: "External service id." },
            serviceName: { type: "string", minLength: 1 },
            layerName: { type: "string", minLength: 1 },
        }, ["serviceId", "serviceName", "layerName"]),
        effect: "add",
        timeoutSeconds: 60,
        status: "available",
    },
    {
        name: "listSensorThingsLayers",
        group: "read",
        title: "List the layers of a SensorThings service",
        description: "The layers (serviceName, layerName, number of sensors) an external SensorThings service offers, "
            + "for add_sensor_things_layer. The first call for a service can take a while.",
        params: object({ serviceId: { type: "string", minLength: 1, description: "External service id." } }, ["serviceId"]),
        effect: "read",
        timeoutSeconds: 120,
        status: "available",
    },
    {
        name: "addGeoJsonLayer",
        group: "layers",
        title: "Add GeoJSON to the map",
        description: "Show small GeoJSON data (WGS84) as a new layer, e.g. a few points or one outline you computed. "
            + "The layer exists only in the user's browser tab. All features must be of one geometry family "
            + "(points, lines or polygons). Polygon layers can be the area of apply_geometry_filter. "
            + "At most 5000 features and about 1 MB; for catalog data use add_catalog_layer.",
        params: object({
            title: { type: "string", minLength: 1, maxLength: 80, description: "Layer title shown in the layer list." },
            geojson: { type: "object", description: "A GeoJSON FeatureCollection in WGS84." },
        }, ["title", "geojson"]),
        effect: "add",
        timeoutSeconds: 60,
        status: "available",
    },
    {
        name: "openGeostory",
        group: "layers",
        title: "Run a geostory",
        description: "Open a geostory on the user's map; it replaces the current map and its layers. Take the id from "
            + "list_geostories. After that the user reads the story themselves.",
        params: object({ storyId: { type: "string", minLength: 1 } }, ["storyId"]),
        effect: "add",
        timeoutSeconds: 60,
        status: "available",
    },

    // ---------------------------------------------------------------- manage
    {
        name: "removeLayer",
        group: "manage",
        title: "Remove a layer from the map",
        description: "Remove a layer from the user's map (the catalog data itself is not touched).",
        params: object({ layerId: LAYER_ID }, ["layerId"]),
        effect: "view",
        timeoutSeconds: 15,
        status: "available",
    },
    {
        name: "setLayerVisibility",
        group: "manage",
        title: "Show or hide a layer",
        description: "Set whether a layer on the map is visible.",
        params: object({ layerId: LAYER_ID, visible: { type: "boolean" } }, ["layerId", "visible"]),
        effect: "view",
        timeoutSeconds: 10,
        status: "available",
    },
    {
        name: "setLayerOpacity",
        group: "manage",
        title: "Set layer opacity",
        description: "Set the opacity of a layer on the map, from 0 (transparent) to 1 (opaque).",
        params: object({ layerId: LAYER_ID, opacity: { type: "number", minimum: 0, maximum: 1 } }, ["layerId", "opacity"]),
        effect: "view",
        timeoutSeconds: 10,
        status: "available",
    },
    {
        name: "moveLayer",
        group: "manage",
        title: "Change the layer order",
        description: "Move a layer in the layer list and drawing order; position 0 is the top of the list, drawn above the "
            + "others. get_map_state lists the layers.",
        params: object({ layerId: LAYER_ID, position: { type: "integer", minimum: 0 } }, ["layerId", "position"]),
        effect: "view",
        timeoutSeconds: 10,
        status: "available",
    },
    {
        name: "setLayerStyle",
        group: "manage",
        title: "Choose a layer style",
        description: "Switch a catalog layer to another of its published styles; get_map_state lists a layer's `styles` "
            + "(id and title) when it has more than one.",
        params: object({ layerId: LAYER_ID, styleId: { type: "string", minLength: 1 } }, ["layerId", "styleId"]),
        effect: "view",
        timeoutSeconds: 15,
        status: "available",
    },
    {
        name: "setLayerColor",
        group: "manage",
        title: "Change a layer's colour",
        description: "Set the fill or outline colour of a layer, as a hex colour like #2a9d8f, as the colour picker in the "
            + "layer list does. Not possible when the colour depends on the data (classes) or the style draws the "
            + "layer in several parts; use set_layer_style then.",
        params: object({
            layerId: LAYER_ID,
            part: { type: "string", enum: ["fill", "outline"] },
            color: { type: "string", minLength: 4, maxLength: 7, description: "#rgb or #rrggbb." },
        }, ["layerId", "part", "color"]),
        effect: "view",
        timeoutSeconds: 10,
        status: "available",
    },
    {
        name: "setLayerTime",
        group: "manage",
        title: "Choose the time of a time-enabled layer",
        description: "Show a time-enabled catalog raster layer at another time (ISO 8601, a start/end range, or "
            + "\"default\"). A time the layer does not offer is refused with the list of its times.",
        params: object({ layerId: LAYER_ID, time: { type: "string", minLength: 4, description: "ISO 8601 time, start/end range, or \"default\"." } }, ["layerId", "time"]),
        effect: "view",
        timeoutSeconds: 15,
        status: "available",
    },
    {
        name: "getLayerLegend",
        group: "manage",
        title: "Read a layer's legend",
        description: "The legend of a layer on the map, as TOSCA's layer panel shows it: entries with labels and colours, "
            + "or the URL of a legend image.",
        params: object({ layerId: LAYER_ID }, ["layerId"]),
        effect: "read",
        timeoutSeconds: 15,
        status: "available",
    },

    // ------------------------------------------------------------------ view
    {
        name: "getMapState",
        group: "view",
        title: "Read the map",
        description: "What the user's TOSCA map shows right now: the view (center, zoom, bounds) and every layer "
            + "with its id, title, visibility, opacity and filters, including layers the user added by hand. "
            + "Read it again instead of relying on an earlier answer.",
        params: object({}),
        effect: "read",
        timeoutSeconds: 10,
        status: "available",
    },
    {
        name: "setView",
        group: "view",
        title: "Move the map",
        description: "Fly the map to a point (WGS84), optionally turned (bearing) and tilted (pitch). Zoom 0 is the world, "
            + "12 a city, 16 a street.",
        params: object({
            center: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2, description: "[longitude, latitude]." },
            zoom: { type: "number", minimum: 0, maximum: 22, description: "Leave out to keep the zoom." },
            bearing: { type: "number", minimum: -360, maximum: 360, description: "Compass direction at the top in degrees (0 = north); leave out to keep it." },
            pitch: { type: "number", minimum: 0, maximum: 85, description: "Tilt in degrees (0 = straight down); leave out to keep it." },
        }, ["center"]),
        effect: "view",
        timeoutSeconds: 10,
        status: "available",
    },
    {
        name: "fitBounds",
        group: "view",
        title: "Fit the map to an extent",
        description: "Show a WGS84 bounding box, e.g. a district or a layer's extent.",
        params: object({ bounds: BBOX }, ["bounds"]),
        effect: "view",
        timeoutSeconds: 10,
        status: "available",
    },
    {
        name: "zoomToLayer",
        group: "view",
        title: "Zoom to a layer",
        description: "Fit the map to the extent of a layer that is on the map.",
        params: object({ layerId: LAYER_ID }, ["layerId"]),
        effect: "view",
        timeoutSeconds: 10,
        status: "available",
    },
    {
        name: "zoomToFeatures",
        group: "view",
        title: "Zoom to matching features",
        description: "Fit the map to the features of a layer that match a condition, e.g. the district "
            + "bezirk_name == Altona. The layer must be on the map and visible. Catalog layers are searched in the "
            + "map tiles the browser has loaded; if nothing matches there, the map shows the layer's whole extent "
            + "once and searches again.",
        params: FEATURE_MATCH,
        effect: "view",
        timeoutSeconds: 30,
        status: "available",
    },
    {
        name: "setBasemap",
        group: "view",
        title: "Change the basemap",
        description: "Switch the background map; get_map_state lists the `basemaps` with their ids. The layers stay.",
        params: object({ basemapId: { type: "string", minLength: 1 } }, ["basemapId"]),
        effect: "view",
        timeoutSeconds: 10,
        status: "available",
    },
    {
        name: "setTerrain",
        group: "view",
        title: "Turn 3D terrain on or off",
        description: "Show the terrain relief in 3D, or flat. Tilt the map with set_view's pitch to see it.",
        params: object({ enabled: { type: "boolean" } }, ["enabled"]),
        effect: "view",
        timeoutSeconds: 10,
        status: "available",
    },

    // ------------------------------------------------------------------ read
    {
        name: "getLayerAttributes",
        group: "read",
        title: "List a map layer's attributes",
        description: "Attributes of a layer on the map that can be used in filters, with their type "
            + "('text' or 'number'). Call it before add_attribute_filter.",
        params: object({ layerId: LAYER_ID }, ["layerId"]),
        effect: "read",
        timeoutSeconds: 10,
        status: "available",
    },
    {
        name: "getLayerFeatures",
        group: "read",
        title: "Read a layer's features",
        description: "The features of a layer on the map with their attributes, page by page, read from what the "
            + "browser holds (nothing is downloaded). Catalog layers (vector tiles): only the features drawn in "
            + "the current map view, after the layer's filters (`scope` \"view\"); move the map first to read "
            + "another area. GeoJSON layers (drawn, buffer, added GeoJSON): all features (`scope` \"all\"). "
            + "`total` counts the features in that scope.",
        params: object({
            layerId: LAYER_ID,
            limit: { type: "integer", minimum: 1, maximum: 500, description: "Features per page (default 50)." },
            offset: { type: "integer", minimum: 0, description: "Features to skip (default 0)." },
            withGeometry: { type: "boolean", description: "Include geometries (off by default)." },
        }, ["layerId"]),
        effect: "read",
        timeoutSeconds: 60,
        status: "available",
    },
    {
        name: "identifyAt",
        group: "read",
        title: "What is at a point",
        description: "The features drawn at a WGS84 point of the current map view, with the attributes the click popup "
            + "shows. The point must be in view; values of raster (image) layers are not read.",
        params: object({ longitude: LONGITUDE, latitude: LATITUDE }, ["longitude", "latitude"]),
        effect: "read",
        timeoutSeconds: 15,
        status: "available",
    },
    {
        name: "getDrawnFeatures",
        group: "read",
        title: "Read what the user drew",
        description: "What the user has drawn: the drawing in progress (not saved yet) and the saved drawings, buffers and "
            + "GeoJSON layers on the map, as GeoJSON. A polygon layer among them can be the area of "
            + "apply_geometry_filter.",
        params: object({}),
        effect: "read",
        timeoutSeconds: 10,
        status: "available",
    },

    // ---------------------------------------------------------------- filter
    {
        name: "addAttributeFilter",
        group: "filter",
        title: "Filter a layer by attribute",
        description: "Show only the features of a map layer that match a condition, e.g. year >= 1960. "
            + "Number attributes take ==, !=, >, >=, <, <=; text attributes take ==, != and in (ignoring case). "
            + "Several filters on one layer are combined with `relation`. The filter also appears in TOSCA's "
            + "filter panel. Works on catalog vector layers; OGC API layers use set_ogc_layer_query.",
        params: object({
            layerId: LAYER_ID,
            attribute: { type: "string", minLength: 1, description: "Attribute name from get_layer_attributes." },
            operator: { type: "string", enum: ATTRIBUTE_OPERATORS },
            value: { type: ["string", "number"], description: "Value to compare with." },
            relation: {
                type: "string",
                enum: ["AND", "OR"],
                description: "How this layer's attribute filters are combined; leave out to keep the current choice.",
            },
        }, ["layerId", "attribute", "operator", "value"]),
        effect: "view",
        timeoutSeconds: 15,
        status: "available",
    },
    {
        name: "removeAttributeFilter",
        group: "filter",
        title: "Remove an attribute filter",
        description: "Remove one filter from a map layer, identified by its attribute and operator (see get_map_state).",
        params: object({
            layerId: LAYER_ID,
            attribute: { type: "string", minLength: 1 },
            operator: { type: "string", enum: ATTRIBUTE_OPERATORS },
        }, ["layerId", "attribute", "operator"]),
        effect: "view",
        timeoutSeconds: 15,
        status: "available",
    },
    {
        name: "setFilterRelation",
        group: "filter",
        title: "Combine a layer's filters with AND or OR",
        description: "Set whether a feature must match all of a layer's attribute filters (AND) or any of them (OR), "
            + "as the AND / OR choice in TOSCA's filter panel. An area filter always applies on top.",
        params: object({ layerId: LAYER_ID, relation: { type: "string", enum: ["AND", "OR"] } }, ["layerId", "relation"]),
        effect: "view",
        timeoutSeconds: 15,
        status: "available",
    },
    {
        name: "clearLayerFilters",
        group: "filter",
        title: "Remove all filters of a layer",
        description: "Remove every attribute and geometry filter of a layer on the map.",
        params: object({ layerId: LAYER_ID }, ["layerId"]),
        effect: "view",
        timeoutSeconds: 15,
        status: "available",
    },
    {
        name: "applyGeometryFilter",
        group: "filter",
        title: "Filter a layer by an area",
        description: "Show only the features of a catalog vector layer that lie within an area, in the browser "
            + "as TOSCA's geometry filter panel does. The area is a GeoJSON polygon layer on the map: one the user "
            + "drew, or one you added with add_geo_json_layer (e.g. a 100 m buffer polygon you computed around a "
            + "place). Give either `areaLayerId` (the whole layer) or `areaMatch` (only its features with "
            + "attribute == value), not both. Catalog layers cannot be the area: on the map they exist only as "
            + "vector tiles, which cut and simplify geometries. The map moves to the area first: only features "
            + "drawn there count, so the target layer must be visible at that zoom. The target layer needs a gid "
            + "or id attribute. Replaces the layer's current area filter; attribute filters stay and apply as well.",
        params: object({
            layerId: LAYER_ID,
            areaLayerId: { ...LAYER_ID, description: "GeoJSON polygon layer on the map that is the area." },
            areaMatch: { ...FEATURE_MATCH, description: "Features of a GeoJSON polygon layer on the map that are the area." },
        }, ["layerId"]),
        effect: "view",
        timeoutSeconds: 30,
        status: "available",
    },
    {
        name: "removeGeometryFilter",
        group: "filter",
        title: "Remove an area filter",
        description: "Remove the geometry filter of a layer on the map.",
        params: object({ layerId: LAYER_ID }, ["layerId"]),
        effect: "view",
        timeoutSeconds: 15,
        status: "available",
    },
    {
        name: "setOgcLayerQuery",
        group: "filter",
        title: "Query an OGC API layer on the server",
        description: "Ask the OGC API service of a layer added with add_ogc_collection for only the features that match "
            + "all conditions, and optionally only some attributes, as the layer's query panel does. Text "
            + "attributes take eq, neq, contains; numbers eq, neq, lt, lte, gt, gte; booleans eq with \"true\" or "
            + "\"false\". The browser reloads the layer with the answer.",
        params: object({
            layerId: LAYER_ID,
            properties: { type: "array", items: { type: "string" }, description: "Attributes to load; empty loads all." },
            conditions: {
                type: "array",
                items: object({
                    attribute: { type: "string", minLength: 1 },
                    operator: { type: "string", enum: OGC_OPERATORS },
                    value: { type: "string" },
                }, ["attribute", "operator", "value"]),
            },
        }, ["layerId"]),
        effect: "view",
        timeoutSeconds: 60,
        status: "available",
    },
    {
        name: "resetOgcLayerQuery",
        group: "filter",
        title: "Reset an OGC API layer query",
        description: "Load an OGC API layer again without conditions and with every attribute.",
        params: object({ layerId: LAYER_ID }, ["layerId"]),
        effect: "view",
        timeoutSeconds: 60,
        status: "available",
    },

    // -------------------------------------------------------------- analysis
    {
        name: "createBuffer",
        group: "analysis",
        title: "Create a buffer",
        description: "Draw a buffer of a given distance around the features of a layer whose data is in the browser "
            + "(drawings, GeoJSON or OGC API layers; not catalog layers) and add it as a polygon layer, which can "
            + "then be the area of apply_geometry_filter.",
        params: object({
            layerId: LAYER_ID,
            meters: { type: "number", minimum: 1, maximum: 50000 },
            title: { type: "string", minLength: 1, maxLength: 80 },
        }, ["layerId", "meters", "title"]),
        effect: "add",
        timeoutSeconds: 60,
        status: "available",
    },
];

/** The commands the assistant may call today. */
export function availableCommands(): CommandSpec[] {
    return commandCatalog.filter((command) => command.status === "available");
}

/** Name of the MCP tool for a command: snake_case of its name (setLayerOpacity → set_layer_opacity). */
export function toolName(commandName: string): string {
    return commandName.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/** Version of the export layout; the MCP server refuses a file with another version. */
export const EXPORT_FORMAT = 1;

/**
 * What the MCP server reads (`map_commands.json`): the available commands with
 * the fields a tool needs. `group` and `status` stay in this file.
 */
export function exportedCommands(): {
    format: number,
    source: string,
    commands: Pick<CommandSpec, "name" | "title" | "description" | "params" | "effect" | "timeoutSeconds">[],
} {
    return {
        format: EXPORT_FORMAT,
        source: "TOSCA-2 src/mcp/commandCatalog.ts (npm run mcp:export); do not edit by hand",
        commands: availableCommands().map(({ name, title, description, params, effect, timeoutSeconds }) => ({
            name, title, description, params, effect, timeoutSeconds,
        })),
    };
}

/**
 * How much of TOSCA the AI assistant can reach: every action of the map's stores is either
 * reachable through a command, an internal step of something that is, or kept from the assistant
 * on purpose (with the reason). Whole app modules that are not offered yet are listed with theirs.
 *
 * `coverage.test.ts` checks this list against the stores themselves, so a new store action or a
 * new store file fails the test until it is placed here. That keeps the "100 %" goal measurable:
 * the open part is exactly `NOT_YET_COVERED_MODULES`.
 *
 * Server-side work (catalog, publishing, styles, geostory writing, external data) is not in the
 * browser and is covered by the MCP server's own tools (TOSCA-Backend, docs/development/mcp-server.md).
 */

export type ActionCoverage =
    /** Reachable through these map commands (names as in `commandCatalog.ts`). */
    | { commands: string[] }
    /** A step inside other actions or a helper with no effect of its own. */
    | { internal: string }
    /** Deliberately not offered to the assistant. */
    | { notForAssistant: string };

const command = (...commands: string[]): ActionCoverage => ({ commands });
const internal = (reason: string): ActionCoverage => ({ internal: reason });
const notForAssistant = (reason: string): ActionCoverage => ({ notForAssistant: reason });

const MOUSE_DRAWING = "Drawing with the mouse is the user's work; the assistant adds geometry with "
    + "add_geo_json_layer and reads the user's drawing with get_drawn_features.";
const STORY_READING = "After open_geostory, moving through the scenes is the reader's (decided 2026-11-27).";

/** Store file name → action name → coverage. Only stores that drive the map are listed here. */
export const STORE_COVERAGE: Record<string, Record<string, ActionCoverage>> = {
    map: {
        getLayerUiState: command("getMapState"),
        addMapDataSource: command("addGeoJsonLayer", "addCatalogLayer"),
        addMapLayer: command("addGeoJsonLayer", "addCatalogLayer"),
        deleteMapDataSource: command("removeLayer"),
        deleteMapLayer: command("removeLayer"),
        add2MapLayerList: internal("layer list bookkeeping of addMapLayer / addMapGroup"),
        removeFromMapLayerList: internal("layer list bookkeeping of deleteMapLayer"),
        removeLayers: internal("bulk clean-up on sign-out and in urban stories"),
        reorderVisibleMapLayer: command("moveLayer"),
        getReorderableVisibleLayersTopToBottom: command("moveLayer"),
        addCompanionLayer: internal("extra render passes of a catalog style"),
        addMapGroup: command("addCatalogLayerGroup"),
        acquireMapSprite: internal("sprite reference counting of catalog styles"),
        releaseMapSprite: internal("sprite reference counting of catalog styles"),
        setLogicalLayerOpacity: command("setLayerOpacity"),
        requestLayerPanelExpansion: notForAssistant("opens a panel in the user's layer list; no effect on the map"),
        consumeLayerPanelExpansion: notForAssistant("opens a panel in the user's layer list; no effect on the map"),
        setLogicalLayerVisibility: command("setLayerVisibility"),
        setGroupMemberVisibility: command("setLayerVisibility"),
        layerOwnsSource: internal("lookup helper"),
        displayNameForSource: internal("lookup helper"),
        resetMapData: internal("clears the map when a geostory, event or participation view opens (open_geostory)"),
        geometryConversion: internal("geometry type → MapLibre layer type helper"),
        setRasterLayerTime: command("setLayerTime"),
        setStandaloneLayerStyle: command("setLayerStyle"),
        setStandaloneLayerPaintColor: command("setLayerColor"),
        initializeDeckOverlay: internal("deck.gl set-up when the map starts"),
        addDeckTilesetLayer: notForAssistant("3D tiles: the data panel has one fixed demo entry and no catalog yet "
            + "(Workspace3DDataListingItem.vue); a command follows when 3D tilesets are in the catalog"),
        addDeckGeoJsonLayer: command("addOgcCollection", "loadOgcLayer"),
        appendDeckGeoJsonChunk: internal("paged loading of OGC API layers"),
        clearDeckGeoJsonChunks: internal("paged loading of OGC API layers"),
        setDeckGeoJsonStyle: command("setLayerColor"),
        removeDeckLayer: command("removeLayer"),
        addDeckReplayLayer: notForAssistant("simulation replays belong to the simulation module (NOT_YET_COVERED_MODULES)"),
        setDeckLayerProps: internal("deck.gl layer updates"),
        setDeckLayerVisibility: command("setLayerVisibility"),
        setDeckLayerOpacity: command("setLayerOpacity"),
        pickDeckObjects: command("identifyAt", "getSelectedFeatures"),
    },
    filter: {
        operandLabel: internal("label of an operator in the filter panel"),
        addAttributeFilter: command("addAttributeFilter"),
        removeAttributeFilter: command("removeAttributeFilter", "clearLayerFilters"),
        addGeometryFilter: command("applyGeometryFilter"),
        createGeometryFilter: command("applyGeometryFilter"),
        removeGeometryFilter: command("removeGeometryFilter", "clearLayerFilters"),
        populateLayerFilter: internal("builds the MapLibre filter of a layer's filters"),
    },
    draw: {
        initializeTerraDraw: internal("drawing tool set-up"),
        destroyTerraDraw: internal("drawing tool clean-up"),
        changeMode: notForAssistant(MOUSE_DRAWING),
        stopTerradraw: notForAssistant(MOUSE_DRAWING),
        initDrawMode: notForAssistant(MOUSE_DRAWING),
        editMode: notForAssistant(MOUSE_DRAWING),
        stopDrawMode: notForAssistant(MOUSE_DRAWING),
        saveAsLayer: command("addGeoJsonLayer"),
        getSnapshot: command("getDrawnFeatures"),
        clearSnapshot: notForAssistant("would throw away the user's unsaved drawing"),
    },
    buffer: {
        temporaryBufferHandler: command("createBuffer"),
        clearTmpBufferLayer: internal("removes the buffer preview of the buffer form"),
        addToMapLayer: command("createBuffer"),
    },
    ogcLayers: {
        addCollectionLayer: command("addOgcCollection"),
        addCategoryItemLayer: command("addOgcCollection"),
        updateLayerQuery: command("setOgcLayerQuery", "resetOgcLayerQuery"),
        refreshLayer: command("loadOgcLayer"),
        loadAll: command("loadOgcLayer"),
        cancelFullLoad: command("loadOgcLayer"),
        capabilitiesForLayer: internal("what the layer's service allows"),
    },
    sensorThingsLayers: {
        addServiceLayer: command("addSensorThingsLayer"),
        addCategoryItemLayer: command("addSensorThingsLayer"),
    },
    geostoryScenes: {
        openStory: command("openGeostory"),
        showScene: notForAssistant(STORY_READING),
        closeStory: notForAssistant(STORY_READING),
    },
};

/** Stores that serve the ones above or the app shell; they have no map action of their own. */
export const SUPPORT_STORES: Record<string, string> = {
    aiBridge: "this connection",
    backend: "backend address and fetch helpers",
    externalDataSources: "loads external catalogs for addOgcCollection / addSensorThingsLayer",
    footer: "page footer",
    geoserver: "loads catalog layers and groups for addCatalogLayer / addCatalogLayerGroup",
    geostory: "geostory list and detail pages (the server's list_geostories / describe_geostory cover them)",
    sensorThingsLive: "live values of SensorThings layers once added",
};

/** App modules the assistant cannot use yet. Each will get its own commands (and server tools). */
export const NOT_YET_COVERED_MODULES: Record<string, string> = {
    geosimulation: "simulations: list from the API, suggest, set parameters, run (planned like geostories)",
    geostorySceneSimulation: "simulation results inside geostory scenes (with simulations)",
    urbanStories: "urban stories",
    hamburgRiders: "Hamburg Riders",
    events: "events",
    participation: "participation",
};

/**
 * AI map commands for the map itself and the user's own drawings: basemap, terrain, drawn
 * features, buffers and geostories. Each follows the map control or panel named on it; nothing
 * in the stores or components changes.
 */
import buffer from "@turf/buffer";
import flatten from "@turf/flatten";
import { type Feature, type FeatureCollection } from "geojson";
import { mapConfiguration } from "../config/mapConfig";
import { useDrawStore } from "@store/draw";
import { useGeostoryStore } from "@store/geostory";
import { type GeoJSONSourceParams, type LayerParams, useMapStore } from "@store/map";
import { type CommandHandler, CommandError, describeLayer, findLayer, readyMap, text } from "./commandHelpers";

const BASEMAP_TILES = ".maplibregl-ctrl-basemaps .basemap[data-id]";
const BASEMAP_SWITCH_TIMEOUT_MS = 10000;
/** Largest drawing answer; it goes through the bridge and into the conversation. */
const MAX_DRAWN_BYTES = 1_000_000;
/** TerraDraw modes of finished user geometries; the store also holds editing helper points. */
const DRAWN_MODES = ["point", "linestring", "polygon"];

/** The basemap tiles of the map's basemap control (`baseMapControl.ts`), the only place the basemaps live. */
function basemapTiles(): HTMLElement[] {
    const container = readyMap().getContainer() as HTMLElement;
    return [...container.querySelectorAll<HTMLElement>(BASEMAP_TILES)];
}

/** The basemaps the control offers, for get_map_state. */
export function describeBasemaps(): Array<Record<string, unknown>> {
    return basemapTiles().map((tile) => ({
        id: tile.dataset.id,
        title: tile.textContent?.trim() ?? tile.dataset.id,
        active: tile.classList.contains("active"),
    }));
}

/** Waits until a basemap tile is marked active, or the timeout passes. */
async function becameActive(tile: HTMLElement): Promise<boolean> {
    const deadline = Date.now() + BASEMAP_SWITCH_TIMEOUT_MS;
    while (Date.now() < deadline) {
        if (tile.classList.contains("active")) return true;
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return tile.classList.contains("active");
}

export const mapViewCommands: Record<string, CommandHandler> = {
    // baseMapControl.ts: a click on a basemap tile (the control keeps its manager to itself)
    setBasemap: async (params) => {
        const basemapId = text(params, "basemapId");
        const tiles = basemapTiles();
        const tile = tiles.find((item) => item.dataset.id === basemapId);
        if (tile === undefined) {
            throw new CommandError(`There is no basemap "${basemapId}". Known: ${tiles.map((item) => item.dataset.id).join(", ")}.`);
        }
        if (!tile.classList.contains("active")) {
            if (tile.getAttribute("aria-busy") === "true") throw new CommandError("The basemap is still switching; try again.");
            tile.click();
            if (!await becameActive(tile)) throw new CommandError(`The basemap "${basemapId}" could not be loaded.`);
        }
        return { basemaps: describeBasemaps() };
    },

    // MapContainer.vue: MapLibre's TerrainControl (same terrain source and exaggeration)
    setTerrain: (params) => {
        if (typeof params.enabled !== "boolean") throw new CommandError("\"enabled\" must be true or false.");
        const map = readyMap();
        if (params.enabled) {
            if (map.getSource("terrain-dem") === undefined) throw new CommandError("This map has no terrain data.");
            // resolveMapConfiguration gives the same value (exaggeration ?? 1) but also needs every basemap's settings.
            map.setTerrain({ source: "terrain-dem", exaggeration: mapConfiguration.terrain.exaggeration ?? 1 });
        } else {
            map.setTerrain(null);
        }
        // MapContainer.vue updates the store and the hillshade on MapLibre's "terrain" event.
        return { terrain: map.getTerrain() !== null && map.getTerrain() !== undefined };
    },

    // store/draw.ts: getSnapshot (drawing in progress) and saveAsLayer (saved drawings are layers)
    getDrawnFeatures: () => {
        const draw = useDrawStore();
        if (draw.externalAppOnProgress) throw new CommandError("Another tool is using the drawing tools right now.");
        const inProgress = draw.drawOnProgress || draw.editOnProgress
            ? draw.getSnapshot().filter((feature: Feature) => (
                DRAWN_MODES.includes(String(feature.properties?.mode))
                && feature.properties?.selectionPoint !== true
                && feature.properties?.midPoint !== true
            ))
            : [];
        // A saved drawing is a GeoJSON layer whose data stays in the browser (addMapLayer keeps
        // `layerData` for drawn and filter layers); external OGC / SensorThings layers are not drawings.
        const saved = useMapStore().layersOnMap
            .filter((layer) => layer.sourceType === "geojson" && layer.layerData !== undefined
                && layer.externalSource === undefined && layer.showOnLayerList !== false)
            .map((layer) => ({ layerId: layer.id, title: layer.displayName ?? layer.id, geojson: layer.layerData }));
        const answer = {
            inProgress: { type: "FeatureCollection", features: inProgress },
            savedLayers: saved,
            note: "inProgress is what the user is drawing now (not saved). savedLayers are drawings, buffers and "
                + "polygon GeoJSON layers on the map; each can be the area of apply_geometry_filter if it holds polygons.",
        };
        if (JSON.stringify(answer).length > MAX_DRAWN_BYTES) throw new CommandError("The drawings are larger than 1 MB.");
        return answer;
    },

    // store/buffer.ts: temporaryBufferHandler + addToMapLayer (same turf call and layer settings)
    createBuffer: async (params) => {
        const mapStore = useMapStore();
        const layer = findLayer(text(params, "layerId"));
        const meters = params.meters;
        if (typeof meters !== "number" || !Number.isFinite(meters) || meters <= 0) throw new CommandError("\"meters\" must be a positive number.");
        const title = text(params, "title").trim();
        if (layer.layerData === undefined || layer.layerData.features.length === 0) {
            throw new CommandError(`Layer "${layer.id}" has no features in the browser to buffer (only GeoJSON layers, drawings and OGC layers do).`);
        }
        const area = buffer(flatten(layer.layerData), meters, { units: "meters" }) as FeatureCollection | undefined;
        if (area === undefined || area.features.length === 0) throw new CommandError(`The buffer of "${layer.id}" is empty.`);
        const identifier = `${layer.id}_buffer_${meters}_${title.toLowerCase().replaceAll(" ", "_")}`;
        if (mapStore.layersOnMap.some((item) => item.id === identifier) || readyMap().getSource(identifier) !== undefined) {
            throw new CommandError(`A layer named "${title}" with this buffer is already on the map. Choose another title.`);
        }
        const source: GeoJSONSourceParams = { identifier, sourceType: "geojson", isFilterLayer: true, geoJSONSrc: area };
        await mapStore.addMapDataSource(source);
        try {
            const layerParams: LayerParams = {
                sourceType: "geojson",
                identifier,
                layerType: "fill",
                sourceIdentifier: identifier,
                displayName: title,
                showOnLayerList: true,
                geoJSONSrc: area,
                isFilterLayer: true,
                isDrawnLayer: true,
            };
            await mapStore.addMapLayer(layerParams);
        } catch (error) {
            mapStore.deleteMapDataSource(identifier);
            throw error;
        }
        return { layer: describeLayer(findLayer(identifier)), note: "The buffer can be the area of apply_geometry_filter." };
    },

    // GeoStoryListItem.vue: the link to the story (route geostory-detail)
    openGeostory: async (params) => {
        const storyId = text(params, "storyId");
        let title: string;
        try {
            title = (await useGeostoryStore().getStoryDetail(storyId)).title;
        } catch {
            throw new CommandError(`There is no geostory "${storyId}" for this user. list_geostories lists them.`);
        }
        // Imported here: the router pulls in the app's views.
        const { default: router } = await import("../router");
        await router.push({ name: "geostory-detail", params: { storyId } });
        return { opened: storyId, title, note: "The story replaced the map; the user reads it in the sidebar." };
    },
};

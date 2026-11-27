/**
 * AI map commands for how layers look and what they show: style, colour, order, legend, and
 * what is at a point. Each calls the store functions or helpers the layer list and the map's
 * click popup use (named on each command); nothing in the stores or components changes.
 */
import {
    isMapStyleColorControlAvailable,
    normalizeEditableHexColor,
    resolveMapStyleEditingCapabilities,
} from "@helpers/mapStyleEditing";
import { createMapStyleLegendEntries, type MapStyleLegendEntry } from "@helpers/mapStyleLegend";
import { popupPropertyRows, withPopupAttributes } from "@helpers/popupAttributes";
import { simulationLegendRows } from "@helpers/simulationLegend";
import {
    deduplicatePopupAttributeFeatures,
    type GeoServerVectorTypeLayerDetail,
    type GeoserverRasterTypeLayerDetail,
    type PopupAttributeFeature,
    resolveLegendUrl,
    useGeoserverStore,
} from "@store/geoserver";
import { useMapStore } from "@store/map";
import { i18n } from "../core/i18n";
import { type CommandHandler, CommandError, describeLayer, finite, findLayer, readyMap, text } from "./commandHelpers";

/** Most features `identifyAt` answers with; a click popup shows about as many. */
const MAX_IDENTIFIED = 50;
/** Style layer kinds the click popup does not ask (`MapContainer.vue` `showAttributePopup`). */
const NOT_CLICKABLE = ["background", "heatmap", "hillshade", "raster"];
/** Paint properties of a layer's main colour and of its outline (`mapStyleEditing.ts`). */
const FILL_PROPERTIES = ["fill-color", "circle-color", "line-color", "fill-extrusion-color", "text-color", "icon-color"];
const OUTLINE_PROPERTIES = ["fill-outline-color", "circle-stroke-color", "text-halo-color", "icon-halo-color"];

function locale(): string {
    return String(i18n.global.locale.value);
}

function legendEntries(entries: MapStyleLegendEntry[]): Array<Record<string, unknown>> {
    return entries.map((entry) => ({
        label: entry.memberLabel === undefined ? entry.label : `${entry.memberLabel}: ${entry.label}`,
        kind: entry.kind,
        colors: entry.colors,
    }));
}

export const layerDisplayCommands: Record<string, CommandHandler> = {
    // MapLayerListingItem.vue: changeLayerStyle
    setLayerStyle: async (params) => {
        const layer = findLayer(text(params, "layerId"));
        const styleId = text(params, "styleId");
        const styles = layer.availableStyles ?? [];
        if (layer.logicalKind === "group" || styles.length < 2) {
            throw new CommandError(`Layer "${layer.id}" has no other style to switch to.`);
        }
        if (!styles.some((style) => style.id === styleId)) {
            throw new CommandError(`Layer "${layer.id}" has no style "${styleId}". get_map_state lists its styles.`);
        }
        await useMapStore().setStandaloneLayerStyle(layer.id, styleId);
        return { layer: describeLayer(findLayer(layer.id)) };
    },

    // MapLayerListingItem.vue: changeLayerColor (MapLibre) and setDeckColor (deck.gl GeoJSON)
    setLayerColor: (params) => {
        const mapStore = useMapStore();
        const layer = findLayer(text(params, "layerId"));
        const part = text(params, "part");
        if (part !== "fill" && part !== "outline") throw new CommandError("\"part\" must be fill or outline.");
        const color = normalizeEditableHexColor(params.color);
        if (color === undefined) throw new CommandError("\"color\" must be a hex colour like #2a9d8f or #2a9.");
        if (layer.renderer === "deckgl") {
            if (layer.type !== "deckgl-geojson") throw new CommandError(`The colours of "${layer.id}" cannot be changed.`);
            mapStore.setDeckGeoJsonStyle(layer.id, part === "fill" ? { fillColor: color } : { lineColor: color });
            return { layer: describeLayer(layer), color };
        }
        const capabilities = resolveMapStyleEditingCapabilities({
            logicalKind: layer.logicalKind,
            layerType: layer.type,
            paint: layer.paint,
            styleLayers: layer.mbStyleLayers,
        });
        if (capabilities.mode === "fixed") {
            throw new CommandError(capabilities.reason === "multi-pass" || capabilities.reason === "group"
                ? `The style of "${layer.id}" draws it in several parts; pick another style with set_layer_style instead.`
                : `The colours of "${layer.id}" cannot be changed.`);
        }
        const wanted = part === "fill" ? FILL_PROPERTIES : OUTLINE_PROPERTIES;
        const controls = capabilities.colors.filter((control) => wanted.includes(control.property)
            && isMapStyleColorControlAvailable(control.property, mapStore.terrainEnabled));
        if (controls.length === 0) throw new CommandError(`Layer "${layer.id}" has no ${part} colour to change.`);
        if (controls.every((control) => control.status !== "editable")) {
            throw new CommandError(`The ${part} colour of "${layer.id}" depends on its data (classes); `
                + "pick another style with set_layer_style instead.");
        }
        controls.filter((control) => control.status === "editable").forEach((control) => {
            mapStore.setStandaloneLayerPaintColor(layer.id, control.property, color);
        });
        return { layer: describeLayer(layer), color };
    },

    // MapLayerListing.vue: the drag and drop in the layer list (reorderVisibleMapLayer)
    moveLayer: (params) => {
        const mapStore = useMapStore();
        const layer = findLayer(text(params, "layerId"));
        const position = finite(params.position, "position");
        if (!Number.isInteger(position) || position < 0) throw new CommandError("\"position\" must be a whole number from 0.");
        const order = mapStore.getReorderableVisibleLayersTopToBottom();
        if (!order.some((item) => item.id === layer.id)) throw new CommandError(`Layer "${layer.id}" cannot be moved.`);
        mapStore.reorderVisibleMapLayer(layer.id, Math.min(position, order.length - 1));
        return { order: mapStore.getReorderableVisibleLayersTopToBottom().map((item) => item.id) };
    },

    // MapLayerListingItem.vue: the legend part of the layer panel
    getLayerLegend: async (params) => {
        const mapStore = useMapStore();
        const layer = findLayer(text(params, "layerId"));
        const simulationLegend = layer.simulationOutput?.legend;
        if (simulationLegend !== undefined && simulationLegend !== null) {
            return { layerId: layer.id, classes: simulationLegendRows(simulationLegend, locale()).map((row) => ({ label: row.label, color: row.color })) };
        }
        const manifest = layer.groupManifest;
        if (layer.logicalKind === "group" && manifest !== undefined) {
            if (manifest.legend?.url !== undefined) return { layerId: layer.id, image: manifest.legend.url };
            const entries = createMapStyleLegendEntries(manifest.layers, {
                members: manifest.members,
                styles: manifest.styles,
                sprites: manifest.sprites,
            });
            return { layerId: layer.id, entries: legendEntries(entries) };
        }
        if ((layer.mbStyleLayers?.length ?? 0) > 0) {
            return { layerId: layer.id, entries: legendEntries(createMapStyleLegendEntries(layer.mbStyleLayers ?? [], layer.mbStyleLegendContext)) };
        }
        if (layer.renderer === "deckgl") {
            const style = mapStore.deckGeoJsonStyles[layer.id];
            if (style === undefined) throw new CommandError(`Layer "${layer.id}" has no legend.`);
            return { layerId: layer.id, entries: [{ label: layer.displayName ?? layer.id, colors: [style.fillColor, style.lineColor] }] };
        }
        const details = layer.details;
        const layerName = (details as GeoserverRasterTypeLayerDetail | undefined)?.coverage?.name
            ?? (details as GeoServerVectorTypeLayerDetail | undefined)?.featureType?.name;
        if (layer.workspaceName === undefined || layerName === undefined || layerName === "") {
            const colors = Object.entries(layer.paint ?? {}).filter(([key, value]) => key.endsWith("-color") && typeof value === "string");
            if (colors.length === 0) throw new CommandError(`Layer "${layer.id}" has no legend.`);
            return { layerId: layer.id, entries: [{ label: layer.displayName ?? layer.id, colors: colors.map(([, value]) => value) }] };
        }
        const geoserver = useGeoserverStore();
        const image = await resolveLegendUrl(
            async (workspace) => await geoserver.fetchWmsCapabilities(workspace, false, details?.catalog?.provider.id),
            layer.workspaceName,
            layerName,
            details?.catalog?.provider.base_url,
        );
        return { layerId: layer.id, image };
    },

    // MapContainer.vue: showAttributePopup (vector and deck.gl features; raster values are not read)
    identifyAt: (params) => {
        const mapStore = useMapStore();
        const map = readyMap();
        const longitude = finite(params.longitude, "longitude");
        const latitude = finite(params.latitude, "latitude");
        const point = map.project([longitude, latitude]);
        const canvas = map.getCanvas();
        if (point.x < 0 || point.y < 0 || point.x > canvas.clientWidth || point.y > canvas.clientHeight) {
            throw new CommandError("The point is outside the current map view; move the map there first.");
        }
        const clickable = (map.getStyle().layers as Array<{ id: string, type: string }>)
            .filter((layer) => !NOT_CLICKABLE.includes(layer.type))
            .map((layer) => layer.id);
        const rendered = (map.queryRenderedFeatures(point, { layers: clickable }) as PopupAttributeFeature[])
            .filter((feature) => mapStore.layersOnMap.some((layer) => (
                mapStore.layerOwnsSource(layer, feature.source) && layer.attributePopupSuppressed !== true
            )));
        const features = [
            ...deduplicatePopupAttributeFeatures(rendered.map((feature) => withPopupAttributes(feature, mapStore.layersOnMap))),
            ...deduplicatePopupAttributeFeatures(mapStore.pickDeckObjects(point)),
        ];
        return {
            point: [longitude, latitude],
            total: features.length,
            features: features.slice(0, MAX_IDENTIFIED).map((feature) => ({
                layer: mapStore.displayNameForSource(feature.source) ?? feature.source,
                attributes: Object.fromEntries(popupPropertyRows(feature, locale()).map((row) => [row.label, row.value])),
            })),
            note: "Features drawn at this point in the current view. Values of raster (image) layers are not read.",
        };
    },
};

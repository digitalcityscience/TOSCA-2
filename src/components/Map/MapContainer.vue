<template>
  <div id="map">
  </div>
</template>

<script setup lang="ts">
import maplibre, { type MapMouseEvent, type Map } from "maplibre-gl"
import { h, nextTick, onMounted, ref, render } from "vue";
import { useI18n } from "vue-i18n";
import { useMapStore } from "@store/map";
import MapAttributeDialog from "./MapAttributeDialog.vue"
import { useDrawStore } from "@store/draw";
import { useParticipationStore } from "@store/participation";
import { BaseMapControl, type BaseMapControlOptions } from "@helpers/baseMapControl";
import { syncTerrainHillshadeVisibility } from "@helpers/mapTerrain";
import { useToast } from "@helpers/toast";
import {
    mapConfiguration,
    resolveMapConfiguration,
} from "../../config/mapConfig";
import {
    queryRasterFeatureInfo,
    deduplicatePopupAttributeFeatures,
    type GeoserverRasterTypeLayerDetail,
    type PopupAttributeFeature,
    type RasterFeatureInfoLayer,
} from "@store/geoserver";

const { t } = useI18n();
const toast = useToast();
const mapStore = useMapStore()
const clickedLayers = ref()
type PopupAnchor = "center" | "top" | "bottom" | "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
let attributePopup: maplibre.Popup | undefined
let featureInfoRequest: AbortController | undefined
onMounted(() => {
    const configuredLng = Number(import.meta.env.VITE_MAP_START_LNG)
    const configuredLat = Number(import.meta.env.VITE_MAP_START_LAT)
    const lng = Number.isNaN(configuredLng) ? 9.993163 : configuredLng
    const lat = Number.isNaN(configuredLat) ? 53.552123 : configuredLat
    const zoom = Number.isNaN(Number(import.meta.env.VITE_MAP_START_ZOOM)) ? 15 : Number(import.meta.env.VITE_MAP_START_ZOOM);
    const resolvedMapConfiguration = resolveMapConfiguration(mapConfiguration, import.meta.env, t);
    const terrain = {
        source: "terrain-dem",
        exaggeration: resolvedMapConfiguration.terrain.exaggeration,
    } as const
    mapStore.map = new maplibre.Map({
        container: "map",
        style: {
            version: 8,
            glyphs: "/fonts/{fontstack}/{range}.pbf",
            sources: {
                "terrain-dem": resolvedMapConfiguration.terrain.demSource,
                "terrain-hillshade": resolvedMapConfiguration.terrain.hillshadeSource,
            },
            layers: [
                {
                    id: "terrain-hillshade",
                    type: "raster",
                    source: "terrain-hillshade",
                    layout: {
                        visibility: "none",
                    },
                    paint: {
                        // Pre-rendered shading, not elevation data: at the default
                        // opacity of 1 this opaque raster is placed above basemap
                        // imagery (see BasemapManager.positionTerrainOverlay) and
                        // blots out all basemap colors underneath it. Partial
                        // opacity lets it shade the basemap instead of replacing it.
                        "raster-opacity": 0.35,
                    },
                },
            ],
        },
        center: [lng, lat], // starting position [lng, lat]
        zoom, // starting zoom
        maxPitch: 85,
    })
    if (mapStore.map !== undefined) {
        /**
         * Bump `paintVersion` on every style data change so Vue computeds that
         * read paint/layout properties (e.g. the layer color rail) re-evaluate
         * after `setPaintProperty` / `setLayoutProperty` / `addLayer` calls.
         */
        mapStore.map.on("styledata", () => {
            mapStore.paintVersion++;
        });
        mapStore.terrainEnabled = mapStore.map.getTerrain() !== null;
        mapStore.map.on("terrain", () => {
            mapStore.terrainEnabled = syncTerrainHillshadeVisibility(
                mapStore.map,
                "terrain-hillshade"
            );
        });
        /**
         * Initialize TerraDraw after the map is loaded. This is necessary to ensure that the map object is available.
         */
        try {
            const terraDraw = useDrawStore().initializeTerraDraw(mapStore.map as Map, ["point", "linestring", "polygon", "select"]);
            console.log(terraDraw);
            useDrawStore().terraDraw = terraDraw;
        } catch (error) {
            console.error("Failed to initialize TerraDraw:", error);
        }
        /**
         * Add a click event listener to the map to show the attribute dialog for the clicked feature.
         * Ignore the click event if the draw or edit mode is active. This is necessary to avoid conflicts with the draw and edit tools.
         * The attribute dialog is only shown if the clicked feature is part of a layer that is currently displayed on the map.
         * The attribute dialog is populated with the attributes of the clicked feature. Features are grouped by layer.
         */
        mapStore.map.on("click", (e: MapMouseEvent) => {
            if (!(useDrawStore().drawOnProgress || useDrawStore().editOnProgress || useParticipationStore().locationSelectionOnProgress)) {
                void showAttributePopup(e)
            }
        })
        // Interleaved deck.gl overlay for 3D layers (e.g. 3D Tiles buildings).
        // Created eagerly so it can depth-sort against MapLibre layers added
        // afterwards; it stays empty until a deck.gl layer is added.
        mapStore.initializeDeckOverlay()
    }
    // Add scale control to the map.
    const scaleControl = new maplibre.ScaleControl()
    mapStore.map.addControl(scaleControl, "bottom-right");

    // Add zoom controls to the map. `visualizePitch`/`visualizeRoll` expose a
    // pitch control since 3D layers are meaningless from a straight-down view.
    const zoomControl = new maplibre.NavigationControl({ visualizePitch: true })
    mapStore.map.addControl(zoomControl, "bottom-right");

    // Terrain and its paired hillshade start disabled. This control enables or
    // disables both without changing the selected basemap or data layers.
    mapStore.map.addControl(new maplibre.TerrainControl(terrain), "bottom-right");

    const options: BaseMapControlOptions = {
        terrainOverlayLayerId: "terrain-hillshade",
        onBasemapLoadError: (basemap) => {
            toast.add({
                severity: "error",
                summary: t("map.basemap.loadErrorTitle"),
                detail: t("map.basemap.loadErrorDetail", { name: basemap.title }),
                life: 5000,
            });
        },
        maps: resolvedMapConfiguration.basemaps,
        initialBasemap: resolvedMapConfiguration.initialBasemapId,
    }
    mapStore.map.addControl(new BaseMapControl(options), "bottom-left");
})

async function showAttributePopup(event: MapMouseEvent): Promise<void> {
    featureInfoRequest?.abort()
    featureInfoRequest = new AbortController()
    const signal = featureInfoRequest.signal
    attributePopup?.remove()
    attributePopup = undefined

    const interactiveLayers = mapStore.map.getStyle().layers
        .filter((layer: { type: string }) => !["background", "heatmap", "hillshade", "raster"].includes(layer.type))
        .map((layer: { id: string }) => layer.id)
    const renderedFeatures = mapStore.map.queryRenderedFeatures(event.point, {
        layers: interactiveLayers,
    }) as PopupAttributeFeature[]
    const matchedFeatures = renderedFeatures.filter((feature) =>
        mapStore.layersOnMap.some((layer) => mapStore.layerOwnsSource(layer, feature.source))
    )
    const vectorFeatures = deduplicatePopupAttributeFeatures(matchedFeatures)

    // deck.gl content (e.g. 3D Tiles buildings) isn't part of MapLibre's own
    // source/layer model, so it can't be seen by queryRenderedFeatures above —
    // it needs deck.gl's own picking API instead.
    const deckFeatures = deduplicatePopupAttributeFeatures(mapStore.pickDeckObjects(event.point))

    const rasterLayers = mapStore.layersOnMap
        .slice()
        .reverse()
        .flatMap((layer): RasterFeatureInfoLayer[] => {
            // deck.gl layers have no MapLibre layout property to read and are
            // never GeoServer raster sources — picked separately above.
            if (layer.renderer === "deckgl") return []
            if (mapStore.map.getLayoutProperty(layer.id, "visibility") === "none") return []
            if (layer.logicalKind === "group") {
                return layer.groupManifest?.members.flatMap((member) => {
                    if (member.details === undefined || !("coverage" in member.details)) return []
                    const source = layer.groupSourceIds?.[member.source_key ?? member.source_alias]
                    if (source === undefined) return []
                    return [{
                        source,
                        workspaceName: layer.groupManifest!.workspace.name,
                        details: member.details as GeoserverRasterTypeLayerDetail,
                    }]
                }) ?? []
            }
            if (
                layer.type !== "raster" ||
                layer.sourceType !== "geoserver" ||
                layer.workspaceName === undefined ||
                layer.details === undefined ||
                !("coverage" in layer.details)
            ) return []
            return [{
                source: layer.source,
                workspaceName: layer.workspaceName,
                details: layer.details as GeoserverRasterTypeLayerDetail,
                time: layer.time,
            }]
        })
    const rasterResults = await Promise.allSettled(rasterLayers.map(async (layer) =>
        await queryRasterFeatureInfo(layer, {
            lng: event.lngLat.lng,
            lat: event.lngLat.lat,
        }, signal)
    ))
    if (signal.aborted) return

    const rasterFeatures = rasterResults.flatMap((result) => {
        if (result.status === "fulfilled") return result.value
        console.warn("Raster GetFeatureInfo failed", result.reason)
        return []
    })
    const features = [...vectorFeatures, ...deckFeatures, ...rasterFeatures]
    if (features.length === 0) return

    clickedLayers.value = features
    const popupContainer = document.createElement("div")
    attributePopup = new maplibre.Popup({
        anchor: resolvePopupAnchor(event),
        className: "tosca-map-popup",
        maxWidth: "none",
        offset: 12,
    })
        .setLngLat(event.lngLat)
        .setDOMContent(popupContainer)
        .addTo(mapStore.map as Map)
    const popup = attributePopup
    popup.on("close", () => {
        render(null, popupContainer)
        if (attributePopup === popup) attributePopup = undefined
    })
    await nextTick()
    render(h(MapAttributeDialog, {
        features,
        onSizeChange: () => clampPopupToMapViewport(popup, mapStore.map as Map),
    }), popupContainer)
    await nextTick()
    clampPopupToMapViewport(popup, mapStore.map as Map)
}

function resolvePopupAnchor(event: MapMouseEvent): PopupAnchor {
    const canvas = event.target.getCanvas()
    const horizontal = event.point.x < canvas.clientWidth * 0.35
        ? "left"
        : event.point.x > canvas.clientWidth * 0.65
            ? "right"
            : ""
    const vertical = event.point.y < canvas.clientHeight * 0.35
        ? "top"
        : event.point.y > canvas.clientHeight * 0.65
            ? "bottom"
            : ""

    if (vertical !== "" && horizontal !== "") {
        return `${vertical}-${horizontal}` as PopupAnchor
    }

    return (horizontal || vertical || "bottom") as PopupAnchor
}

function clampPopupToMapViewport(popup: maplibre.Popup, map: Map): void {
    const popupElement = popup.getElement()
    const mapRect = map.getContainer().getBoundingClientRect()
    const margin = 12

    popupElement.style.transform = popupElement.dataset.toscaBaseTransform ?? popupElement.style.transform
    popupElement.dataset.toscaBaseTransform = popupElement.style.transform

    const popupRect = popupElement.getBoundingClientRect()
    const minLeft = mapRect.left + margin
    const maxRight = mapRect.right - margin
    const minTop = mapRect.top + margin
    const maxBottom = mapRect.bottom - margin
    const dx = popupRect.left < minLeft
        ? minLeft - popupRect.left
        : popupRect.right > maxRight
            ? maxRight - popupRect.right
            : 0
    const dy = popupRect.top < minTop
        ? minTop - popupRect.top
        : popupRect.bottom > maxBottom
            ? maxBottom - popupRect.bottom
            : 0

    if (dx !== 0 || dy !== 0) {
        popupElement.style.transform = `${popupElement.dataset.toscaBaseTransform} translate(${dx}px, ${dy}px)`
    }
}
</script>

<style scoped>
#map {
  width: 100%;
  height: 100%;
}
</style>

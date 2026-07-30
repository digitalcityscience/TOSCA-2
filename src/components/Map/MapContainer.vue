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

const { t } = useI18n();
const mapStore = useMapStore()
const clickedLayers = ref()
type PopupAnchor = "center" | "top" | "bottom" | "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
onMounted(() => {
    const configuredLng = Number(import.meta.env.VITE_MAP_START_LNG)
    const configuredLat = Number(import.meta.env.VITE_MAP_START_LAT)
    const lng = Number.isNaN(configuredLng) ? 9.993163 : configuredLng
    const lat = Number.isNaN(configuredLat) ? 53.552123 : configuredLat
    const zoom = Number.isNaN(Number(import.meta.env.VITE_MAP_START_ZOOM)) ? 15 : Number(import.meta.env.VITE_MAP_START_ZOOM);
    mapStore.map = new maplibre.Map({
        container: "map",
        style: {
            version: 8,
            glyphs: "/fonts/{fontstack}/{range}.pbf",
            sources: {},
            layers: []
        },
        center: [lng, lat], // starting position [lng, lat]
        zoom // starting zoom
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
        mapStore.map.on("click", (e: MapMouseEvent)=>{
            if (!(useDrawStore().drawOnProgress || useDrawStore().editOnProgress || useParticipationStore().locationSelectionOnProgress)) {
                const interactiveLayers = mapStore.map.getStyle().layers
                    .filter((layer: { type: string; }) => layer.type !== "heatmap")
                    .map((layer: { id: any; }) => layer.id);
                const clickedFeatures: any[] = mapStore.map.queryRenderedFeatures(e.point, { layers: interactiveLayers })
                if (clickedFeatures.length > 0) {
                    const matchedFeatures = clickedFeatures.filter((clickedLayer)=>{ return mapStore.layersOnMap.some((l)=>{ return l.source === clickedLayer.source }) })
                    if (matchedFeatures.length > 0){
                        const uniqueLayers = new Set();
                        const reducedFeatures: any[] = [];
                        for (const feature of matchedFeatures) {
                            if (!uniqueLayers.has(feature.sourceLayer)) {
                                uniqueLayers.add(feature.sourceLayer);
                                reducedFeatures.push(feature);
                            }
                        }
                        console.log("matched features", matchedFeatures)
                        console.log(e)
                        clickedLayers.value = reducedFeatures
                        console.log("clicked layers", clickedLayers.value)
                        const popupContainer = document.createElement("div")
                        const popup = new maplibre.Popup({
                            anchor: resolvePopupAnchor(e),
                            className: "tosca-map-popup",
                            maxWidth: "none",
                            offset: 12,
                        })
                            .setLngLat(e.lngLat)
                            .setDOMContent(popupContainer)
                            .addTo(mapStore.map as Map)
                        nextTick(() => {
                            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                            const popupComp = h(MapAttributeDialog, {
                                features: [...reducedFeatures],
                                onSizeChange: () => {
                                    clampPopupToMapViewport(popup, mapStore.map as Map)
                                },
                            });
                            render(popupComp, popupContainer);
                            void nextTick(() => {
                                clampPopupToMapViewport(popup, mapStore.map as Map)
                            })
                        }).then(()=>{}, ()=>{})
                    }
                }
            }
        })
    }
    // Add scale control to the map.
    const scaleControl = new maplibre.ScaleControl()
    mapStore.map.addControl(scaleControl, "bottom-right");

    // Add zoom controls to the map.
    const zoomControl = new maplibre.NavigationControl()
    mapStore.map.addControl(zoomControl, "bottom-right");

    const options: BaseMapControlOptions = {
        maps:[
            {
                id:"streets-v2",
                title: t("map.basemap.streets"),
                tiles: [
                    `https://api.maptiler.com/maps/${import.meta.env.VITE_MAPTILER_API_MAP_ID}/{z}/{x}/{y}.png?key=${import.meta.env.VITE_MAPTILER_API_KEY}`
                ]
            },
            {
                id:"satellite",
                title: t("map.basemap.satellite"),
                tiles: [
                    `https://api.maptiler.com/maps/satellite/{z}/{x}/{y}.jpg?key=${import.meta.env.VITE_MAPTILER_API_KEY}`
                ]
            }
        ],
        initialBasemap: "streets-v2"
    }
    mapStore.map.addControl(new BaseMapControl(options), "bottom-left");
})

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

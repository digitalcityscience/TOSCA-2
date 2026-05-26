<template>
    <span class="hidden" aria-hidden="true"></span>
</template>

<script setup lang="ts">
import maplibre, { type GeoJSONSource, type MapLayerMouseEvent, type Popup } from "maplibre-gl";
import { h, nextTick, onBeforeUnmount, onMounted, render, watch } from "vue";
import { useToast } from "primevue/usetoast";
import { useEventsStore, type EventMapProperties, getEventFeatureId } from "@store/events";
import { useMapStore } from "@store/map";
import EventMapPopup from "./EventMapPopup.vue";

const EVENT_SOURCE_ID = "events-route-source";
const EVENT_LAYER_ID = "events-route-pins";
const EVENT_HALO_LAYER_ID = "events-route-pin-halos";

const events = useEventsStore();
const mapStore = useMapStore();
const toast = useToast();
let popup: Popup | undefined;

onMounted(() => {
    setupOverlay().catch((error) => {
        toast.add({ severity: "error", summary: "Error", detail: error, life: 3000 });
    });
});

onBeforeUnmount(() => {
    popup?.remove();
    if (mapStore.map !== undefined) {
        mapStore.map.off("moveend", refreshFromViewport);
        mapStore.map.off("click", EVENT_LAYER_ID, handlePinClick);
        mapStore.map.off("mouseenter", EVENT_LAYER_ID, setPointerCursor);
        mapStore.map.off("mouseleave", EVENT_LAYER_ID, clearPointerCursor);
        removeOverlay();
    }
});

watch(
    () => events.spatialEvents,
    () => {
        updateSourceData();
    },
    { deep: true }
);

watch(
    () => events.filters,
    () => {
        refreshFromViewport();
    },
    { deep: true }
);

async function setupOverlay(): Promise<void> {
    await waitForMapStyle();
    installOverlay();
    refreshFromViewport();
    mapStore.map.on("moveend", refreshFromViewport);
    mapStore.map.on("click", EVENT_LAYER_ID, handlePinClick);
    mapStore.map.on("mouseenter", EVENT_LAYER_ID, setPointerCursor);
    mapStore.map.on("mouseleave", EVENT_LAYER_ID, clearPointerCursor);
}

async function waitForMapStyle(): Promise<void> {
    if (mapStore.map.loaded() || mapStore.map.isStyleLoaded()) {
        return;
    }

    await new Promise<void>((resolve) => {
        mapStore.map.once("load", () => {
            resolve();
        });
    });
}

function installOverlay(): void {
    if (mapStore.map.getSource(EVENT_SOURCE_ID) === undefined) {
        mapStore.map.addSource(EVENT_SOURCE_ID, {
            type: "geojson",
            data: events.spatialEvents,
        });
    }

    if (mapStore.map.getLayer(EVENT_HALO_LAYER_ID) === undefined) {
        mapStore.map.addLayer({
            id: EVENT_HALO_LAYER_ID,
            type: "circle",
            source: EVENT_SOURCE_ID,
            paint: {
                "circle-color": "#ffffff",
                "circle-radius": 12,
                "circle-opacity": 0.92,
                "circle-stroke-color": "#127369",
                "circle-stroke-width": 2,
            },
        });
    }

    if (mapStore.map.getLayer(EVENT_LAYER_ID) === undefined) {
        mapStore.map.addLayer({
            id: EVENT_LAYER_ID,
            type: "circle",
            source: EVENT_SOURCE_ID,
            paint: {
                "circle-color": [
                    "match",
                    ["get", "location_mode"],
                    "hybrid", "#f59e0b",
                    "physical", "#127369",
                    "#2563eb",
                ],
                "circle-radius": 6,
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": 1.5,
            },
        });
    }
}

function removeOverlay(): void {
    if (mapStore.map.getLayer(EVENT_LAYER_ID) !== undefined) {
        mapStore.map.removeLayer(EVENT_LAYER_ID);
    }
    if (mapStore.map.getLayer(EVENT_HALO_LAYER_ID) !== undefined) {
        mapStore.map.removeLayer(EVENT_HALO_LAYER_ID);
    }
    if (mapStore.map.getSource(EVENT_SOURCE_ID) !== undefined) {
        mapStore.map.removeSource(EVENT_SOURCE_ID);
    }
}

function updateSourceData(): void {
    const source = mapStore.map.getSource(EVENT_SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(events.spatialEvents);
}

function refreshFromViewport(): void {
    const bounds = mapStore.map.getBounds();
    events.loadEventMap([
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
    ]).catch((error) => {
        toast.add({ severity: "error", summary: "Error", detail: error, life: 3000 });
    });
}

function handlePinClick(event: MapLayerMouseEvent): void {
    const feature = event.features?.[0];
    if (feature === undefined) {
        return;
    }
    const properties = feature.properties as EventMapProperties | undefined;
    const eventId = getEventFeatureId(feature.id, properties);
    if (properties === undefined || eventId === "") {
        return;
    }
    const popupEvent: EventMapProperties = {
        ...properties,
        id: eventId,
    };
    popup?.remove();
    popup = new maplibre.Popup({ maxWidth: "none" })
        .setLngLat(event.lngLat)
        .setHTML("<div id=\"event-map-popup-content\"></div>")
        .addTo(mapStore.map);

    nextTick(() => {
        const container = document.getElementById("event-map-popup-content");
        if (container === null) {
            return;
        }
        render(h(EventMapPopup, { event: popupEvent }), container);
    }).catch(() => {});
}

function setPointerCursor(): void {
    mapStore.map.getCanvas().style.cursor = "pointer";
}

function clearPointerCursor(): void {
    mapStore.map.getCanvas().style.cursor = "";
}
</script>

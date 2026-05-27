<template>
    <span class="hidden" aria-hidden="true"></span>
</template>

<script setup lang="ts">
import maplibre, { type GeoJSONSource, type MapMouseEvent, type Popup } from "maplibre-gl";
import { h, onBeforeUnmount, onMounted, render, watch } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "primevue/usetoast";
import { useEventsStore, type EventMapProperties, getEventFeatureId } from "@store/events";
import { useMapStore } from "@store/map";
import EventMapPopup from "./EventMapPopup.vue";

const EVENT_SOURCE_ID = "events-route-source";
const EVENT_LAYER_ID = "events-route-pins";
const EVENT_HALO_LAYER_ID = "events-route-pin-halos";
const EVENT_INTERACTIVE_LAYER_IDS = [EVENT_LAYER_ID, EVENT_HALO_LAYER_ID];

const events = useEventsStore();
const mapStore = useMapStore();
const router = useRouter();
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
        mapStore.map.off("click", handleMapClick);
        EVENT_INTERACTIVE_LAYER_IDS.forEach((layerId) => {
            mapStore.map.off("mouseenter", layerId, setPointerCursor);
            mapStore.map.off("mouseleave", layerId, clearPointerCursor);
        });
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
    mapStore.map.on("click", handleMapClick);
    EVENT_INTERACTIVE_LAYER_IDS.forEach((layerId) => {
        mapStore.map.on("mouseenter", layerId, setPointerCursor);
        mapStore.map.on("mouseleave", layerId, clearPointerCursor);
    });
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
            data: normalizedSpatialEvents(),
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
    source?.setData(normalizedSpatialEvents());
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

function handleMapClick(event: MapMouseEvent): void {
    const existingLayers = EVENT_INTERACTIVE_LAYER_IDS.filter((layerId) => {
        return mapStore.map.getLayer(layerId) !== undefined;
    });
    if (existingLayers.length === 0) {
        return;
    }
    const features = mapStore.map.queryRenderedFeatures(event.point, {
        layers: existingLayers,
    });
    const feature = features[0];
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
    const popupContainer = document.createElement("div");
    render(h(EventMapPopup, {
        event: popupEvent,
        onOpenDetails: () => {
            popup?.remove();
            router.push({ name: "event-detail", params: { eventId: popupEvent.id } }).catch(() => {});
        },
    }), popupContainer);
    popup = new maplibre.Popup({ maxWidth: "none", closeButton: false })
        .setLngLat(event.lngLat)
        .setDOMContent(popupContainer)
        .addTo(mapStore.map);
    popup.on("close", () => {
        render(null, popupContainer);
    });
}

function normalizedSpatialEvents(): GeoJSON.FeatureCollection {
    return {
        ...events.spatialEvents,
        features: events.spatialEvents.features.map((feature) => {
            const id = getEventFeatureId(feature.id, feature.properties ?? undefined);
            return {
                ...feature,
                properties: {
                    ...(feature.properties ?? {}),
                    id,
                },
            };
        }),
    };
}

function setPointerCursor(): void {
    mapStore.map.getCanvas().style.cursor = "pointer";
}

function clearPointerCursor(): void {
    mapStore.map.getCanvas().style.cursor = "";
}
</script>

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
import EventClusterPopup from "./EventClusterPopup.vue";
import EventMapPopup from "./EventMapPopup.vue";

const EVENT_SOURCE_ID = "events-route-source";
const EVENT_LAYER_ID = "events-route-pins";
const EVENT_CLUSTER_COUNT_LAYER_ID = "events-route-cluster-count";
const EVENT_INTERACTIVE_LAYER_IDS = [
    EVENT_CLUSTER_COUNT_LAYER_ID,
    EVENT_LAYER_ID,
];

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
    removeOverlay();
    mapStore.map.addSource(EVENT_SOURCE_ID, {
        type: "geojson",
        data: normalizedSpatialEvents(),
        cluster: true,
        clusterMaxZoom: 16,
        clusterRadius: 100,
    });

    if (mapStore.map.getLayer(EVENT_LAYER_ID) === undefined) {
        mapStore.map.addLayer({
            id: EVENT_LAYER_ID,
            type: "circle",
            source: EVENT_SOURCE_ID,
            paint: {
                "circle-color": [
                    "case",
                    ["has", "point_count"],
                    [
                        "step",
                        ["get", "point_count"],
                        "#127369",
                        10,
                        "#f59e0b",
                        25,
                        "#4338ca",
                    ],
                    [
                        "match",
                        ["get", "location_mode"],
                        "hybrid", "#f59e0b",
                        "physical", "#127369",
                        "#2563eb",
                    ],
                ],
                "circle-radius": [
                    "case",
                    ["has", "point_count"],
                    [
                        "step",
                        ["get", "point_count"],
                        18,
                        10, 22,
                        25, 28,
                    ],
                    8,
                ],
                "circle-opacity": 0.92,
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": 2,
            },
        });
    }

    if (mapStore.map.getLayer(EVENT_CLUSTER_COUNT_LAYER_ID) === undefined) {
        mapStore.map.addLayer({
            id: EVENT_CLUSTER_COUNT_LAYER_ID,
            type: "symbol",
            source: EVENT_SOURCE_ID,
            filter: ["has", "point_count"],
            layout: {
                "text-field": "{point_count_abbreviated}",
                "text-font": ["Open Sans Regular"],
                "text-size": 13,
            },
            paint: {
                "text-color": "#ffffff",
            },
        });
    }
}

function removeOverlay(): void {
    if (mapStore.map.getLayer(EVENT_LAYER_ID) !== undefined) {
        mapStore.map.removeLayer(EVENT_LAYER_ID);
    }
    if (mapStore.map.getLayer(EVENT_CLUSTER_COUNT_LAYER_ID) !== undefined) {
        mapStore.map.removeLayer(EVENT_CLUSTER_COUNT_LAYER_ID);
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
    if (isClusterFeature(feature)) {
        showClusterPopup(feature, event).catch((error) => {
            toast.add({ severity: "error", summary: "Error", detail: error, life: 3000 });
        });
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

async function showClusterPopup(feature: maplibre.MapGeoJSONFeature, event: MapMouseEvent): Promise<void> {
    const source = mapStore.map.getSource(EVENT_SOURCE_ID) as GeoJSONSource | undefined;
    const clusterId = Number(feature.properties?.cluster_id);
    const pointCount = Number(feature.properties?.point_count);
    if (source === undefined || !Number.isFinite(clusterId) || !Number.isFinite(pointCount)) {
        return;
    }

    const leaves = await source.getClusterLeaves(clusterId, pointCount, 0);
    const clusterEvents = leaves
        .map((leaf) => {
            const properties = leaf.properties as EventMapProperties | undefined;
            const eventId = getEventFeatureId(leaf.id, properties);
            if (properties === undefined || eventId === "") {
                return undefined;
            }
            return {
                ...properties,
                id: eventId,
            };
        })
        .filter((item): item is EventMapProperties => item !== undefined);

    if (clusterEvents.length === 0) {
        return;
    }

    popup?.remove();
    const popupContainer = document.createElement("div");
    render(h(EventClusterPopup, {
        events: clusterEvents,
        onOpenDetails: (eventId: string) => {
            popup?.remove();
            router.push({ name: "event-detail", params: { eventId } }).catch(() => {});
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

function isClusterFeature(feature: maplibre.MapGeoJSONFeature): boolean {
    return feature.properties?.cluster === true || feature.properties?.cluster === 1;
}

function normalizedSpatialEvents(): GeoJSON.FeatureCollection {
    return {
        ...events.spatialEvents,
        features: events.spatialEvents.features.map(normalizeSingleFeature),
    };
}

function normalizeSingleFeature(feature: GeoJSON.Feature): GeoJSON.Feature {
    const id = getEventFeatureId(feature.id, feature.properties ?? undefined);
    return {
        ...feature,
        properties: {
            ...normalizeFeatureProperties(feature.properties ?? {}),
            cluster: false,
            id,
        },
    };
}

function normalizeFeatureProperties(properties: Record<string, unknown>): Record<string, string | number | boolean | null> {
    return Object.fromEntries(
        Object.entries(properties).map(([key, value]) => {
            if (
                value === null ||
                typeof value === "string" ||
                typeof value === "number" ||
                typeof value === "boolean"
            ) {
                return [key, value];
            }
            if (value === undefined) {
                return [key, null];
            }
            return [key, JSON.stringify(value)];
        })
    );
}

function setPointerCursor(): void {
    mapStore.map.getCanvas().style.cursor = "pointer";
}

function clearPointerCursor(): void {
    mapStore.map.getCanvas().style.cursor = "";
}
</script>

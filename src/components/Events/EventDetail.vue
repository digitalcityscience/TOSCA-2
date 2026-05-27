<template>
    <div class="event-detail">
        <div v-if="events.loadingDetail" class="flex justify-center py-8">
            <ProgressSpinner />
        </div>

        <Message v-if="errorMessage !== ''" severity="error" class="mb-3">
            {{ errorMessage }}
        </Message>

        <div v-if="event" class="grid gap-4">
            <EventCoreView :event="event" />
            <Card v-if="event.profile_key === 'public_health' && event.profile !== null">
                <template #content>
                    <PublicHealthEventProfileView :profile="event.profile" />
                </template>
            </Card>
            <Card v-if="event.series !== null">
                <template #content>
                    <EventSeriesExtensionView :series="event.series" />
                </template>
            </Card>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Card from "primevue/card";
import Message from "primevue/message";
import ProgressSpinner from "primevue/progressspinner";
import { useToast } from "primevue/usetoast";
import { type EventDetail, useEventsStore } from "@store/events";
import { useGeoserverStore } from "@store/geoserver";
import { useMapStore } from "@store/map";
import { loadEventLayersOnMap } from "@helpers/eventLayers";
import EventCoreView from "./EventCoreView.vue";
import PublicHealthEventProfileView from "./PublicHealthEventProfileView.vue";
import EventSeriesExtensionView from "./EventSeriesExtensionView.vue";

const props = defineProps<{
    eventId: string
}>();

const events = useEventsStore();
const geoserver = useGeoserverStore();
const mapStore = useMapStore();
const toast = useToast();
const errorMessage = ref("");

const event = computed<EventDetail | undefined>(() => {
    return events.selectedEvent;
});

watch(
    () => props.eventId,
    (eventId) => {
        loadEvent(eventId).catch((error) => {
            errorMessage.value = String(error);
        });
    },
    { immediate: true }
);

async function loadEvent(eventId: string): Promise<void> {
    errorMessage.value = "";
    const detail = await events.getEventDetail(eventId);
    await loadEventLayersOnMap(detail, geoserver, mapStore, {
        onLayerError: (error, layer) => {
            toast.add({
                severity: "error",
                summary: "Layer Error",
                detail: `Could not load ${layer.layer.workspace.name}:${layer.layer.name}. ${String(error)}`,
                life: 5000,
            });
        },
    });
    await focusEventLocation(detail);
}

async function focusEventLocation(detail: EventDetail): Promise<void> {
    if (
        mapStore.map === undefined ||
        !["physical", "hybrid"].includes(detail.location_mode) ||
        detail.location === null
    ) {
        return;
    }

    const coordinates = parsePointLocation(detail.location);
    if (coordinates === undefined) {
        return;
    }

    await events.loadEventMap(createLocationBbox(coordinates)).catch((error) => {
        toast.add({
            severity: "error",
            summary: "Error",
            detail: error,
            life: 3000,
        });
    });

    mapStore.map.flyTo({
        center: coordinates,
        zoom: Math.max(mapStore.map.getZoom(), 14),
        essential: true,
    });
}

function parsePointLocation(value: string): [number, number] | undefined {
    const match = value.match(/POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/i);
    if (match === null) {
        return undefined;
    }

    const longitude = Number(match[1]);
    const latitude = Number(match[2]);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
        return undefined;
    }
    return [longitude, latitude];
}

function createLocationBbox([longitude, latitude]: [number, number]): [number, number, number, number] {
    const padding = 0.02;
    return [
        longitude - padding,
        latitude - padding,
        longitude + padding,
        latitude + padding,
    ];
}
</script>

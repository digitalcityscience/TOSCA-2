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
}
</script>

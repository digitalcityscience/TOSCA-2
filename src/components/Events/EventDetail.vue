<template>
    <div class="grid gap-4">
        <div v-if="events.loadingDetail && event === undefined" class="grid gap-3">
            <USkeleton class="h-56 w-full rounded-lg" />
            <USkeleton class="h-36 w-full rounded-lg" />
        </div>

        <UAlert
            v-if="errorMessage !== ''"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            title="This event couldn't be opened"
            :description="errorMessage"
        >
            <template #actions>
                <UButton
                    label="Try again"
                    icon="i-lucide-refresh-cw"
                    color="error"
                    variant="soft"
                    size="sm"
                    :loading="events.loadingDetail"
                    @click="retryLoad"
                />
            </template>
        </UAlert>

        <template v-if="event !== undefined">
            <EventCoreView :event="event" />
            <UCard
                v-if="event.profile_key === 'public_health' && event.profile !== null"
                :ui="{ body: 'p-4 sm:p-5' }"
            >
                <PublicHealthEventProfileView :profile="event.profile" />
            </UCard>
            <UCard v-if="event.series !== null" :ui="{ body: 'p-4 sm:p-5' }">
                <EventSeriesExtensionView :series="event.series" />
            </UCard>
        </template>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { type EventDetail, useEventsStore } from "@store/events";
import { useGeoserverStore } from "@store/geoserver";
import { useMapStore } from "@store/map";
import { loadEventLayersOnMap } from "@helpers/eventLayers";
import { useToast } from "@helpers/toast";
import {
    reportDeveloperError,
    serviceUnavailableMessage,
} from "@helpers/userFacingError";
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
    return events.selectedEvent?.id === props.eventId ? events.selectedEvent : undefined;
});

watch(
    () => props.eventId,
    (eventId) => {
        loadEvent(eventId).catch(handleLoadError);
    },
    { immediate: true }
);

async function loadEvent(eventId: string): Promise<void> {
    errorMessage.value = "";
    const detail = await events.getEventDetail(eventId);
    await loadEventLayersOnMap(detail, geoserver, mapStore, {
        onLayerError: (error, layer) => {
            const layerName = `${layer.layer.workspace.name}:${layer.layer.name}`;
            reportDeveloperError(`Loading event map layer ${layerName}`, error);
            toast.add({
                severity: "warning",
                summary: "Some map content is unavailable",
                detail: "The event opened, but one of its map layers could not be shown.",
                life: 5000,
            });
        },
    });
    await focusEventLocation(detail);
}

async function focusEventLocation(detail: EventDetail): Promise<void> {
    if (
        mapStore.map === undefined ||
        !["physical", "hybrid"].includes(detail.location_mode)
    ) {
        return;
    }

    const coordinates = parsePointLocation(detail.location);
    if (coordinates === undefined) {
        return;
    }

    await events.loadEventMap(createLocationBbox(coordinates)).catch(() => {
        toast.add({
            severity: "warning",
            summary: "Location unavailable",
            detail: "The event opened, but its location could not be shown on the map.",
            life: 4000,
        });
    });

    mapStore.map.flyTo({
        center: coordinates,
        zoom: Math.max(mapStore.map.getZoom(), 14),
        essential: true,
    });
}

function retryLoad(): void {
    loadEvent(props.eventId).catch(handleLoadError);
}

function handleLoadError(error: unknown): void {
    errorMessage.value = serviceUnavailableMessage("event");
    reportDeveloperError(`Opening event ${props.eventId}`, error);
}

function parsePointLocation(value: unknown): [number, number] | undefined {
    if (isGeoJsonPoint(value)) {
        return value.coordinates;
    }
    if (typeof value !== "string") {
        return undefined;
    }
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

function isGeoJsonPoint(value: unknown): value is { type: "Point", coordinates: [number, number] } {
    if (typeof value !== "object" || value === null || !("type" in value) || !("coordinates" in value)) {
        return false;
    }
    const candidate = value as { type: unknown, coordinates: unknown };
    return (
        candidate.type === "Point" &&
        Array.isArray(candidate.coordinates) &&
        candidate.coordinates.length >= 2 &&
        typeof candidate.coordinates[0] === "number" &&
        typeof candidate.coordinates[1] === "number"
    );
}

function createLocationBbox(
    [longitude, latitude]: [number, number]
): [number, number, number, number] {
    const padding = 0.02;
    return [
        longitude - padding,
        latitude - padding,
        longitude + padding,
        latitude + padding,
    ];
}
</script>

<template>
    <BaseSlideoverSidebarComponent
        :id="sidebarID"
        side="left"
        :collapsed="route.meta.sidebar !== sidebarID"
        width-class="w-[min(38.75rem,calc(100vw-5rem))]"
    >
        <EventMapOverlay />

        <template #header>
            <div class="flex min-w-0 items-center gap-2">
                <UIcon name="i-lucide-calendar-days" class="size-4 shrink-0 text-primary" />
                <span class="truncate">Calendar and citizen information</span>
            </div>
        </template>

        <div v-if="route.name === 'event-detail'" class="mb-3">
            <UButton
                icon="i-lucide-arrow-left"
                label="Back to events"
                size="sm"
                color="neutral"
                variant="outline"
                :loading="returningToList"
                @click="goBackToEvents"
            />
        </div>

        <RouterView />
    </BaseSlideoverSidebarComponent>
</template>

<script setup lang="ts">
import bbox from "@turf/bbox";
import { ref } from "vue";
import { RouterView, useRoute, useRouter } from "vue-router";
import BaseSlideoverSidebarComponent from "@components/Base/BaseSlideoverSidebarComponent.vue";
import { useEventsStore } from "@store/events";
import { useMapStore } from "@store/map";
import { useToast } from "@helpers/toast";
import { reportDeveloperError } from "@helpers/userFacingError";
import EventMapOverlay from "./EventMapOverlay.vue";

const sidebarID = "events";
const events = useEventsStore();
const mapStore = useMapStore();
const route = useRoute();
const router = useRouter();
const toast = useToast();
const returningToList = ref(false);

async function goBackToEvents(): Promise<void> {
    returningToList.value = true;
    try {
        await mapStore.resetMapData(false);
        await router.push({ name: "event-list" });
        await events.loadEventMap();
        fitMapToEvents();
    } catch (error) {
        reportDeveloperError("Returning to the event list", error);
        toast.add({
            severity: "error",
            summary: "Couldn't return to the event list",
            detail: "Please try again.",
            life: 4000,
        });
    } finally {
        returningToList.value = false;
    }
}

function fitMapToEvents(): void {
    if (mapStore.map === undefined) {
        return;
    }

    if (events.spatialEvents.features.length === 0) {
        resetMapCamera();
        return;
    }

    const bounds = bbox(events.spatialEvents);
    if (!bounds.every(Number.isFinite)) {
        resetMapCamera();
        return;
    }

    const [minLng, minLat, maxLng, maxLat] = bounds;
    if (minLng === maxLng && minLat === maxLat) {
        mapStore.map.flyTo({
            center: [minLng, minLat],
            zoom: 14,
            essential: true,
        });
        return;
    }

    mapStore.map.fitBounds(bounds, {
        padding: 80,
        maxZoom: 14,
    });
}

function resetMapCamera(): void {
    if (mapStore.map === undefined) {
        return;
    }

    mapStore.map.flyTo({
        center: [mapStartLng(), mapStartLat()],
        zoom: mapStartZoom(),
        essential: true,
    });
}

function mapStartLng(): number {
    return mapStartNumber(import.meta.env.VITE_MAP_START_LNG, 9.993163);
}

function mapStartLat(): number {
    return mapStartNumber(import.meta.env.VITE_MAP_START_LAT, 53.552123);
}

function mapStartZoom(): number {
    return mapStartNumber(import.meta.env.VITE_MAP_START_ZOOM, 15);
}

function mapStartNumber(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}
</script>

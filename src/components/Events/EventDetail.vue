<template>
    <div class="grid gap-4">
        <div v-if="events.loadingDetail && event === undefined" class="grid gap-3">
            <USkeleton class="h-56 w-full rounded-lg" />
            <USkeleton class="h-36 w-full rounded-lg" />
        </div>

        <NotFoundOrPrivate v-if="notFound" @retry="retryLoad" />
        <UAlert
            v-else-if="errorMessage !== ''"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="t('events.detail.openErrorTitle')"
            :description="errorMessage"
        >
            <template #actions>
                <UButton
                    :label="t('events.tryAgain')"
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
import { useCloseWhenPrivateAfterLogout } from "../../auth/privateContent";
import { buildEventDetailUrl } from "@store/events";
import NotFoundOrPrivate from "@components/Base/NotFoundOrPrivate.vue";
import { isNotFoundError } from "@store/backend";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
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
import { parseEventPointLocation } from "./eventLocation";

const props = defineProps<{
    eventId: string
}>();

const events = useEventsStore();
const { t } = useI18n();
const geoserver = useGeoserverStore();
const mapStore = useMapStore();
const toast = useToast();
const errorMessage = ref("");
const notFound = ref(false);
// Logging out while a private event is open: close it and go back to the list.
useCloseWhenPrivateAfterLogout(() => buildEventDetailUrl(props.eventId), { name: "event-list" });

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
    notFound.value = false;
    const detail = await events.getEventDetail(eventId);
    await loadEventLayersOnMap(detail, geoserver, mapStore, {
        onLayerError: (error, layer) => {
            const layerName = `${layer.layer.workspace.name}:${layer.layer.name}`;
            reportDeveloperError(`Loading event map layer ${layerName}`, error);
            toast.add({
                severity: "warning",
                summary: t("events.detail.layerErrorTitle"),
                detail: t("events.detail.layerErrorDetail"),
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

    const coordinates = parseEventPointLocation(detail.location);
    if (coordinates === undefined) {
        return;
    }

    mapStore.map.flyTo({
        center: coordinates,
        zoom: Math.max(mapStore.map.getZoom(), 14),
        offset: [eventSidebarMapOffset(), 0],
        essential: true,
    });
}

function eventSidebarMapOffset(): number {
    if (typeof document === "undefined") {
        return 0;
    }
    const sidebarWidth = document.getElementById("events")?.getBoundingClientRect().width ?? 0;
    return sidebarWidth / 2;
}

function retryLoad(): void {
    loadEvent(props.eventId).catch(handleLoadError);
}

function handleLoadError(error: unknown): void {
    if (isNotFoundError(error)) {
        notFound.value = true;
        return;
    }
    errorMessage.value = serviceUnavailableMessage("event");
    reportDeveloperError(`Opening event ${props.eventId}`, error);
}

</script>

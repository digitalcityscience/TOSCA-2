<template>
    <div class="event-list">
        <EventMapOverlay />

        <div v-if="events.loadingList && events.events.length === 0" class="flex justify-center py-8">
            <ProgressSpinner />
        </div>

        <Message v-if="events.error" severity="error" class="mb-3">
            {{ events.error }}
        </Message>

        <Message
            v-if="!events.loadingList && events.events.length === 0 && !events.error"
            severity="info"
        >
            No events are available.
        </Message>

        <div class="grid gap-3">
            <EventListItem
                v-for="event in events.events"
                :key="event.id"
                :event="event"
            />
        </div>

        <section v-if="events.onlineEvents.length > 0" class="mt-4">
            <h3 class="text-base font-semibold text-surface-900 mb-2">Online and flexible events</h3>
            <div class="grid gap-2">
                <RouterLink
                    v-for="event in events.onlineEvents"
                    :key="event.id"
                    class="block rounded-md border border-surface-200 bg-surface-0 p-3 hover:border-primary-400"
                    :to="{ name: 'event-detail', params: { eventId: event.id } }"
                >
                    <div class="font-semibold text-surface-900">{{ event.title }}</div>
                    <div class="text-sm text-surface-600">{{ formatDate(event.start_datetime) }}</div>
                </RouterLink>
            </div>
        </section>

        <div v-if="events.next !== null" class="flex justify-center py-4">
            <Button
                icon="pi pi-plus"
                label="Load more"
                severity="secondary"
                :loading="events.loadingList"
                @click="loadMore"
            />
        </div>
    </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { RouterLink } from "vue-router";
import Button from "primevue/button";
import Message from "primevue/message";
import ProgressSpinner from "primevue/progressspinner";
import { useToast } from "primevue/usetoast";
import { useEventsStore } from "@store/events";
import EventListItem from "./EventListItem.vue";
import EventMapOverlay from "./EventMapOverlay.vue";

const events = useEventsStore();
const toast = useToast();

onMounted(() => {
    if (events.events.length === 0) {
        events.loadEvents().catch(showError);
    }
});

function loadMore(): void {
    events.loadMoreEvents().catch(showError);
}

function showError(error: unknown): void {
    toast.add({ severity: "error", summary: "Error", detail: error, life: 3000 });
}

function formatDate(value: string): string {
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(value));
}
</script>

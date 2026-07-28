<template>
    <div class="grid gap-4">
        <EventFilters />

        <div class="flex items-center justify-between gap-3">
            <UTabs
                v-model="activeView"
                :items="viewItems"
                :content="false"
                color="neutral"
                variant="pill"
                size="sm"
            />
            <span v-if="events.events.length > 0" class="text-xs text-muted">
                {{ events.events.length }} {{ events.events.length === 1 ? "event" : "events" }}
            </span>
        </div>

        <div v-if="events.loadingList && events.events.length === 0" class="grid gap-3">
            <USkeleton v-for="index in 3" :key="index" class="h-40 w-full rounded-lg" />
        </div>

        <UAlert
            v-if="events.error !== ''"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            title="Events are unavailable right now"
            :description="events.error"
        >
            <template #actions>
                <UButton
                    label="Try again"
                    icon="i-lucide-refresh-cw"
                    color="error"
                    variant="soft"
                    size="sm"
                    :loading="events.loadingList"
                    @click="loadEvents"
                />
            </template>
        </UAlert>

        <UAlert
            v-if="!events.loadingList && events.events.length === 0 && events.error === ''"
            color="info"
            variant="subtle"
            icon="i-lucide-calendar-x"
            title="No events are available"
            description="Try changing the filters or including past events."
        />

        <div v-if="events.events.length > 0">
            <div v-if="activeView === 'list'" class="grid gap-3">
                <EventListItem
                    v-for="event in events.events"
                    :key="event.id"
                    :event="event"
                />
            </div>
            <EventCalendarView v-else :events="events.events" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useEventsStore } from "@store/events";
import EventCalendarView from "./EventCalendarView.vue";
import EventFilters from "./EventFilters.vue";
import EventListItem from "./EventListItem.vue";

const events = useEventsStore();
const activeView = ref<"list" | "calendar">("list");
const viewItems = [
    { label: "List", value: "list", icon: "i-lucide-list" },
    { label: "Calendar", value: "calendar", icon: "i-lucide-calendar-days" },
];

onMounted(() => {
    if (events.events.length === 0) {
        loadEvents();
    }
});

function loadEvents(): void {
    events.loadEvents().catch(() => {
        // The store logs technical details and exposes user-safe alert copy.
    });
}
</script>

<template>
    <div class="event-cluster-popup">
        <p class="text-sm font-semibold text-surface-900">{{ events.length }} events at this location</p>
        <div class="mt-2 grid gap-2">
            <button
                v-for="event in events"
                :key="event.id"
                class="cluster-event"
                type="button"
                @click="emit('open-details', event.id)"
            >
                <span class="font-medium text-surface-900">{{ event.title }}</span>
                <span class="text-xs text-surface-600">{{ formatDate(event.start_datetime) }}</span>
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { type EventMapProperties } from "@store/events";

defineProps<{
    events: EventMapProperties[]
}>();

const emit = defineEmits<{
    "open-details": [eventId: string]
}>();

function formatDate(value: string): string {
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(value));
}
</script>

<style scoped>
.event-cluster-popup {
    width: min(340px, 72vw);
    max-height: 360px;
    overflow-y: auto;
    padding: 0.25rem;
}

.cluster-event {
    display: grid;
    gap: 0.125rem;
    width: 100%;
    padding: 0.625rem 0.75rem;
    text-align: left;
    border-radius: 0.5rem;
    background: #f8fafc;
}

.cluster-event:hover {
    background: #eef2ff;
}
</style>

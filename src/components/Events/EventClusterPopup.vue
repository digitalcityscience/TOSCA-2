<template>
    <section class="event-cluster-popup grid gap-2">
        <div class="flex items-center gap-2">
            <UIcon name="i-lucide-map-pinned" class="size-4 text-primary" />
            <h3 class="text-sm font-semibold text-highlighted">
                {{ events.length }} events at this location
            </h3>
        </div>
        <div class="grid gap-2">
            <UButton
                v-for="event in events"
                :key="event.id"
                color="neutral"
                variant="soft"
                class="h-auto justify-start px-3 py-2 text-left"
                @click="emit('open-details', event.id)"
            >
                <span class="grid min-w-0 gap-0.5">
                    <span class="truncate text-sm font-medium text-highlighted">{{ event.title }}</span>
                    <span class="text-xs text-muted">{{ formatEventDate(event.start_datetime) }}</span>
                </span>
            </UButton>
        </div>
    </section>
</template>

<script setup lang="ts">
import { type EventMapProperties } from "@store/events";
import { formatEventDate } from "./eventPresentation";

defineProps<{
    events: EventMapProperties[]
}>();

const emit = defineEmits<{
    "open-details": [eventId: string]
}>();
</script>

<style scoped>
.event-cluster-popup {
    width: min(21rem, 72vw);
    max-height: 22.5rem;
    overflow-y: auto;
}
</style>

<template>
    <UCard
        class="transition hover:ring-primary/30"
        :ui="{ body: 'p-4 sm:p-4', header: 'p-4 sm:p-4', footer: 'p-4 sm:p-4' }"
    >
        <template #header>
            <div class="grid gap-2">
                <h2 class="text-base font-semibold leading-snug text-highlighted">{{ event.title }}</h2>
                <div class="flex flex-wrap gap-1.5">
                    <UBadge color="neutral" variant="subtle" icon="i-lucide-calendar-clock">
                        {{ dateLabel }}
                    </UBadge>
                    <EventLocationBadge :mode="event.location_mode" />
                    <UBadge v-if="seriesLabel !== ''" color="info" variant="subtle" icon="i-lucide-repeat-2">
                        {{ seriesLabel }}
                    </UBadge>
                </div>
            </div>
        </template>

        <div class="grid gap-3">
            <p class="text-sm leading-relaxed text-toned">{{ event.summary }}</p>
            <div v-if="taxonomyPreview.visible.length > 0" class="flex flex-wrap gap-1.5">
                <UBadge
                    v-for="chip in taxonomyPreview.visible"
                    :key="chip"
                    color="neutral"
                    variant="outline"
                >
                    {{ chip }}
                </UBadge>
                <UBadge v-if="taxonomyPreview.hiddenCount > 0" color="neutral" variant="outline">
                    +{{ taxonomyPreview.hiddenCount }} more
                </UBadge>
            </div>
        </div>

        <template #footer>
            <UButton
                :to="{ name: 'event-detail', params: { eventId: event.id } }"
                label="Open event"
                size="sm"
            />
        </template>
    </UCard>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { type EventListItem } from "@store/events";
import EventLocationBadge from "./EventLocationBadge.vue";
import { previewTaxonomyChips } from "./taxonomyChips";
import {
    eventSeriesPosition,
    formatEventDate,
} from "./eventPresentation";

const props = defineProps<{
    event: EventListItem
}>();

const dateLabel = computed(() => formatEventDate(props.event.start_datetime));
const seriesLabel = computed(() => {
    return eventSeriesPosition(props.event.occurrence_index, props.event.total_occurrences);
});
const taxonomyPreview = computed(() => {
    return previewTaxonomyChips(props.event.taxonomy_assignments, 5);
});
</script>

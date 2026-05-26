<template>
    <section class="grid gap-3">
        <h3 class="text-lg font-semibold text-surface-900">Series</h3>
        <div class="rounded-md border border-surface-200 bg-surface-0 p-3">
            <div class="flex flex-wrap items-center gap-2">
                <Tag :value="series.name" severity="info" />
                <Tag v-if="positionLabel !== ''" :value="positionLabel" severity="secondary" />
                <Tag v-if="series.is_exception" value="Updated occurrence" severity="warn" />
            </div>
            <p v-if="movedLabel !== ''" class="mt-2 text-sm text-surface-600">{{ movedLabel }}</p>
            <div class="mt-3 flex flex-wrap gap-2">
                <RouterLink
                    v-if="series.previous_occurrence !== null"
                    :to="{ name: 'event-detail', params: { eventId: series.previous_occurrence.id } }"
                >
                    <Button icon="pi pi-arrow-left" label="Previous" size="small" severity="secondary" />
                </RouterLink>
                <RouterLink
                    v-if="series.next_occurrence !== null"
                    :to="{ name: 'event-detail', params: { eventId: series.next_occurrence.id } }"
                >
                    <Button icon="pi pi-arrow-right" label="Next" size="small" severity="secondary" />
                </RouterLink>
            </div>
        </div>
    </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import Button from "primevue/button";
import Tag from "primevue/tag";
import { type EventSeriesNavigation } from "@store/events";

const props = defineProps<{
    series: EventSeriesNavigation
}>();

const positionLabel = computed(() => {
    if (props.series.occurrence_index === null || props.series.total_occurrences === null) {
        return "";
    }
    return `${props.series.occurrence_index} / ${props.series.total_occurrences}`;
});

const movedLabel = computed(() => {
    if (props.series.original_start_datetime === null) {
        return "";
    }
    const originalDate = new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(props.series.original_start_datetime));
    return `Originally scheduled for ${originalDate}`;
});
</script>

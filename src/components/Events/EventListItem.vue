<template>
    <Card class="event-card">
        <template #title>
            <h2 class="text-xl font-semibold leading-tight">{{ event.title }}</h2>
        </template>
        <template #subtitle>
            <div class="flex flex-wrap gap-2">
                <Tag :value="dateLabel" severity="secondary" />
                <Tag :value="locationLabel" :severity="locationSeverity" />
                <Tag v-if="seriesLabel !== ''" :value="seriesLabel" severity="info" />
            </div>
        </template>
        <template #content>
            <div class="grid gap-3">
                <p class="text-sm leading-relaxed text-surface-700">{{ event.summary }}</p>
                <div v-if="taxonomyPreview.visible.length > 0" class="flex flex-wrap gap-2">
                    <Tag
                        v-for="chip in taxonomyPreview.visible"
                        :key="chip"
                        :value="chip"
                        severity="secondary"
                    />
                    <Tag
                        v-if="taxonomyPreview.hiddenCount > 0"
                        :value="`+${taxonomyPreview.hiddenCount} more`"
                        severity="secondary"
                    />
                </div>
            </div>
        </template>
        <template #footer>
            <RouterLink :to="{ name: 'event-detail', params: { eventId: event.id } }">
                <Button icon="pi pi-calendar" label="Open Event" size="small" />
            </RouterLink>
        </template>
    </Card>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import Button from "primevue/button";
import Card from "primevue/card";
import Tag from "primevue/tag";
import { type EventListItem } from "@store/events";
import { previewTaxonomyChips } from "./taxonomyChips";

const props = defineProps<{
    event: EventListItem
}>();

const dateLabel = computed(() => {
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(props.event.start_datetime));
});

const locationLabel = computed(() => {
    const labels: Record<string, string> = {
        physical: "In person",
        online: "Online",
        hybrid: "Hybrid",
        by_arrangement: "By arrangement",
        home_visit: "Home visit",
    };
    return labels[props.event.location_mode] ?? props.event.location_mode;
});

const locationSeverity = computed(() => {
    if (props.event.location_mode === "online") {
        return "info";
    }
    if (props.event.location_mode === "hybrid") {
        return "warn";
    }
    return "success";
});

const seriesLabel = computed(() => {
    if (
        props.event.series_id == null ||
        props.event.occurrence_index == null ||
        props.event.total_occurrences == null
    ) {
        return "";
    }
    return `${props.event.occurrence_index} / ${props.event.total_occurrences}`;
});

const taxonomyPreview = computed(() => {
    return previewTaxonomyChips(props.event.taxonomy_assignments, 5);
});
</script>

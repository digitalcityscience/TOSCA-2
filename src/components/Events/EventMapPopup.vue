<template>
    <div class="event-popup">
        <div class="flex flex-wrap gap-2 mb-2">
            <Tag :value="locationLabel" :severity="locationSeverity" />
            <Tag v-if="seriesLabel !== ''" :value="seriesLabel" severity="info" />
        </div>
        <h3 class="text-base font-semibold leading-tight text-surface-900">{{ event.title }}</h3>
        <p class="text-sm leading-relaxed text-surface-700 mt-1">{{ event.summary }}</p>
        <p class="text-sm font-medium text-surface-800 mt-2">{{ dateLabel }}</p>
        <div v-if="taxonomyPreview.visible.length > 0" class="mt-2 flex flex-wrap gap-1">
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
        <Button
            class="mt-3"
            icon="pi pi-arrow-right"
            label="Open details"
            size="small"
            @click="emit('open-details')"
        />
    </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import Button from "primevue/button";
import Tag from "primevue/tag";
import { type EventMapProperties } from "@store/events";
import { previewTaxonomyChips } from "./taxonomyChips";

const props = defineProps<{
    event: EventMapProperties
}>();

const emit = defineEmits<{
    "open-details": []
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
    return previewTaxonomyChips(props.event.taxonomy_assignments, 4);
});
</script>

<style scoped>
.event-popup {
    width: min(320px, 70vw);
    padding: 0.25rem;
}
</style>

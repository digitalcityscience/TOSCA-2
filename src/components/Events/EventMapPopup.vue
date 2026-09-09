<template>
    <article class="event-popup grid gap-3">
        <div class="flex flex-wrap gap-1.5">
            <EventLocationBadge :mode="event.location_mode" />
            <UBadge v-if="seriesLabel !== ''" color="info" variant="subtle" icon="i-lucide-repeat-2">
                {{ seriesLabel }}
            </UBadge>
        </div>

        <div class="grid gap-1">
            <h3 class="text-base font-semibold leading-tight text-highlighted">{{ event.title }}</h3>
            <p class="line-clamp-3 text-sm leading-relaxed text-toned">{{ event.summary }}</p>
            <p class="mt-1 flex items-center gap-1.5 text-sm font-medium text-toned">
                <UIcon name="i-lucide-calendar-clock" class="size-4 text-muted" />
                {{ dateLabel }}
            </p>
        </div>

        <div v-if="taxonomyPreview.visible.length > 0" class="flex flex-wrap gap-1">
            <UBadge
                v-for="chip in taxonomyPreview.visible"
                :key="chip"
                color="neutral"
                variant="outline"
            >
                {{ chip }}
            </UBadge>
            <UBadge v-if="taxonomyPreview.hiddenCount > 0" color="neutral" variant="outline">
                {{ t("events.moreCount", { count: taxonomyPreview.hiddenCount }) }}
            </UBadge>
        </div>

        <UButton
            :label="t('events.map.openDetails')"
            trailing-icon="i-lucide-arrow-right"
            size="sm"
            class="w-fit"
            @click="emit('open-details')"
        />
    </article>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { type EventMapProperties } from "@store/events";
import EventLocationBadge from "./EventLocationBadge.vue";
import { previewTaxonomyChips } from "./taxonomyChips";
import {
    eventSeriesPosition,
    formatEventDate,
} from "./eventPresentation";

const props = defineProps<{
    event: EventMapProperties
}>();
const { locale, t } = useI18n();

const emit = defineEmits<{
    "open-details": []
}>();

const dateLabel = computed(() => formatEventDate(props.event.start_datetime, locale.value));
const seriesLabel = computed(() => {
    return eventSeriesPosition(props.event.occurrence_index, props.event.total_occurrences);
});
const taxonomyPreview = computed(() => {
    return previewTaxonomyChips(props.event.taxonomy_assignments, 4);
});
</script>

<style scoped>
.event-popup {
    width: min(20rem, 70vw);
}
</style>

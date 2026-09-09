<template>
    <section class="grid gap-3">
        <h2 class="text-base font-semibold text-highlighted">{{ t("events.series.title") }}</h2>
        <div class="grid gap-3">
            <div class="flex flex-wrap items-center gap-1.5">
                <UBadge color="info" variant="subtle" icon="i-lucide-repeat-2">
                    {{ series.name }}
                </UBadge>
                <UBadge v-if="positionLabel !== ''" color="neutral" variant="outline">
                    {{ positionLabel }}
                </UBadge>
                <UBadge v-if="series.is_exception" color="warning" variant="subtle">
                    {{ t("events.series.updatedOccurrence") }}
                </UBadge>
            </div>
            <p v-if="movedLabel !== ''" class="text-sm text-muted">{{ movedLabel }}</p>
            <div class="flex flex-wrap gap-2">
                <UButton
                    v-if="series.previous_occurrence !== null"
                    :to="{ name: 'event-detail', params: { eventId: series.previous_occurrence.id } }"
                    icon="i-lucide-arrow-left"
                    :label="t('common.back')"
                    size="sm"
                    color="neutral"
                    variant="outline"
                />
                <UButton
                    v-if="series.next_occurrence !== null"
                    :to="{ name: 'event-detail', params: { eventId: series.next_occurrence.id } }"
                    trailing-icon="i-lucide-arrow-right"
                    :label="t('common.next')"
                    size="sm"
                    color="neutral"
                    variant="outline"
                />
            </div>
        </div>
    </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { type EventSeriesNavigation } from "@store/events";
import { eventSeriesPosition, formatEventDate } from "./eventPresentation";

const props = defineProps<{
    series: EventSeriesNavigation
}>();
const { locale, t } = useI18n();

const positionLabel = computed(() => {
    return eventSeriesPosition(props.series.occurrence_index, props.series.total_occurrences);
});
const movedLabel = computed(() => {
    if (props.series.original_start_datetime === null) {
        return "";
    }
    return t("events.series.originallyScheduled", {
        date: formatEventDate(props.series.original_start_datetime, locale.value),
    });
});
</script>

<template>
    <section class="grid gap-1.5" :data-testid="`equity-legend-${props.legend.id}`">
        <h5 class="text-xs font-semibold text-highlighted">{{ localize(props.legend.title, locale) }}</h5>
        <ul v-if="props.legend.kind === 'classes'" class="grid gap-1" data-testid="equity-legend-rows">
            <li v-for="row in props.legend.rows" :key="row.label.en" class="flex items-start gap-2 text-xs" data-testid="equity-legend-row" :data-color="row.color">
                <span class="mt-0.5 inline-block size-3.5 shrink-0 rounded-sm border border-default" :style="{ backgroundColor: row.color }" aria-hidden="true" />
                <span>
                    {{ localize(row.label, locale) }}
                    <span v-if="row.detail !== undefined" class="text-muted"> · {{ localize(row.detail, locale) }}</span>
                </span>
            </li>
        </ul>
        <div v-else class="grid gap-1" data-testid="equity-legend-gradient">
            <div class="h-3 rounded-sm border border-default" :style="{ background: gradientCss }" aria-hidden="true" />
            <div class="relative h-4 text-xs text-muted">
                <span
                    v-for="stop in props.legend.gradient"
                    :key="stop.position"
                    class="absolute -translate-x-1/2 whitespace-nowrap"
                    :style="{ left: `${stop.position * 100}%` }"
                    :data-color="stop.color"
                    data-testid="equity-legend-tick"
                >{{ localize(stop.label, locale) }}</span>
            </div>
        </div>
        <ul v-if="props.legend.special.length > 0" class="grid gap-1" data-testid="equity-legend-special">
            <li v-for="row in props.legend.special" :key="row.label.en" class="flex items-start gap-2 text-xs" :data-color="row.color">
                <span class="mt-0.5 inline-block size-3.5 shrink-0 rounded-sm border border-default" :style="{ backgroundColor: row.color }" aria-hidden="true" />
                <span>
                    {{ localize(row.label, locale) }}
                    <span v-if="row.detail !== undefined" class="text-muted"> · {{ localize(row.detail, locale) }}</span>
                </span>
            </li>
        </ul>
        <p class="text-xs text-muted">{{ localize(props.legend.note, locale) }}</p>
    </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { localize } from "../../config/urbanStories";
import type { EquityLegend } from "../../config/urbanStories/styles/transitEquity";

interface Props {
    legend: EquityLegend
}

const props = defineProps<Props>();
const { locale } = useI18n();

const gradientCss = computed(() => {
    const stops = (props.legend.gradient ?? []).map((stop) => `${stop.color} ${stop.position * 100}%`);
    return `linear-gradient(to right, ${stops.join(", ")})`;
});
</script>

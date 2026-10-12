<template>
    <section class="grid gap-1.5" :data-testid="`legend-${props.legend.kind}`" :data-style-name="props.legend.styleName">
        <h5 class="text-xs font-semibold text-highlighted">{{ localize(props.legend.title, locale) }}</h5>
        <div v-if="props.legend.kind === 'ramp'" class="grid gap-1" data-testid="legend-items">
            <div class="flex overflow-hidden rounded-sm border border-default">
                <span
                    v-for="item in props.legend.items"
                    :key="item.value"
                    class="flex h-7 flex-1 items-center justify-center text-xs font-semibold"
                    :style="{ backgroundColor: item.color, color: textColor(item.color) }"
                    :data-color="item.color"
                    :title="localize(item.label, locale)"
                    data-testid="legend-item"
                >{{ item.value }}</span>
            </div>
            <div v-if="props.legend.rampEnds !== undefined" class="flex justify-between gap-2 text-xs text-muted">
                <span>{{ localize(props.legend.rampEnds.low, locale) }}</span>
                <span class="text-right">{{ localize(props.legend.rampEnds.high, locale) }}</span>
            </div>
        </div>
        <ul v-else-if="props.legend.kind === 'classes'" class="grid gap-1" data-testid="legend-items">
            <li v-for="item in props.legend.items" :key="item.value ?? item.label.en" class="flex items-center gap-2 text-xs" data-testid="legend-item">
                <span class="inline-block size-3.5 shrink-0 rounded-sm border border-default" :style="{ backgroundColor: item.color }" :data-color="item.color" aria-hidden="true" />
                <span>{{ localize(item.label, locale) }}</span>
            </li>
        </ul>
        <div v-else class="grid gap-1" data-testid="legend-items">
            <div class="h-3 rounded-sm border border-default" :style="{ background: gradient }" aria-hidden="true" />
            <div class="flex justify-between text-xs text-muted">
                <span v-for="item in props.legend.items" :key="item.value" data-testid="legend-item" :data-color="item.color">{{ localize(item.label, locale) }}</span>
            </div>
        </div>
        <div class="flex items-center gap-2 text-xs" data-testid="legend-no-data">
            <span class="inline-block size-3.5 shrink-0 rounded-sm border border-default" :style="{ backgroundColor: props.legend.noData.color }" aria-hidden="true" />
            <span>{{ localize(props.legend.noData.label, locale) }}</span>
        </div>
        <p v-if="props.legend.note !== undefined" class="text-xs text-muted">{{ localize(props.legend.note, locale) }}</p>
        <div v-if="props.legend.categories !== undefined" class="mt-1 grid gap-1 border-t border-default pt-2">
            <h6 v-if="props.legend.categoriesTitle !== undefined" class="text-xs font-semibold text-highlighted">
                {{ localize(props.legend.categoriesTitle, locale) }}
            </h6>
            <ol class="grid list-inside list-decimal gap-1" data-testid="legend-categories">
                <li v-for="category in props.legend.categories" :key="category.label.en" class="text-xs" data-testid="legend-category">
                    <span class="font-medium text-highlighted">{{ localize(category.label, locale) }}</span>
                    <span class="text-muted"> – {{ localize(category.description, locale) }}</span>
                </li>
            </ol>
        </div>
    </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { localize } from "../../config/urbanStories";
import type { LegendSpec } from "../../config/urbanStories/styles/fifteenMinute";

interface Props {
    legend: LegendSpec
}

const props = defineProps<Props>();
const { locale } = useI18n();

/** Evenly spaced stops, as many as the legend items, so the bar matches the interpolation stops. */
/** Black or white text, whichever reads better on the swatch (WCAG relative luminance). */
function textColor(hex: string): string {
    const channel = (offset: number): number => {
        const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
    return luminance > 0.4 ? "#1f2937" : "#ffffff";
}

const gradient = computed(() => {
    const items = props.legend.items;
    const stops = items.map((item, index) => `${item.color} ${(index / Math.max(items.length - 1, 1)) * 100}%`);
    return `linear-gradient(to right, ${stops.join(", ")})`;
});
</script>

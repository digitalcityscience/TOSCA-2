<template>
    <section class="grid gap-1.5" data-testid="gs-legend" :data-style-name="props.legend.styleName">
        <h5 class="text-xs font-semibold text-highlighted">{{ localize(props.legend.title, locale) }}</h5>
        <ul class="grid gap-1" data-testid="legend-items">
            <li v-for="item in props.legend.items" :key="item.label.en" class="flex items-center gap-2 text-xs" data-testid="legend-item">
                <span
                    v-if="item.shape === 'icon'"
                    class="inline-flex size-3.5 shrink-0 items-center justify-center rounded-full text-[0.55rem] font-bold leading-none text-white"
                    :style="{ backgroundColor: item.color }"
                    :data-color="item.color"
                    aria-hidden="true"
                >⌂</span>
                <span
                    v-else-if="item.shape === 'outline' || item.shape === 'dashed'"
                    class="inline-block size-3.5 shrink-0 rounded-sm bg-transparent"
                    :style="{ border: `2px ${item.shape === 'dashed' ? 'dashed' : 'solid'} ${item.color}` }"
                    :data-color="item.color"
                    aria-hidden="true"
                />
                <span
                    v-else
                    class="inline-block size-3.5 shrink-0 rounded-sm border border-default"
                    :style="{ backgroundColor: item.color }"
                    :data-color="item.color"
                    aria-hidden="true"
                />
                <span>{{ localize(item.label, locale) }}</span>
            </li>
        </ul>
        <div v-for="item in props.legend.noData" :key="item.label.en" class="flex items-center gap-2 text-xs" data-testid="legend-no-data">
            <span class="inline-block size-3.5 shrink-0 rounded-sm border border-default" :style="{ backgroundColor: item.color }" :data-color="item.color" aria-hidden="true" />
            <span>{{ localize(item.label, locale) }}</span>
        </div>
        <p v-if="props.legend.note !== undefined" class="text-xs text-muted">{{ localize(props.legend.note, locale) }}</p>
    </section>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { localize } from "../../config/urbanStories";
import type { GreenLegend } from "../../config/urbanStories/styles/greenSpaces";

interface Props {
    legend: GreenLegend
}

const props = defineProps<Props>();
const { locale } = useI18n();
</script>

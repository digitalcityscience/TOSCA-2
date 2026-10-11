<template>
    <div class="simulation-legend">
        <p v-if="props.legend.attribute" class="simulation-legend-attribute">{{ props.legend.attribute.replaceAll("_", " ") }}</p>
        <ul class="simulation-legend-rows" :aria-label="t('map.layerItem.legendAlt')">
            <li v-for="row in rows" :key="row.key" class="simulation-legend-row">
                <span class="simulation-legend-swatch" aria-hidden="true">
                    <span :class="['simulation-legend-mark', `simulation-legend-mark-${row.mark}`]" :style="markStyle(row)"></span>
                </span>
                <span class="simulation-legend-label">{{ row.label }}</span>
            </li>
        </ul>
    </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { SimulationLegend } from "@store/geosimulation";
import { simulationLegendRows, type SimulationLegendRow } from "@helpers/simulationLegend";

const props = defineProps<{ legend: SimulationLegend }>();
const { t, locale } = useI18n();
const rows = computed(() => simulationLegendRows(props.legend, locale.value));

function markStyle(row: SimulationLegendRow): Record<string, string> {
    const style: Record<string, string> = { background: row.color };
    if (row.size !== undefined && row.mark === "circle") {
        const diameter = `${Math.max(4, row.size * 2)}px`;
        style.width = diameter;
        style.height = diameter;
    }
    if (row.size !== undefined && row.mark === "line") {
        style.height = `${Math.max(1, row.size)}px`;
    }
    return style;
}
</script>

<style scoped>
.simulation-legend {
    display: grid;
    gap: 0.35rem;
}

.simulation-legend-attribute {
    margin: 0;
    font-size: 0.75rem;
    color: var(--ui-text-muted);
}

.simulation-legend-rows {
    display: grid;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
}

.simulation-legend-row {
    display: grid;
    grid-template-columns: 2.75rem minmax(0, 1fr);
    align-items: center;
    gap: 0.6rem;
    min-height: 1.9rem;
}

.simulation-legend-swatch {
    display: grid;
    width: 2.75rem;
    height: 2.4rem;
    place-items: center;
}

.simulation-legend-mark {
    display: block;
    border: 1px solid rgb(15 23 42 / 0.22);
}

.simulation-legend-mark-fill {
    width: 1.65rem;
    height: 1rem;
}

.simulation-legend-mark-circle {
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 9999px;
}

.simulation-legend-mark-line {
    width: 1.8rem;
    height: 3px;
    border: 0;
    border-radius: 9999px;
}

.simulation-legend-mark-gradient {
    width: 2.4rem;
    height: 0.7rem;
    border-radius: 9999px;
}

.simulation-legend-label {
    min-width: 0;
    overflow-wrap: anywhere;
    font-size: 0.8rem;
    line-height: 1.25;
    color: var(--ui-text);
}
</style>

<template>
    <dl class="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3">
        <div v-for="(row, index) in visibleRows" :key="index" class="rounded-md border border-default bg-elevated p-3">
            <dt class="text-xs text-muted">{{ metricLabel(row) }}</dt>
            <dd class="mt-1 text-xl font-semibold text-highlighted">{{ metricValue(row) }}</dd>
        </div>
    </dl>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { SimulationMetricGridView, SimulationTableOutput } from "@store/geosimulation";
import { fieldByKey, fieldIndex, normalizeSimulationDataset } from "@helpers/simulationResults";
import { formatNumber } from "@helpers/simulationFormat";

const props = defineProps<{ output: SimulationTableOutput; view: SimulationMetricGridView }>();
const { locale } = useI18n();
const dataset = computed(() => normalizeSimulationDataset(props.output.data));
const metricKey = computed(() => dataset.value.fields.find((field) => field.semantic === "metric")?.key ?? "metric");
const valueKey = computed(() => dataset.value.fields.find((field) => field.semantic === "measure")?.key ?? "value");
const unitKey = computed(() => dataset.value.fields.find((field) => field.semantic === "unit")?.key ?? (dataset.value.columns.includes("unit") ? "unit" : undefined));
const visibleRows = computed(() => {
    if (!props.view.metrics) return dataset.value.rows;
    const index = fieldIndex(dataset.value, metricKey.value);
    const rowsByMetric = new Map(dataset.value.rows.map((row) => [String(row[index]), row]));
    return props.view.metrics.flatMap((metric) => {
        const row = rowsByMetric.get(metric);
        return row ? [row] : [];
    });
});

function metricLabel(row: Array<string | number | boolean | null>): string {
    const value = row[fieldIndex(dataset.value, metricKey.value ?? "")];
    return value === null || value === undefined ? "—" : String(value);
}

function metricValue(row: Array<string | number | boolean | null>): string {
    const value = row[fieldIndex(dataset.value, valueKey.value ?? "")];
    const formatted = typeof value === "number" ? formatNumber(value, locale.value) : String(value ?? "—");
    const rowUnit = unitKey.value ? row[fieldIndex(dataset.value, unitKey.value)] : undefined;
    const fieldUnit = valueKey.value ? fieldByKey(dataset.value, valueKey.value)?.unit : undefined;
    return [formatted, rowUnit ?? fieldUnit].filter(Boolean).join(" ");
}
</script>

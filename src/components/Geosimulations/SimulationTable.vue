<template>
    <section class="grid gap-2">
        <h3 v-if="props.showTitle" class="text-sm font-semibold text-highlighted">{{ props.table.title }}</h3>
        <div class="table-scroll">
            <table class="sim-table">
                <thead>
                    <tr><th v-for="field in selectedFields" :key="field.key">{{ field.label }}<span v-if="field.unit"> ({{ field.unit }})</span></th></tr>
                </thead>
                <tbody>
                    <tr v-for="(row, index) in rows" :key="index">
                        <td v-for="field in selectedFields" :key="field.key">{{ formatCell(row[fieldIndex(dataset, field.key)]) }}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { SimulationTableOutput, SimulationTableView } from "@store/geosimulation";
import { formatNumber } from "@helpers/simulationFormat";
import { fieldIndex, normalizeSimulationDataset } from "@helpers/simulationResults";

/** A `table` output of a run or comparison: typed cells, at most a few thousand rows. */
const props = withDefaults(defineProps<{
    table: SimulationTableOutput;
    view?: SimulationTableView;
    showTitle?: boolean;
}>(), { view: () => ({ type: "table", version: 1 }), showTitle: true });
const { locale } = useI18n();
const dataset = computed(() => normalizeSimulationDataset(props.table.data));
const selectedFields = computed(() => {
    const keys = props.view.columns ?? dataset.value.columns;
    return keys.map((key) => dataset.value.fields.find((field) => field.key === key)).filter((field) => field !== undefined);
});
const rows = computed(() => {
    const values = [...dataset.value.rows];
    if (!props.view.sort) return values;
    const index = fieldIndex(dataset.value, props.view.sort.field);
    const direction = props.view.sort.direction === "descending" ? -1 : 1;
    return values.sort((left, right) => String(left[index] ?? "").localeCompare(String(right[index] ?? ""), undefined, { numeric: true }) * direction);
});

function formatCell(cell: string | number | boolean | null): string {
    if (cell === null) return "—";
    return typeof cell === "number" ? formatNumber(cell, locale.value) : String(cell);
}
</script>

<style scoped>
.table-scroll {
    overflow-x: auto;
}

.sim-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.75rem;
}

.sim-table th,
.sim-table td {
    padding: 0.3rem 0.45rem;
    border-bottom: 1px solid rgb(148 163 184 / 0.2);
    text-align: left;
    white-space: nowrap;
}

.sim-table th {
    font-weight: 600;
    text-transform: capitalize;
}
</style>

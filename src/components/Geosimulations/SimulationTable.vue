<template>
    <section class="grid gap-2">
        <h3 class="text-sm font-semibold text-highlighted">{{ props.table.title }}</h3>
        <div class="table-scroll">
            <table class="sim-table">
                <thead>
                    <tr><th v-for="column in props.table.data.columns" :key="column">{{ column.replaceAll("_", " ") }}</th></tr>
                </thead>
                <tbody>
                    <tr v-for="(row, index) in props.table.data.rows" :key="index">
                        <td v-for="(cell, cellIndex) in row" :key="cellIndex">{{ formatCell(cell) }}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </section>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { SimulationTableOutput } from "@store/geosimulation";
import { formatNumber } from "@helpers/simulationFormat";

/** A `table` output of a run or comparison: typed cells, at most a few thousand rows. */
const props = defineProps<{ table: SimulationTableOutput }>();
const { locale } = useI18n();

function formatCell(cell: string | number | null): string {
    if (cell === null) return "—";
    return typeof cell === "number" ? formatNumber(cell, locale.value) : cell;
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

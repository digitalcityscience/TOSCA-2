<template><div class="relative min-h-72"><canvas ref="canvas"></canvas></div></template>

<script setup lang="ts">
import { Chart, BarController, BarElement, CategoryScale, Legend, LineController, LineElement, LinearScale, PointElement, Tooltip } from "chart.js";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { SimulationChartView, SimulationTableOutput } from "@store/geosimulation";
import { fieldByKey, fieldIndex, normalizeSimulationDataset } from "@helpers/simulationResults";

Chart.register(BarController, BarElement, CategoryScale, LinearScale, LineController, LineElement, PointElement, Tooltip, Legend);
const props = defineProps<{ output: SimulationTableOutput; view: SimulationChartView }>();
const canvas = ref<HTMLCanvasElement>();
const dataset = computed(() => normalizeSimulationDataset(props.output.data));
let chart: Chart | undefined;

function renderChart(): void {
    if (!canvas.value) return;
    chart?.destroy();
    const xKey = props.view.type === "line_chart" ? props.view.x : props.view.category;
    const xIndex = fieldIndex(dataset.value, xKey ?? "");
    chart = new Chart(canvas.value, {
        type: props.view.type === "line_chart" ? "line" : "bar",
        data: {
            labels: dataset.value.rows.map((row) => String(row[xIndex] ?? "—")),
            datasets: props.view.series.map((series, index) => {
                const color = series.color ?? `hsl(${(index * 67 + 205) % 360} 72% 48%)`;
                const yIndex = fieldIndex(dataset.value, series.field);
                return {
                    label: series.label ?? fieldByKey(dataset.value, series.field)?.label ?? series.field,
                    data: dataset.value.rows.map((row) => Number(row[yIndex] ?? 0)),
                    borderColor: color,
                    backgroundColor: color,
                    tension: 0.2,
                    yAxisID: series.axis === "secondary" ? "y1" : "y",
                };
            }),
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { type: "linear", position: "left" },
                y1: { type: "linear", position: "right", grid: { drawOnChartArea: false } },
            },
        },
    });
}

onMounted(renderChart);
watch(() => [props.output, props.view], renderChart, { deep: true });
onBeforeUnmount(() => chart?.destroy());
</script>

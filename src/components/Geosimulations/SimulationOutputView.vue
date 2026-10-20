<template>
    <figure class="grid gap-3">
        <SimulationTable v-if="view.type === 'table'" :table="output" :view="view" :show-title="false" />
        <SimulationMetricGrid v-else-if="view.type === 'metric_grid'" :output="output" :view="view" />
        <SimulationChart v-else :output="output" :view="view" />
        <figcaption v-if="caption" class="text-sm text-toned">{{ caption }}</figcaption>
    </figure>
</template>

<script setup lang="ts">
import type { SimulationResultView, SimulationTableOutput } from "@store/geosimulation";

withDefaults(defineProps<{
    output: SimulationTableOutput;
    view: SimulationResultView;
    caption?: string;
}>(), { caption: "" });
</script>

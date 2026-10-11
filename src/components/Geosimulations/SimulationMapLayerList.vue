<template>
    <section class="grid gap-2">
        <h3 class="text-sm font-semibold text-highlighted">{{ props.title ?? t("geosimulations.mapLayers") }}</h3>
        <p class="text-xs text-muted">{{ t("geosimulations.mapLayersHint") }}</p>
        <ul class="grid gap-1">
            <li v-for="output in props.outputs" :key="output.id" class="output-row">
                <USwitch
                    :model-value="isOnMap(output)"
                    :loading="pendingOutputId === output.id"
                    :aria-label="output.title"
                    @update:model-value="(on: boolean) => toggleOutput(output, on)"
                />
                <span class="min-w-0 truncate text-sm">{{ output.title }}</span>
                <span v-if="output.features !== null" class="text-xs text-muted">{{ formatNumber(output.features, locale) }}</span>
            </li>
        </ul>
    </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useMapStore } from "@store/map";
import type { SimulationLabels, SimulationVectorLayerOutput } from "@store/geosimulation";
import { addSimulationOutputLayer, removeSimulationOutputLayer, waitForMapStyle } from "@helpers/geosimulationLayers";
import { formatNumber } from "@helpers/simulationFormat";
import { useToast } from "@helpers/toast";
import { reportDeveloperError } from "@helpers/userFacingError";

/** On/off switches for the map-layer outputs of a run or comparison (`owner`). */
const props = defineProps<{
    owner: { id: string; labels: SimulationLabels };
    outputs: SimulationVectorLayerOutput[];
    title?: string;
}>();
const { t, locale } = useI18n();
const mapStore = useMapStore();
const toast = useToast();
const pendingOutputId = ref<string>();

function isOnMap(output: SimulationVectorLayerOutput): boolean {
    return mapStore.layersOnMap.some((layer) => layer.simulationOutput?.outputId === output.id);
}

async function toggleOutput(output: SimulationVectorLayerOutput, on: boolean): Promise<void> {
    pendingOutputId.value = output.id;
    try {
        await waitForMapStyle(mapStore.map);
        if (on) {
            addSimulationOutputLayer(mapStore, props.owner, output);
        } else {
            const layer = mapStore.layersOnMap.find((item) => item.simulationOutput?.outputId === output.id);
            if (layer !== undefined) await removeSimulationOutputLayer(mapStore, layer);
        }
    } catch (error) {
        reportDeveloperError(`Toggling simulation output ${output.role}`, error);
        toast.add({ severity: "error", summary: t("toast.error"), detail: t("geosimulations.layerError"), life: 4000 });
    } finally {
        pendingOutputId.value = undefined;
    }
}
</script>

<style scoped>
.output-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.6rem;
    padding: 0.3rem 0;
}
</style>

<template>
    <div class="grid gap-4">
        <USkeleton v-if="loading" class="h-60 w-full rounded-lg" />
        <UAlert v-else-if="failed" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="t('geosimulations.modelUnavailable')" />

        <template v-else-if="model">
            <div class="grid gap-2">
                <h2 class="text-xl font-semibold leading-tight text-highlighted">{{ model.title }}</h2>
                <p class="text-sm leading-relaxed text-toned">{{ model.summary }}</p>
            </div>

            <EditorJsReadonly v-if="model.description_content.blocks.length > 0" :data="model.description_content" />

            <section class="grid gap-3">
                <h3 class="text-sm font-semibold text-highlighted">{{ t("geosimulations.runs") }}</h3>
                <p v-if="model.runs.length === 0" class="text-sm text-muted">{{ t("geosimulations.noRuns") }}</p>
                <UCard v-for="run in model.runs" :key="run.id" :ui="{ body: 'p-4 sm:p-4' }">
                    <div class="grid gap-2">
                        <div class="flex items-start justify-between gap-2">
                            <h4 class="font-semibold leading-tight text-highlighted">{{ run.title }}</h4>
                            <UBadge v-if="run.status !== 'published'" color="warning" variant="subtle" :label="t(`geosimulations.status.${run.status}`)" />
                        </div>
                        <p class="text-xs text-muted">{{ formatSimulatedTime(run.time, locale) }}</p>
                        <UButton class="w-fit" :to="{ name: 'geosimulation-run', params: { runId: run.id } }" :label="t('geosimulations.openRun')" size="sm" />
                    </div>
                </UCard>
            </section>
        </template>
    </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import EditorJsReadonly from "@components/Base/EditorJsReadonly.vue";
import { type SimulationModelDetail, useGeosimulationStore } from "@store/geosimulation";
import { formatSimulatedTime } from "@helpers/simulationFormat";

const props = defineProps<{ modelId: string }>();
const { t, locale } = useI18n();
const geosimulation = useGeosimulationStore();
const model = ref<SimulationModelDetail>();
const loading = ref(false);
const failed = ref(false);

watch(() => props.modelId, async (modelId) => {
    loading.value = true;
    failed.value = false;
    try {
        model.value = await geosimulation.loadModel(modelId);
    } catch {
        failed.value = true;
    } finally {
        loading.value = false;
    }
}, { immediate: true });
</script>

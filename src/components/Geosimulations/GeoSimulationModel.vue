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

            <section v-if="model.runnable" class="start-run">
                <div class="grid gap-0.5">
                    <h3 class="text-sm font-semibold text-highlighted">{{ t("geosimulations.newRun.cta") }}</h3>
                    <p class="text-xs text-muted">{{ t("geosimulations.newRun.ctaHelp") }}</p>
                </div>
                <UButton
                    class="w-fit"
                    icon="i-lucide-play"
                    :to="{ name: 'geosimulation-new-run', params: { modelId: model.id } }"
                    :label="t('geosimulations.newRun.title')"
                />
            </section>

            <section v-if="ownRuns.length > 0" class="grid gap-2">
                <h3 class="text-sm font-semibold text-highlighted">{{ t("geosimulations.myRuns") }}</h3>
                <ul class="grid gap-1">
                    <li v-for="ownRun in ownRuns" :key="ownRun.id" class="flex flex-wrap items-baseline gap-x-2">
                        <ULink class="text-sm text-primary hover:underline" :to="{ name: 'geosimulation-run', params: { runId: ownRun.id } }">
                            {{ ownRun.title }}
                        </ULink>
                        <span class="text-xs text-muted">{{ formatStarted(ownRun.startedAt) }}</span>
                    </li>
                </ul>
            </section>

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

            <section v-if="comparisons.length > 0" class="grid gap-3">
                <h3 class="text-sm font-semibold text-highlighted">{{ t("geosimulations.comparisons") }}</h3>
                <UCard v-for="comparison in comparisons" :key="comparison.id" :ui="{ body: 'p-4 sm:p-4' }">
                    <div class="grid gap-2">
                        <div class="flex items-start justify-between gap-2">
                            <h4 class="font-semibold leading-tight text-highlighted">{{ comparison.title }}</h4>
                            <UBadge v-if="comparison.status !== 'published'" color="warning" variant="subtle" :label="t(`geosimulations.status.${comparison.status}`)" />
                        </div>
                        <p class="text-xs text-muted">
                            {{ t("geosimulations.comparison.versus", { baseline: comparison.baseline.title, candidate: comparison.candidate.title }) }}
                        </p>
                        <UButton
                            class="w-fit"
                            :to="{ name: 'geosimulation-comparison', params: { comparisonId: comparison.id } }"
                            :label="t('geosimulations.comparison.open')"
                            icon="i-lucide-git-compare"
                            size="sm"
                            color="neutral"
                            variant="outline"
                        />
                    </div>
                </UCard>
            </section>
        </template>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import EditorJsReadonly from "@components/Base/EditorJsReadonly.vue";
import { type SimulationModelDetail, useGeosimulationStore } from "@store/geosimulation";
import { formatSimulatedTime } from "@helpers/simulationFormat";
import { myRuns } from "@helpers/simulationMyRuns";

const props = defineProps<{ modelId: string }>();
const { t, locale } = useI18n();
const geosimulation = useGeosimulationStore();
const model = ref<SimulationModelDetail>();
const loading = ref(false);
const failed = ref(false);
const comparisons = computed(() => model.value?.comparisons ?? []);
const ownRuns = computed(() => (model.value ? myRuns(model.value.id) : []));

function formatStarted(iso: string): string {
    return new Intl.DateTimeFormat(locale.value, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

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

<style scoped>
.start-run {
    display: grid;
    gap: 0.6rem;
    padding: 0.75rem 0.85rem;
    border: 1px solid rgb(148 163 184 / 0.25);
    border-radius: 0.5rem;
}
</style>

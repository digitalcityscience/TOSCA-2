<template>
    <div class="grid gap-4">
        <div v-if="geosimulation.loadingModels && geosimulation.models.length === 0" class="grid gap-3">
            <USkeleton v-for="index in 2" :key="index" class="h-40 w-full rounded-lg" />
        </div>

        <UAlert
            v-if="geosimulation.error !== ''"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="t('geosimulations.unavailable')"
            :description="geosimulation.error"
        >
            <template #actions>
                <UButton
                    :label="t('geosimulations.tryAgain')"
                    icon="i-lucide-refresh-cw"
                    color="error"
                    variant="soft"
                    size="sm"
                    :loading="geosimulation.loadingModels"
                    @click="loadModels"
                />
            </template>
        </UAlert>

        <UAlert
            v-if="!geosimulation.loadingModels && geosimulation.models.length === 0 && geosimulation.error === ''"
            color="info"
            variant="subtle"
            icon="i-lucide-route-off"
            :title="t('geosimulations.empty')"
            :description="t('geosimulations.emptyDescription')"
        />

        <UCard v-for="model in geosimulation.models" :key="model.id" :ui="{ body: 'p-4 sm:p-4', footer: 'p-4 sm:p-4' }">
            <div class="grid gap-2">
                <div class="flex items-start justify-between gap-2">
                    <h2 class="text-lg font-semibold leading-tight text-highlighted">{{ model.title }}</h2>
                    <UBadge v-if="model.status !== 'published'" color="warning" variant="subtle" :label="t(`geosimulations.status.${model.status}`)" />
                </div>
                <p class="text-sm leading-relaxed text-toned">{{ model.summary }}</p>
                <UBadge color="neutral" variant="subtle" icon="i-lucide-play" class="w-fit" :label="t('geosimulations.runCount', { count: model.run_count }, model.run_count)" />
            </div>
            <template #footer>
                <UButton :to="{ name: 'geosimulation-model', params: { modelId: model.id } }" :label="t('geosimulations.openModel')" size="sm" />
            </template>
        </UCard>

        <div v-if="geosimulation.nextModelsUrl !== null" class="flex justify-center py-2">
            <UButton icon="i-lucide-plus" :label="t('geosimulations.loadMore')" color="neutral" variant="outline" :loading="geosimulation.loadingModels" @click="loadMore" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useGeosimulationStore } from "@store/geosimulation";

const geosimulation = useGeosimulationStore();
const { t } = useI18n();

onMounted(() => {
    if (geosimulation.models.length === 0) loadModels();
});

function loadModels(): void {
    geosimulation.loadModels().catch(() => {
        // The store logs technical details and exposes user-safe alert copy.
    });
}

function loadMore(): void {
    geosimulation.loadMoreModels().catch(() => {});
}
</script>

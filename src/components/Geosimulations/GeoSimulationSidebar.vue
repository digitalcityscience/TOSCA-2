<template>
    <BaseSlideoverSidebarComponent
        :id="sidebarID"
        side="left"
        :collapsed="route.meta.sidebar !== sidebarID"
        :unmount-on-hide="false"
        width-class="w-[min(38.75rem,calc(100vw-5rem))]"
    >
        <template #header>
            <div class="flex min-w-0 items-center gap-2">
                <UIcon name="i-lucide-route" class="size-4 shrink-0 text-primary" />
                <span class="truncate">{{ t("geosimulations.title") }}</span>
            </div>
        </template>

        <div v-if="backTarget" class="mb-3">
            <UButton
                icon="i-lucide-arrow-left"
                :label="backTarget.label"
                size="sm"
                color="neutral"
                variant="outline"
                :to="backTarget.to"
            />
        </div>

        <RouterView />
    </BaseSlideoverSidebarComponent>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { RouterView, useRoute, type RouteLocationRaw } from "vue-router";
import BaseSlideoverSidebarComponent from "@components/Base/BaseSlideoverSidebarComponent.vue";
import { useGeosimulationStore } from "@store/geosimulation";

const sidebarID = "geosimulations";
const { t } = useI18n();
const route = useRoute();
const geosimulation = useGeosimulationStore();

const backTarget = computed<{ label: string; to: RouteLocationRaw } | undefined>(() => {
    if (route.name === "geosimulation-model") {
        return { label: t("geosimulations.backToModels"), to: { name: "geosimulation-list" } };
    }
    if (route.name === "geosimulation-run") {
        const modelId = geosimulation.selectedRun?.model.id;
        return modelId === undefined
            ? { label: t("geosimulations.backToModels"), to: { name: "geosimulation-list" } }
            : { label: t("geosimulations.backToRuns"), to: { name: "geosimulation-model", params: { modelId } } };
    }
    if (route.name === "geosimulation-comparison") {
        const modelId = geosimulation.selectedComparison?.model.id;
        return modelId === undefined
            ? { label: t("geosimulations.backToModels"), to: { name: "geosimulation-list" } }
            : { label: t("geosimulations.backToRuns"), to: { name: "geosimulation-model", params: { modelId } } };
    }
    return undefined;
});
</script>

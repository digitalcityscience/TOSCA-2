<template>
    <div
        v-if="simulationStore.hasReplay && (simulationStore.loading || simulationStore.playWindow !== undefined)"
        class="geostory-replay-control"
        role="group"
        :aria-label="t('geostories.scenes.replay.label')"
    >
        <template v-if="simulationStore.loading">
            <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin text-muted" aria-hidden="true" />
            <span class="text-xs text-muted">{{ loadingLabel }}</span>
        </template>
        <template v-else-if="simulationStore.playWindow !== undefined">
            <UButton
                :icon="simulationStore.playing ? 'i-lucide-pause' : 'i-lucide-play'"
                :aria-label="simulationStore.playing ? t('geostories.scenes.replay.pause') : t('geostories.scenes.replay.play')"
                color="primary"
                variant="soft"
                size="xs"
                square
                @click="simulationStore.togglePlay()"
            />
            <span class="geostory-replay-clock" aria-live="off">{{ clock }}</span>
            <span class="text-xs text-muted">{{ t("geostories.scenes.replay.rate", { rate: simulationStore.playWindow.rate }) }}</span>
        </template>
    </div>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useGeostorySceneSimulationStore } from "@store/geostorySceneSimulation";
import { formatReplayClock } from "@helpers/simulationFormat";
import { useToast } from "@helpers/toast";

const { t, locale } = useI18n();
const simulationStore = useGeostorySceneSimulationStore();
const toast = useToast();

watch(
    () => simulationStore.loadFailed,
    (failed) => {
        if (!failed) return;
        toast.add({
            severity: "error",
            summary: t("geostories.scenes.replay.failed"),
            life: 5000,
        });
    }
);

const loadingLabel = computed(() =>
    t("geostories.scenes.replay.loading", { mb: (simulationStore.loadedBytes / 1e6).toFixed(1) })
);
const clock = computed(() => {
    const time = simulationStore.simulation?.time;
    if (time === undefined) return "";
    return formatReplayClock(time.start, simulationStore.time, time.timezone, locale.value);
});
</script>

<style scoped>
.geostory-replay-control {
    /* Bottom right, left of the scale bar: the story sidebar covers the map's left side. */
    position: absolute;
    right: 7rem;
    bottom: 2.25rem;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.75rem 0.375rem 0.375rem;
    border-radius: 9999px;
    background: color-mix(in srgb, var(--ui-bg) 92%, transparent);
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.18);
    backdrop-filter: blur(6px);
}

.geostory-replay-clock {
    min-width: 4.8rem;
    font-variant-numeric: tabular-nums;
    font-size: 0.85rem;
    font-weight: 600;
}
</style>

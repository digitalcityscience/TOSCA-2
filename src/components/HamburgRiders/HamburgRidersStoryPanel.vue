<template>
    <section class="grid gap-3" data-testid="riders-story-panel">
        <UAlert
            color="neutral"
            variant="subtle"
            icon="i-lucide-calendar-clock"
            :title="serviceNote"
            data-testid="riders-service-note"
        />
        <p v-if="riders.loadStatus === 'loading'" class="text-sm text-muted" data-testid="riders-loading">
            {{ t("hamburgRiders.story.loading") }}
        </p>
        <UAlert
            v-else-if="riders.loadStatus === 'error'"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="t('hamburgRiders.story.error', { message: riders.loadError ?? '' })"
            data-testid="riders-error"
        >
            <template #actions>
                <UButton size="xs" color="neutral" variant="outline" @click="riders.retryLoad()">
                    {{ t("hamburgRiders.story.retry") }}
                </UButton>
            </template>
        </UAlert>
        <p class="text-sm text-default">{{ running ? t("hamburgRiders.story.hint") : t("hamburgRiders.story.stopped") }}</p>
        <div class="flex flex-wrap gap-2">
            <UButton
                size="sm"
                :color="running ? 'neutral' : 'primary'"
                :variant="running ? 'outline' : 'solid'"
                :icon="running ? 'i-lucide-square' : 'i-lucide-play'"
                data-testid="riders-story-start"
                @click="running ? stop() : start()"
            >{{ running ? t("hamburgRiders.story.stop") : t("hamburgRiders.story.start") }}</UButton>
            <UButton
                v-if="running && !riders.controlsOpen"
                size="sm"
                color="neutral"
                variant="outline"
                icon="i-lucide-panel-right-open"
                data-testid="riders-story-reopen"
                @click="riders.openControls()"
            >{{ t("hamburgRiders.story.reopen") }}</UButton>
            <UButton
                size="sm"
                color="neutral"
                variant="outline"
                icon="i-lucide-locate-fixed"
                data-testid="riders-story-overview"
                @click="flyToOverview"
            >{{ t("hamburgRiders.story.overview") }}</UButton>
        </div>
        <UAccordion
            type="multiple"
            :items="[{ label: t('hamburgRiders.story.explore.title'), icon: 'i-lucide-layers', value: 'explore', slot: 'explore' as const }]"
            :model-value="['explore']"
            :ui="{ label: 'text-sm font-semibold' }"
        >
            <template #explore-body>
                <HamburgRidersExploreSection />
            </template>
        </UAccordion>
    </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { activateHamburgRiders, deactivateHamburgRiders } from "@helpers/hamburgRiders/ridersApi";
import { RIDERS_CAMERA } from "@helpers/hamburgRiders/ridersConfig";
import { standaloneClaim } from "@helpers/hamburgRiders/ridersState";
import HamburgRidersExploreSection from "./HamburgRidersExploreSection.vue";
import { useHamburgRidersStore } from "@store/hamburgRiders";
import { useMapStore } from "@store/map";
import { HAMBURG_RIDERS_STORY_CONSUMER } from "../../config/urbanStories/hamburgRiders";

/**
 * Left-panel body of the standalone HamburgRiders story. Mounted by the Urban Stories sidebar only while the
 * story is selected: mounting claims the full Riders experience (network, S-/U-Bahn vehicles, timeline, dark
 * basemap, controls) as one consumer, and unmounting withdraws exactly that claim.
 */
const { t } = useI18n();
const riders = useHamburgRidersStore();
const mapStore = useMapStore();

const serviceNote = computed(() => (
    riders.dataset === undefined
        ? t("hamburgRiders.story.serviceNote", { date: "…" })
        : t("hamburgRiders.story.serviceNote", { date: riders.dataset.meta.dateLabel })
));

function flyToOverview(): void {
    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const target = { center: RIDERS_CAMERA.center, zoom: RIDERS_CAMERA.zoom, bearing: 0, pitch: 0 };
    if (reduced) mapStore.map?.jumpTo(target);
    else mapStore.map?.flyTo({ ...target, duration: 1500 });
}

const running = computed(() => riders.consumers.includes(HAMBURG_RIDERS_STORY_CONSUMER));

function start(): void {
    const claim = standaloneClaim();
    activateHamburgRiders({
        consumer: HAMBURG_RIDERS_STORY_CONSUMER,
        network: claim.network,
        stops: claim.stops,
        vehicles: claim.vehicleModes,
        timeline: claim.timeline,
        basemap: claim.basemap,
        controls: claim.controls,
    });
    flyToOverview();
}

function stop(): void {
    deactivateHamburgRiders(HAMBURG_RIDERS_STORY_CONSUMER);
}

// Opening the story starts it; the button starts it again after Stop. Leaving the story always stops it.
onMounted(start);
onBeforeUnmount(stop);
</script>

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
                :color="isPlaying ? 'neutral' : 'primary'"
                :variant="isPlaying ? 'outline' : 'solid'"
                :icon="isPlaying ? 'i-lucide-pause' : 'i-lucide-play'"
                data-testid="riders-story-start"
                @click="togglePlay"
            >{{ isPlaying ? t("hamburgRiders.timeline.pause") : t("hamburgRiders.timeline.play") }}</UButton>
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
import { computed, onBeforeUnmount } from "vue";
import { useI18n } from "vue-i18n";
import { activateHamburgRiders, deactivateHamburgRiders } from "@helpers/hamburgRiders/ridersApi";
import { RIDERS_CAMERA } from "@helpers/hamburgRiders/ridersConfig";
import { standaloneClaim } from "@helpers/hamburgRiders/ridersState";
import { reducedMotion, viewInsets } from "@helpers/urbanStoryCamera";
import HamburgRidersExploreSection from "./HamburgRidersExploreSection.vue";
import { useHamburgRidersStore } from "@store/hamburgRiders";
import { useMapStore } from "@store/map";
import { HAMBURG_RIDERS_STORY_CONSUMER } from "../../config/urbanStories/hamburgRiders";

/**
 * Left-panel body of the standalone HamburgRiders story. Mounted by the Urban Stories sidebar only while the
 * story is selected: mounting claims the full Riders experience (network, S-/U-Bahn vehicles, timeline, controls) as one consumer, and unmounting withdraws exactly that claim.
 */
const { t } = useI18n();
const riders = useHamburgRidersStore();
const mapStore = useMapStore();

const serviceNote = computed(() => (
    riders.dataset === undefined
        ? t("hamburgRiders.story.serviceNote", { date: "…" })
        : t("hamburgRiders.story.serviceNote", { date: riders.dataset.meta.dateLabel })
));

let paddedMap: typeof mapStore.map;

function releasePadding(): void {
    try {
        paddedMap?.setPadding({ left: 0, right: 0, top: 0, bottom: 0 });
    } catch {
        // the map may already be gone
    }
    paddedMap = undefined;
}

function flyToOverview(): void {
    const map = mapStore.map;
    if (map === undefined || map === null) return;
    const reduced = reducedMotion();
    const padding = viewInsets(map);
    map.setPadding(padding);
    paddedMap = map;
    const target = { center: RIDERS_CAMERA.center, zoom: RIDERS_CAMERA.zoom, bearing: 0, pitch: 0, padding };
    if (reduced) map.jumpTo(target);
    else map.flyTo({ ...target, duration: 1500 });
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

const isPlaying = computed(() => running.value && riders.playing);

// Nothing is loaded until the first Play, like "Start story" elsewhere; afterwards it pauses and resumes.
function togglePlay(): void {
    if (!running.value) {
        start();
        riders.setPlaying(true);
        return;
    }
    riders.setPlaying(!riders.playing);
}

function stop(): void {
    deactivateHamburgRiders(HAMBURG_RIDERS_STORY_CONSUMER);
    releasePadding();
}

// Opening the story loads nothing; Play loads it. Leaving the story withdraws whatever it claimed.
onBeforeUnmount(stop);
</script>

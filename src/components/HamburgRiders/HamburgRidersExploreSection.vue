<template>
    <section class="grid gap-3" data-testid="riders-explore">
        <p class="text-sm text-muted">{{ t("hamburgRiders.story.explore.hint") }}</p>
        <ul class="grid gap-2">
            <li
                v-for="entry in RIDERS_EXPLORE_ENTRIES"
                :key="entry.key"
                class="flex items-start gap-2 rounded-md border border-muted p-2"
                :data-testid="`riders-explore-${entry.key}`"
            >
                <span class="mt-1 size-2.5 shrink-0 rounded-full" :style="{ background: MODE_STYLE[entry.modes[0]].hex }" aria-hidden="true"></span>
                <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium text-highlighted">{{ localize(entry.title, locale) }}</p>
                    <p class="text-xs text-muted">{{ localize(entry.description, locale) }}</p>
                    <p v-if="isAdded(entry)" class="text-xs text-primary">{{ t("hamburgRiders.story.explore.added") }}</p>
                </div>
                <UButton
                    size="xs"
                    color="neutral"
                    variant="outline"
                    :icon="isAdded(entry) ? 'i-lucide-minus' : 'i-lucide-plus'"
                    :data-testid="`riders-explore-toggle-${entry.key}`"
                    @click="toggle(entry)"
                >{{ isAdded(entry) ? t("hamburgRiders.story.explore.remove") : t("hamburgRiders.story.explore.add") }}</UButton>
            </li>
        </ul>
    </section>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { MODE_STYLE } from "@helpers/hamburgRiders/ridersConfig";
import {
    isExploreEntryAdded,
    RIDERS_EXPLORE_CONSUMER,
    RIDERS_EXPLORE_ENTRIES,
    withExploreEntry,
    type RidersExploreEntry,
} from "@helpers/hamburgRiders/ridersExplore";
import { emptyClaim } from "@helpers/hamburgRiders/ridersState";
import { useHamburgRidersStore } from "@store/hamburgRiders";
import { localize } from "../../config/urbanStories";

/**
 * Explore Data of the HamburgRiders story. Entries are claimed by their own consumer, so they stay on the map when
 * the story is stopped or closed, and the story's own claim never removes them.
 */
const { t, locale } = useI18n();
const riders = useHamburgRidersStore();

function isAdded(entry: RidersExploreEntry): boolean {
    return isExploreEntryAdded(riders.claims[RIDERS_EXPLORE_CONSUMER], entry);
}

function toggle(entry: RidersExploreEntry): void {
    const next = withExploreEntry(riders.claims[RIDERS_EXPLORE_CONSUMER] ?? emptyClaim(), entry, !isAdded(entry));
    const empty = next.network.length + next.stops.length + next.vehicleModes.length === 0;
    if (empty) riders.release(RIDERS_EXPLORE_CONSUMER);
    else riders.updateClaim(RIDERS_EXPLORE_CONSUMER, () => next);
}
</script>

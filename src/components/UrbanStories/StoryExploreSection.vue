<template>
    <div class="grid gap-3" data-testid="urban-story-explore">
        <div class="flex items-center justify-between gap-2">
            <p class="text-xs text-muted">
                {{ t("urbanStories.explore.datasetCount", { count: props.story.explore.length }) }}
            </p>
            <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-refresh-cw"
                data-testid="refresh-status"
                @click="urbanStories.refreshStatus(props.story.key)"
            >
                {{ t("urbanStories.explore.refresh") }}
            </UButton>
        </div>

        <!--
            One flat, keyed list: when a chapter moves entries between "related" and their normal group,
            Vue moves the existing entry components instead of re-creating them, so an open settings
            panel, a picked metric or a running add survive every reorder.
        -->
        <ul class="grid gap-2" data-testid="explore-list">
            <template v-for="row in rows" :key="row.key">
                <li
                    v-if="row.type === 'heading'"
                    role="presentation"
                    :data-testid="row.testId"
                    :data-heading="row.section"
                >
                    <h4
                        class="text-xs font-semibold uppercase tracking-wide"
                        :class="row.section === 'related' ? 'text-primary' : 'text-muted'"
                    >
                        {{ row.text }}
                    </h4>
                </li>
                <ExploreLayerEntry
                    v-else
                    :story-key="props.story.key"
                    :entry="row.entry"
                    :in-chapter="row.section === 'related'"
                    :data-explore-section="row.section"
                />
            </template>
        </ul>

        <section class="grid gap-2" data-testid="added-layers">
            <h4 class="text-xs font-semibold uppercase tracking-wide text-muted">
                {{ t("urbanStories.explore.addedTitle") }}
            </h4>
            <p v-if="urbanStories.trackedLayers.length === 0" class="text-xs text-muted">
                {{ t("urbanStories.explore.addedEmpty") }}
            </p>
            <ul v-else class="grid gap-1">
                <li
                    v-for="tracked in urbanStories.trackedLayers"
                    :key="tracked.runtimeId"
                    class="flex items-center justify-between gap-2 rounded-md border border-muted px-3 py-1.5"
                    :data-runtime-id="tracked.runtimeId"
                >
                    <div class="min-w-0">
                        <p class="truncate text-sm text-highlighted">{{ localize(tracked.entry.title, locale) }}</p>
                        <p class="truncate text-xs text-muted">
                            {{ t("urbanStories.explore.addedFrom", { story: storyTitle(tracked.storyKey) }) }}
                        </p>
                    </div>
                    <UButton
                        size="xs"
                        color="error"
                        variant="ghost"
                        icon="i-lucide-trash-2"
                        :aria-label="t('urbanStories.explore.remove')"
                        data-testid="remove-added"
                        @click="urbanStories.removeEntry(tracked.storyKey, tracked.entry.key)"
                    />
                </li>
            </ul>
        </section>
    </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useUrbanStoriesStore } from "@store/urbanStories";
import {
    getStoryConfig,
    localize,
    type ExploreEntry,
    type ExploreGroup,
    type UrbanStoryConfig,
    type UrbanStoryKey,
} from "../../config/urbanStories";
import ExploreLayerEntry from "./ExploreLayerEntry.vue";

interface Props {
    story: UrbanStoryConfig
}

const props = defineProps<Props>();
const { t, locale } = useI18n();
const urbanStories = useUrbanStoriesStore();

const GROUP_ORDER: readonly ExploreGroup[] = ["building", "street", "admin", "poi", "green"];

// While a story plays, the active chapter's entries move to the top. Nothing is hidden (decision D3).
const prioritised = computed(() => urbanStories.prioritisedEntries(props.story));

type ExploreRow =
    | { type: "heading"; key: string; section: string; text: string; testId?: string }
    | { type: "entry"; key: string; section: string; entry: ExploreEntry };

/** Headings and entries in display order. Entry keys never change with the order, only their position. */
const rows = computed<ExploreRow[]>(() => {
    const result: ExploreRow[] = [];
    const { chapter, related, others } = prioritised.value;
    const entryRow = (entry: ExploreEntry, section: string): ExploreRow => (
        { type: "entry", key: `${props.story.key}/${entry.key}`, section, entry }
    );
    if (chapter !== undefined && related.length > 0) {
        result.push({
            type: "heading",
            key: "heading:related",
            section: "related",
            testId: "related-entries",
            text: t("urbanStories.explore.relatedTitle", { chapter: localize(chapter.title, locale.value) }),
        });
        related.forEach((entry) => result.push(entryRow(entry, "related")));
    }
    if (related.length > 0) {
        result.push({ type: "heading", key: "heading:others", section: "others", testId: "other-entries-title", text: t("urbanStories.explore.othersTitle") });
    }
    for (const group of GROUP_ORDER) {
        const entries = others.filter((entry) => entry.group === group);
        if (entries.length === 0) continue;
        result.push({ type: "heading", key: `heading:group:${group}`, section: `group:${group}`, text: t(`urbanStories.explore.groups.${group}`) });
        entries.forEach((entry) => result.push(entryRow(entry, `group:${group}`)));
    }
    return result;
});

function storyTitle(key: UrbanStoryKey): string {
    const story = getStoryConfig(key);
    return story === undefined ? key : localize(story.title, locale.value);
}
</script>

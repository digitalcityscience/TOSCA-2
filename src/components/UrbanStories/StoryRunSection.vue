<template>
    <div class="grid gap-3" data-testid="urban-story-run" :data-run-state="urbanStories.runState">
        <template v-if="urbanStories.runState === 'idle'">
            <p class="text-xs text-muted">{{ t("urbanStories.run.startHint") }}</p>
            <div>
                <UButton size="sm" icon="i-lucide-play" data-testid="run-start" @click="start">
                    {{ t("urbanStories.run.start") }}
                </UButton>
            </div>
        </template>

        <div
            v-else-if="urbanStories.runState === 'loading'"
            class="flex items-center gap-2 text-sm text-muted"
            role="status"
            data-testid="run-loading"
        >
            <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" aria-hidden="true" />
            {{ t("urbanStories.run.starting") }}
        </div>

        <template v-else-if="urbanStories.runState === 'error'">
            <UAlert
                color="warning"
                variant="subtle"
                icon="i-lucide-circle-alert"
                :title="t(`urbanStories.run.issues.${issueKey}Title`)"
                :description="t(`urbanStories.run.issues.${issueKey}`)"
                data-testid="run-issue"
                :data-issue="urbanStories.runIssue"
            />
            <div>
                <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-refresh-cw" data-testid="run-retry" @click="start">
                    {{ t("urbanStories.run.retry") }}
                </UButton>
            </div>
        </template>

        <template v-else>
            <GeoStorySceneProgress v-if="urbanStories.runMode === 'geostory'" @select="urbanStories.goToScene" />
            <nav v-else-if="story.chapters.length > 1" class="grid gap-1.5" :aria-label="t('geostories.scenes.navLabel')" data-testid="chapter-progress">
                <ol class="flex flex-wrap gap-1.5">
                    <li v-for="(chapter, index) in story.chapters" :key="chapter.chapterKey">
                        <UButton
                            size="xs"
                            :color="index === urbanStories.currentChapterIndex ? 'primary' : 'neutral'"
                            :variant="index === urbanStories.currentChapterIndex ? 'solid' : 'outline'"
                            :aria-current="index === urbanStories.currentChapterIndex ? 'step' : undefined"
                            :label="`${index + 1}. ${localize(chapter.title, locale)}`"
                            class="max-w-48"
                            :ui="{ label: 'truncate' }"
                            :data-testid="`chapter-jump-${chapter.chapterKey}`"
                            @click="urbanStories.goToChapter(index)"
                        />
                    </li>
                </ol>
            </nav>

            <StoryChapter
                v-if="urbanStories.activeChapter !== undefined"
                :title="localize(urbanStories.activeChapter.title, locale)"
                :blocks="urbanStories.activeChapterBlocks"
                :caption="chapterCaption"
            />
            <StoryChapter
                v-else
                :title="sceneStore.activeScene?.title ?? t('urbanStories.run.chapterTitle')"
                :blocks="urbanStories.activeChapterBlocks"
                :caption="sceneStore.activeScene?.caption.trim() ?? ''"
            />

            <div class="flex flex-wrap items-center gap-2">
                <UButton
                    size="xs"
                    color="neutral"
                    variant="soft"
                    icon="i-lucide-chevron-left"
                    :disabled="!hasPrevious"
                    data-testid="run-previous"
                    @click="urbanStories.stepScene(-1)"
                >
                    {{ t("urbanStories.run.previous") }}
                </UButton>
                <span class="text-xs text-muted" data-testid="run-position">
                    {{ t("urbanStories.run.chapterOf", { current: position, total: urbanStories.chapterCount }) }}
                </span>
                <UButton
                    size="xs"
                    color="neutral"
                    variant="soft"
                    trailing-icon="i-lucide-chevron-right"
                    :disabled="!hasNext"
                    data-testid="run-next"
                    @click="urbanStories.stepScene(1)"
                >
                    {{ t("urbanStories.run.next") }}
                </UButton>
            </div>

            <FifteenMinuteControls v-if="showFifteenMinuteControls" />
            <ul v-if="['walkability-safety', 'building-walking'].includes(props.story.key) && urbanStories.runMode === 'chapters'" class="grid gap-3" data-testid="walkability-controls">
                <ExploreLayerEntry
                    v-for="entry in walkEntries"
                    :key="entry.key"
                    :story-key="props.story.key"
                    :entry="entry"
                    in-chapter
                />
            </ul>

            <UAlert
                v-if="urbanStories.runLayerWarnings.length > 0"
                color="warning"
                variant="subtle"
                icon="i-lucide-triangle-alert"
                :title="t('urbanStories.run.layerWarningTitle')"
                :description="t('urbanStories.run.layerWarning', { layers: urbanStories.runLayerWarnings.join(', ') })"
                data-testid="run-layer-warning"
            />

            <p v-if="relatedCount > 0" class="flex flex-wrap items-center gap-2 text-xs text-muted" data-testid="run-related-hint">
                {{ t("urbanStories.run.relatedHint", { count: relatedCount }) }}
                <UButton size="xs" color="neutral" variant="link" data-testid="run-show-related" @click="emit('show-explore')">
                    {{ t("urbanStories.run.showRelated") }}
                </UButton>
            </p>

            <label v-if="urbanStories.runMode === 'geostory'" class="flex items-center gap-2 text-xs" :title="t('urbanStories.run.focusHelp')">
                <USwitch
                    :model-value="urbanStories.focusEnabled"
                    size="sm"
                    data-testid="run-focus"
                    :aria-label="t('urbanStories.run.focusLabel')"
                    @update:model-value="urbanStories.setFocusEnabled(Boolean($event))"
                />
                <span>{{ t("urbanStories.run.focusLabel") }}</span>
            </label>

            <div class="flex flex-wrap items-center gap-2">
                <UButton size="xs" color="neutral" variant="outline" icon="i-lucide-layers" data-testid="run-back" @click="backToExplore">
                    {{ t("urbanStories.run.backToExplore") }}
                </UButton>
                <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-map" data-testid="run-overview" @click="overview">
                    {{ t("urbanStories.run.overview") }}
                </UButton>
            </div>
        </template>
    </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import GeoStorySceneProgress from "@components/Geostories/GeoStorySceneProgress.vue";
import { useGeostorySceneStore } from "@store/geostoryScenes";
import { useUrbanStoriesStore } from "@store/urbanStories";
import { localize, type UrbanStoryConfig } from "../../config/urbanStories";
import FifteenMinuteControls from "./FifteenMinuteControls.vue";
import StoryChapter from "./StoryChapter.vue";
import ExploreLayerEntry from "./ExploreLayerEntry.vue";

interface Props {
    story: UrbanStoryConfig
}

const props = defineProps<Props>();
const emit = defineEmits<{ "show-explore": [] }>();
const { t, locale } = useI18n();
const urbanStories = useUrbanStoriesStore();
const sceneStore = useGeostorySceneStore();
const walkEntries = computed(() => props.story.explore.filter((entry) => urbanStories.activeChapter?.relatedExploreEntries.includes(entry.key)));

const issueKey = computed(() => {
    const issue = urbanStories.runIssue;
    // `not-configured` after an attempt reads like "unpublished": there is no published story.
    return issue === undefined || issue === "not-configured" ? "unpublished" : issue === "fetch-failed" ? "fetchFailed" : issue === "map-not-ready" ? "mapNotReady" : issue;
});
const position = computed(() => Math.max(urbanStories.currentChapterIndex, 0) + 1);
const hasPrevious = computed(() => urbanStories.currentChapterIndex > 0);
const hasNext = computed(() => urbanStories.currentChapterIndex >= 0 && urbanStories.currentChapterIndex < urbanStories.chapterCount - 1);
const chapterCaption = computed(() => {
    const chapter = urbanStories.activeChapter;
    if (urbanStories.runMode === "chapters") return chapter?.narrative === undefined ? "" : localize(chapter.narrative, locale.value);
    return sceneStore.activeScene?.caption.trim() ?? "";
});
/** Chapters with an `interaction` get the map controls of their story (today: 15-Minute City). */
const showFifteenMinuteControls = computed(() => (
    props.story.key === "fifteen-minute" && urbanStories.activeChapter?.interaction !== undefined
));
const relatedCount = computed(() => urbanStories.prioritisedEntries(props.story).related.length);

async function start(): Promise<void> {
    await urbanStories.startStory(props.story.key);
}

async function backToExplore(): Promise<void> {
    await urbanStories.endRun({ camera: "previous" });
    emit("show-explore");
}

async function overview(): Promise<void> {
    await urbanStories.endRun({ camera: "overview" });
}
</script>

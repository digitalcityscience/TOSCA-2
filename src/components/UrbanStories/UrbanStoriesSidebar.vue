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
                <UIcon name="i-lucide-layers-3" class="size-4 shrink-0 text-primary" />
                <span class="truncate">{{ t("urbanStories.title") }}</span>
            </div>
        </template>

        <div class="grid gap-4">
            <UrbanStorySelector
                :stories="URBAN_STORIES"
                :active-key="urbanStories.activeStoryKey"
                @select="openStory"
            />

            <p v-if="story === undefined" class="text-sm text-muted" data-testid="urban-stories-empty">
                {{ t("urbanStories.empty") }}
            </p>

            <template v-else>
                <UrbanStoryIntro :story="story" :compact="story.key === 'green-spaces'" />
                <WalkabilityBuildingPanel v-if="story.key === 'building-walking'" />
                <HamburgRidersStoryPanel v-if="story.key === 'hamburg-riders'" />

                <UAccordion
                    v-if="story.key !== 'hamburg-riders'"
                    type="multiple"
                    :items="sections"
                    :model-value="openSections"
                    @update:model-value="openSections = $event as string[]"
                    :ui="{ label: 'text-sm font-semibold' }"
                >
                    <template #run-body>
                        <StoryRunSection :story="story" @show-explore="showExplore" />
                    </template>

                    <template #explore-body>
                        <StoryExploreSection :story="story" />
                    </template>
                </UAccordion>
            </template>
        </div>
    </BaseSlideoverSidebarComponent>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import BaseSlideoverSidebarComponent from "@components/Base/BaseSlideoverSidebarComponent.vue";
import { useUrbanStoriesStore } from "@store/urbanStories";
import { reportDeveloperError } from "@helpers/userFacingError";
import { isUrbanStoryKey, URBAN_STORIES, type UrbanStoryKey } from "../../config/urbanStories";
import { URBAN_STORIES_ROUTE_NAME } from "../../router/urbanStoriesRoute";
import HamburgRidersStoryPanel from "@components/HamburgRiders/HamburgRidersStoryPanel.vue";
import WalkabilityBuildingPanel from "./WalkabilityBuildingPanel.vue";
import StoryExploreSection from "./StoryExploreSection.vue";
import StoryRunSection from "./StoryRunSection.vue";
import UrbanStoryIntro from "./UrbanStoryIntro.vue";
import UrbanStorySelector from "./UrbanStorySelector.vue";

const sidebarID = "urbanStories";
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const urbanStories = useUrbanStoriesStore();

const story = computed(() => urbanStories.activeStory);
const sections = computed(() => [
    { label: t("urbanStories.sections.run"), icon: "i-lucide-route", value: "run", slot: "run" as const },
    { label: t("urbanStories.sections.explore"), icon: "i-lucide-layers", value: "explore", slot: "explore" as const },
]);

const openSections = ref<string[]>(["run"]);

function showExplore(): void {
    if (!openSections.value.includes("explore")) openSections.value = [...openSections.value, "explore"];
}

// Leaving the panel (or closing it) ends a running story: no orphan scene group, snapshot restored.
// Another map feature resets the map right after this guard; ending first keeps state consistent.
onBeforeRouteLeave(async () => {
    await urbanStories.endRun({ camera: "none" });
});
onBeforeUnmount(() => {
    void urbanStories.endRun({ camera: "none" });
});

// The route is the source of truth for the selection: deep links, clicks and history all land here.
watch(() => route.params.storyKey, (storyKey) => {
    urbanStories.selectStory(isUrbanStoryKey(storyKey) ? storyKey : undefined);
}, { immediate: true });

async function openStory(key: UrbanStoryKey): Promise<void> {
    if (key === urbanStories.activeStoryKey) return;
    try {
        await router.push({ name: URBAN_STORIES_ROUTE_NAME, params: { storyKey: key } });
    } catch (error) {
        reportDeveloperError("Opening an Urban Story", error);
    }
}
</script>

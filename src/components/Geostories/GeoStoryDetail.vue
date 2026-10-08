<template>
    <div class="grid gap-4">
        <div v-if="geostory.loadingDetail && story === undefined" class="grid gap-3">
            <USkeleton class="h-72 w-full rounded-lg" />
            <USkeleton class="h-48 w-full rounded-lg" />
        </div>

        <UAlert
            v-if="errorMessage !== ''"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            title="This GeoStory couldn't be opened"
            :description="errorMessage"
        >
            <template #actions>
                <UButton
                    label="Try again"
                    icon="i-lucide-refresh-cw"
                    color="error"
                    variant="soft"
                    size="sm"
                    :loading="geostory.loadingDetail"
                    @click="retryLoad"
                />
            </template>
        </UAlert>

        <UCard
            v-if="story !== undefined"
            class="overflow-hidden"
            :ui="{ header: 'p-0 sm:p-0', body: 'p-4 sm:p-5' }"
        >
            <template #header>
                <div v-if="heroImageUrl !== undefined" class="geostory-hero-shell">
                    <USkeleton
                        v-if="heroImageLoading"
                        class="absolute inset-0 z-10 h-full w-full rounded-none"
                    />
                    <img
                        :src="heroImageUrl"
                        :alt="story.hero_image_alt"
                        class="geostory-hero-image"
                        decoding="async"
                        fetchpriority="high"
                        @load="heroImageLoading = false"
                        @error="heroImageLoading = false"
                    >
                </div>
            </template>

            <article class="grid gap-5">
                <header class="grid gap-3">
                    <h1 class="text-2xl font-bold leading-tight text-highlighted">{{ story.title }}</h1>
                    <div class="flex flex-wrap gap-1.5">
                        <UBadge color="neutral" variant="subtle" icon="i-lucide-calendar">
                            {{ createdAtLabel }}
                        </UBadge>
                        <UBadge
                            v-if="sceneCount > 0"
                            color="info"
                            variant="subtle"
                            icon="i-lucide-map"
                        >
                            {{ sceneCountLabel }}
                        </UBadge>
                    </div>
                    <p v-if="story.summary !== ''" class="text-sm leading-relaxed text-toned">
                        {{ story.summary }}
                    </p>
                    <GeoStorySceneProgress @select="selectScene" />
                </header>

                <USeparator />

                <EditorJsReadonly
                    v-if="storyContent.blocks.length > 0"
                    :data="storyContent"
                    map-scene-anchors
                    @rendered="attachSceneScroll"
                />
                <UAlert
                    v-else
                    color="info"
                    variant="subtle"
                    icon="i-lucide-file-text"
                    title="No story content"
                    description="This story does not have content yet."
                />

                <section v-if="story.about_author?.trim()" class="grid gap-2 border-t border-default pt-4">
                    <h2 class="text-base font-semibold text-highlighted">{{ t("geostories.detail.aboutAuthorTitle") }}</h2>
                    <p class="whitespace-pre-line text-sm leading-relaxed text-toned">
                        {{ story.about_author }}
                    </p>
                </section>

                <section v-if="story.feature_links.length > 0" class="grid gap-2">
                    <h2 class="text-base font-semibold text-highlighted">Related content</h2>
                    <div class="flex flex-wrap gap-1.5">
                        <UBadge
                            v-for="link in story.feature_links"
                            :key="link.id"
                            color="info"
                            variant="outline"
                        >
                            {{ link.target_type }}: {{ link.link_type }}
                        </UBadge>
                    </div>
                </section>
            </article>
        </UCard>
    </div>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    type GeoStoryDetail,
    resolveBackendMediaUrl,
    useGeostoryStore,
} from "@store/geostory";
import { useGeostorySceneStore } from "@store/geostoryScenes";
import { useMapStore } from "@store/map";
import { useToast } from "@helpers/toast";
import {
    reportDeveloperError,
    serviceUnavailableMessage,
} from "@helpers/userFacingError";
import EditorJsReadonly from "@components/Base/EditorJsReadonly.vue";
import GeoStorySceneProgress from "@components/Geostories/GeoStorySceneProgress.vue";
import { slideoverScrollContainerKey } from "@helpers/slideoverSidebarRegistry";
import {
    createSceneScrollSync,
    findScrollParent,
    scrollTopForAnchor,
} from "@helpers/sceneScrollSync";
import { SCENE_ANCHOR_CLASS } from "@helpers/editorJsMapSceneAnchor";

const props = defineProps<{
    storyId: string
}>();

const geostory = useGeostoryStore();
const { locale, t } = useI18n();
const mapStore = useMapStore();
const sceneStore = useGeostorySceneStore();
const toast = useToast();
const errorMessage = ref("");
const heroImageLoading = ref(false);

const story = computed<GeoStoryDetail | undefined>(() => {
    return geostory.selectedStory?.id === props.storyId
        ? geostory.selectedStory
        : undefined;
});
const heroImageUrl = computed(() => resolveBackendMediaUrl(story.value?.hero_image_url));
const storyContent = computed(() => ({
    ...story.value?.content,
    blocks: story.value?.content?.blocks ?? [],
}));
const sceneCount = computed(() => {
    return sceneStore.story?.id === story.value?.id ? sceneStore.scenes.length : 0;
});
const sceneCountLabel = computed(() => {
    const count = sceneCount.value;
    const key = count === 1
        ? "geostories.detail.sceneCount"
        : "geostories.detail.sceneCountPlural";

    return t(key, { count });
});
const createdAtLabel = computed(() => {
    if (story.value === undefined) {
        return "";
    }
    const date = new Date(story.value.created_at);
    return Number.isNaN(date.getTime())
        ? story.value.created_at
        : new Intl.DateTimeFormat(locale.value, { dateStyle: "medium" }).format(date);
});

watch(
    () => props.storyId,
    (storyId) => {
        loadStory(storyId).catch(handleLoadError);
    },
    { immediate: true }
);

watch(heroImageUrl, (url) => {
    heroImageLoading.value = url !== undefined;
}, { immediate: true });

async function loadStory(storyId: string): Promise<void> {
    errorMessage.value = "";
    const detail = await geostory.getStoryDetail(storyId);
    if (detail.id !== props.storyId) return; // a newer story was opened meanwhile
    await mapStore.resetMapData(false);
    await sceneStore.openStory(detail, {
        onLayerError: (error, sceneLayer) => {
            const layerName = `${sceneLayer.layer.workspace.name}:${sceneLayer.layer.name}`;
            reportDeveloperError(`Loading GeoStory map layer details ${layerName}`, error);
            toast.add({
                severity: "warning",
                summary: "Some map details are unavailable",
                detail: "The map is shown, but popups and tables are unavailable for one of its layers.",
                life: 5000,
            });
        },
    });
}

// Scrolling the story switches the map to the scene of the last anchor above
// the middle of the sidebar (see createSceneScrollSync).
const sidebarScrollContainer = inject(slideoverScrollContainerKey, undefined);
const sceneScroll = createSceneScrollSync({
    onActivate: (sceneId) => {
        sceneStore.showScene(sceneId).catch((error: unknown) => {
            reportDeveloperError(`Switching GeoStory scene ${sceneId}`, error);
        });
    },
    getFirstSceneId: () => sceneStore.scenes[0]?.id,
    getTargetSceneId: () => sceneStore.targetSceneId,
    isKnownScene: (sceneId) => sceneStore.scenes.some((scene) => scene.id === sceneId),
});

let scrollRoot: HTMLElement | undefined;
let storyContentElement: HTMLElement | undefined;

function attachSceneScroll(content: HTMLElement): void {
    const root = sidebarScrollContainer?.value ?? findScrollParent(content);
    storyContentElement = content;
    scrollRoot = root;
    if (root !== undefined) sceneScroll.attach(root, content);
}

/**
 * Scene picked in the progress list: scroll to where the story shows it (its
 * anchor just past the trigger line; the top for the first scene) and switch the
 * map right away. Scenes without an anchor only switch the map.
 */
function selectScene(sceneId: string): void {
    const isFirst = sceneStore.scenes[0]?.id === sceneId;
    const anchor = storyContentElement?.querySelector<HTMLElement>(
        `.${SCENE_ANCHOR_CLASS}[data-scene-id="${CSS.escape(sceneId)}"]`
    );
    if (scrollRoot !== undefined && (isFirst || anchor != null)) {
        const root = scrollRoot;
        const top = isFirst || anchor == null
            ? 0
            : scrollTopForAnchor(
                anchor.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop,
                root.clientHeight,
                root.scrollHeight
            );
        const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
        root.scrollTo({ top, behavior: reducedMotion ? "auto" : "smooth" });
    }
    sceneStore.showScene(sceneId).catch((error: unknown) => {
        reportDeveloperError(`Switching GeoStory scene ${sceneId}`, error);
    });
}

// Content can render before the story's scenes are open; re-check once they are.
watch(() => sceneStore.story, () => {
    sceneScroll.refresh();
});

// Stop scene switching when the story view goes away; the layers stay until the
// reader returns to the story list (which resets the map).
onBeforeUnmount(() => {
    sceneScroll.detach();
    void sceneStore.closeStory();
});

function retryLoad(): void {
    loadStory(props.storyId).catch(handleLoadError);
}

function handleLoadError(error: unknown): void {
    errorMessage.value = serviceUnavailableMessage("GeoStory");
    reportDeveloperError(`Opening GeoStory ${props.storyId}`, error);
}
</script>

<style scoped>
.geostory-hero-shell {
    position: relative;
    height: min(21rem, 38vh);
    overflow: hidden;
    background: var(--ui-bg-muted);
}
.geostory-hero-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
}
</style>

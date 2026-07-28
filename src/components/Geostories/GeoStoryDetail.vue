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
                            v-if="renderableLayerCount > 0"
                            color="info"
                            variant="subtle"
                            icon="i-lucide-layers"
                        >
                            {{ renderableLayerCount }}
                            {{ renderableLayerCount === 1 ? "map layer" : "map layers" }}
                        </UBadge>
                    </div>
                    <p v-if="story.summary !== ''" class="text-sm leading-relaxed text-toned">
                        {{ story.summary }}
                    </p>
                </header>

                <USeparator />

                <EditorJsReadonly
                    v-if="storyContent.blocks.length > 0"
                    :data="storyContent"
                />
                <UAlert
                    v-else
                    color="info"
                    variant="subtle"
                    icon="i-lucide-file-text"
                    title="No narrative content"
                    description="This story does not have narrative content yet."
                />

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
import { computed, ref, watch } from "vue";
import {
    type GeoStoryDetail,
    resolveBackendMediaUrl,
    useGeostoryStore,
} from "@store/geostory";
import { useGeoserverStore } from "@store/geoserver";
import { useMapStore } from "@store/map";
import { loadGeostoryLayersOnMap } from "@helpers/geostoryLayers";
import { useToast } from "@helpers/toast";
import {
    reportDeveloperError,
    serviceUnavailableMessage,
} from "@helpers/userFacingError";
import EditorJsReadonly from "@components/Base/EditorJsReadonly.vue";

const props = defineProps<{
    storyId: string
}>();

const geostory = useGeostoryStore();
const geoserver = useGeoserverStore();
const mapStore = useMapStore();
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
    ...story.value?.context?.content,
    blocks: story.value?.context?.content?.blocks ?? [],
}));
const renderableLayerCount = computed(() => {
    return story.value?.layers.filter((item) => {
        return item.layer.is_public && item.layer.publishing_state === "PUBLISHED";
    }).length ?? 0;
});
const createdAtLabel = computed(() => {
    if (story.value === undefined) {
        return "";
    }
    const date = new Date(story.value.created_at);
    return Number.isNaN(date.getTime())
        ? story.value.created_at
        : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
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
    await loadGeostoryLayersOnMap(detail, geoserver, mapStore, {
        onLayerError: (error, layer) => {
            const layerName = `${layer.layer.workspace.name}:${layer.layer.name}`;
            reportDeveloperError(`Loading GeoStory map layer ${layerName}`, error);
            toast.add({
                severity: "warning",
                summary: "Some map content is unavailable",
                detail: "The story opened, but one of its map layers could not be shown.",
                life: 5000,
            });
        },
    });
}

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

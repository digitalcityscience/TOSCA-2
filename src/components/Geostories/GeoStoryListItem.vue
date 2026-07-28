<template>
    <UCard
        class="overflow-hidden transition hover:ring-primary/30"
        :ui="{
            header: 'p-0 sm:p-0',
            body: 'p-4 sm:p-4',
            footer: 'p-4 pt-0 sm:p-4 sm:pt-0',
        }"
    >
        <template #header>
            <div v-if="heroImageUrl !== undefined" class="story-card-image-shell">
                <USkeleton v-if="heroImageLoading" class="absolute inset-0 z-10 h-full w-full rounded-none" />
                <img
                    :src="heroImageUrl"
                    :alt="story.hero_image_alt"
                    class="story-card-image"
                    loading="lazy"
                    decoding="async"
                    @load="heroImageLoading = false"
                    @error="heroImageLoading = false"
                >
            </div>
            <div v-else class="story-card-placeholder">
                <UIcon name="i-lucide-book-open" class="size-12 text-primary" />
            </div>
        </template>

        <div class="grid gap-3">
            <div class="grid gap-2">
                <h2 class="text-lg font-semibold leading-tight text-highlighted">{{ story.title }}</h2>
                <UBadge color="neutral" variant="subtle" icon="i-lucide-calendar">
                    {{ createdAtLabel }}
                </UBadge>
            </div>
            <p class="text-sm leading-relaxed text-toned">{{ story.summary }}</p>
        </div>

        <template #footer>
            <UButton
                :to="{ name: 'geostory-detail', params: { storyId: story.id } }"
                icon="i-lucide-book-open"
                trailing-icon="i-lucide-arrow-right"
                label="Open story"
                size="sm"
            />
        </template>
    </UCard>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
    type GeoStoryListItem,
    resolveBackendMediaUrl,
} from "@store/geostory";

const props = defineProps<{
    story: GeoStoryListItem
}>();

const heroImageUrl = computed(() => resolveBackendMediaUrl(props.story.hero_image_url));
const heroImageLoading = ref(heroImageUrl.value !== undefined);
const createdAtLabel = computed(() => {
    const date = new Date(props.story.created_at);
    return Number.isNaN(date.getTime())
        ? props.story.created_at
        : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
});

watch(heroImageUrl, (url) => {
    heroImageLoading.value = url !== undefined;
});
</script>

<style scoped>
.story-card-image-shell,
.story-card-placeholder {
    position: relative;
    height: 13rem;
    overflow: hidden;
    background: var(--ui-bg-muted);
}
.story-card-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
}
.story-card-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
}
</style>

<template>
    <Card class="story-card overflow-hidden">
        <template #header>
            <div v-if="heroImageUrl" class="story-card-image-shell">
                <Skeleton v-if="heroImageLoading" class="story-card-image-skeleton" />
                <Image
                    :src="heroImageUrl"
                    :alt="story.hero_image_alt"
                    loading="lazy"
                    decoding="async"
                    fetchpriority="low"
                    image-class="story-card-image"
                    @load="heroImageLoading = false"
                    @error="heroImageLoading = false"
                />
            </div>
            <div v-else class="story-card-placeholder">
                <span class="material-icons-outlined">auto_stories</span>
            </div>
        </template>
        <template #title>
            <h2 class="text-xl font-semibold leading-tight">{{ story.title }}</h2>
        </template>
        <template #subtitle>
            <Tag :value="createdAtLabel" severity="secondary" />
        </template>
        <template #content>
            <p class="text-sm leading-relaxed text-surface-700">{{ story.summary }}</p>
        </template>
        <template #footer>
            <RouterLink :to="{ name: 'geostory-detail', params: { storyId: story.id } }">
                <Button icon="pi pi-book" label="Open Story" size="small" />
            </RouterLink>
        </template>
    </Card>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import Button from "primevue/button";
import Card from "primevue/card";
import Image from "primevue/image";
import Skeleton from "primevue/skeleton";
import Tag from "primevue/tag";
import {
    type GeoStoryListItem,
    resolveBackendMediaUrl,
} from "@store/geostory";

const props = defineProps<{
    story: GeoStoryListItem
}>();

const heroImageUrl = computed(() => {
    return resolveBackendMediaUrl(props.story.hero_image_url);
});
const heroImageLoading = ref(heroImageUrl.value !== undefined);

watch(heroImageUrl, (url) => {
    heroImageLoading.value = url !== undefined;
});

const createdAtLabel = computed(() => {
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
    }).format(new Date(props.story.created_at));
});
</script>

<style scoped>
.story-card :deep(.p-card-header) {
    line-height: 0;
}

.story-card-image-shell {
    position: relative;
    height: 210px;
    overflow: hidden;
    background: var(--surface-100);
}

.story-card-image-skeleton {
    position: absolute;
    inset: 0;
    width: 100% !important;
    height: 100% !important;
    border-radius: 0;
    z-index: 1;
}

.story-card :deep(.story-card-image) {
    width: 100%;
    height: 210px;
    object-fit: cover;
}

.story-card-placeholder {
    height: 210px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-100);
    color: var(--primary-600);
}

.story-card-placeholder .material-icons-outlined {
    font-size: 3rem;
}
</style>

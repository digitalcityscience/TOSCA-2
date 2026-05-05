<template>
    <div class="geostory-detail">
        <div v-if="geostory.loadingDetail" class="flex justify-center py-8">
            <ProgressSpinner />
        </div>

        <Message v-if="errorMessage !== ''" severity="error" class="mb-3">
            {{ errorMessage }}
        </Message>

        <div v-if="story">
            <Card class="overflow-hidden">
                <template #header>
                    <div v-if="heroImageUrl" class="geostory-hero-shell">
                        <Skeleton v-if="heroImageLoading" class="geostory-hero-skeleton" />
                        <Image
                            :src="heroImageUrl"
                            :alt="story.hero_image_alt"
                            decoding="async"
                            fetchpriority="high"
                            image-class="geostory-hero-image"
                            preview
                            @load="heroImageLoading = false"
                            @error="heroImageLoading = false"
                        />
                    </div>
                </template>
                <template #title>
                    <h1 class="text-3xl font-bold leading-tight">{{ story.title }}</h1>
                </template>
                <template #subtitle>
                    <Tag :value="createdAtLabel" severity="secondary" />
                </template>
                <template #content>
                    <EditorJsRenderer v-if="storyBlocks.length > 0" class="pt-4" :blocks="storyBlocks" />
                    <Message v-else severity="info">This story does not have narrative content yet.</Message>
                </template>
            </Card>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Card from "primevue/card";
import Image from "primevue/image";
import Message from "primevue/message";
import ProgressSpinner from "primevue/progressspinner";
import Skeleton from "primevue/skeleton";
import Tag from "primevue/tag";
import { useToast } from "primevue/usetoast";
import {
    type GeoStoryDetail,
    useGeostoryStore,
    resolveBackendMediaUrl,
} from "@store/geostory";
import { useGeoserverStore } from "@store/geoserver";
import { useMapStore } from "@store/map";
import { loadGeostoryLayersOnMap } from "@helpers/geostoryLayers";
import EditorJsRenderer from "./EditorJsRenderer.vue";

const props = defineProps<{
    storyId: string
}>();

const geostory = useGeostoryStore();
const geoserver = useGeoserverStore();
const mapStore = useMapStore();
const toast = useToast();
const errorMessage = ref("");

const story = computed<GeoStoryDetail | undefined>(() => {
    return geostory.selectedStory;
});

const heroImageUrl = computed(() => {
    return resolveBackendMediaUrl(story.value?.hero_image_url);
});
const heroImageLoading = ref(false);

const storyBlocks = computed(() => {
    return story.value?.context?.content?.blocks ?? [];
});

const createdAtLabel = computed(() => {
    if (story.value === undefined) {
        return "";
    }

    return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
    }).format(new Date(story.value.created_at));
});

watch(
    () => props.storyId,
    (storyId) => {
        loadStory(storyId).catch((error) => {
            errorMessage.value = String(error);
        });
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
            toast.add({
                severity: "error",
                summary: "Layer Error",
                detail: `Could not load ${layer.layer.workspace.name}:${layer.layer.name}. ${String(error)}`,
                life: 5000,
            });
        },
    });
}
</script>

<style scoped>
.geostory-hero-shell {
    position: relative;
    height: 340px;
    overflow: hidden;
    background: var(--surface-100);
}

.geostory-hero-skeleton {
    position: absolute;
    inset: 0;
    width: 100% !important;
    height: 340px !important;
    border-radius: 0;
    z-index: 1;
}

.geostory-detail :deep(.geostory-hero-image) {
    width: 100%;
    height: 340px;
    object-fit: cover;
}
</style>

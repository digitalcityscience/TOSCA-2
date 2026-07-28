<template>
    <div class="grid gap-4">
        <div v-if="geostory.loadingList && geostory.stories.length === 0" class="grid gap-3">
            <USkeleton v-for="index in 3" :key="index" class="h-80 w-full rounded-lg" />
        </div>

        <UAlert
            v-if="geostory.error !== ''"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            title="GeoStories are unavailable right now"
            :description="geostory.error"
        >
            <template #actions>
                <UButton
                    label="Try again"
                    icon="i-lucide-refresh-cw"
                    color="error"
                    variant="soft"
                    size="sm"
                    :loading="geostory.loadingList"
                    @click="loadStories"
                />
            </template>
        </UAlert>

        <UAlert
            v-if="!geostory.loadingList && geostory.stories.length === 0 && geostory.error === ''"
            color="info"
            variant="subtle"
            icon="i-lucide-book-x"
            title="No GeoStories are available"
            description="Published stories will appear here."
        />

        <div v-if="geostory.stories.length > 0" class="flex justify-end text-xs text-muted">
            {{ geostory.stories.length }} {{ geostory.stories.length === 1 ? "story" : "stories" }}
        </div>

        <div class="grid gap-3">
            <GeoStoryListItem
                v-for="story in geostory.stories"
                :key="story.id"
                :story="story"
            />
        </div>

        <div v-if="geostory.next !== null" class="flex justify-center py-2">
            <UButton
                icon="i-lucide-plus"
                label="Load more"
                color="neutral"
                variant="outline"
                :loading="geostory.loadingList"
                @click="loadMore"
            />
        </div>
    </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useGeostoryStore } from "@store/geostory";
import GeoStoryListItem from "./GeoStoryListItem.vue";

const geostory = useGeostoryStore();

onMounted(() => {
    if (geostory.stories.length === 0) {
        loadStories();
    }
});

function loadMore(): void {
    geostory.loadMoreStories().catch(() => {
        // The store logs technical details and exposes user-safe alert copy.
    });
}

function loadStories(): void {
    geostory.loadStories().catch(() => {
        // The store logs technical details and exposes user-safe alert copy.
    });
}
</script>

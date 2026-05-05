<template>
    <div class="geostory-list">
        <div v-if="geostory.loadingList && geostory.stories.length === 0" class="flex justify-center py-8">
            <ProgressSpinner />
        </div>

        <Message v-if="geostory.error" severity="error" class="mb-3">
            {{ geostory.error }}
        </Message>

        <Message
            v-if="!geostory.loadingList && geostory.stories.length === 0 && !geostory.error"
            severity="info"
        >
            No GeoStories are available.
        </Message>

        <div class="grid gap-3">
            <GeoStoryListItem
                v-for="story in geostory.stories"
                :key="story.id"
                :story="story"
            />
        </div>

        <div v-if="geostory.next !== null" class="flex justify-center py-4">
            <Button
                icon="pi pi-plus"
                label="Load more"
                severity="secondary"
                :loading="geostory.loadingList"
                @click="loadMore"
            />
        </div>
    </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import Button from "primevue/button";
import Message from "primevue/message";
import ProgressSpinner from "primevue/progressspinner";
import { useToast } from "primevue/usetoast";
import { useGeostoryStore } from "@store/geostory";
import GeoStoryListItem from "./GeoStoryListItem.vue";

const geostory = useGeostoryStore();
const toast = useToast();

onMounted(() => {
    if (geostory.stories.length === 0) {
        geostory.loadStories().catch((error) => {
            toast.add({ severity: "error", summary: "Error", detail: error, life: 3000 });
        });
    }
});

function loadMore(): void {
    geostory.loadMoreStories().catch((error) => {
        toast.add({ severity: "error", summary: "Error", detail: error, life: 3000 });
    });
}
</script>

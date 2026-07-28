<template>
    <BaseSlideoverSidebarComponent
        :id="sidebarID"
        side="left"
        :collapsed="route.meta.sidebar !== sidebarID"
        width-class="w-[min(38.75rem,calc(100vw-5rem))]"
    >
        <template #header>
            <div class="flex min-w-0 items-center gap-2">
                <UIcon name="i-lucide-book-open" class="size-4 shrink-0 text-primary" />
                <span class="truncate">GeoStories</span>
            </div>
        </template>

        <div v-if="route.name === 'geostory-detail'" class="mb-3">
            <UButton
                icon="i-lucide-arrow-left"
                label="Back to stories"
                size="sm"
                color="neutral"
                variant="outline"
                :loading="returningToList"
                @click="goBackToStories"
            />
        </div>

        <RouterView />
    </BaseSlideoverSidebarComponent>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { RouterView, useRoute, useRouter } from "vue-router";
import BaseSlideoverSidebarComponent from "@components/Base/BaseSlideoverSidebarComponent.vue";
import { useMapStore } from "@store/map";
import { useToast } from "@helpers/toast";
import { reportDeveloperError } from "@helpers/userFacingError";

const sidebarID = "geostories";
const mapStore = useMapStore();
const route = useRoute();
const router = useRouter();
const toast = useToast();
const returningToList = ref(false);

async function goBackToStories(): Promise<void> {
    returningToList.value = true;
    try {
        await mapStore.resetMapData(false);
        await router.push({ name: "geostory-list" });
    } catch (error) {
        reportDeveloperError("Returning to the GeoStory list", error);
        toast.add({
            severity: "error",
            summary: "Couldn't return to the GeoStory list",
            detail: "Please try again.",
            life: 4000,
        });
    } finally {
        returningToList.value = false;
    }
}
</script>

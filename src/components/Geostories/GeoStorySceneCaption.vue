<template>
    <!-- The live region stays mounted so screen readers announce caption changes. -->
    <div class="geostory-scene-caption-region" aria-live="polite">
        <aside
            v-if="caption !== ''"
            class="geostory-scene-caption"
            :aria-label="t('geostories.scenes.captionLabel')"
        >
            <div class="min-w-0 flex-1">
                <p class="text-xs font-semibold text-highlighted">{{ sceneTitle }}</p>
                <p class="mt-0.5 whitespace-pre-line text-sm leading-snug text-toned">{{ caption }}</p>
            </div>
            <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="xs"
                square
                :aria-label="t('geostories.scenes.hideCaption')"
                @click="dismissedSceneId = sceneStore.activeSceneId"
            />
        </aside>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useGeostorySceneStore } from "@store/geostoryScenes";

const { t } = useI18n();
const sceneStore = useGeostorySceneStore();
// Hiding applies to one scene; the next scene's caption shows again.
const dismissedSceneId = ref<string>();

const caption = computed(() => {
    const scene = sceneStore.activeScene;
    if (scene === undefined || scene.id === dismissedSceneId.value) return "";
    return scene.caption.trim();
});
const sceneTitle = computed(() => sceneStore.activeScene?.title ?? "");
</script>

<style scoped>
.geostory-scene-caption-region {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    z-index: 5;
    max-width: min(22rem, calc(100% - 1.5rem));
    pointer-events: none;
}
.geostory-scene-caption {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.625rem 0.75rem;
    border-radius: 0.5rem;
    background: color-mix(in srgb, var(--ui-bg) 92%, transparent);
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.18);
    backdrop-filter: blur(6px);
    pointer-events: auto;
}
</style>

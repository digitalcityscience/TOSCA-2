<template>
    <nav
        v-if="scenes.length > 1"
        class="grid gap-1.5"
        :aria-label="t('geostories.scenes.navLabel')"
    >
        <p class="text-xs text-muted">
            {{ t("geostories.scenes.progress", { current: currentIndex + 1, total: scenes.length }) }}
            <span v-if="currentScene !== undefined" class="text-toned">· {{ currentScene.title }}</span>
        </p>
        <ol class="flex flex-wrap gap-1.5">
            <li v-for="(scene, index) in scenes" :key="scene.id">
                <UButton
                    size="xs"
                    :color="scene.id === currentScene?.id ? 'primary' : 'neutral'"
                    :variant="scene.id === currentScene?.id ? 'solid' : 'outline'"
                    :aria-current="scene.id === currentScene?.id ? 'step' : undefined"
                    :label="`${index + 1}. ${scene.title}`"
                    class="max-w-48"
                    :ui="{ label: 'truncate' }"
                    @click="emit('select', scene.id)"
                />
            </li>
        </ol>
    </nav>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useGeostorySceneStore } from "@store/geostoryScenes";

const emit = defineEmits<{
    /** The reader picked a scene; the parent scrolls to it and switches the map. */
    select: [sceneId: string]
}>();

const { t } = useI18n();
const sceneStore = useGeostorySceneStore();
const scenes = computed(() => sceneStore.scenes);
// Follow the requested scene, so the list reacts before the map finishes switching.
const currentIndex = computed(() => {
    const sceneId = sceneStore.targetSceneId ?? sceneStore.activeSceneId;
    return Math.max(scenes.value.findIndex((scene) => scene.id === sceneId), 0);
});
const currentScene = computed(() => scenes.value[currentIndex.value]);
</script>

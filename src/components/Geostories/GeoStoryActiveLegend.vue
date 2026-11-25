<template>
    <aside v-if="entries.length > 0" class="geostory-active-legend" aria-live="polite">
        <header class="geostory-active-legend-header">
            <UIcon name="i-lucide-list-tree" class="size-4 shrink-0 text-primary" aria-hidden="true" />
            <div class="min-w-0">
                <p class="text-xs font-semibold text-highlighted">Map legend</p>
                <p class="truncate text-xs text-muted">{{ sceneTitle }}</p>
            </div>
        </header>
        <MapStyleLegend :entries="entries" />
    </aside>
</template>

<script setup lang="ts">
import { computed } from "vue";
import MapStyleLegend from "@components/Map/Layer/MapStyleLegend.vue";
import { createMapStyleLegendEntries } from "@helpers/mapStyleLegend";
import { useGeostorySceneStore } from "@store/geostoryScenes";

const sceneStore = useGeostorySceneStore();

const sceneTitle = computed(() => sceneStore.activeScene?.title ?? "");
const entries = computed(() => {
    const scene = sceneStore.activeScene;
    const story = sceneStore.story;
    if (scene === undefined || story === undefined) return [];

    return createMapStyleLegendEntries(scene.render_layers, {
        members: scene.layers.map((layer) => ({ id: layer.id, title: layer.layer.name })),
        styles: story.map.styles,
        sprites: story.map.sprites,
    });
});
</script>

<style scoped>
.geostory-active-legend {
    display: grid;
    gap: 0.55rem;
    padding: 0.75rem;
    border: 1px solid var(--ui-border-muted);
    border-radius: 0.5rem;
    background: color-mix(in srgb, var(--ui-bg-muted) 76%, transparent);
}

.geostory-active-legend-header {
    display: flex;
    align-items: center;
    gap: 0.45rem;
}
</style>

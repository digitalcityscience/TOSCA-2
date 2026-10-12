<template>
    <article class="grid gap-2 rounded-md border border-muted px-3 py-2" data-testid="story-chapter">
        <h4 class="text-sm font-semibold text-highlighted" data-testid="chapter-title">{{ props.title }}</h4>
        <EditorJsReadonly v-if="props.blocks.length > 0" :data="content" />
        <p v-else class="text-xs text-muted" data-testid="chapter-no-narrative">
            {{ props.caption !== "" ? props.caption : t("urbanStories.run.noNarrative") }}
        </p>
    </article>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import EditorJsReadonly from "@components/Base/EditorJsReadonly.vue";
import type { GeoStoryEditorBlock } from "@store/geostory";

interface Props {
    title: string
    /** Narrative of the active chapter; map-scene anchors are already removed. */
    blocks: GeoStoryEditorBlock[]
    /** Scene caption shown when the chapter has no text of its own. */
    caption?: string
}

const props = withDefaults(defineProps<Props>(), { caption: "" });
const { t } = useI18n();
// No `map-scene-anchors`: this panel switches scenes through its own navigation, not by scrolling.
const content = computed(() => ({ blocks: props.blocks }));
</script>

<template>
    <div
        v-if="richHtml"
        ref="rootElement"
        class="rich-description text-sm text-toned"
        :class="{ 'rich-description-clamped': props.clampLines !== undefined }"
        :style="clampStyle"
        data-testid="rich-description"
        v-html="richHtml"
    ></div>
    <p
        v-else-if="fallback"
        ref="rootElement"
        class="whitespace-pre-line text-sm text-toned"
        :class="{ 'rich-description-clamped': props.clampLines !== undefined }"
        :style="clampStyle"
    >
        {{ fallback }}
    </p>
</template>

<script setup lang="ts">
import { computed, ref, type CSSProperties } from "vue";
import {
    descriptionDocumentToHtml,
    type EditorJsDescriptionContent,
} from "@helpers/editorJsDescription";

const props = defineProps<{
    content?: EditorJsDescriptionContent | null;
    fallback?: string;
    clampLines?: number;
}>();

const rootElement = ref<HTMLElement>();
const richHtml = computed(() => descriptionDocumentToHtml(props.content));
const clampStyle = computed<CSSProperties | undefined>(() => props.clampLines === undefined
    ? undefined
    : { "--rich-description-clamp-lines": String(props.clampLines) });

function isTruncated(): boolean {
    const element = rootElement.value;
    return element !== undefined && element.scrollHeight > element.clientHeight + 1;
}

defineExpose({ isTruncated });
</script>

<style scoped>
.rich-description-clamped {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: var(--rich-description-clamp-lines);
}

.rich-description :deep(p),
.rich-description :deep(ol),
.rich-description :deep(ul) {
    margin: 0.45rem 0;
    line-height: 1.6;
}

.rich-description :deep(h2),
.rich-description :deep(h3),
.rich-description :deep(h4) {
    margin: 0.8rem 0 0.3rem;
    color: var(--ui-text-highlighted);
    font-weight: 650;
    line-height: 1.3;
}

.rich-description :deep(h2) { font-size: 1rem; }
.rich-description :deep(h3) { font-size: 0.925rem; }
.rich-description :deep(h4) { font-size: 0.875rem; }

.rich-description :deep(strong),
.rich-description :deep(b) {
    color: inherit;
    font-weight: 700;
}

.rich-description :deep(em),
.rich-description :deep(i) {
    font-style: italic;
}

.rich-description :deep(ol),
.rich-description :deep(ul) {
    padding-left: 1.25rem;
}

.rich-description :deep(ol) { list-style: decimal; }
.rich-description :deep(ul) { list-style: disc; }
.rich-description :deep(li > ol),
.rich-description :deep(li > ul) { margin: 0.2rem 0; }

.rich-description :deep(a) {
    color: var(--ui-primary);
    text-decoration: underline;
    text-underline-offset: 0.15em;
}

.rich-description :deep(code) {
    border-radius: 0.2rem;
    background: var(--ui-bg-muted);
    padding: 0.05rem 0.25rem;
    font-size: 0.875em;
}
</style>

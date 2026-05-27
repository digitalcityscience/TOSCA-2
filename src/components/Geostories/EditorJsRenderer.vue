<template>
    <div class="editorjs-view">
        <template v-for="(block, index) in blocks" :key="index">
            <p
                v-if="block.type === 'paragraph'"
                class="story-paragraph"
                data-testid="editor-paragraph"
                v-html="inlineText(block)"
            ></p>

            <component
                :is="headerTag(block)"
                v-else-if="block.type === 'header'"
                class="story-heading"
                data-testid="editor-header"
                v-html="inlineText(block)"
            />

            <EditorJsList
                v-else-if="block.type === 'list'"
                :items="listItems(block)"
                :ordered="listStyle(block) === 'ordered'"
            />

            <blockquote
                v-else-if="block.type === 'quote'"
                class="story-quote"
                data-testid="editor-quote"
            >
                <p v-html="inlineText(block)"></p>
                <cite v-if="captionText(block) !== ''">{{ captionText(block) }}</cite>
            </blockquote>

            <Divider v-else-if="block.type === 'delimiter'" data-testid="editor-delimiter" />

            <pre v-else-if="block.type === 'code'" class="story-code" data-testid="editor-code"><code>{{ codeText(block) }}</code></pre>

            <figure v-else-if="block.type === 'image'" class="story-image-block" data-testid="editor-image">
                <Image
                    v-if="imageUrl(block)"
                    :src="imageUrl(block)"
                    :alt="imageAlt(block)"
                    image-class="story-inline-image"
                    preview
                />
                <figcaption v-if="captionText(block) !== ''">{{ captionText(block) }}</figcaption>
            </figure>
        </template>
    </div>
</template>

<script setup lang="ts">
import Divider from "primevue/divider";
import Image from "primevue/image";
import {
    type GeoStoryEditorBlock,
    resolveBackendMediaUrl,
} from "@store/geostory";
import EditorJsList from "./EditorJsList.vue";

defineProps<{
    blocks: GeoStoryEditorBlock[]
}>();

function inlineText(block: GeoStoryEditorBlock): string {
    return String(block.data?.text ?? "");
}

function captionText(block: GeoStoryEditorBlock): string {
    return String(block.data?.caption ?? "");
}

function codeText(block: GeoStoryEditorBlock): string {
    return String(block.data?.code ?? "");
}

function headerTag(block: GeoStoryEditorBlock): string {
    const level = Number(block.data?.level ?? 2);
    if (level < 2 || level > 4) {
        return "h2";
    }

    return `h${level}`;
}

function listStyle(block: GeoStoryEditorBlock): string {
    return String(block.data?.style ?? "unordered");
}

function listItems(block: GeoStoryEditorBlock): unknown[] {
    const items = block.data?.items;
    if (!Array.isArray(items)) {
        return [];
    }

    return items;
}

function imageUrl(block: GeoStoryEditorBlock): string | undefined {
    const file = block.data?.file as { url?: string } | undefined;
    return resolveBackendMediaUrl(file?.url);
}

function imageAlt(block: GeoStoryEditorBlock): string {
    return String(block.data?.alt ?? "");
}
</script>

<style scoped>
.editorjs-view {
    display: grid;
    gap: 1rem;
}

.story-paragraph {
    line-height: 1.7;
    color: var(--surface-800);
}

.story-heading {
    font-weight: 700;
    line-height: 1.25;
    color: var(--surface-900);
}

h2.story-heading {
    font-size: 1.45rem;
}

h3.story-heading {
    font-size: 1.2rem;
}

h4.story-heading {
    font-size: 1.05rem;
}

.story-quote {
    border-left: 4px solid var(--primary-500);
    padding: 0.5rem 0 0.5rem 1rem;
    color: var(--surface-700);
    background: var(--surface-50);
}

.story-quote cite {
    display: block;
    margin-top: 0.5rem;
    font-size: 0.85rem;
    color: var(--surface-500);
}

.story-code {
    padding: 1rem;
    overflow-x: auto;
    border-radius: 6px;
    background: var(--surface-900);
    color: var(--surface-0);
}

.story-image-block {
    display: grid;
    gap: 0.5rem;
}

.story-image-block :deep(.story-inline-image) {
    width: 100%;
    height: auto;
    max-height: none;
    object-fit: contain;
    border-radius: 6px;
}

.story-image-block figcaption {
    font-size: 0.85rem;
    color: var(--surface-600);
}
</style>

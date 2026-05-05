<template>
    <component
        :is="ordered ? 'ol' : 'ul'"
        class="story-list"
        :class="ordered ? 'list-decimal' : 'list-disc'"
        data-testid="editor-list"
    >
        <li v-for="(item, index) in normalizedItems" :key="index">
            <span v-html="item.content"></span>
            <EditorJsList
                v-if="item.items.length > 0"
                :items="item.items"
                :ordered="ordered"
            />
        </li>
    </component>
</template>

<script setup lang="ts">
import { computed } from "vue";

defineOptions({
    name: "EditorJsList",
});

interface EditorListItem {
    content: string;
    items: unknown[];
}

const props = defineProps<{
    items: unknown[];
    ordered: boolean;
}>();

const normalizedItems = computed(() => {
    return props.items.map((item) => normalizeListItem(item));
});

function normalizeListItem(item: unknown): EditorListItem {
    if (typeof item === "string") {
        return {
            content: item,
            items: [],
        };
    }

    if (typeof item === "object" && item !== null) {
        const itemRecord = item as Record<string, unknown>;
        return {
            content: String(itemRecord.content ?? ""),
            items: Array.isArray(itemRecord.items) ? itemRecord.items : [],
        };
    }

    return {
        content: String(item),
        items: [],
    };
}
</script>

<style scoped>
.story-list {
    padding-left: 1.5rem;
    display: grid;
    gap: 0.35rem;
    color: var(--surface-800);
}

.story-list .story-list {
    margin-top: 0.35rem;
}
</style>

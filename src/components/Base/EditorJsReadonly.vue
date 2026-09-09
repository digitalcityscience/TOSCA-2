<template>
    <div class="editorjs-readonly">
        <div ref="holder" data-testid="editorjs-holder"></div>
        <UAlert
            v-if="initializationFailed"
            class="mt-3"
            color="warning"
            variant="subtle"
            icon="i-lucide-file-warning"
            title="Narrative content is unavailable"
            description="This content could not be displayed."
        />
    </div>
</template>

<script setup lang="ts">
import type EditorJS from "@editorjs/editorjs";
import type { LogLevels, OutputData } from "@editorjs/editorjs";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { resolveBackendMediaUrl } from "@store/backend";
import { reportDeveloperError } from "@helpers/userFacingError";
import EditorJsReadonlyList from "@helpers/editorJsReadonlyList";

interface EditorJsBlock {
    id?: string;
    type: string;
    data?: Record<string, unknown>;
    tunes?: Record<string, unknown>;
}

export interface EditorJsContent {
    version?: string;
    time?: number;
    blocks?: EditorJsBlock[];
}

const props = defineProps<{
    data: EditorJsContent
}>();

const holder = ref<HTMLElement>();
const initializationFailed = ref(false);
let editor: EditorJS | undefined;
let lifecycleVersion = 0;
let renderVersion = 0;

onMounted(() => {
    initializeEditor().catch(handleInitializationError);
});

watch(
    () => props.data,
    () => {
        renderData().catch(handleInitializationError);
    },
    { deep: true }
);

onBeforeUnmount(() => {
    lifecycleVersion += 1;
    renderVersion += 1;
    const instance = editor;
    editor = undefined;
    if (instance !== undefined) {
        instance.isReady
            .then(() => instance.destroy())
            .catch(() => undefined);
    }
});

async function initializeEditor(): Promise<void> {
    const currentLifecycle = ++lifecycleVersion;
    const [
        { default: EditorJs },
        { default: Header },
        { default: Quote },
        { default: Delimiter },
        { default: Code },
        { default: Image },
    ] = await Promise.all([
        import("@editorjs/editorjs"),
        import("@editorjs/header"),
        import("@editorjs/quote"),
        import("@editorjs/delimiter"),
        import("@editorjs/code"),
        import("@editorjs/image"),
    ]);

    if (holder.value === undefined || currentLifecycle !== lifecycleVersion) {
        return;
    }

    initializationFailed.value = false;
    const instance = new EditorJs({
        holder: holder.value,
        readOnly: true,
        hideToolbar: true,
        minHeight: 0,
        logLevel: "ERROR" as LogLevels,
        tools: {
            header: Header,
            list: EditorJsReadonlyList,
            quote: Quote,
            delimiter: Delimiter,
            code: Code,
            image: Image,
        },
        data: normalizeEditorData(props.data),
    });
    editor = instance;
    await instance.isReady;

    if (currentLifecycle !== lifecycleVersion) {
        instance.destroy();
        if (editor === instance) {
            editor = undefined;
        }
    }
}

async function renderData(): Promise<void> {
    const instance = editor;
    if (instance === undefined) {
        return;
    }

    const currentRender = ++renderVersion;
    await instance.isReady;
    if (currentRender !== renderVersion || instance !== editor) {
        return;
    }
    await instance.blocks.render(normalizeEditorData(props.data));
}

function normalizeEditorData(content: EditorJsContent): OutputData {
    return {
        version: content.version,
        time: content.time,
        blocks: (content.blocks ?? []).map((block) => ({
            id: block.id,
            type: block.type,
            data: normalizeBlockData(block),
            tunes: block.tunes,
        })),
    };
}

function normalizeBlockData(block: EditorJsBlock): Record<string, unknown> {
    const data = { ...block.data };
    if (block.type !== "image") {
        return data;
    }

    const file = data.file;
    if (typeof file !== "object" || file === null || !("url" in file)) {
        return data;
    }

    const url = (file as { url?: unknown }).url;
    if (typeof url !== "string") {
        return data;
    }

    return {
        ...data,
        file: {
            ...file,
            url: resolveBackendMediaUrl(url) ?? url,
        },
    };
}

function handleInitializationError(error: unknown): void {
    initializationFailed.value = true;
    reportDeveloperError("Rendering Editor.js content in read-only mode", error);
}
</script>

<style scoped>
.editorjs-readonly {
    min-width: 0;
    color: var(--ui-text-toned);
}
.editorjs-readonly :deep(.codex-editor__redactor) {
    padding-bottom: 0 !important;
}
.editorjs-readonly :deep(.ce-block__content),
.editorjs-readonly :deep(.ce-toolbar__content) {
    max-width: none;
}
.editorjs-readonly :deep(.ce-block) {
    padding: 0.25rem 0;
}
.editorjs-readonly :deep(.ce-paragraph) {
    line-height: 1.7;
}
.editorjs-readonly :deep(.ce-header) {
    color: var(--ui-text-highlighted);
    line-height: 1.25;
    font-weight: 700;
    margin: 0.55em 0 0.25em;
}
.editorjs-readonly :deep(h1.ce-header) { font-size: 1.875rem; }
.editorjs-readonly :deep(h2.ce-header) { font-size: 1.5rem; }
.editorjs-readonly :deep(h3.ce-header) { font-size: 1.25rem; }
.editorjs-readonly :deep(h4.ce-header) { font-size: 1.125rem; }
.editorjs-readonly :deep(h5.ce-header) { font-size: 1rem; }
.editorjs-readonly :deep(h6.ce-header) { font-size: 0.875rem; }
.editorjs-readonly :deep(.editorjs-readonly-list) {
    margin: 0.45rem 0;
    padding-left: 1.5rem;
}
.editorjs-readonly :deep(.editorjs-readonly-list--unordered) { list-style: disc; }
.editorjs-readonly :deep(.editorjs-readonly-list--ordered) { list-style: decimal; }
.editorjs-readonly :deep(.editorjs-readonly-list--checklist) {
    padding-left: 0;
    list-style: none;
}
.editorjs-readonly :deep(.editorjs-readonly-list__item) {
    margin: 0.2rem 0;
    line-height: 1.65;
}
.editorjs-readonly :deep(.editorjs-readonly-list__item > .editorjs-readonly-list) {
    margin: 0.2rem 0;
}
.editorjs-readonly :deep(.editorjs-readonly-list__checkbox) {
    margin-right: 0.55rem;
    accent-color: var(--ui-primary);
}
.editorjs-readonly :deep(.cdx-quote) {
    border-left: 3px solid var(--ui-primary);
    border-radius: 0 0.5rem 0.5rem 0;
    padding: 0.75rem 1rem;
    background: var(--ui-bg-muted);
}
.editorjs-readonly :deep(.ce-code__textarea) {
    border: 0;
    border-radius: 0.5rem;
    background: var(--ui-bg-inverted);
    color: var(--ui-text-inverted);
}
.editorjs-readonly :deep(.image-tool__image-picture) {
    max-height: none;
    border-radius: 0.5rem;
}
</style>

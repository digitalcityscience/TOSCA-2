<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import EditorJsReadonly from "@components/Base/EditorJsReadonly.vue";
import { reportDeveloperError } from "@helpers/userFacingError";
import { useFooterStore, type PublishedFooterDocument } from "@store/footer";

type LoadState = "idle" | "loading" | "ready" | "not-found" | "error";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const footerStore = useFooterStore();
const document = ref<PublishedFooterDocument | null>(null);
const loadState = ref<LoadState>("idle");
let requestVersion = 0;

const isDocumentRoute = computed(() => route.name === "footer-document");
const documentSlug = computed(() => String(route.params.footerDocumentSlug ?? ""));
const modalTitle = computed(() => document.value?.title ?? (
    loadState.value === "not-found"
        ? t("footer.notFoundTitle")
        : t("footer.loadingTitle")
));

watch(
    [isDocumentRoute, documentSlug],
    ([isOpen, slug]) => {
        if (!isOpen || slug === "") {
            requestVersion += 1;
            document.value = null;
            loadState.value = "idle";
            return;
        }
        loadDocument(slug).catch(() => undefined);
    },
    { immediate: true }
);

async function loadDocument(slug: string): Promise<void> {
    const currentRequest = ++requestVersion;
    document.value = null;
    loadState.value = "loading";
    try {
        const result = await footerStore.loadDocument(slug);
        if (currentRequest !== requestVersion) {
            return;
        }
        document.value = result;
        loadState.value = result === null ? "not-found" : "ready";
    } catch (cause) {
        if (currentRequest !== requestVersion) {
            return;
        }
        loadState.value = "error";
        reportDeveloperError(`Loading footer document ${slug}`, cause);
    }
}

function closeDocument(): void {
    const background = window.history.state?.background;
    if (typeof background === "string" && background !== "") {
        router.back();
        return;
    }
    router.replace({ name: "home" }).catch(() => undefined);
}

function handleOpenChange(isOpen: boolean): void {
    if (!isOpen && isDocumentRoute.value) {
        closeDocument();
    }
}
</script>

<template>
  <UModal
    :open="isDocumentRoute"
    :title="modalTitle"
    :ui="{
      overlay: 'z-[100] bg-elevated/80 backdrop-blur-[1px]',
      content: 'z-[101] w-[min(54rem,calc(100vw-1.5rem))] max-w-none',
      body: 'max-h-[calc(100dvh-8rem)] overflow-y-auto overscroll-contain'
    }"
    @update:open="handleOpenChange"
  >
    <template #body>
      <div v-if="loadState === 'loading'" class="space-y-3" aria-live="polite">
        <USkeleton class="h-4 w-full" />
        <USkeleton class="h-4 w-11/12" />
        <USkeleton class="h-4 w-4/5" />
        <USkeleton class="mt-6 h-4 w-full" />
        <span class="sr-only">{{ t("footer.loadingTitle") }}</span>
      </div>

      <EditorJsReadonly
        v-else-if="loadState === 'ready' && document"
        :data="document.content"
      />

      <UAlert
        v-else-if="loadState === 'not-found'"
        color="warning"
        variant="subtle"
        icon="i-lucide-file-question-mark"
        :title="t('footer.notFoundTitle')"
        :description="t('footer.notFoundDescription')"
      />

      <UAlert
        v-else-if="loadState === 'error'"
        color="error"
        variant="subtle"
        icon="i-lucide-cloud-off"
        :title="t('footer.errorTitle')"
        :description="t('footer.errorDescription')"
      />
    </template>
  </UModal>
</template>

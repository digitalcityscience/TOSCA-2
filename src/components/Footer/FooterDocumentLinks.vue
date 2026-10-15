<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { PublishedFooterDocumentLink } from "@store/footer";
import { countFittingItems } from "./footerOverflow";

// Matches the mobile breakpoint in AppFooter's styles.
const DESKTOP_QUERY = "(min-width: 768px)";

const props = defineProps<{
    documents: PublishedFooterDocumentLink[];
}>();

const emit = defineEmits<{
    open: [document: PublishedFooterDocumentLink];
}>();

const { t } = useI18n();
const menuId = `footer-more-${useId()}`;
const navRef = ref<HTMLElement | null>(null);
const measureRef = ref<HTMLElement | null>(null);
const moreRef = ref<HTMLElement | null>(null);
const moreButtonRef = ref<HTMLButtonElement | null>(null);
const isDesktop = ref(true);
const visibleCount = ref(props.documents.length);
const menuOpen = ref(false);

const inlineDocuments = computed(() => props.documents.slice(0, visibleCount.value));
const overflowDocuments = computed(() => props.documents.slice(visibleCount.value));

let mediaQuery: MediaQueryList | null = null;
let resizeObserver: ResizeObserver | null = null;

function measure(): void {
    const nav = navRef.value;
    const measureRow = measureRef.value;
    if (!nav || !measureRow) {
        visibleCount.value = props.documents.length;
        return;
    }
    const widths = Array.from(
        measureRow.querySelectorAll<HTMLElement>("[data-measure-link]"),
        (element) => Math.ceil(element.getBoundingClientRect().width)
    );
    const moreElement = measureRow.querySelector<HTMLElement>("[data-measure-more]");
    const moreWidth = Math.ceil(moreElement?.getBoundingClientRect().width ?? 0);
    const gap = Number.parseFloat(getComputedStyle(measureRow).columnGap) || 0;
    visibleCount.value = countFittingItems(widths, nav.clientWidth, gap, moreWidth);
}

function closeMenu(focusButton = false): void {
    if (!menuOpen.value) {
        return;
    }
    menuOpen.value = false;
    if (focusButton) {
        moreButtonRef.value?.focus();
    }
}

function toggleMenu(): void {
    menuOpen.value = !menuOpen.value;
}

function handleDocumentPointerDown(event: PointerEvent): void {
    if (moreRef.value && !moreRef.value.contains(event.target as Node)) {
        closeMenu();
    }
}

function handleMediaChange(): void {
    isDesktop.value = mediaQuery?.matches ?? true;
}

function openDocument(document: PublishedFooterDocumentLink): void {
    closeMenu();
    emit("open", document);
}

watch(menuOpen, (isOpen) => {
    if (isOpen) {
        window.document.addEventListener("pointerdown", handleDocumentPointerDown);
    } else {
        window.document.removeEventListener("pointerdown", handleDocumentPointerDown);
    }
});

watch(
    [() => props.documents, isDesktop],
    async () => {
        await nextTick();
        observeElements();
        measure();
    },
    { deep: true }
);

watch(overflowDocuments, (documents) => {
    if (documents.length === 0) {
        closeMenu();
    }
});

function observeElements(): void {
    resizeObserver?.disconnect();
    if (navRef.value) {
        resizeObserver?.observe(navRef.value);
    }
    if (measureRef.value) {
        resizeObserver?.observe(measureRef.value);
    }
}

onMounted(() => {
    if (typeof window.matchMedia === "function") {
        mediaQuery = window.matchMedia(DESKTOP_QUERY);
        isDesktop.value = mediaQuery.matches;
        mediaQuery.addEventListener("change", handleMediaChange);
    }
    if (typeof ResizeObserver === "function") {
        resizeObserver = new ResizeObserver(() => measure());
    }
    observeElements();
    measure();
});

onBeforeUnmount(() => {
    mediaQuery?.removeEventListener("change", handleMediaChange);
    resizeObserver?.disconnect();
    window.document.removeEventListener("pointerdown", handleDocumentPointerDown);
});
</script>

<template>
  <nav
    v-if="isDesktop"
    ref="navRef"
    class="footer-documents"
    :aria-label="t('footer.documentsLabel')"
  >
    <!-- Off-screen copy of every link and the More button, measured to decide what fits. -->
    <div class="footer-documents-measure" aria-hidden="true" inert>
      <div ref="measureRef" class="footer-documents-measure-row">
        <span
          v-for="document in documents"
          :key="document.id"
          class="footer-document-link"
          data-measure-link
        >{{ document.title }}</span>
        <span class="footer-more-button" data-measure-more>
          {{ t("footer.moreDocuments") }}
          <UIcon name="i-lucide-chevron-up" class="footer-more-icon" />
        </span>
      </div>
    </div>

    <ul class="footer-documents-row">
      <li v-for="document in inlineDocuments" :key="document.id">
        <RouterLink
          class="footer-document-link"
          :to="document.path"
          @click.prevent="openDocument(document)"
        >
          {{ document.title }}
        </RouterLink>
      </li>
    </ul>

    <div
      v-if="overflowDocuments.length"
      ref="moreRef"
      class="footer-more"
      @keydown.escape.stop="closeMenu(true)"
    >
      <button
        ref="moreButtonRef"
        type="button"
        class="footer-more-button"
        :aria-expanded="menuOpen"
        :aria-controls="menuId"
        @click="toggleMenu"
      >
        {{ t("footer.moreDocuments") }}
        <UIcon
          name="i-lucide-chevron-up"
          class="footer-more-icon"
          :class="{ 'footer-more-icon-open': menuOpen }"
        />
      </button>
      <ul v-show="menuOpen" :id="menuId" class="footer-more-panel">
        <li v-for="document in overflowDocuments" :key="document.id">
          <RouterLink
            class="footer-document-link footer-more-link"
            :to="document.path"
            @click.prevent="openDocument(document)"
          >
            {{ document.title }}
          </RouterLink>
        </li>
      </ul>
    </div>
  </nav>

  <nav v-else class="footer-documents footer-documents-mobile" :aria-label="t('footer.documentsLabel')">
    <ul class="footer-documents-list">
      <li v-for="document in documents" :key="document.id">
        <RouterLink
          class="footer-document-link"
          :to="document.path"
          @click.prevent="openDocument(document)"
        >
          {{ document.title }}
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.footer-documents {
    position: relative;
    display: flex;
    min-width: 0;
    flex: 1 1 0;
    align-items: center;
    justify-content: flex-end;
    gap: 0.9rem;
}

/* A zero-size clip box, so the full-width row never widens the page. */
.footer-documents-measure {
    position: absolute;
    top: 0;
    left: 0;
    width: 0;
    height: 0;
    overflow: hidden;
    visibility: hidden;
    pointer-events: none;
}

.footer-documents-measure-row {
    display: flex;
    width: max-content;
    gap: 0.9rem;
    white-space: nowrap;
}

.footer-documents-row,
.footer-documents-list,
.footer-more-panel {
    margin: 0;
    padding: 0;
    list-style: none;
}

.footer-documents-row {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 0.9rem;
    white-space: nowrap;
}

.footer-documents-mobile {
    width: 100%;
    flex: 0 0 auto;
    justify-content: center;
}

.footer-documents-list {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.45rem 0.9rem;
}

.footer-document-link {
    color: inherit;
    font-weight: 600;
    text-decoration: none;
    text-underline-offset: 0.18em;
    transition: color 150ms ease;
}

.footer-document-link:hover,
.footer-document-link:focus-visible {
    color: var(--ui-primary);
    text-decoration: underline;
}

.footer-document-link:focus-visible,
.footer-more-button:focus-visible {
    border-radius: 0.2rem;
    outline: 2px solid var(--ui-primary);
    outline-offset: 2px;
}

.footer-more {
    position: relative;
    flex: 0 0 auto;
}

.footer-more-button {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    cursor: pointer;
    font: inherit;
    font-weight: 600;
    white-space: nowrap;
}

.footer-more-button:hover {
    color: var(--ui-primary);
}

.footer-more-icon {
    width: 0.85rem;
    height: 0.85rem;
    transition: transform 150ms ease;
}

.footer-more-icon-open {
    transform: rotate(180deg);
}

.footer-more-panel {
    position: absolute;
    right: 0;
    bottom: calc(100% + 0.6rem);
    display: flex;
    min-width: 11rem;
    max-width: min(20rem, calc(100vw - 2rem));
    max-height: min(20rem, calc(100dvh - var(--tosca-app-header-height) - var(--tosca-app-footer-height) - 1.5rem));
    flex-direction: column;
    overflow-y: auto;
    padding: 0.35rem;
    border: 1px solid var(--tosca-app-border);
    border-radius: 0.5rem;
    background: var(--tosca-app-chrome-bg);
    box-shadow: 0 8px 24px var(--tosca-map-frame-shadow);
    line-height: 1.3;
}

.footer-more-link {
    display: block;
    padding: 0.4rem 0.55rem;
    border-radius: 0.3rem;
}

.footer-more-link:hover,
.footer-more-link:focus-visible {
    background: color-mix(in srgb, var(--ui-primary) 10%, transparent);
}
</style>

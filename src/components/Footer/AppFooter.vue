<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { resolveBackendMediaUrl } from "@store/backend";
import { useFooterStore, type PublishedFooterDocumentLink } from "@store/footer";
import FooterDocumentLinks from "./FooterDocumentLinks.vue";

const FOOTER_HEIGHT_PROPERTY = "--tosca-app-footer-height";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const footerStore = useFooterStore();
const footerRef = ref<HTMLElement | null>(null);
let resizeObserver: ResizeObserver | null = null;

// Wrapped logos make the footer taller, and fixed-position panels (sidebars,
// popovers) read this variable to stay clear of it.
function publishFooterHeight(): void {
    if (!footerRef.value) {
        return;
    }
    const height = footerRef.value.getBoundingClientRect().height;
    if (height > 0) {
        document.documentElement.style.setProperty(FOOTER_HEIGHT_PROPERTY, `${height}px`);
    }
}

onMounted(() => {
    footerStore.loadFooter().catch(() => undefined);
    if (typeof ResizeObserver === "function" && footerRef.value) {
        resizeObserver = new ResizeObserver(() => publishFooterHeight());
        resizeObserver.observe(footerRef.value);
    }
});

onBeforeUnmount(() => {
    resizeObserver?.disconnect();
    document.documentElement.style.removeProperty(FOOTER_HEIGHT_PROPERTY);
});

function openDocument(document: PublishedFooterDocumentLink): void {
    router.push({
        name: "footer-document",
        params: { footerDocumentSlug: document.slug },
        state: { background: route.fullPath },
    }).catch(() => undefined);
}
</script>

<template>
  <footer ref="footerRef" class="app-footer" :aria-label="t('footer.label')">
    <div v-if="footerStore.footer" class="footer-content">
      <ul v-if="footerStore.footer.logos.length" class="footer-logos">
        <li v-for="logo in footerStore.footer.logos" :key="logo.id" class="footer-logo-item">
          <a
            v-if="logo.destination_url"
            class="footer-logo-link"
            :href="logo.destination_url"
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              class="footer-logo"
              :src="resolveBackendMediaUrl(logo.url)"
              :alt="logo.alt_text"
            >
          </a>
          <img
            v-else
            class="footer-logo"
            :src="resolveBackendMediaUrl(logo.url)"
            :alt="logo.alt_text"
          >
        </li>
      </ul>

      <FooterDocumentLinks
        v-if="footerStore.footer.documents.length"
        :documents="footerStore.footer.documents"
        @open="openDocument"
      />
    </div>
  </footer>
</template>

<style scoped>
.app-footer {
    position: relative;
    /* Above the slideovers (40) and map side frames (60), which end at the
       footer's top edge, so the documents' More panel opens over them; below
       their tooltips and the modals (70+). */
    z-index: 65;
    display: flex;
    /* Not the CSS variable: it is overwritten with this element's measured height. */
    min-height: 2rem;
    min-width: 0;
    flex: 0 0 auto;
    align-items: center;
    border-top: 1px solid var(--tosca-app-border);
    background: var(--tosca-app-chrome-bg);
    color: var(--tosca-app-chrome-muted);
    font-size: 0.75rem;
    line-height: 1;
}

.footer-content {
    display: flex;
    width: 100%;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.25rem 1rem;
}

.footer-logos {
    display: flex;
    min-width: 0;
    max-width: 60%;
    flex: 0 1 auto;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.3rem 0.65rem;
    margin: 0;
    padding: 0;
    list-style: none;
}

.footer-logo-item,
.footer-logo-link {
    display: inline-flex;
    align-items: center;
}

.footer-logo {
    display: block;
    width: auto;
    max-width: 6rem;
    height: 1.45rem;
    object-fit: contain;
}

.footer-logo-link:focus-visible {
    border-radius: 0.2rem;
    outline: 2px solid var(--ui-primary);
    outline-offset: 2px;
}

@media (max-width: 767.98px) {
    .footer-content {
        flex-direction: column;
        gap: 0.45rem;
        padding: 0.45rem 1rem;
    }

    .footer-logos {
        max-width: 100%;
    }
}
</style>

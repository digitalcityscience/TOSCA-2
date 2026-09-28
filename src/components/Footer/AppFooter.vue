<script setup lang="ts">
import { onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { resolveBackendMediaUrl } from "@store/backend";
import { useFooterStore, type PublishedFooterDocument } from "@store/footer";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const footerStore = useFooterStore();

onMounted(() => {
    footerStore.loadFooter().catch(() => undefined);
});

function openDocument(document: PublishedFooterDocument): void {
    router.push({
        name: "footer-document",
        params: { footerDocumentSlug: document.slug },
        state: { background: route.fullPath },
    }).catch(() => undefined);
}
</script>

<template>
  <footer class="app-footer" :aria-label="t('footer.label')">
    <div v-if="footerStore.footer" class="footer-content">
      <div v-if="footerStore.footer.logos.length" class="footer-logos">
        <template v-for="logo in footerStore.footer.logos" :key="logo.id">
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
        </template>
      </div>

      <nav v-if="footerStore.footer.documents.length" class="footer-documents" :aria-label="t('footer.documentsLabel')">
        <RouterLink
          v-for="document in footerStore.footer.documents"
          :key="document.id"
          class="footer-document-link"
          :to="document.path"
          @click.prevent="openDocument(document)"
        >
          {{ document.title }}
        </RouterLink>
      </nav>
    </div>
  </footer>
</template>

<style scoped>
.app-footer {
    position: relative;
    z-index: 20;
    display: flex;
    height: var(--tosca-app-footer-height);
    min-width: 0;
    flex: 0 0 var(--tosca-app-footer-height);
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
    overflow-x: auto;
    padding: 0 1rem;
    scrollbar-width: none;
}

.footer-content::-webkit-scrollbar {
    display: none;
}

.footer-logos,
.footer-documents {
    display: flex;
    min-width: max-content;
    align-items: center;
}

.footer-logos {
    gap: 0.65rem;
}

.footer-documents {
    gap: 0.9rem;
}

.footer-logo-link {
    display: inline-flex;
    align-items: center;
}

.footer-logo {
    display: block;
    width: auto;
    max-width: 8rem;
    height: calc(var(--tosca-app-footer-height) - 0.55rem);
    object-fit: contain;
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
.footer-logo-link:focus-visible {
    border-radius: 0.2rem;
    outline: 2px solid var(--ui-primary);
    outline-offset: 2px;
}
</style>

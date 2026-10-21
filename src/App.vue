<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { RouterView } from "vue-router";
import { useI18n } from "vue-i18n";
import { useMapStore } from "./store/map";
import LocaleSwitcher from "./components/Base/LocaleSwitcher.vue";
import AppFooter from "./components/Footer/AppFooter.vue";
import FooterDocumentModal from "./components/Footer/FooterDocumentModal.vue";
import { brandName } from "./config/branding";
import { useKeycloakAuth } from "./auth/keycloak";

type ThemeMode = "light" | "dark";

const { t } = useI18n();
const mapStore = useMapStore();
const {
    isReady: isAuthReady,
    isAuthenticated,
    username,
    userProfile,
    authDiagnostics,
    login,
    logout,
    openAccountManagement,
} = useKeycloakAuth();
const authDebugEnabled = new URLSearchParams(window.location.search).has("auth-debug");
const themeMode = ref<ThemeMode>("light");
const isDarkMode = computed(() => themeMode.value === "dark");
const themeToggleLabel = computed(() => isDarkMode.value ? t("theme.switchToLight") : t("theme.switchToDark"));
const themeToggleIcon = computed(() => isDarkMode.value ? "i-lucide-sun" : "i-lucide-moon");

function applyThemeMode(mode: ThemeMode): void {
    document.documentElement.classList.toggle("dark", mode === "dark");
}

function toggleThemeMode(): void {
    themeMode.value = isDarkMode.value ? "light" : "dark";
}

onMounted(() => {
    const savedTheme = localStorage.getItem("tosca-theme-mode");
    const preferredTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    themeMode.value = savedTheme === "dark" || savedTheme === "light" ? savedTheme : preferredTheme;
    applyThemeMode(themeMode.value);
})

watch(themeMode, (mode) => {
    applyThemeMode(mode);
    localStorage.setItem("tosca-theme-mode", mode);
})
</script>

<template>
  <UApp>
    <div class="app-container flex min-h-0 flex-col bg-default text-default font-sans">
      <header class="app-header">
        <RouterLink to="/" class="app-brand" :aria-label="`${brandName} home`">
          {{ brandName }}
        </RouterLink>
        <div class="flex items-center gap-1">
          <details v-if="authDebugEnabled" class="relative text-xs">
            <summary class="cursor-pointer rounded px-2 py-1 text-muted hover:bg-elevated">Auth debug</summary>
            <pre class="absolute right-0 z-50 mt-1 w-96 overflow-auto rounded border border-default bg-default p-3 text-left text-xs text-default shadow-lg">{{ JSON.stringify(authDiagnostics, null, 2) }}</pre>
          </details>
          <UButton
            v-if="isAuthReady && !isAuthenticated"
            icon="i-lucide-log-in"
            color="primary"
            size="sm"
            :label="t('auth.login')"
            @click="login"
          />
          <UPopover v-else-if="isAuthReady && isAuthenticated">
            <button
              class="flex max-w-60 items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              :aria-label="t('auth.openMenu')"
            >
              <UAvatar :alt="userProfile.displayName" :text="userProfile.initials" size="sm" />
              <span class="hidden min-w-0 sm:block">
                <span class="block truncate text-sm font-medium">{{ userProfile.displayName }}</span>
                <span v-if="userProfile.email" class="block truncate text-xs text-muted">{{ userProfile.email }}</span>
              </span>
              <UIcon name="i-lucide-chevron-down" class="size-4 text-muted" />
            </button>
            <template #content>
              <section class="w-80 p-3" :aria-label="t('auth.account')">
                <div class="flex items-center gap-3 border-b border-default pb-3">
                  <UAvatar :alt="userProfile.displayName" :text="userProfile.initials" size="lg" />
                  <div class="min-w-0">
                    <p class="truncate font-semibold text-highlighted">{{ userProfile.displayName }}</p>
                    <p v-if="userProfile.email" class="truncate text-sm text-muted">{{ userProfile.email }}</p>
                    <p v-else-if="username" class="truncate text-sm text-muted">@{{ username }}</p>
                  </div>
                </div>
                <div class="py-3">
                  <p class="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{{ t('auth.roles') }}</p>
                  <div v-if="userProfile.realmRoles.length" class="flex flex-wrap gap-1.5">
                    <UBadge v-for="role in userProfile.realmRoles" :key="role" color="neutral" variant="subtle">
                      {{ role }}
                    </UBadge>
                  </div>
                  <p v-else class="text-sm text-muted">{{ t('auth.noRoles') }}</p>
                </div>
                <div class="grid gap-2 border-t border-default pt-3">
                  <UButton icon="i-lucide-settings" color="neutral" variant="soft" block @click="openAccountManagement">
                    {{ t('auth.manageAccount') }}
                  </UButton>
                  <UButton icon="i-lucide-log-out" color="error" variant="ghost" block @click="logout">
                    {{ t('auth.logout') }}
                  </UButton>
                </div>
              </section>
            </template>
          </UPopover>
          <LocaleSwitcher />
          <UTooltip :text="themeToggleLabel">
            <UButton
              class="h-8 w-8 p-0"
              :icon="themeToggleIcon"
              color="neutral"
              variant="ghost"
              square
              :aria-label="themeToggleLabel"
              @click="toggleThemeMode"
            />
          </UTooltip>
        </div>
      </header>
      <main class="app-main">
        <RouterView name="default"></RouterView>
        <RouterView v-if="mapStore.map" name="events"></RouterView>
        <RouterView v-if="mapStore.map" name="geostories"></RouterView>
        <RouterView v-if="mapStore.map" name="urbanStories"></RouterView>
        <RouterView v-if="mapStore.map" name="geosimulations"></RouterView>
      </main>
      <AppFooter />
      <FooterDocumentModal />
    </div>
  </UApp>
</template>

<style scoped>
.app-container {
    width: 100%;
    height: 100%;
}
.app-header {
    height: var(--tosca-app-header-height);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0 1rem;
    border-bottom: 1px solid var(--tosca-app-border);
    background: var(--tosca-app-chrome-bg);
    color: var(--tosca-app-chrome-text);
    z-index: 20;
}
.app-brand {
    display: inline-flex;
    align-items: center;
    min-width: 0;
    font-size: 1rem;
    font-weight: 700;
    line-height: 1;
    color: inherit;
    text-decoration: none;
}
.app-main {
    position: relative;
    min-height: 0;
    flex: 1 1 auto;
}
</style>

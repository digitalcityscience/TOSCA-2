<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { RouterView } from "vue-router";
import { useI18n } from "vue-i18n";
import { useMapStore } from "./store/map";
import LocaleSwitcher from "./components/Base/LocaleSwitcher.vue";
import AiAssistantConnection from "./components/Base/AiAssistantConnection.vue";
import AppFooter from "./components/Footer/AppFooter.vue";
import FooterDocumentModal from "./components/Footer/FooterDocumentModal.vue";
import { brandName } from "./config/branding";
import { useAuth } from "./auth/session";
import { useLogin } from "./auth/useLogin";
import { useToast } from "./core/helpers/toast";
import { useAiBridgeStore } from "./store/aiBridge";

type ThemeMode = "light" | "dark";

const { t } = useI18n();
const mapStore = useMapStore();
const toast = useToast();
const auth = useAuth();
// "Connect AI assistant" (MCP map bridge); hidden unless the deployment configures it.
const aiBridge = useAiBridgeStore();
const aiConnection = ref<InstanceType<typeof AiAssistantConnection>>();
const { status: authStatus, isAuthenticated, loginPending, profile, accountUrl, diagnostics } = auth;
// Claims panel for checking Keycloak/backend setup; development builds only.
const authDebugEnabled = import.meta.env.DEV && new URLSearchParams(window.location.search).has("auth-debug");
// The login button is always in the header until the user is signed in: it
// spins while a previous session is restored and is disabled (with a
// tooltip) when the Keycloak env vars are missing.
const showLoginButton = computed(() => !isAuthenticated.value || profile.value === undefined);
const loginDisabled = computed(() => authStatus.value === "disabled");
const loginBusy = computed(() => loginPending.value || authStatus.value === "initializing");

// Called straight from the click so the browser allows the popup.
const { login } = useLogin();

function logout(): void {
    void auth.logout();
}

function openAccountManagement(): void {
    if (accountUrl.value !== undefined) window.open(accountUrl.value, "_blank", "noopener");
}

auth.onSessionChange((reason) => {
    if (reason === "expired") {
        toast.add({ severity: "info", summary: t("auth.sessionExpired"), detail: t("auth.sessionExpiredDetail"), life: 8000 });
    }
});
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
            <pre class="absolute right-0 z-50 mt-1 w-96 overflow-auto rounded border border-default bg-default p-3 text-left text-xs text-default shadow-lg">{{ JSON.stringify(diagnostics, null, 2) }}</pre>
          </details>
          <AiAssistantConnection v-if="aiBridge.available && isAuthenticated" ref="aiConnection" />
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
          <UTooltip v-if="showLoginButton" :text="t('auth.notConfigured')" :disabled="!loginDisabled">
            <UButton
              color="primary"
              size="sm"
              :disabled="loginDisabled"
              :loading="loginBusy"
              :label="loginPending ? t('auth.signingIn') : t('auth.login')"
              @click="login"
            />
          </UTooltip>
          <UPopover v-else-if="profile">
            <button
              class="flex max-w-60 items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              :aria-label="t('auth.openMenu')"
            >
              <UAvatar :alt="profile.displayName" :text="profile.initials" size="sm" />
              <span class="hidden min-w-0 sm:block">
                <span class="block truncate text-sm font-medium">{{ profile.displayName }}</span>
                <span v-if="profile.email" class="block truncate text-xs text-muted">{{ profile.email }}</span>
              </span>
              <UIcon name="i-lucide-chevron-down" class="size-4 text-muted" />
            </button>
            <template #content>
              <section class="w-80 p-3" :aria-label="t('auth.account')">
                <div class="flex items-center gap-3 border-b border-default pb-3">
                  <UAvatar :alt="profile.displayName" :text="profile.initials" size="lg" />
                  <div class="min-w-0">
                    <p class="truncate font-semibold text-highlighted">{{ profile.displayName }}</p>
                    <p v-if="profile.email" class="truncate text-sm text-muted">{{ profile.email }}</p>
                    <p v-else-if="profile.username" class="truncate text-sm text-muted">@{{ profile.username }}</p>
                  </div>
                </div>
                <div v-if="profile.organizations.length" class="py-3">
                  <p class="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{{ t('auth.organization') }}</p>
                  <div class="flex flex-wrap gap-1.5">
                    <UBadge v-for="organization in profile.organizations" :key="organization" color="neutral" variant="subtle">
                      {{ organization }}
                    </UBadge>
                  </div>
                </div>
                <div class="grid gap-2 border-t border-default pt-3">
                  <UButton
                    v-if="aiBridge.available"
                    icon="i-lucide-bot"
                    color="neutral"
                    variant="soft"
                    block
                    @click="aiConnection?.start()"
                  >
                    {{ t('aiBridge.menuItem') }}
                  </UButton>
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
        </div>
      </header>
      <main class="app-main">
        <RouterView name="default"></RouterView>
        <!-- Not remounted on sign-in/out: the stores reload their data in place
             (filters stay) and open private items close themselves. -->
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

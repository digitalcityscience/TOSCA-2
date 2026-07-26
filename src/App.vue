<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { RouterView } from "vue-router";
import { useMapStore } from "./store/map";
import toscaLogo from "./assets/GIZ-HCU-DCS-TOSCA_2.svg";

type ThemeMode = "light" | "dark";

const mapStore = useMapStore();
const themeMode = ref<ThemeMode>("light");
const isDarkMode = computed(() => themeMode.value === "dark");
const themeToggleLabel = computed(() => isDarkMode.value ? "Switch to light mode" : "Switch to dark mode");
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
        <RouterLink to="/" class="app-brand" aria-label="TOSCA home">
          TOSCA
        </RouterLink>
        <div class="flex items-center gap-1">
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
        <RouterView v-if="mapStore.map" name="participation"></RouterView>
      </main>
      <footer class="app-footer">
        <img class="app-footer-logo" :src="toscaLogo" alt="GIZ HCU DCS TOSCA" />
      </footer>
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
.app-footer {
    height: var(--tosca-app-footer-height);
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 0.5rem;
    padding: 0 1rem;
    border-top: 1px solid var(--tosca-app-border);
    background: var(--tosca-app-chrome-bg);
    color: var(--tosca-app-chrome-muted);
    font-size: 0.75rem;
    line-height: 1;
    z-index: 20;
}
.app-footer-logo {
    max-height: calc(var(--tosca-app-footer-height) - 0.375rem);
    max-width: min(32rem, calc(100vw - 2rem));
    object-fit: contain;
}
</style>

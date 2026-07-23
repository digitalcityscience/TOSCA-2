<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { RouterView } from "vue-router";
import { useMapStore } from "./store/map";

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
    <div class="app-container font-sans">
      <UTooltip :text="themeToggleLabel">
        <UButton
          class="theme-mode-toggle"
          :icon="themeToggleIcon"
          color="neutral"
          variant="soft"
          square
          :aria-label="themeToggleLabel"
          @click="toggleThemeMode"
        />
      </UTooltip>
      <RouterView name="default"></RouterView>
      <RouterView v-if="mapStore.map" name="participation"></RouterView>
    </div>
  </UApp>
</template>

<style scoped>
.app-container {
    width: 100%;
    height: 100%;
}
.theme-mode-toggle {
    position: fixed;
    top: 0.75rem;
    left: 50%;
    z-index: 30;
    transform: translateX(-50%);
    width: 2.375rem;
    height: 2.375rem;
    padding: 0;
    box-shadow: 0 12px 30px rgb(15 23 42 / 0.22);
}
</style>

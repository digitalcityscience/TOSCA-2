<script setup lang="ts">
import { RouterView } from "vue-router";
import { useMapStore } from "./store/map";
import { useAuthStore } from "@store/auth";

const loginUrl = import.meta.env.VITE_OAUTH_AUTH_URL as string;
const authStore = useAuthStore();

</script>

<template>
  <div class="app-container font-sans">
    <a :href="loginUrl" class="material-icons" v-if="!authStore.isAuthenticated">
      login
    </a>
    <RouterView name="default"></RouterView>
    <RouterView v-if="useMapStore().map" name="participation"></RouterView>
  </div>
</template>

<style scoped>
.app-container {
  width: 100%;
  height: 100%;
}
</style>

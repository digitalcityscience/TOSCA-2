<script setup lang="ts">
import { RouterView } from "vue-router";
import { useMapStore } from "./store/map";
</script>

<template>
  <UApp>
    <div class="app-container font-sans">
      <RouterView name="default"></RouterView>
      <RouterView v-if="useMapStore().map" name="participation"></RouterView>
    </div>
  </UApp>
</template>

<style scoped>
.app-container {
    width: 100%;
    height: 100%;
}
</style>

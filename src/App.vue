<script setup lang="ts">
import { RouterView } from "vue-router";
import { useMapStore } from "./store/map";
</script>

<template>
  <div class="app-container font-sans">
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

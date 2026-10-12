<template>
    <div class="hr-side" data-testid="riders-controls">
        <HamburgRidersStatistics @close="riders.closeControls()" />
        <HamburgRidersLayerSelector />
    </div>
</template>

<script setup lang="ts">
import { useHamburgRidersStore } from "@store/hamburgRiders";
import HamburgRidersLayerSelector from "./HamburgRidersLayerSelector.vue";
import HamburgRidersStatistics from "./HamburgRidersStatistics.vue";

const riders = useHamburgRidersStore();
</script>

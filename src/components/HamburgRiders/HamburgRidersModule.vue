<template>
    <div v-if="riders.active" ref="rootElement" class="hr-root" data-testid="riders-module">
        <HamburgRidersControls v-if="riders.controlsVisible" />
        <button
            v-else-if="riders.controlsWanted"
            type="button"
            class="hr-reopen"
            data-testid="riders-reopen"
            @click="riders.openControls()"
        >
            <span aria-hidden="true">🚆</span>{{ t("hamburgRiders.controls.reopen") }}
        </button>
        <HamburgRidersTimeline v-if="riders.effective.timeline" />
    </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useHamburgRidersStore } from "@store/hamburgRiders";
import HamburgRidersControls from "./HamburgRidersControls.vue";
import HamburgRidersTimeline from "./HamburgRidersTimeline.vue";
import { useMapInsets } from "./useMapInsets";
import "./hamburgRiders.css";

/**
 * The floating HamburgRiders UI: control panel (statistics, layer selector) and timeline. It renders nothing
 * while no consumer has activated HamburgRiders, so mounting it costs nothing for the other stories.
 */
const { t } = useI18n();
const riders = useHamburgRidersStore();
const rootElement = ref<HTMLElement>();
useMapInsets(rootElement);
</script>

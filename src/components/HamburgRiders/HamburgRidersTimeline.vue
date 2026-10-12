<template>
    <div class="hr-timeline" role="group" :aria-label="t('hamburgRiders.timeline.label')" data-testid="riders-timeline">
        <div class="hr-timeline-main">
            <button
                type="button"
                class="hr-play"
                data-testid="riders-play-pause"
                :aria-pressed="riders.playing"
                @click="riders.setPlaying(!riders.playing)"
            >{{ riders.playing ? `⏸ ${t("hamburgRiders.timeline.pause")}` : `▶ ${t("hamburgRiders.timeline.play")}` }}</button>
            <span class="hr-time" data-testid="riders-time">{{ formatRidersTime(riders.time) }}</span>
            <input
                class="hr-slider"
                type="range"
                data-testid="riders-slider"
                :min="ANIM_START_SEC"
                :max="ANIM_END_SEC"
                step="30"
                :value="riders.time"
                :aria-label="t('hamburgRiders.timeline.time')"
                @input="riders.setTime(Number(($event.target as HTMLInputElement).value))"
            >
        </div>
        <span class="hr-speed-label">{{ t("hamburgRiders.timeline.speed") }}</span>
        <select
            class="hr-speed"
            data-testid="riders-speed"
            :aria-label="t('hamburgRiders.timeline.speed')"
            :value="riders.speed"
            @change="riders.setSpeed(Number(($event.target as HTMLSelectElement).value))"
        >
            <option v-for="option in SPEED_OPTIONS" :key="option" :value="option">{{ option }}×</option>
        </select>
        <span v-if="serviceDate" class="hr-service" data-testid="riders-service-date">
            {{ t("hamburgRiders.timeline.service", { date: serviceDate }) }}
        </span>
    </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useHamburgRidersStore } from "@store/hamburgRiders";
import { ANIM_END_SEC, ANIM_START_SEC, SPEED_OPTIONS } from "@helpers/hamburgRiders/ridersConfig";
import { formatRidersTime } from "@helpers/hamburgRiders/ridersVehicles";

const { t } = useI18n();
const riders = useHamburgRidersStore();
const serviceDate = computed(() => riders.dataset?.meta.dateLabel);
</script>

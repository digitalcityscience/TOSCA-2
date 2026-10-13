<template>
    <section class="hr-panel" :class="{ 'hr-collapsed': collapsed }" data-testid="riders-statistics">
        <div class="hr-panel-header" @click="collapsed = !collapsed">
            <h3>{{ t("hamburgRiders.statistics.title") }}</h3>
            <div class="hr-header-actions">
                <button
                    type="button"
                    class="hr-icon-btn"
                    :aria-expanded="!collapsed"
                    :aria-label="collapsed ? t('hamburgRiders.controls.expand') : t('hamburgRiders.controls.collapse')"
                    @click.stop="collapsed = !collapsed"
                >{{ collapsed ? "⌃" : "⌄" }}</button>
                <button
                    type="button"
                    class="hr-icon-btn"
                    data-testid="riders-close-controls"
                    :aria-label="t('hamburgRiders.controls.close')"
                    @click.stop="emit('close')"
                >×</button>
            </div>
        </div>
        <div class="hr-panel-body">
            <div class="hr-stat-row">
                <span class="hr-stat-label">{{ t("hamburgRiders.statistics.active") }}</span>
                <span class="hr-stat-value" data-testid="riders-stat-active">{{ format(riders.stats.active) }}</span>
            </div>
            <div class="hr-stat-row">
                <span class="hr-stat-label">{{ t("hamburgRiders.statistics.cumulative") }}</span>
                <span class="hr-stat-value" data-testid="riders-stat-cumulative">{{ format(riders.stats.cumulative) }}</span>
            </div>
            <div class="hr-stat-row">
                <span class="hr-stat-label">{{ t("hamburgRiders.statistics.total") }}</span>
                <span class="hr-stat-value" data-testid="riders-stat-total">{{ format(riders.stats.total) }}</span>
            </div>
            <p class="hr-note">{{ t("hamburgRiders.statistics.scope") }}</p>
            <details v-if="meta" class="hr-about">
                <summary>{{ t("hamburgRiders.about.title") }}</summary>
                <p>{{ t("hamburgRiders.timeline.service", { date: meta.dateLabel }) }}</p>
                <p>{{ t("hamburgRiders.about.feed", { publisher: meta.feed.publisher, version: meta.feed.version, start: meta.feed.startDate, end: meta.feed.endDate }) }}</p>
                <p>{{ t("hamburgRiders.about.source") }}</p>
                <p>{{ t("hamburgRiders.about.credits") }}</p>
            </details>
        </div>
    </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useHamburgRidersStore } from "@store/hamburgRiders";

const emit = defineEmits<{ close: [] }>();
const { t, locale } = useI18n();
const riders = useHamburgRidersStore();
const collapsed = ref(typeof window !== "undefined" && window.matchMedia?.("(max-width: 700px)").matches === true);
const meta = computed(() => riders.dataset?.meta);

function format(value: number): string {
    return value.toLocaleString(locale.value);
}
</script>

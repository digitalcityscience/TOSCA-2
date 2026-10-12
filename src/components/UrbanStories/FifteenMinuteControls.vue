<template>
    <section class="grid gap-3 rounded-md border border-muted px-3 py-2" data-testid="fifteen-minute-controls" :data-mode="store.mode">
        <h4 v-if="store.mode !== 'overall'" class="text-sm font-semibold text-highlighted">{{ t("urbanStories.fifteenMinute.controlsTitle") }}</h4>

        <UAlert
            v-if="store.buildingsState === 'tiles-unavailable'"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            :title="t('urbanStories.fifteenMinute.unavailable.title')"
            :description="t('urbanStories.fifteenMinute.unavailable.description')"
            data-testid="fifteen-minute-tiles-unavailable"
        />

        <label v-if="showCategory" class="grid gap-1">
            <span class="text-xs font-medium text-muted">{{ t("urbanStories.fifteenMinute.category.label") }}</span>
            <USelect
                :model-value="categoryValue"
                :items="categoryItems"
                size="sm"
                class="w-full"
                data-testid="category-select"
                @update:model-value="onCategory"
            />
            <span class="text-xs text-muted">{{ t("urbanStories.fifteenMinute.category.help") }}</span>
        </label>

        <div v-if="store.mode === 'gaps'" class="grid gap-2" data-testid="gap-controls">
            <h5 class="text-xs font-semibold text-highlighted">{{ t("urbanStories.fifteenMinute.gap.title") }}</h5>
            <label class="flex items-center gap-2 text-xs">
                <USwitch :model-value="store.gapEnabled" size="sm" data-testid="gap-enabled" @update:model-value="store.setGapEnabled(Boolean($event))" />
                <span>{{ t("urbanStories.fifteenMinute.gap.enable") }}</span>
            </label>
            <label class="grid gap-1">
                <span class="text-xs font-medium text-muted">{{ t("urbanStories.fifteenMinute.gap.threshold") }}</span>
                <USelect
                    :model-value="String(store.gapMaxScore)"
                    :items="thresholdItems"
                    size="sm"
                    class="w-full"
                    :disabled="!store.gapEnabled"
                    data-testid="gap-threshold"
                    @update:model-value="store.setGapMaxScore(Number($event))"
                />
            </label>
            <label class="flex items-center gap-2 text-xs">
                <USwitch
                    :model-value="store.gapMissingCategoryOnly"
                    size="sm"
                    :disabled="store.category === null"
                    data-testid="gap-missing-only"
                    @update:model-value="store.setGapMissingCategoryOnly(Boolean($event))"
                />
                <span>{{ t("urbanStories.fifteenMinute.gap.missingOnly") }}</span>
            </label>
            <p v-if="store.category === null" class="text-xs text-muted">{{ t("urbanStories.fifteenMinute.gap.missingNeedsCategory") }}</p>
            <p class="text-xs text-muted">{{ t("urbanStories.fifteenMinute.gap.help") }}</p>
        </div>

        <div v-if="store.mode === 'neighbourhoods'" class="grid gap-2" data-testid="admin-controls">
            <h5 class="text-xs font-semibold text-highlighted">{{ t("urbanStories.fifteenMinute.admin.title") }}</h5>
            <label class="grid gap-1">
                <span class="text-xs font-medium text-muted">{{ t("urbanStories.fifteenMinute.admin.level") }}</span>
                <USelect :model-value="store.adminLevel" :items="levelItems" size="sm" class="w-full" data-testid="admin-level" @update:model-value="store.setAdminLevel($event as AdministrativeLevel)" />
            </label>
            <label class="grid gap-1">
                <span class="text-xs font-medium text-muted">{{ t("urbanStories.fifteenMinute.admin.metric") }}</span>
                <USelect :model-value="store.adminMetric" :items="adminMetricItems" size="sm" class="w-full" data-testid="admin-metric" @update:model-value="store.setAdminMetric($event as AdministrativeMetric)" />
            </label>
            <p class="text-xs text-muted">{{ t("urbanStories.fifteenMinute.admin.explain") }}</p>
            <p class="text-xs text-muted">{{ t("urbanStories.fifteenMinute.admin.zoomHint") }}</p>
        </div>

        <div v-if="store.selectionEnabled" class="grid gap-2" data-testid="selection-panel">
            <h5 class="text-xs font-semibold text-highlighted">{{ t("urbanStories.fifteenMinute.selection.title") }}</h5>
            <p v-if="store.profile === undefined" class="text-xs text-muted" data-testid="selection-hint">{{ t("urbanStories.fifteenMinute.selection.hint") }}</p>
            <template v-else>
                <p class="text-xs" data-testid="selection-id">
                    <span class="font-medium">{{ t("urbanStories.fifteenMinute.selection.id") }}:</span>
                    {{ store.selection?.featureId ?? t("urbanStories.fifteenMinute.selection.idMissing") }}
                </p>
                <p class="flex items-center gap-2 text-sm" data-testid="selection-score">
                    <span class="inline-block size-3.5 rounded-sm border border-default" :style="{ backgroundColor: store.profile.scoreColor }" aria-hidden="true" />
                    <span>
                        {{ t("urbanStories.fifteenMinute.selection.score") }}:
                        <strong>{{ store.profile.score === null ? t("urbanStories.fifteenMinute.selection.noScore") : `${store.profile.score} / 9` }}</strong>
                    </span>
                </p>
                <p v-if="store.profile.decayScore !== null" class="text-xs text-muted" data-testid="selection-decay">
                    {{ t("urbanStories.fifteenMinute.selection.decay") }}: {{ store.profile.decayScore.toFixed(1) }}
                </p>
                <p v-if="store.profile.confidence !== null" class="text-xs text-muted">
                    {{ t("urbanStories.fifteenMinute.selection.confidence") }}: {{ store.profile.confidence }}
                </p>
                <h6 class="text-xs font-medium text-muted">{{ t("urbanStories.fifteenMinute.selection.categories") }}</h6>
                <ul class="grid gap-1" data-testid="selection-categories">
                    <li v-for="item in store.profile.categories" :key="item.id" class="flex items-start gap-2 text-xs" :data-category="item.id" :data-state="item.state">
                        <span class="mt-0.5 inline-block size-3 shrink-0 rounded-full" :style="{ backgroundColor: item.color }" aria-hidden="true" />
                        <span class="min-w-0">
                            <span class="font-medium">{{ localize(item.label, locale) }}:</span>
                            {{ t(`urbanStories.fifteenMinute.selection.${item.state}`) }}
                            <span v-if="item.places !== null" class="text-muted">
                                · {{ t("urbanStories.fifteenMinute.selection.places", { count: item.places }) }}
                            </span>
                            <span v-if="item.walkMinutes !== null" class="text-muted">
                                · {{ t("urbanStories.fifteenMinute.selection.walk", { minutes: item.walkMinutes.toFixed(1) }) }}
                            </span>
                        </span>
                    </li>
                </ul>
                <p class="text-xs text-muted">{{ t("urbanStories.fifteenMinute.selection.tilesNote") }}</p>
                <div>
                    <UButton size="xs" color="neutral" variant="outline" icon="i-lucide-x" data-testid="selection-clear" @click="store.clearSelection()">
                        {{ t("urbanStories.fifteenMinute.selection.clear") }}
                    </UButton>
                </div>
            </template>
        </div>

        <section class="grid gap-3" data-testid="fifteen-minute-legends">
            <h5 class="text-xs font-semibold text-highlighted">{{ t("urbanStories.fifteenMinute.legend.title") }}</h5>
            <FifteenMinuteLegend v-for="legend in legends" :key="legend.styleName" :legend="legend" />
            <p v-if="store.effectiveCategory !== null" class="flex items-center gap-2 text-xs" data-testid="legend-poi">
                <span class="inline-block size-3 shrink-0 rounded-full border border-default" :style="{ backgroundColor: poiColor }" aria-hidden="true" />
                {{ localize({ en: `Destinations: ${categoryLabel.en}`, de: `Ziele: ${categoryLabel.de}` }, locale) }}
            </p>
            <p class="text-xs text-muted">{{ t("urbanStories.fifteenMinute.legend.buildingNote") }}</p>
        </section>
    </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useFifteenMinuteStore } from "@store/urbanStories.fifteenMinute";
import { localize } from "../../config/urbanStories";
import {
    adminLegend,
    ADMIN_METRIC_SCALES,
    categoryLegend,
    CATEGORY_FIELDS,
    isFifteenMinuteCategoryId,
    overallLegend,
    poiLegendColor,
    type AdministrativeLevel,
    type AdministrativeMetric,
} from "../../config/urbanStories/styles/fifteenMinute";
import FifteenMinuteLegend from "./FifteenMinuteLegend.vue";

const { t, locale } = useI18n();
const store = useFifteenMinuteStore();

const showCategory = computed(() => store.mode === "category" || store.mode === "gaps");
const OVERALL = "__overall";
const categoryValue = computed(() => store.category ?? OVERALL);
const categoryItems = computed(() => [
    { label: t("urbanStories.fifteenMinute.category.overall"), value: OVERALL },
    ...store.categoryOptions.map((option) => ({
        label: option.available
            ? localize(option.label, locale.value)
            : `${localize(option.label, locale.value)} (${t("urbanStories.fifteenMinute.category.unavailable")})`,
        value: option.id,
        disabled: !option.available,
    })),
]);
const thresholdItems = computed(() => Array.from({ length: 9 }, (_, count) => ({
    value: String(count),
    label: t("urbanStories.fifteenMinute.gap.thresholdOption", { count }),
})));
const levelItems = computed(() => (["stadtteile", "bezirke"] as const).map((value) => ({
    value, label: t(`urbanStories.fifteenMinute.admin.${value}`),
})));
const adminMetricItems = computed(() => (Object.keys(ADMIN_METRIC_SCALES) as AdministrativeMetric[]).map((value) => ({
    value, label: localize(ADMIN_METRIC_SCALES[value].label, locale.value),
})));

const legends = computed(() => {
    if (store.mode === undefined) return [];
    const building = store.effectiveCategory === null ? overallLegend() : categoryLegend(store.effectiveCategory);
    return store.mode === "neighbourhoods" ? [adminLegend(store.adminMetric), building] : [building];
});
const categoryLabel = computed(() => CATEGORY_FIELDS[store.effectiveCategory ?? "food"].label);
const poiColor = computed(() => poiLegendColor(store.effectiveCategory ?? "food"));

function onCategory(value: unknown): void {
    void store.selectCategory(isFifteenMinuteCategoryId(value) ? value : null);
}
</script>

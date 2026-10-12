<template>
    <section class="grid gap-1.5 rounded-md border border-primary px-3 py-2" data-testid="gs-area-card" :data-area-id="props.row.id">
        <h6 class="text-xs font-semibold text-highlighted">{{ props.row.name }}<span v-if="props.row.bezirk !== ''" class="font-normal text-muted"> · {{ props.row.bezirk }}</span></h6>
        <dl class="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
            <template v-for="line in lines" :key="line.key">
                <dt :class="line.active ? 'font-semibold text-highlighted' : 'text-muted'">{{ line.label }}</dt>
                <dd class="text-right font-medium" :data-testid="`gs-area-${line.key}`">{{ line.value }}</dd>
            </template>
        </dl>
        <p class="text-xs text-muted">
            {{ tr(
                `Based on ${props.row.parkN.toLocaleString(locale)} residential buildings with a computable time. Building values, not residents; a statistic needs at least 5 buildings.`,
                `Basiert auf ${props.row.parkN.toLocaleString(locale)} Wohngebäuden mit berechenbarer Zeit. Gebäudewerte, keine Einwohner; eine Statistik braucht mindestens 5 Gebäude.`
            ) }}
        </p>
    </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { StadtteilRow } from "@helpers/greenSpacesData";
import { formatMinutes, formatShare, type AdminMeasure } from "../../config/urbanStories/styles/greenSpaces";

interface Props {
    row: StadtteilRow
    /** The measure the map currently shows; its row is marked. */
    measure?: AdminMeasure
}

const props = defineProps<Props>();
const { locale } = useI18n();
const tr = (en: string, de: string): string => (locale.value === "de" ? de : en);

/** Every published value of the Stadtteil, each in its own unit: minutes to a park, minutes to a playground, shares of land or buildings. */
const lines = computed(() => [
    { key: "park-median", label: tr("Median walk to a park", "Median Weg zum Park"), value: formatMinutes(props.row.parkMedian, locale.value), active: props.measure === "park" },
    { key: "park-p90", label: tr("Walk to a park, 90th percentile", "Weg zum Park, 90. Perzentil"), value: formatMinutes(props.row.parkP90, locale.value), active: false },
    { key: "playground-median", label: tr("Median walk to a playground", "Median Weg zum Spielplatz"), value: formatMinutes(props.row.playgroundMedian, locale.value), active: props.measure === "playground" },
    { key: "playground-p90", label: tr("Walk to a playground, 90th percentile", "Weg zum Spielplatz, 90. Perzentil"), value: formatMinutes(props.row.playgroundP90, locale.value), active: false },
    { key: "coverage-recreational", label: tr("Land covered by recreational parks", "Von Parkanlagen bedeckte Fläche"), value: formatShare(props.row.coverageRecreational, locale.value), active: props.measure === "coverage-recreational" },
    { key: "coverage-green", label: tr("Land covered by all official green", "Von amtlichem Grün bedeckte Fläche"), value: formatShare(props.row.coverageGreen, locale.value), active: props.measure === "coverage-green" },
    { key: "large-green", label: tr("Buildings with a large green space in 15 min", "Gebäude mit großer Grünfläche in 15 Min."), value: formatShare(props.row.largeGreenShare, locale.value), active: props.measure === "large-green" },
]);
</script>

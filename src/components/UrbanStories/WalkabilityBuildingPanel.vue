<template>
    <section v-if="store.selectionEnabled" class="grid gap-2 rounded-md border border-muted px-3 py-3" data-testid="walk-building-profile">
        <h4 class="text-sm font-semibold text-highlighted">{{ label("Building details", "Gebäudedetails") }}</h4>
        <p v-if="store.profile === undefined" class="text-sm text-muted">{{ label("Click a building to see its identity, use and walking surroundings.", "Klicken Sie auf ein Gebäude für Kennung, Nutzung und Fußweg-Umfeld.") }}</p>
        <template v-else>
            <dl class="grid gap-2 text-sm" data-testid="building-identity">
                <div class="grid gap-1"><dt class="text-muted">ALKIS ID</dt><dd class="break-all font-semibold">{{ store.profile.alkisId ?? noData }}</dd></div>
                <div class="flex items-baseline justify-between gap-3"><dt>{{ label("Building use (ALKIS code)", "Gebäudenutzung (ALKIS-Code)") }}</dt><dd>{{ store.profile.functionCode ?? noData }}</dd></div>
                <div class="flex items-baseline justify-between gap-3"><dt>{{ label("Residential classification", "Wohngebäude-Klassifikation") }}</dt><dd>{{ store.profile.residential === undefined ? noData : store.profile.residential ? label("Residential / mixed with housing", "Wohnen / Mischnutzung mit Wohnen") : label("Non-residential", "Nichtwohngebäude") }}</dd></div>
                <div class="flex items-baseline justify-between gap-3"><dt>{{ label("Height", "Höhe") }}</dt><dd>{{ store.profile.height === undefined ? noData : `${store.profile.height} m` }}</dd></div>
                <div class="flex items-baseline justify-between gap-3"><dt>{{ label("Footprint area", "Grundfläche") }}</dt><dd>{{ store.profile.footprintArea === undefined ? noData : `${store.profile.footprintArea} m²` }}</dd></div>
            </dl>
            <h5 class="mt-2 text-sm font-semibold">{{ label("Walking surroundings · 400 m", "Fußweg-Umfeld · 400 m") }}</h5>
            <p class="text-sm text-default">These values describe streets reachable within a 400-metre walk from this building.</p>
            <dl class="grid gap-2 text-sm">
                <div class="flex items-baseline justify-between gap-3"><dt>Walking safety</dt><dd class="font-semibold">{{ score(store.profile.safety) }}</dd></div>
                <div class="flex items-baseline justify-between gap-3"><dt>Walking comfort</dt><dd class="font-semibold">{{ score(store.profile.comfort) }}</dd></div>
                <div v-if="store.profile.coveredLength !== undefined" class="flex items-baseline justify-between gap-3"><dt>Street length used</dt><dd>{{ Math.round(store.profile.coveredLength) }} m</dd></div>
                <div v-if="store.profile.scoredShare !== undefined" class="flex items-baseline justify-between gap-3"><dt>Street data available</dt><dd>{{ Math.round(store.profile.scoredShare * 100) }}%</dd></div>
            </dl>
            <p class="text-xs text-muted">Safety: higher means fewer recorded crashes in the model. It is not a personal risk prediction.</p>
            <p v-if="store.profile.reason !== undefined" class="text-xs text-muted">No value because: {{ store.profile.reason }}</p>
            <UButton size="xs" color="neutral" variant="outline" @click="store.clearSelection()">Clear selection</UButton>
        </template>
    </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useWalkabilitySafetyStore } from "@store/urbanStories.walkabilitySafety";

const store = useWalkabilitySafetyStore();
const { locale } = useI18n();
const label = (en: string, de: string): string => locale.value === "de" ? de : en;
const noData = computed(() => label("Not available", "Nicht verfügbar"));
function score(value: number | undefined): string { return value === undefined ? "No data" : `${Math.round(value)} / 100`; }
</script>

<template>
    <section class="grid gap-2 rounded-md border border-muted px-3 py-2" data-testid="equity-riders">
        <label class="flex items-center gap-2 text-xs font-semibold text-highlighted">
            <USwitch :model-value="store.ridersOn" size="sm" data-testid="riders-toggle" @update:model-value="store.setRidersOn(Boolean($event))" />
            <span>{{ text("ridersTitle") }}</span>
        </label>
        <p class="text-xs text-muted">{{ text("ridersExplain") }}</p>
        <template v-if="store.ridersOn">
            <div class="flex flex-wrap gap-1.5" data-testid="riders-modes">
                <UButton
                    v-for="mode in MODES"
                    :key="mode.value"
                    size="xs"
                    :color="store.ridersModes.includes(mode.value) ? 'primary' : 'neutral'"
                    :variant="store.ridersModes.includes(mode.value) ? 'solid' : 'outline'"
                    :aria-pressed="store.ridersModes.includes(mode.value)"
                    :data-testid="`riders-mode-${mode.value}`"
                    @click="store.toggleRidersMode(mode.value)"
                >{{ localize(mode.label, locale) }}</UButton>
            </div>
            <p v-if="store.ridersState.loading === 'loading'" class="text-xs text-muted" role="status">{{ text("ridersLoading") }}</p>
            <p v-else-if="store.ridersState.loading === 'error'" class="text-xs text-error" role="alert">{{ text("ridersError") }}</p>
            <p v-else-if="store.ridersState.serviceDate !== undefined" class="text-xs" data-testid="riders-date">
                {{ text("ridersDate") }}: <strong>{{ store.ridersState.serviceDate }}</strong>
            </p>
            <p class="text-xs text-muted">{{ text("ridersNoVehicles") }}</p>
        </template>
    </section>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { RidersMode } from "@helpers/hamburgRiders/ridersApi";
import { useTransitEquityStore } from "@store/urbanStories.transitEquity";
import { localize } from "../../config/urbanStories";
import { EQUITY_TEXT, type EquityTextKey } from "../../config/urbanStories/transitEquityText";

const store = useTransitEquityStore();
const { locale } = useI18n();
const text = (key: EquityTextKey): string => localize(EQUITY_TEXT[key], locale.value);

const MODES: { value: RidersMode, label: { en: string, de: string } }[] = [
    { value: "u-bahn", label: { en: "U-Bahn", de: "U-Bahn" } },
    { value: "s-bahn", label: { en: "S-Bahn", de: "S-Bahn" } },
    { value: "regional", label: { en: "Regional", de: "Regional" } },
    { value: "bus", label: { en: "Bus", de: "Bus" } },
];
</script>

<template>
    <section class="grid gap-1.5 rounded-md border border-muted px-3 py-2" data-testid="equity-building-card" :data-building-id="props.profile.id ?? undefined">
        <h6 class="flex items-center gap-2 text-xs font-semibold text-highlighted">
            <span class="inline-block size-3 shrink-0 rounded-sm border border-default" :style="{ backgroundColor: swatch }" aria-hidden="true" />
            {{ props.title ?? text("building") }}
            <span v-if="props.profile.id !== null" class="font-normal text-muted">{{ props.profile.id }}</span>
        </h6>
        <p v-if="!props.profile.residential" class="text-xs text-muted">{{ text("notHousing") }}</p>
        <dl class="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
            <dt class="text-muted">{{ text("officialStatus") }}</dt>
            <dd class="text-right font-medium" data-testid="card-official">{{ officialText }}</dd>
            <dt class="text-muted">{{ text("walkTime") }}</dt>
            <dd class="text-right font-medium" data-testid="card-walk">{{ walkText }}</dd>
            <dt class="text-muted">{{ text("departuresPerDay") }}</dt>
            <dd class="text-right font-medium" data-testid="card-departures">{{ departuresText }}</dd>
            <dt class="text-muted">{{ text("linesInReach") }}</dt>
            <dd class="text-right font-medium" data-testid="card-lines">{{ props.profile.lines === null ? "–" : number(props.profile.lines) }}</dd>
            <template v-if="props.profile.stops !== null">
                <dt class="text-muted">{{ text("stopsInReach") }}</dt>
                <dd class="text-right font-medium">{{ number(props.profile.stops) }}</dd>
            </template>
            <template v-if="props.profile.accessClass !== null">
                <dt class="text-muted">{{ text("classLabel") }}</dt>
                <dd class="text-right font-medium">{{ props.profile.accessClass.replaceAll("_", " ") }}</dd>
            </template>
            <dt class="text-muted">{{ text("heightLabel") }}</dt>
            <dd class="text-right font-medium">{{ props.profile.heightM === null ? text("heightMissing") : `${decimal(props.profile.heightM)} m` }}</dd>
        </dl>
        <slot />
    </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { localize } from "../../config/urbanStories";
import { EQUITY_TEXT, type EquityTextKey } from "../../config/urbanStories/transitEquityText";
import { AGREEMENT_COLORS, COVERAGE_COLORS, NO_DATA_COLOR, type BuildingProfile } from "../../config/urbanStories/styles/transitEquity";

interface Props {
    profile: BuildingProfile
    title?: string
    /** Which colour the swatch shows: the coverage class or the four-class agreement. */
    view?: "coverage" | "agreement"
}

const props = withDefaults(defineProps<Props>(), { title: undefined, view: "coverage" });
const { locale } = useI18n();

const text = (key: EquityTextKey): string => localize(EQUITY_TEXT[key], locale.value);
const number = (value: number): string => new Intl.NumberFormat(locale.value).format(value);
const decimal = (value: number): string => new Intl.NumberFormat(locale.value, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);

const swatch = computed(() => {
    if (props.view === "agreement") return props.profile.agreement === "no-origin" ? NO_DATA_COLOR : AGREEMENT_COLORS[props.profile.agreement];
    return props.profile.inCatchment === null ? NO_DATA_COLOR : props.profile.inCatchment ? COVERAGE_COLORS.inside : COVERAGE_COLORS.outside;
});
const officialText = computed(() => (props.profile.inCatchment === null ? "–" : props.profile.inCatchment ? text("inside") : text("outside")));
const walkText = computed(() => {
    switch (props.profile.walkState) {
        case "minutes": return `${decimal(props.profile.walkMin ?? 0)} ${text("minutes")}`;
        case "none-within-15": return text("walkNone");
        default: return text("walkNoOrigin");
    }
});
const departuresText = computed(() => {
    if (props.profile.departures === null) return "–";
    const value = number(props.profile.departures);
    return props.profile.departuresComplete ? value : `${text("departuresIncomplete")} ${value}`;
});
</script>

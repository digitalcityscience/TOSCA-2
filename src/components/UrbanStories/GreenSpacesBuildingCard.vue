<template>
    <section
        class="grid gap-1.5 rounded-md border px-3 py-2"
        :class="props.selected ? 'border-primary' : 'border-muted'"
        data-testid="gs-building-card"
        :data-building-id="props.profile.id ?? undefined"
        :data-selected="props.selected ? 'true' : undefined"
    >
        <h6 class="flex flex-wrap items-center gap-x-2 text-xs font-semibold text-highlighted">
            <span v-if="props.marker !== undefined" class="inline-flex size-4 items-center justify-center rounded-full border border-default bg-default text-[0.65rem]">{{ props.marker }}</span>
            <span>{{ props.title ?? tr("Building", "Gebäude") }}</span>
            <span v-if="props.profile.id !== null" class="font-normal text-muted">{{ props.profile.id }}</span>
        </h6>
        <p v-if="props.profile.residential === false" class="text-xs text-muted">{{ tr("Not a housing building.", "Kein Wohngebäude.") }}</p>
        <dl class="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
            <template v-for="row in rows" :key="row.key">
                <dt :class="row.active ? 'font-semibold text-highlighted' : 'text-muted'">
                    <span class="mr-1.5 inline-block size-2 rounded-full" :style="{ backgroundColor: row.color }" aria-hidden="true" />{{ row.label }}
                    <span v-if="row.active" class="font-normal text-muted"> · {{ tr("on the map", "auf der Karte") }}</span>
                </dt>
                <dd class="text-right font-medium" :data-testid="`gs-card-${row.key}`" :data-state="row.state">{{ row.value }}</dd>
            </template>
            <template v-if="props.profile.heightM !== null">
                <dt class="text-muted">{{ tr("Building height", "Gebäudehöhe") }}</dt>
                <dd class="text-right font-medium">{{ props.profile.heightM.toLocaleString(locale) }} m</dd>
            </template>
        </dl>
        <p v-for="warning in warnings" :key="warning" class="text-xs text-warning" data-testid="gs-card-warning">{{ warning }}</p>
    </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import {
    AREA_CLASS_INFO,
    formatMinutes,
    type AccessMeasure,
    type AccessValue,
    type BuildingProfile,
} from "../../config/urbanStories/styles/greenSpaces";

interface Props {
    profile: BuildingProfile
    title?: string
    /** The measure the map currently shows; its row is marked. */
    measure?: AccessMeasure
    selected?: boolean
    /** Letter that ties the card to its marker on the map. */
    marker?: string
    /** Which destination the card shows: one scene tells one story, only the comparison shows both. */
    show?: "park" | "playground" | "both"
}

const props = withDefaults(defineProps<Props>(), { show: "both" });
const { locale } = useI18n();
const tr = (en: string, de: string): string => (locale.value === "de" ? de : en);

function describe(value: AccessValue): string {
    if (value.state === "ok") return formatMinutes(value.minutes, locale.value);
    return value.state === "no-origin" ? tr("not computable (no walking origin)", "nicht berechenbar (kein Wegeanschluss)") : tr("no value", "kein Wert");
}

// Park and playground are two destinations: two rows, never one score.
const rows = computed(() => [
    { key: "park", label: tr("Walk to the nearest park", "Weg zum nächsten Park"), value: describe(props.profile.park), state: props.profile.park.state, active: props.measure === "park", color: AREA_CLASS_INFO.recreational_park.color },
    { key: "playground", label: tr("Walk to the nearest playground", "Weg zum nächsten Spielplatz"), value: describe(props.profile.playground), state: props.profile.playground.state, active: props.measure === "playground", color: AREA_CLASS_INFO.playground.color },
].filter((row) => props.show === "both" || row.key === props.show));

const warnings = computed(() => {
    const list: string[] = [];
    const shown = [props.show !== "playground" ? props.profile.park : undefined, props.show !== "park" ? props.profile.playground : undefined];
    if (shown.some((value) => value?.state === "no-origin")) {
        list.push(tr("This building has no connection to the walking network, so no time can be modelled. It is not a zero-minute walk.", "Dieses Gebäude hat keinen Anschluss an das Fußwegenetz, daher lässt sich keine Zeit modellieren. Es ist kein Weg von null Minuten."));
    }
    return list;
});
</script>

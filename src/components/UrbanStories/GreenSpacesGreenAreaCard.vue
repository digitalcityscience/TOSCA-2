<template>
    <section class="grid gap-1.5 rounded-md border border-primary px-3 py-2" data-testid="gs-green-area-card" :data-area-id="props.profile.id ?? undefined">
        <h6 class="flex flex-wrap items-center gap-x-2 text-xs font-semibold text-highlighted">
            <span class="inline-block size-3 rounded-sm border border-default" :style="{ backgroundColor: color }" aria-hidden="true" />
            <span>{{ props.profile.name ?? tr("Unnamed area", "Unbenannte Fläche") }}</span>
        </h6>
        <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt class="text-muted">{{ tr("Class", "Klasse") }}</dt>
            <dd class="text-right font-medium" data-testid="gs-green-class">{{ localize(areaClassLabel(props.profile), locale) }}</dd>
            <dt class="text-muted">{{ tr("Official category", "Amtliche Kategorie") }}</dt>
            <dd class="text-right font-medium">{{ locale === "de" ? (props.profile.categoryDe ?? "–") : (props.profile.categoryEn ?? "–") }}</dd>
            <dt class="text-muted">{{ tr("Area", "Fläche") }}</dt>
            <dd class="text-right font-medium">{{ formatArea(props.profile.areaM2, locale) }}</dd>
            <template v-if="place !== ''">
                <dt class="text-muted">{{ tr("Place", "Ort") }}</dt>
                <dd class="text-right font-medium">{{ place }}</dd>
            </template>
            <template v-if="props.profile.ownership !== null">
                <dt class="text-muted">{{ tr("Ownership", "Eigentum") }}</dt>
                <dd class="text-right font-medium">{{ props.profile.ownership }}</dd>
            </template>
            <template v-if="props.profile.idnr !== null">
                <dt class="text-muted">dgp_idnr</dt>
                <dd class="text-right font-medium tabular-nums">{{ props.profile.idnr }}</dd>
            </template>
            <template v-if="props.profile.sourceVersion !== null">
                <dt class="text-muted">{{ tr("Source", "Quelle") }}</dt>
                <dd class="text-right font-medium">{{ tr("Digitaler Grünplan", "Digitaler Grünplan") }} {{ props.profile.sourceVersion }}</dd>
            </template>
        </dl>
        <p v-if="meaning !== undefined" class="text-xs text-muted">{{ meaning }}</p>
    </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { localize } from "../../config/urbanStories";
import { AREA_CLASS_INFO, areaClassLabel, formatArea, type GreenAreaProfile } from "../../config/urbanStories/styles/greenSpaces";

interface Props {
    profile: GreenAreaProfile
}

const props = defineProps<Props>();
const { locale } = useI18n();
const tr = (en: string, de: string): string => (locale.value === "de" ? de : en);
const color = computed(() => (props.profile.areaClass === null ? "#bdbdbd" : AREA_CLASS_INFO[props.profile.areaClass].color));
const place = computed(() => [props.profile.borough, props.profile.district].filter((part): part is string => part !== null).join(", "));
const meaning = computed(() => (props.profile.areaClass === null ? undefined : localize(AREA_CLASS_INFO[props.profile.areaClass].meaning, locale.value)));
</script>

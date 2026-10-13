<template>
    <section
        class="grid gap-1.5 rounded-md border px-3 py-2"
        :class="props.selected ? 'border-primary' : 'border-muted'"
        data-testid="fm-building-card"
        :data-building-id="props.profile.id ?? undefined"
        :data-selected="props.selected ? 'true' : undefined"
    >
        <h6 class="flex flex-wrap items-center gap-x-2 text-xs font-semibold text-highlighted">
            <span>{{ props.title ?? tr("Building", "Gebäude") }}</span>
            <span v-if="props.profile.id !== null" class="font-normal text-muted">{{ props.profile.id }}</span>
        </h6>
        <p v-if="props.profile.residential === false" class="text-xs text-muted">{{ tr("Not a housing building.", "Kein Wohngebäude.") }}</p>
        <dl class="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
            <template v-for="row in rows" :key="row.key">
                <dt :class="row.active ? 'font-semibold text-highlighted' : 'text-muted'">
                    {{ row.label }}
                    <span v-if="row.active" class="font-normal text-muted"> · {{ tr("on the map", "auf der Karte") }}</span>
                </dt>
                <dd class="text-right font-medium" :data-testid="`fm-card-${row.key}`">{{ row.value }}</dd>
            </template>
        </dl>
        <p
            v-for="warning in warnings"
            :key="warning"
            class="text-xs text-warning"
            data-testid="fm-card-warning"
        >{{ warning }}</p>
        <details v-if="props.showCategories" class="text-xs">
            <summary class="cursor-pointer select-none text-muted">{{ tr("Walking time to each category", "Gehzeit zu jeder Kategorie") }}</summary>
            <dl class="mt-1 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5" data-testid="fm-card-categories">
                <template v-for="item in props.profile.categories" :key="item.id">
                    <dt :class="item.id === activeCategory ? 'font-semibold text-highlighted' : 'text-muted'">{{ localize(item.label, locale) }}</dt>
                    <dd class="text-right font-medium">{{ categoryText(item) }}</dd>
                </template>
            </dl>
        </details>
    </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { localize } from "../../config/urbanStories";
import {
    categoryOfMeasure,
    type BuildingProfile,
    type CategoryProfile,
    type MeasureId,
} from "../../config/urbanStories/styles/fifteenMinute";

interface Props {
    profile: BuildingProfile
    title?: string
    /** The measure the map currently shows; its row is marked. */
    measure?: MeasureId
    selected?: boolean
    showCategories?: boolean
}

const props = withDefaults(defineProps<Props>(), { title: undefined, measure: undefined, selected: false, showCategories: false });
const { locale } = useI18n();

const tr = (en: string, de: string): string => (locale.value === "de" ? de : en);
const decimal = (value: number, digits = 1): string => new Intl.NumberFormat(locale.value, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
const dash = "–";

const activeCategory = computed(() => (props.measure === undefined ? undefined : categoryOfMeasure(props.measure)));

function categoryText(item: CategoryProfile): string {
    if (item.state === "none") return tr("none within 15 min", "keines in 15 Min.");
    if (item.state === "unknown") return dash;
    return item.walkMinutes === null ? tr("within 15 min", "in 15 Min.") : `${decimal(item.walkMinutes)} min`;
}

const COMFORT_REASON: Record<string, [string, string]> = {
    connector_exceeds_radius: ["Not computable: the nearest walking network is more than 400 m away.", "Nicht berechenbar: das nächste Wegenetz ist mehr als 400 m entfernt."],
    no_scored_segments: ["Not computable: no street within 400 m has a comfort score.", "Nicht berechenbar: keine Straße in 400 m hat einen Komfortwert."],
};

const rows = computed(() => {
    const p = props.profile;
    const measure = props.measure;
    const category = activeCategory.value;
    const list: { key: string; label: string; value: string; active: boolean }[] = [
        { key: "count", label: tr("Categories reached (0–9)", "Erreichte Kategorien (0–9)"), value: p.count === null ? dash : `${p.count} ${tr("of 9", "von 9")}`, active: false },
        { key: "access", label: tr("Overall accessibility (0–100)", "Gesamterreichbarkeit (0–100)"), value: p.decay === null ? dash : decimal(p.decay), active: measure === "access" },
    ];
    if (category !== undefined) {
        const item = p.categories.find((candidate) => candidate.id === category);
        list.push({
            key: "category",
            label: localize(item?.label ?? { en: "Category", de: "Kategorie" }, locale.value),
            value: item === undefined ? dash : categoryText(item),
            active: true,
        });
    }
    list.push(
        { key: "comfort", label: tr("Walking comfort within 400 m (0–100)", "Gehkomfort in 400 m (0–100)"), value: p.comfort === null ? dash : decimal(p.comfort), active: measure === "comfort" },
        { key: "safety", label: tr("Safety index within 400 m (0–100)", "Sicherheitsindex in 400 m (0–100)"), value: p.safety === null ? dash : decimal(p.safety), active: measure === "safety" },
        {
            key: "green",
            label: tr("Large green space (0–100)", "Große Grünfläche (0–100)"),
            value: p.green === null ? dash : p.green === 0 ? tr("none within 15 min", "keine in 15 Min.") : decimal(p.green),
            active: measure === "green",
        },
        { key: "park", label: tr("Official park", "Offizieller Park"), value: p.dgpPark === null ? dash : `${decimal(p.dgpPark)} min`, active: measure === "green-park" },
        { key: "height", label: tr("Building height", "Gebäudehöhe"), value: p.heightM === null ? tr("not available", "nicht verfügbar") : `${decimal(p.heightM)} m`, active: false },
    );
    return list;
});

/** Coverage and confidence notes for the values the reader may read as facts. */
const warnings = computed(() => {
    const p = props.profile;
    const list: string[] = [];
    if (p.confidence === "low") list.push(tr("Low data confidence: the walking connection to the street network is poor, so all values of this building are less reliable.", "Geringe Datenverlässlichkeit: Der Weg zum Straßennetz ist schlecht angebunden, daher sind alle Werte dieses Gebäudes weniger verlässlich."));
    if (p.confidence === "none" || p.originQuality === "none") list.push(tr("No score: this building has no walking origin on the street network. Missing is not zero.", "Kein Wert: Dieses Gebäude hat keinen Wegeanschluss ans Straßennetz. Fehlend ist nicht null."));
    const measure = props.measure;
    if (measure === "comfort") {
        if (p.comfort === null && p.comfortReason !== null) list.push(tr(...(COMFORT_REASON[p.comfortReason] ?? ["Comfort could not be computed.", "Komfort konnte nicht berechnet werden."])));
        if (p.comfortShare !== null && p.comfortShare < 0.8) list.push(tr(`Only ${decimal(p.comfortShare * 100, 0)} % of the street length within 400 m carries a comfort score.`, `Nur ${decimal(p.comfortShare * 100, 0)} % der Straßenlänge in 400 m hat einen Komfortwert.`));
        if (p.comfortConfidence !== null && p.comfortConfidence < 0.6) list.push(tr(`Comfort data confidence is low (${decimal(p.comfortConfidence, 2)} of 1).`, `Die Verlässlichkeit der Komfortdaten ist gering (${decimal(p.comfortConfidence, 2)} von 1).`));
    }
    if (measure === "safety") {
        if (p.safety === null && p.safetyReason !== null) list.push(tr("Safety index not computable: the nearest walking network is more than 400 m away.", "Sicherheitsindex nicht berechenbar: Das nächste Wegenetz ist mehr als 400 m entfernt."));
        if (p.safetyLength !== null && p.safetyLength < 1000) list.push(tr(`Only ${decimal(p.safetyLength / 1000, 1)} km of scored street network within 400 m, so the index rests on few streets.`, `Nur ${decimal(p.safetyLength / 1000, 1)} km bewertetes Wegenetz in 400 m, der Index beruht daher auf wenigen Straßen.`));
    }
    if (measure === "green-park" && p.dgpParkStatus !== null && p.dgpParkStatus !== "ok") list.push(tr("Official park distance not computable (no walking origin).", "Entfernung zum offiziellen Park nicht berechenbar (kein Wegeanschluss)."));
    return list;
});
</script>

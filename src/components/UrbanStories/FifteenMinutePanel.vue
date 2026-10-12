<template>
    <section ref="root" class="grid gap-3" data-testid="fifteen-minute-panel" :data-scene="store.sceneKey" :data-measure="store.measure">
        <UAlert
            v-if="store.dataStatus === 'error'"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            :title="tr('The neighbourhood values could not be loaded.', 'Die Stadtteilwerte konnten nicht geladen werden.')"
            data-testid="fm-data-error"
        />
        <p v-else-if="store.dataStatus === 'loading'" class="text-xs text-muted" role="status">{{ tr("Loading values…", "Werte werden geladen …") }}</p>

        <!-- Scene 1: what does the score say? -->
        <template v-if="store.sceneKey === 'passes-the-test'">
            <div v-if="summary !== undefined" class="grid gap-1 rounded-md border border-muted px-3 py-2" data-testid="fm-glance">
                <h5 class="text-xs font-semibold text-highlighted">{{ tr("A typical Stadtteil", "Ein typischer Stadtteil") }}</h5>
                <p class="text-2xl font-semibold text-highlighted" data-testid="fm-median-score">{{ decimal(summary.medianDecay) }} <span class="text-sm font-normal text-muted">/ 100</span></p>
                <p class="text-xs">
                    {{ tr(
                        `Median of the mean overall scores of ${summary.stadtteile} Stadtteile. In that Stadtteil, residential buildings reach ${decimal(summary.medianCategories)} of 9 categories on average.`,
                        `Median der mittleren Gesamtwerte von ${summary.stadtteile} Stadtteilen. In diesem Stadtteil erreichen Wohngebäude im Mittel ${decimal(summary.medianCategories)} von 9 Kategorien.`
                    ) }}
                </p>
                <p class="text-xs text-muted">{{ tr("A median over Stadtteile, not weighted by buildings or residents.", "Ein Median über Stadtteile, nicht nach Gebäuden oder Einwohnern gewichtet.") }}</p>
            </div>

            <section v-if="summary !== undefined" class="grid gap-1.5" data-testid="fm-distribution">
                <h5 class="text-xs font-semibold text-highlighted">{{ tr("How the published scores are distributed", "Wie sich die veröffentlichten Werte verteilen") }}</h5>
                <p class="text-xs text-muted">{{ tr("Number of Stadtteile by mean overall score.", "Anzahl der Stadtteile nach mittlerem Gesamtwert.") }}</p>
                <FifteenMinuteBars :rows="distributionRows" :label="tr('Stadtteile by mean overall score', 'Stadtteile nach mittlerem Gesamtwert')" />
            </section>

            <section v-if="summary !== undefined" class="grid gap-1.5" data-testid="fm-coverage">
                <h5 class="text-xs font-semibold text-highlighted">{{ tr("Coverage of the nine categories", "Abdeckung der neun Kategorien") }}</h5>
                <p class="text-xs text-muted">{{ tr("Share of residential buildings with at least one place within 15 minutes: the typical Stadtteil (median) and the range across Stadtteile.", "Anteil der Wohngebäude mit mindestens einem Ziel in 15 Minuten: der typische Stadtteil (Median) und die Spanne über alle Stadtteile.") }}</p>
                <FifteenMinuteBars :rows="coverageRows" :label="tr('Category coverage', 'Abdeckung der Kategorien')" />
            </section>

            <div class="grid gap-1 text-xs" data-testid="fm-score-explainer">
                <h5 class="font-semibold text-highlighted">{{ tr("What the score represents", "Was der Wert bedeutet") }}</h5>
                <p>{{ measureText("access").meaning }}</p>
                <p class="text-muted">{{ measureText("access").caution }}</p>
            </div>

            <AreaCard v-if="store.selectedArea !== undefined" :row="store.selectedArea" :measure="store.measure" @clear="store.clearSelection()" />
        </template>

        <!-- Scene 2: same score, different profile -->
        <template v-else-if="store.sceneKey === 'same-score-different-neighbourhood'">
            <div class="flex flex-wrap gap-2" data-testid="fm-places">
                <UButton
                    v-for="place in compared"
                    :key="place.area.id"
                    size="xs"
                    color="neutral"
                    variant="outline"
                    :style="{ borderColor: place.color }"
                    icon="i-lucide-map-pin"
                    :data-testid="`fm-fly-${place.area.id}`"
                    @click="store.flyToArea(place.area)"
                >
                    {{ place.area.name }}
                </UButton>
            </div>
            <div class="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1 text-xs" data-testid="fm-compare-table">
                <span />
                <span v-for="place in compared" :key="place.area.id" class="text-right font-semibold" :style="{ color: place.color }">{{ place.area.name }}</span>
                <template v-for="line in compareLines" :key="line.key">
                    <span class="text-muted">{{ line.label }}</span>
                    <span v-for="(value, index) in line.values" :key="index" class="text-right font-medium tabular-nums" :data-testid="`fm-compare-${line.key}-${index}`">{{ value }}</span>
                </template>
            </div>
            <section class="grid gap-1.5" data-testid="fm-profile">
                <h5 class="text-xs font-semibold text-highlighted">{{ tr("What the score is made of", "Woraus der Wert besteht") }}</h5>
                <p class="text-xs text-muted">{{ tr("Share of residential buildings with at least one place of the category within 15 minutes.", "Anteil der Wohngebäude mit mindestens einem Ziel der Kategorie in 15 Minuten.") }}</p>
                <FifteenMinuteBars :rows="profileRows" :label="tr('Category profile of the two Stadtteile', 'Kategorienprofil der beiden Stadtteile')" />
                <p v-if="largestGap !== undefined" class="text-xs" data-testid="fm-largest-gap">{{ largestGap }}</p>
            </section>
        </template>

        <!-- Scene 3: the weakest link -->
        <template v-else-if="store.sceneKey === 'the-weakest-link'">
            <div class="flex flex-wrap gap-2" data-testid="fm-focus-areas">
                <UButton
                    v-for="area in focusAreas"
                    :key="area.id"
                    size="xs"
                    color="neutral"
                    :variant="store.focusAreaId === area.id ? 'solid' : 'outline'"
                    :aria-pressed="store.focusAreaId === area.id"
                    :data-testid="`fm-focus-${area.id}`"
                    @click="store.setFocusArea(area)"
                >
                    {{ area.name }}
                </UButton>
            </div>
            <div class="flex flex-wrap gap-1.5" role="group" :aria-label="tr('Category', 'Kategorie')" data-testid="fm-categories">
                <UButton
                    v-for="item in categoryOptions"
                    :key="item.id"
                    size="xs"
                    color="neutral"
                    :variant="store.category === item.id ? 'solid' : 'outline'"
                    :aria-pressed="store.category === item.id"
                    :data-testid="`fm-category-${item.id}`"
                    @click="store.setCategory(item.id)"
                >
                    {{ item.label }}
                </UButton>
            </div>
            <CategoryInfo :category="store.category" />
            <section v-if="focusRow !== undefined" class="grid gap-1.5" data-testid="fm-weakest">
                <h5 class="text-xs font-semibold text-highlighted">{{ focusRow.name }}</h5>
                <p class="text-xs" data-testid="fm-overall-vs-category">
                    {{ tr(
                        `Overall: ${decimal(focusRow.categoriesMean)} of 9 categories reached on average, mean score ${decimal(focusRow.decayMean)}. ${categoryLabel(store.category)}: ${pct(focusRow.shares[store.category])} of residential buildings reach it within 15 minutes.`,
                        `Gesamt: im Mittel ${decimal(focusRow.categoriesMean)} von 9 Kategorien erreicht, mittlerer Wert ${decimal(focusRow.decayMean)}. ${categoryLabel(store.category)}: ${pct(focusRow.shares[store.category])} der Wohngebäude erreichen sie in 15 Minuten.`
                    ) }}
                </p>
                <FifteenMinuteBars :rows="focusRows" :label="tr('Category coverage of the selected Stadtteil', 'Kategorienabdeckung des gewählten Stadtteils')" />
                <p v-if="weakest !== undefined" class="text-xs text-muted">{{ tr(`The weakest category here: ${categoryLabel(weakest)}.`, `Die schwächste Kategorie hier: ${categoryLabel(weakest)}.`) }}</p>
            </section>
        </template>

        <!-- Scenes 4 and 5: accessibility next to a second dimension -->
        <template v-else-if="store.sceneKey === 'accessible-but-comfortable' || store.sceneKey === 'accessible-but-safe'">
            <div class="flex gap-2" role="group" :aria-label="tr('Map view', 'Kartenansicht')" data-testid="fm-view-toggle">
                <UButton
                    size="xs"
                    color="neutral"
                    :variant="dimensionView === 'access' ? 'solid' : 'outline'"
                    :aria-pressed="dimensionView === 'access'"
                    data-testid="fm-view-access"
                    @click="setDimensionView('access')"
                >{{ tr("Accessibility", "Erreichbarkeit") }}</UButton>
                <UButton
                    size="xs"
                    color="neutral"
                    :variant="dimensionView === 'access' ? 'outline' : 'solid'"
                    :aria-pressed="dimensionView !== 'access'"
                    data-testid="fm-view-second"
                    @click="setDimensionView(dimension)"
                >{{ measureText(dimension).label }}</UButton>
            </div>
            <div class="grid gap-1 text-xs" data-testid="fm-dimension-explainer">
                <h5 class="font-semibold text-highlighted">{{ measureText(dimension).label }}</h5>
                <p>{{ measureText(dimension).meaning }}</p>
                <p class="font-medium">{{ measureText(dimension).direction }}</p>
                <p class="text-muted">{{ measureText(dimension).caution }}</p>
            </div>
            <div class="grid gap-2" data-testid="fm-examples">
                <div v-for="(example, index) in store.sceneExamples" :key="example.building.id" class="grid gap-1.5">
                    <div class="flex flex-wrap items-center gap-2">
                        <span class="text-xs font-semibold" :style="{ color: toneColor(example.tone) }">{{ example.area.name }}</span>
                        <UButton size="xs" color="neutral" variant="soft" icon="i-lucide-locate-fixed" :data-testid="`fm-example-${index}`" @click="showExample(example)">
                            {{ tr("Show this building", "Dieses Gebäude zeigen") }}
                        </UButton>
                    </div>
                    <BuildingCard
                        v-if="store.examples[example.building.id] !== undefined"
                        :profile="store.examples[example.building.id].profile"
                        :title="tr('Example building', 'Beispielgebäude')"
                        :measure="store.measure"
                        :selected="store.selection?.profile.id === example.building.id"
                    />
                </div>
            </div>
            <div class="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1 text-xs" data-testid="fm-area-compare">
                <h5 class="col-span-3 font-semibold text-highlighted">{{ tr("The two Stadtteile (means)", "Die beiden Stadtteile (Mittelwerte)") }}</h5>
                <span />
                <span v-for="example in store.sceneExamples" :key="example.area.id" class="text-right font-semibold" :style="{ color: toneColor(example.tone) }">{{ example.area.name }}</span>
                <template v-for="line in dimensionLines" :key="line.key">
                    <span class="text-muted">{{ line.label }}</span>
                    <span v-for="(value, index) in line.values" :key="index" class="text-right font-medium tabular-nums" :data-testid="`fm-area-${line.key}-${index}`">{{ value }}</span>
                </template>
            </div>
        </template>

        <!-- Scene 6: explore -->
        <template v-else-if="store.sceneKey === 'explore-beyond-the-score'">
            <div class="flex flex-wrap gap-1.5" role="group" :aria-label="tr('Theme', 'Thema')" data-testid="fm-themes">
                <UButton
                    v-for="item in themeOptions"
                    :key="item.id"
                    size="xs"
                    color="neutral"
                    :variant="store.theme === item.id ? 'solid' : 'outline'"
                    :aria-pressed="store.theme === item.id"
                    :data-testid="`fm-theme-${item.id}`"
                    @click="store.setTheme(item.id)"
                >
                    {{ item.label }}
                </UButton>
            </div>
            <div v-if="store.theme === 'category'" class="flex flex-wrap gap-1.5" role="group" :aria-label="tr('Category', 'Kategorie')" data-testid="fm-categories">
                <UButton
                    v-for="item in categoryOptions"
                    :key="item.id"
                    size="xs"
                    color="neutral"
                    :variant="store.category === item.id ? 'soft' : 'ghost'"
                    :aria-pressed="store.category === item.id"
                    :data-testid="`fm-category-${item.id}`"
                    @click="store.setCategory(item.id)"
                >
                    {{ item.label }}
                </UButton>
            </div>
            <div v-if="store.theme === 'green'" class="flex flex-wrap gap-1.5" role="group" :aria-label="tr('Green-space measure', 'Grünflächen-Maß')" data-testid="fm-green-measures">
                <UButton
                    v-for="item in greenOptions"
                    :key="item.id"
                    size="xs"
                    color="neutral"
                    :variant="store.greenMeasure === item.id ? 'soft' : 'ghost'"
                    :aria-pressed="store.greenMeasure === item.id"
                    :data-testid="`fm-green-${item.id}`"
                    @click="store.setGreenMeasure(item.id)"
                >
                    {{ item.label }}
                </UButton>
            </div>
            <CategoryInfo v-if="store.theme === 'category'" :category="store.category" />
            <div v-if="activeText !== undefined" class="grid gap-1 text-xs" data-testid="fm-metric">
                <h5 class="font-semibold text-highlighted">{{ activeText.label }}</h5>
                <p>{{ activeText.meaning }}</p>
                <p><span class="font-medium">{{ tr("Unit", "Einheit") }}:</span> {{ activeText.unit }}. {{ activeText.direction }}</p>
                <p class="text-muted">{{ activeText.caution }}</p>
            </div>
            <AreaCard v-if="store.selectedArea !== undefined" :row="store.selectedArea" :measure="store.measure" @clear="store.clearSelection()" />
        </template>

        <FifteenMinuteLegend v-if="legend !== undefined" :legend="legend" />

        <!-- The building the reader clicked (the worked examples have their own cards) -->
        <BuildingCard
            v-if="clickedProfile !== undefined"
            :profile="clickedProfile"
            :title="tr('Selected building', 'Gewähltes Gebäude')"
            :measure="store.measure"
            :show-categories="true"
            selected
        />
        <div v-if="store.selection !== undefined || store.selectedArea !== undefined" class="flex">
            <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-x" data-testid="fm-clear" @click="store.clearSelection()">
                {{ tr("Clear selection", "Auswahl aufheben") }}
            </UButton>
        </div>
    </section>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onMounted, ref, type PropType } from "vue";
import { useI18n } from "vue-i18n";
import { useFifteenMinuteStore, weakestCategory } from "@store/urbanStories.fifteenMinute";
import { localize } from "../../config/urbanStories";
import {
    AREA_COLORS,
    CATEGORY_DESCRIPTIONS,
    CATEGORY_IDS,
    CATEGORY_LABELS,
    RAMPS,
    categoryMeasure,
    legendFor,
    measureInfo,
    type CategoryId,
    type MeasureId,
} from "../../config/urbanStories/styles/fifteenMinute";
import { LANGENBEK, WILHELMSBURG, type SceneExample, type VerifiedArea } from "../../config/urbanStories/fifteenMinuteLocations";
import type { StadtteilRow } from "@helpers/fifteenMinuteData";
import FifteenMinuteBars, { type BarRow } from "./FifteenMinuteBars.vue";
import BuildingCard from "./FifteenMinuteBuildingCard.vue";
import FifteenMinuteLegend from "./FifteenMinuteLegend.vue";

const store = useFifteenMinuteStore();
const { locale } = useI18n();

// The story intro and its caveats sit above the run section: bring the scene into view when the run starts.
const root = ref<HTMLElement>();
onMounted(() => {
    root.value?.closest<HTMLElement>("[data-testid='urban-story-run']")?.scrollIntoView?.({ block: "start", behavior: "smooth" });
});

const tr = (en: string, de: string): string => (locale.value === "de" ? de : en);
const fmt = (value: number, digits: number): string => new Intl.NumberFormat(locale.value, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
const decimal = (value: number | null, digits = 1): string => (value === null ? "–" : fmt(value, digits));
const pct = (share: number | null): string => (share === null ? "–" : `${fmt(share * 100, 0)} %`);
const categoryLabel = (id: CategoryId): string => localize(CATEGORY_LABELS[id], locale.value);

function measureText(measure: MeasureId): { label: string; meaning: string; unit: string; direction: string; caution: string } {
    const info = measureInfo(measure);
    return {
        label: localize(info.label, locale.value),
        meaning: localize(info.meaning, locale.value),
        unit: localize(info.unit, locale.value),
        direction: localize(info.direction, locale.value),
        caution: localize(info.caution, locale.value),
    };
}

const summary = computed(() => store.summary);

// --- legend: the layer that is drawn at this zoom --------------------------------------------------------------

const legend = computed(() => (store.measure === undefined ? undefined : legendFor(store.zoom >= 11.6 ? "building" : "admin", store.measure)));

// --- scene 1 -------------------------------------------------------------------------------------------

const distributionRows = computed<BarRow[]>(() => {
    const histogram = summary.value?.decayHistogram ?? [];
    const total = Math.max(1, ...histogram);
    return histogram.map((count, index) => ({
        key: `class-${index}`,
        label: `${index * 20} – ${index * 20 + 20}`,
        values: [{ share: count / total, color: RAMPS.access[index], text: `${count}` }],
    }));
});

const coverageRows = computed<BarRow[]>(() => (summary.value?.categories ?? []).map((item) => ({
    key: item.id,
    label: categoryLabel(item.id),
    note: `${pct(item.min)} – ${pct(item.max)}`,
    values: [{ share: item.median, color: RAMPS.teal[3], text: pct(item.median) }],
})));

// --- scene 2 -------------------------------------------------------------------------------------------

const toneColor = (tone: "a" | "b"): string => AREA_COLORS[tone];

const compared = computed(() => [
    { area: WILHELMSBURG, color: AREA_COLORS.a, row: store.rowOf(WILHELMSBURG.id) },
    { area: LANGENBEK, color: AREA_COLORS.b, row: store.rowOf(LANGENBEK.id) },
]);

const compareLines = computed(() => [
    { key: "score", label: tr("Mean overall score (0–100)", "Mittlerer Gesamtwert (0–100)"), values: compared.value.map((place) => decimal(place.row?.decayMean ?? null)) },
    { key: "count", label: tr("Categories reached, mean (of 9)", "Erreichte Kategorien, Mittel (von 9)"), values: compared.value.map((place) => decimal(place.row?.categoriesMean ?? null, 2)) },
    { key: "n", label: tr("Residential buildings scored", "Bewertete Wohngebäude"), values: compared.value.map((place) => (place.row === undefined ? "–" : fmt(place.row.scored, 0))) },
]);

const profileRows = computed<BarRow[]>(() => CATEGORY_IDS.map((id) => ({
    key: id,
    label: categoryLabel(id),
    values: compared.value.map((place) => ({ share: place.row?.shares[id] ?? null, color: place.color, text: pct(place.row?.shares[id] ?? null) })),
})));

const largestGap = computed(() => {
    const [a, b] = compared.value;
    if (a.row === undefined || b.row === undefined) return undefined;
    let best: { id: CategoryId; gap: number } | undefined;
    for (const id of CATEGORY_IDS) {
        const left = a.row.shares[id];
        const right = b.row.shares[id];
        if (left === null || right === null) continue;
        const gap = Math.abs(left - right);
        if (best === undefined || gap > best.gap) best = { id, gap };
    }
    if (best === undefined || a.row.decayMean === null || b.row.decayMean === null) return undefined;
    const scoreGap = Math.abs(a.row.decayMean - b.row.decayMean);
    return tr(
        `The overall scores differ by ${decimal(scoreGap)} points, but ${categoryLabel(best.id)} differs by ${fmt(best.gap * 100, 0)} percentage points (${pct(a.row.shares[best.id])} in ${a.area.name}, ${pct(b.row.shares[best.id])} in ${b.area.name}).`,
        `Die Gesamtwerte unterscheiden sich um ${decimal(scoreGap)} Punkte, aber ${categoryLabel(best.id)} um ${fmt(best.gap * 100, 0)} Prozentpunkte (${pct(a.row.shares[best.id])} in ${a.area.name}, ${pct(b.row.shares[best.id])} in ${b.area.name}).`
    );
});

// --- scene 3 -------------------------------------------------------------------------------------------

const focusAreas: VerifiedArea[] = [LANGENBEK, WILHELMSBURG];
const focusRow = computed(() => store.rowOf(store.focusAreaId));
const weakest = computed(() => weakestCategory(focusRow.value));
const categoryOptions = computed(() => CATEGORY_IDS.map((id) => ({ id, label: categoryLabel(id) })));

const focusRows = computed<BarRow[]>(() => CATEGORY_IDS.map((id) => ({
    key: id,
    label: categoryLabel(id),
    highlight: id === store.category,
    note: id === weakest.value ? tr("weakest", "schwächste") : undefined,
    values: [{ share: focusRow.value?.shares[id] ?? null, color: id === store.category ? RAMPS.teal[4] : RAMPS.teal[2], text: pct(focusRow.value?.shares[id] ?? null) }],
})));

/** Name, content and limits of the chosen category. */
const CategoryInfo = defineComponent({
    props: { category: { type: String as PropType<CategoryId>, required: true } },
    setup(props) {
        return () => h("div", { class: "grid gap-1 text-xs", "data-testid": "fm-category-info" }, [
            h("h5", { class: "font-semibold text-highlighted" }, categoryLabel(props.category)),
            h("p", {}, tr(
                `Includes ${localize(CATEGORY_DESCRIPTIONS[props.category], "en")}. Colour = walking minutes to the nearest place.`,
                `Umfasst ${localize(CATEGORY_DESCRIPTIONS[props.category], "de")}. Farbe = Gehminuten zum nächsten Ziel.`
            )),
            h("p", { class: "text-muted" }, measureText(categoryMeasure(props.category)).caution),
        ]);
    },
});

// --- scenes 4 and 5 -------------------------------------------------------------------------------------

const dimension = computed<"comfort" | "safety">(() => (store.sceneKey === "accessible-but-safe" ? "safety" : "comfort"));
const dimensionView = computed(() => (dimension.value === "safety" ? store.safetyView : store.comfortView));

function setDimensionView(view: "access" | "comfort" | "safety"): void {
    if (dimension.value === "safety") store.setSafetyView(view === "safety" ? "safety" : "access");
    else store.setComfortView(view === "comfort" ? "comfort" : "access");
}

const dimensionLines = computed(() => {
    const rows = store.sceneExamples.map((example) => store.rowOf(example.area.id));
    const second = dimension.value === "safety"
        ? { key: "second", label: tr("Mean safety index (0–100)", "Mittlerer Sicherheitsindex (0–100)"), values: rows.map((row) => decimal(row?.safetyMean ?? null)) }
        : { key: "second", label: tr("Mean walking comfort (0–100)", "Mittlerer Gehkomfort (0–100)"), values: rows.map((row) => decimal(row?.comfortMean ?? null)) };
    return [
        { key: "score", label: tr("Mean overall score (0–100)", "Mittlerer Gesamtwert (0–100)"), values: rows.map((row) => decimal(row?.decayMean ?? null)) },
        second,
        { key: "count", label: tr("Categories reached, mean (of 9)", "Erreichte Kategorien, Mittel (von 9)"), values: rows.map((row) => decimal(row?.categoriesMean ?? null, 2)) },
    ];
});

async function showExample(example: SceneExample): Promise<void> {
    await store.selectExample(example.building, true);
}

// --- scene 6 -------------------------------------------------------------------------------------------

const themeOptions = computed(() => [
    { id: "access" as const, label: tr("Accessibility", "Erreichbarkeit") },
    { id: "category" as const, label: tr("Category", "Kategorie") },
    { id: "comfort" as const, label: tr("Comfort", "Komfort") },
    { id: "safety" as const, label: tr("Safety", "Sicherheit") },
    { id: "green" as const, label: tr("Green space", "Grünfläche") },
]);

const greenOptions = computed(() => [
    { id: "green" as const, label: tr("Large green space (score)", "Große Grünfläche (Wert)") },
    { id: "green-park" as const, label: tr("Official park (minutes)", "Offizieller Park (Minuten)") },
]);

const activeText = computed(() => (store.measure === undefined ? undefined : measureText(store.measure)));

// --- the clicked building ---------------------------------------------------------------------------

/** The selected building; in the two comparison scenes the worked examples have their own cards. */
const clickedProfile = computed(() => {
    const profile = store.selection?.profile;
    if (profile === undefined) return undefined;
    const shownAsExample = (store.sceneKey === "accessible-but-comfortable" || store.sceneKey === "accessible-but-safe")
        && store.sceneExamples.some((example) => example.building.id === profile.id);
    return shownAsExample ? undefined : profile;
});

/** Selected Stadtteil: its published values for every dimension. */
const AreaCard = defineComponent({
    props: { row: { type: Object as PropType<StadtteilRow>, required: true }, measure: { type: String as PropType<MeasureId | undefined>, default: undefined } },
    emits: ["clear"],
    setup(props) {
        return () => {
            const row = props.row;
            const lines: [string, string, boolean][] = [
                [tr("Mean overall score (0–100)", "Mittlerer Gesamtwert (0–100)"), decimal(row.decayMean), props.measure === "access"],
                [tr("Categories reached, mean (of 9)", "Erreichte Kategorien, Mittel (von 9)"), decimal(row.categoriesMean, 2), false],
                [tr("Mean walking comfort (0–100)", "Mittlerer Gehkomfort (0–100)"), decimal(row.comfortMean), props.measure === "comfort"],
                [tr("Mean safety index (0–100)", "Mittlerer Sicherheitsindex (0–100)"), decimal(row.safetyMean), props.measure === "safety"],
                [tr("Mean large-green-space score (0–100)", "Mittlerer Wert große Grünfläche (0–100)"), decimal(row.greenMean), props.measure === "green"],
                [tr("Median minutes to an official park", "Median der Minuten zum offiziellen Park"), row.dgpMedian === null ? "–" : `${decimal(row.dgpMedian)} min`, props.measure === "green-park"],
            ];
            const active = props.measure === undefined ? undefined : CATEGORY_IDS.find((id) => categoryMeasure(id) === props.measure);
            if (active !== undefined) lines.unshift([`${categoryLabel(active)}: ${tr("share of buildings reaching it", "Anteil der Gebäude mit Zugang")}`, pct(row.shares[active]), true]);
            return h("section", { class: "grid gap-1.5 rounded-md border border-primary px-3 py-2", "data-testid": "fm-area-card", "data-area-id": row.id }, [
                h("h6", { class: "text-xs font-semibold text-highlighted" }, `${row.name}${row.bezirk === "" ? "" : ` · ${row.bezirk}`}`),
                h("dl", { class: "grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs" }, lines.flatMap(([label, value, isActive]) => [
                    h("dt", { class: isActive ? "font-semibold text-highlighted" : "text-muted" }, label),
                    h("dd", { class: "text-right font-medium" }, value),
                ])),
                h("p", { class: "text-xs text-muted" }, tr(
                    `Based on ${fmt(row.scored, 0)} residential buildings with a score${row.lowConfidenceShare === null ? "" : `; ${pct(row.lowConfidenceShare)} of them have low data confidence`}. Building values, not residents.`,
                    `Basiert auf ${fmt(row.scored, 0)} Wohngebäuden mit Wert${row.lowConfidenceShare === null ? "" : `; ${pct(row.lowConfidenceShare)} davon mit geringer Datenverlässlichkeit`}. Gebäudewerte, keine Einwohner.`
                )),
            ]);
        };
    },
});
</script>

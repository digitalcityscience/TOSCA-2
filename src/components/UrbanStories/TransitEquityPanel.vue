<template>
    <section class="grid gap-3" data-testid="transit-equity-panel" :data-scene="store.sceneKey">
        <UAlert
            v-if="store.dataStatus === 'error'"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            :title="text('dataError')"
            data-testid="equity-data-error"
        />
        <p v-else-if="store.dataStatus === 'loading'" class="text-xs text-muted" role="status">{{ text("loading") }}</p>

        <!-- Scene 1 -->
        <template v-if="store.sceneKey === 'who-is-covered'">
            <div class="grid gap-1 rounded-md border border-muted px-3 py-2" data-testid="equity-citywide">
                <h5 class="text-xs font-semibold text-highlighted">{{ text("coverageTitle") }}</h5>
                <template v-if="store.citywide.residential > 0">
                    <p class="text-2xl font-semibold text-highlighted" data-testid="citywide-inside">{{ percent(1 - store.citywide.share) }}</p>
                    <p class="text-xs">
                        {{ localizeText({
                            en: `of ${number(store.citywide.residential)} housing buildings lie inside an official HVV catchment; ${number(store.citywide.outside)} (${percent(store.citywide.share)}) lie outside every one.`,
                            de: `von ${number(store.citywide.residential)} Wohngebäuden liegen in einem amtlichen HVV-Einzugsbereich; ${number(store.citywide.outside)} (${percent(store.citywide.share)}) liegen in keinem.`,
                        }) }}
                    </p>
                </template>
                <p class="text-xs text-muted">{{ text("buildingsNotPeople") }}</p>
            </div>
            <section class="grid gap-1.5" data-testid="equity-distribution">
                <h5 class="text-xs font-semibold text-highlighted">{{ text("distributionTitle") }}</h5>
                <p class="text-xs text-muted">{{ text("distributionCaption") }}</p>
                <EquityBars :rows="distributionRows" :label="text('distributionTitle')" />
                <p v-if="distribution.missing > 0" class="text-xs text-muted">{{ distribution.missing }} {{ text("noHousing") }}</p>
            </section>
            <p class="text-xs text-muted">{{ text("coverageDefinition") }}</p>
            <AreaCard v-if="store.selectedArea !== undefined" :area="store.selectedArea" />
            <p v-else class="text-xs text-muted">{{ text("clickHint") }}</p>
            <p class="text-xs text-muted">{{ text("nextHint") }}</p>
        </template>

        <!-- Scene 2 -->
        <template v-else-if="store.sceneKey === 'where-are-the-gaps'">
            <div v-if="langenhorn !== undefined" class="grid gap-1 rounded-md border border-muted px-3 py-2" data-testid="equity-gap-area">
                <h5 class="text-xs font-semibold text-highlighted">{{ text("gapTitle") }}: {{ langenhorn.name }}</h5>
                <p class="text-2xl font-semibold text-highlighted" data-testid="gap-share">{{ langenhorn.outsideShare === null ? "–" : percent(langenhorn.outsideShare) }}</p>
                <p class="text-xs">
                    {{ localizeText({
                        en: `of its ${number(langenhorn.residentialCount)} housing buildings (${number(langenhorn.outsideCount)}) are outside every official catchment.`,
                        de: `seiner ${number(langenhorn.residentialCount)} Wohngebäude (${number(langenhorn.outsideCount)}) liegen außerhalb aller Einzugsbereiche.`,
                    }) }}
                </p>
                <p v-if="comparisonText !== ''" class="text-xs" data-testid="gap-vs-hamburg">{{ comparisonText }}</p>
            </div>
            <section v-if="store.gapStats !== undefined && store.gapStats.count > 0" class="grid gap-1" data-testid="equity-gap-pattern">
                <h5 class="text-xs font-semibold text-highlighted">{{ text("gapPattern") }}</h5>
                <p class="text-xs">
                    {{ localizeText({
                        en: `The uncovered housing buildings are not remote: the typical one (median) is ${gapWalkEn} from the nearest stop, and ${percent(store.gapStats.withinNineShare)} of them have a stop within 9 minutes — the walking time of the 720 m rail radius. The gap is a matter of the catchment limits (480 m bus, 720 m rail), not of distance to the nearest stop alone.`,
                        de: `Die nicht abgedeckten Wohngebäude liegen nicht abgelegen: das typische (Median) ist ${gapWalkDe} von der nächsten Haltestelle entfernt, und bei ${percent(store.gapStats.withinNineShare)} liegt eine Haltestelle innerhalb von 9 Minuten — der Gehzeit des 720-m-Bahnradius. Die Lücke ergibt sich aus den Grenzen der Einzugsbereiche (480 m Bus, 720 m Bahn), nicht allein aus der Entfernung zur nächsten Haltestelle.`,
                    }) }}
                </p>
            </section>
            <p class="text-xs text-muted">{{ text("gapSelect") }}</p>
            <div>
                <UButton size="xs" color="neutral" variant="outline" icon="i-lucide-map-pin" data-testid="gap-example" @click="showExample(GAP_EXAMPLE)">
                    {{ text("gapExampleButton") }}
                </UButton>
            </div>
            <EquityBuildingCard v-if="store.selection !== undefined" :profile="store.selection.profile" view="coverage">
                <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-x" data-testid="selection-clear" @click="store.clearSelection()">{{ text("clear") }}</UButton>
            </EquityBuildingCard>
            <p class="text-xs text-muted">{{ text("coverageDefinition") }}</p>
        </template>

        <!-- Scene 3 -->
        <template v-else-if="store.sceneKey === 'stop-is-not-service'">
            <p class="text-xs">{{ text("serviceIntro") }}</p>
            <div class="grid gap-2" data-testid="equity-service-examples">
                <EquityBuildingCard v-if="examples.high !== undefined" :profile="examples.high.profile" :title="text('higherService')" view="coverage">
                    <UButton size="xs" color="neutral" variant="outline" icon="i-lucide-map-pin" data-testid="service-high" @click="showExample(SERVICE_HIGH, 16.5)">{{ text("showOnMap") }}</UButton>
                </EquityBuildingCard>
                <EquityBuildingCard v-if="examples.low !== undefined" :profile="examples.low.profile" :title="text('lowerService')" view="coverage">
                    <UButton size="xs" color="neutral" variant="outline" icon="i-lucide-map-pin" data-testid="service-low" @click="showExample(SERVICE_LOW, 16.5)">{{ text("showOnMap") }}</UButton>
                </EquityBuildingCard>
            </div>
            <EquityBuildingCard v-if="selectedIsNotExample && store.selection !== undefined" :profile="store.selection.profile" view="coverage" />
            <section class="grid gap-1 rounded-md border border-muted px-3 py-2" data-testid="equity-stop-card">
                <h5 class="text-xs font-semibold text-highlighted">{{ text("stopCard") }}</h5>
                <p v-if="store.selectedStop === undefined" class="text-xs text-muted">{{ text("stopHint") }}</p>
                <dl v-else class="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
                    <dt class="text-muted">{{ store.selectedStop.name }}</dt>
                    <dd class="text-right font-medium">{{ store.selectedStop.art }}</dd>
                    <dt class="text-muted">{{ text("stopDepartures") }}</dt>
                    <dd class="text-right font-medium" data-testid="stop-departures">{{ number(store.selectedStop.abfahrten) }}</dd>
                    <dt class="text-muted">{{ text("lineCount") }}</dt>
                    <dd class="text-right font-medium" data-testid="stop-lines">{{ number(store.selectedStop.linienzahl) }}</dd>
                    <dt class="text-muted">{{ text("lines") }}</dt>
                    <dd class="max-w-48 truncate text-right font-medium" :title="store.selectedStop.linien">{{ store.selectedStop.linien }}</dd>
                </dl>
            </section>
            <p class="text-xs text-muted" data-testid="service-basis">{{ text("serviceBasis") }}</p>
            <RidersContext />
        </template>

        <!-- Scene 4 -->
        <template v-else-if="store.sceneKey === 'coverage-vs-walking'">
            <p class="text-xs">{{ text("agreementIntro") }}</p>
            <p class="text-xs text-muted" data-testid="agreement-threshold">{{ text("agreementThreshold") }}</p>
            <section v-if="store.agreement !== undefined" class="grid gap-1.5" data-testid="equity-agreement-city">
                <h5 class="text-xs font-semibold text-highlighted">{{ text("agreementCitywide") }}</h5>
                <EquityBars :rows="agreementRows(store.agreement)" :label="text('agreementCitywide')" />
            </section>
            <section v-if="store.areaAgreement !== undefined" class="grid gap-1.5" data-testid="equity-agreement-area">
                <h5 class="text-xs font-semibold text-highlighted">{{ text("agreementLocal") }}: Langenhorn</h5>
                <EquityBars :rows="agreementRows(store.areaAgreement)" :label="text('agreementLocal')" />
            </section>
            <h5 class="text-xs font-semibold text-highlighted">{{ text("agreementExamples") }}</h5>
            <div class="grid gap-2">
                <EquityBuildingCard v-if="examples.officialOnly !== undefined" :profile="examples.officialOnly.profile" :title="text('officialOnlyExample')" view="agreement">
                    <UButton size="xs" color="neutral" variant="outline" icon="i-lucide-map-pin" data-testid="agreement-official" @click="showExample(OFFICIAL_ONLY_EXAMPLE, 17)">{{ text("showOnMap") }}</UButton>
                </EquityBuildingCard>
                <EquityBuildingCard v-if="examples.walkingOnly !== undefined" :profile="examples.walkingOnly.profile" :title="text('walkingOnlyExample')" view="agreement">
                    <UButton size="xs" color="neutral" variant="outline" icon="i-lucide-map-pin" data-testid="agreement-walking" @click="showExample(WALKING_ONLY_EXAMPLE, 17)">{{ text("showOnMap") }}</UButton>
                </EquityBuildingCard>
            </div>
            <EquityBuildingCard v-if="selectedIsNotExample && store.selection !== undefined" :profile="store.selection.profile" view="agreement" />
            <p class="text-xs text-muted">{{ text("neitherTruth") }}</p>
        </template>

        <!-- Scene 5 -->
        <template v-else-if="store.sceneKey === 'averages-hide-differences'">
            <p class="text-xs">{{ text("compareIntro") }}</p>
            <template v-if="store.comparison !== undefined">
                <section
                    v-for="item in [store.comparison.first, store.comparison.second]"
                    :key="item.area.id"
                    class="grid gap-1.5 rounded-md border border-muted px-3 py-2"
                    :data-testid="`equity-compare-${item.area.id}`"
                >
                    <div class="flex items-center justify-between gap-2">
                        <h5 class="text-xs font-semibold text-highlighted">{{ item.area.name }}</h5>
                        <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-locate-fixed" :data-testid="`compare-zoom-${item.area.id}`" @click="store.flyToArea(item.area)">
                            {{ text("focusOn") }} {{ item.area.name }}
                        </UButton>
                    </div>
                    <dl class="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
                        <dt class="text-muted">{{ text("housing") }}</dt>
                        <dd class="text-right font-medium">{{ number(item.summary.count) }}</dd>
                        <dt class="text-muted">{{ text("median") }}</dt>
                        <dd class="text-right font-medium" data-testid="compare-median">{{ number(item.summary.median) }}</dd>
                        <dt class="text-muted">{{ text("tenth") }}</dt>
                        <dd class="text-right font-medium">{{ number(item.summary.p10) }}</dd>
                        <dt class="text-muted">{{ text("ninetieth") }}</dt>
                        <dd class="text-right font-medium">{{ number(item.summary.p90) }}</dd>
                        <dt class="text-muted">{{ text("withoutService") }}</dt>
                        <dd class="text-right font-medium" data-testid="compare-zero">{{ percent(item.summary.bandShares[0]) }}</dd>
                        <dt class="text-muted">{{ text("outsideCatchment") }}</dt>
                        <dd class="text-right font-medium">{{ percent(item.summary.outsideShare) }}</dd>
                    </dl>
                    <h6 class="text-xs font-semibold text-highlighted">{{ text("bandsTitle") }}</h6>
                    <EquityBars :rows="bandRows(item.summary)" :label="`${item.area.name}: ${text('bandsTitle')}`" />
                </section>
                <p class="text-xs" data-testid="compare-reading">{{ compareReading }}</p>
            </template>
            <p v-else-if="store.dataStatus !== 'error'" class="text-xs text-muted" role="status">{{ text("loading") }}</p>
            <p class="text-xs text-muted">{{ text("compareNote") }}</p>
        </template>

        <!-- Scene 6 -->
        <template v-else-if="store.sceneKey === 'explore-the-gaps'">
            <section class="grid gap-2 rounded-md border border-muted px-3 py-2" data-testid="equity-criteria">
                <h5 class="text-xs font-semibold text-highlighted">{{ text("criteriaTitle") }}</h5>
                <label class="grid gap-1">
                    <span class="text-xs font-medium text-muted">{{ text("areaLabel") }}</span>
                    <USelect :model-value="store.criteria.area ?? ALL" :items="areaItems" size="sm" class="w-full" data-testid="criteria-area" @update:model-value="onArea" />
                </label>
                <label class="grid gap-1">
                    <span class="text-xs font-medium text-muted">{{ text("coverageLabel") }}</span>
                    <USelect :model-value="store.criteria.coverage" :items="coverageItems" size="sm" class="w-full" data-testid="criteria-coverage" @update:model-value="onCoverage" />
                </label>
                <label class="grid gap-1">
                    <span class="text-xs font-medium text-muted">{{ text("walkLabel") }}</span>
                    <USelect :model-value="valueOf(store.criteria.walkMoreThan)" :items="walkItems" size="sm" class="w-full" data-testid="criteria-walk" @update:model-value="(v: unknown) => store.setCriteria({ walkMoreThan: numberOrNull(v) })" />
                    <span class="text-xs text-muted">{{ text("walkNote") }}</span>
                </label>
                <label class="grid gap-1">
                    <span class="text-xs font-medium text-muted">{{ text("departuresLabel") }}</span>
                    <USelect :model-value="valueOf(store.criteria.departuresAtMost)" :items="departureItems" size="sm" class="w-full" data-testid="criteria-departures" @update:model-value="(v: unknown) => store.setCriteria({ departuresAtMost: numberOrNull(v) })" />
                    <span class="text-xs text-muted">{{ text("departuresNote") }}</span>
                </label>
                <label class="grid gap-1">
                    <span class="text-xs font-medium text-muted">{{ text("linesLabel") }}</span>
                    <USelect :model-value="valueOf(store.criteria.linesAtMost)" :items="lineItems" size="sm" class="w-full" data-testid="criteria-lines" @update:model-value="(v: unknown) => store.setCriteria({ linesAtMost: numberOrNull(v) })" />
                </label>
                <div>
                    <UButton size="xs" color="neutral" variant="outline" icon="i-lucide-rotate-ccw" data-testid="criteria-reset" @click="store.resetCriteria()">{{ text("reset") }}</UButton>
                </div>
            </section>
            <section class="grid gap-1 rounded-md border border-muted px-3 py-2" data-testid="equity-criteria-counts" role="status">
                <template v-if="store.criteriaCounts !== undefined">
                    <p class="text-2xl font-semibold text-highlighted" data-testid="criteria-matching">{{ number(store.criteriaCounts.matching) }}</p>
                    <p class="text-xs">
                        {{ text("housing") }} {{ text("matches") }}
                        ({{ percent(store.criteriaCounts.total === 0 ? 0 : store.criteriaCounts.matching / store.criteriaCounts.total) }}
                        {{ text("of") }} {{ number(store.criteriaCounts.total) }}{{ store.criteria.area === null ? "" : ` ${text("inArea")} ${areaName}` }}).
                    </p>
                    <p v-if="store.criteria.area !== null" class="text-xs text-muted">
                        {{ text("allHamburg") }}: {{ number(store.criteriaCounts.city.matching) }} {{ text("of") }} {{ number(store.criteriaCounts.city.total) }}
                    </p>
                </template>
                <p v-else-if="store.countsStatus === 'error'" class="text-xs text-muted">{{ text("dataError") }}</p>
                <p v-else class="text-xs text-muted">{{ text("loading") }}</p>
            </section>
            <p class="text-xs text-muted">{{ text("exploreHint") }}</p>
            <p class="text-xs text-muted">{{ text("exploreScale") }}</p>
            <AreaCard v-if="store.selectedArea !== undefined" :area="store.selectedArea" />
            <EquityBuildingCard v-if="store.selection !== undefined" :profile="store.selection.profile" view="coverage" :title="text('selectedFeature')" />
            <section v-if="store.selectedStop !== undefined" class="grid gap-1 rounded-md border border-muted px-3 py-2" data-testid="equity-stop-card">
                <h5 class="text-xs font-semibold text-highlighted">{{ text("stopCard") }}: {{ store.selectedStop.name }}</h5>
                <p class="text-xs">{{ number(store.selectedStop.abfahrten) }} {{ text("stopDepartures").toLowerCase() }} · {{ number(store.selectedStop.linienzahl) }} {{ text("lines").toLowerCase() }} ({{ store.selectedStop.linien }})</p>
            </section>
            <div v-if="store.selection !== undefined || store.selectedStop !== undefined || store.selectedArea !== undefined">
                <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-x" data-testid="selection-clear" @click="clearAll">{{ text("clear") }}</UButton>
            </div>
        </template>

        <section class="grid gap-3 border-t border-default pt-3" data-testid="equity-legends">
            <h5 class="text-xs font-semibold text-highlighted">{{ text("legendTitle") }}</h5>
            <EquityLegend v-for="legend in legends" :key="legend.id" :legend="legend" />
            <p class="text-xs text-muted">{{ text("zoomHint") }}</p>
        </section>
    </section>
</template>

<script setup lang="ts">
import { computed, defineComponent, h } from "vue";
import { useI18n } from "vue-i18n";
import { useTransitEquityStore, type SelectedArea } from "@store/urbanStories.transitEquity";
import { localize } from "../../config/urbanStories";
import {
    OFFICIAL_ONLY_EXAMPLE,
    GAP_EXAMPLE,
    SERVICE_HIGH,
    SERVICE_LOW,
    WALKING_ONLY_EXAMPLE,
    type VerifiedBuilding,
} from "../../config/urbanStories/transitEquityLocations";
import { EQUITY_TEXT, type EquityTextKey } from "../../config/urbanStories/transitEquityText";
import {
    adminOutsideLegend,
    AGREEMENT_COLORS,
    buildingLegend,
    DEPARTURE_CLASSES,
    DEPARTURE_ZERO_COLOR,
    OUTSIDE_SHARE_STOPS,
    stopsLegend,
    type CoverageFilter,
    type EquityLegend as EquityLegendSpec,
} from "../../config/urbanStories/styles/transitEquity";
import type { AgreementCounts, DistributionSummary } from "@helpers/transitEquityData";
import EquityBars, { type EquityBarRow } from "./EquityBars.vue";
import EquityBuildingCard from "./EquityBuildingCard.vue";
import EquityLegend from "./EquityLegend.vue";
import RidersContext from "./TransitEquityRiders.vue";

const store = useTransitEquityStore();
const { locale } = useI18n();

const text = (key: EquityTextKey): string => localize(EQUITY_TEXT[key], locale.value);
const localizeText = (value: { en: string, de: string }): string => localize(value, locale.value);
const number = (value: number): string => new Intl.NumberFormat(locale.value).format(value);
const decimal = (value: number): string => new Intl.NumberFormat(locale.value, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
const percent = (value: number): string => new Intl.NumberFormat(locale.value, { style: "percent", maximumFractionDigits: 1 }).format(value);

async function showExample(example: VerifiedBuilding, zoom?: number): Promise<void> {
    store.flyToBuilding(example, zoom);
    await store.selectExample(example);
}

// --- scene 1 -------------------------------------------------------------------------------------

const DISTRIBUTION_BINS: { max: number, label: string, color: string }[] = [
    { max: 0.1, label: "0–10 %", color: OUTSIDE_SHARE_STOPS[0].color },
    { max: 0.2, label: "10–20 %", color: OUTSIDE_SHARE_STOPS[1].color },
    { max: 0.35, label: "20–35 %", color: OUTSIDE_SHARE_STOPS[2].color },
    { max: 0.5, label: "35–50 %", color: OUTSIDE_SHARE_STOPS[4].color },
    { max: Infinity, label: "> 50 %", color: OUTSIDE_SHARE_STOPS[5].color },
];

const distribution = computed(() => {
    const values = store.stadtteile.map((row) => row.outsideShare).filter((value): value is number => value !== null);
    const counts = DISTRIBUTION_BINS.map(() => 0);
    let lower = -Infinity;
    DISTRIBUTION_BINS.forEach((bin, index) => {
        counts[index] = values.filter((value) => value > lower && value <= bin.max).length;
        lower = bin.max;
    });
    return { counts, total: values.length, missing: store.stadtteile.length - values.length };
});

const distributionRows = computed<EquityBarRow[]>(() => DISTRIBUTION_BINS.map((bin, index) => ({
    key: bin.label,
    label: bin.label,
    share: distribution.value.total === 0 ? 0 : distribution.value.counts[index] / distribution.value.total,
    color: bin.color,
    text: String(distribution.value.counts[index]),
})));

// --- scene 2 -------------------------------------------------------------------------------------

const langenhorn = computed(() => store.rowOf("413"));
const comparisonText = computed(() => {
    const row = langenhorn.value;
    if (row?.outsideShare == null || store.citywide.residential === 0) return "";
    const diff = (row.outsideShare - store.citywide.share) * 100;
    const points = decimal(Math.abs(diff));
    return localizeText({
        en: `Hamburg-wide the rate is ${percent(store.citywide.share)}: ${points} ${diff >= 0 ? "points above" : "points below"} it.`,
        de: `Hamburgweit liegt die Quote bei ${percent(store.citywide.share)}: ${points} Punkte ${diff >= 0 ? "darüber" : "darunter"}.`,
    });
});
const gapWalkEn = computed(() => (store.gapStats?.medianWalkMin == null ? "more than 15 minutes" : `${decimal(store.gapStats.medianWalkMin)} minutes`));
const gapWalkDe = computed(() => (store.gapStats?.medianWalkMin == null ? "mehr als 15 Minuten" : `${decimal(store.gapStats.medianWalkMin)} Minuten`));

// --- scenes 3, 4 -----------------------------------------------------------------------------------

const examples = computed(() => ({
    high: store.examples[SERVICE_HIGH.id],
    low: store.examples[SERVICE_LOW.id],
    officialOnly: store.examples[OFFICIAL_ONLY_EXAMPLE.id],
    walkingOnly: store.examples[WALKING_ONLY_EXAMPLE.id],
}));
const exampleIds = new Set([SERVICE_HIGH.id, SERVICE_LOW.id, OFFICIAL_ONLY_EXAMPLE.id, WALKING_ONLY_EXAMPLE.id]);
const selectedIsNotExample = computed(() => {
    const id = store.selection?.profile.id;
    return id === null || id === undefined || !exampleIds.has(id);
});

function agreementRows(counts: AgreementCounts): EquityBarRow[] {
    const rows: [string, number, string][] = [
        [localizeText({ en: "Covered by both", de: "Von beiden" }), counts.both, AGREEMENT_COLORS.both],
        [localizeText({ en: "Official only", de: "Nur amtlich" }), counts.officialOnly, AGREEMENT_COLORS.officialOnly],
        [localizeText({ en: "Walking only", de: "Nur Fußweg" }), counts.walkingOnly, AGREEMENT_COLORS.walkingOnly],
        [localizeText({ en: "Neither", de: "Keine" }), counts.neither, AGREEMENT_COLORS.neither],
    ];
    return rows.map(([label, count, color]) => ({
        key: label, label, color, share: counts.total === 0 ? 0 : count / counts.total, text: `${number(count)} · ${percent(counts.total === 0 ? 0 : count / counts.total)}`,
    }));
}

// --- scene 5 -------------------------------------------------------------------------------------

const BAND_COLORS = [DEPARTURE_ZERO_COLOR, ...DEPARTURE_CLASSES.map((item) => item.color)];
const BAND_LABELS = ["0", "1–99", "100–299", "300–699", "700–1,499", "≥ 1,500"];

function bandRows(summary: DistributionSummary): EquityBarRow[] {
    return summary.bandShares.map((share, index) => ({
        key: BAND_LABELS[index], label: BAND_LABELS[index], share, color: BAND_COLORS[index], text: percent(share),
    }));
}

const compareReading = computed(() => {
    const comparison = store.comparison;
    if (comparison === undefined) return "";
    const [a, b] = [comparison.first, comparison.second];
    return localizeText({
        en: `${a.area.name} and ${b.area.name} have a similar typical level (median ${number(a.summary.median)} and ${number(b.summary.median)} departures per day), but ${percent(a.summary.bandShares[0])} of the housing buildings in ${a.area.name} have no departure in reach against ${percent(b.summary.bandShares[0])} in ${b.area.name}. The average hides where the weaker service is: on the map, orange buildings have none.`,
        de: `${a.area.name} und ${b.area.name} haben ein ähnliches typisches Niveau (Median ${number(a.summary.median)} und ${number(b.summary.median)} Abfahrten pro Tag), aber ${percent(a.summary.bandShares[0])} der Wohngebäude in ${a.area.name} haben keine Abfahrt in Reichweite, in ${b.area.name} sind es ${percent(b.summary.bandShares[0])}. Der Durchschnitt verbirgt, wo das Angebot schwächer ist: Auf der Karte haben orange Gebäude keines.`,
    });
});

// --- scene 6 -------------------------------------------------------------------------------------

const ALL = "__all";
const OFF = "__off";
const areaItems = computed(() => [
    { label: text("allHamburg"), value: ALL },
    ...store.stadtteile.map((row) => ({ label: row.name, value: row.id })),
]);
const areaName = computed(() => (store.criteria.area === null ? "" : store.rowOf(store.criteria.area)?.name ?? ""));
const coverageItems = computed(() => [
    { label: text("coverageAny"), value: "any" },
    { label: text("coverageInside"), value: "inside" },
    { label: text("coverageOutside"), value: "outside" },
]);
const offItem = computed(() => ({ label: text("off"), value: OFF }));
const walkItems = computed(() => [offItem.value, ...[3, 6, 9, 12, 15].map((value) => ({ label: `${value} ${text("minutes")}`, value: String(value) }))]);
const departureItems = computed(() => [offItem.value, ...[0, 50, 100, 200, 500, 1000].map((value) => ({ label: String(value), value: String(value) }))]);
const lineItems = computed(() => [offItem.value, ...[0, 1, 2, 3, 5].map((value) => ({ label: String(value), value: String(value) }))]);

const valueOf = (value: number | null): string => (value === null ? OFF : String(value));
const numberOrNull = (value: unknown): number | null => (value === OFF || value === undefined || value === null ? null : Number(value));

function onArea(value: unknown): void {
    store.setAreaFilter(value === ALL || typeof value !== "string" ? null : value);
}
function onCoverage(value: unknown): void {
    store.setCriteria({ coverage: value as CoverageFilter });
}
function clearAll(): void {
    store.clearSelection();
    store.selectArea(undefined);
}

// --- legends -------------------------------------------------------------------------------------

const legends = computed<EquityLegendSpec[]>(() => {
    const view = store.activeView;
    if (view === undefined) return [];
    const list: EquityLegendSpec[] = [];
    if (store.sceneKey === "who-is-covered" || store.sceneKey === "explore-the-gaps") list.push(adminOutsideLegend());
    list.push(buildingLegend(view));
    if (store.sceneKey === "stop-is-not-service" || store.sceneKey === "where-are-the-gaps" || store.sceneKey === "coverage-vs-walking" || store.sceneKey === "explore-the-gaps") list.push(stopsLegend());
    return list;
});

/** Admin details: name, rate, comparison with Hamburg. */
const AreaCard = defineComponent({
    props: { area: { type: Object as () => SelectedArea, required: true } },
    setup(props) {
        return () => {
            const area = props.area;
            const share = area.outsideShare;
            const diff = share === null || store.citywide.residential === 0 ? undefined : (share - store.citywide.share) * 100;
            return h("section", { class: "grid gap-1 rounded-md border border-muted px-3 py-2", "data-testid": "equity-area-card", "data-area-id": area.id }, [
                h("h5", { class: "text-xs font-semibold text-highlighted" }, area.name),
                h("p", { class: "text-lg font-semibold text-highlighted", "data-testid": "area-share" }, share === null ? text("areaNoValue") : `${percent(share)} ${text("areaOutside")}`),
                area.residential !== null && area.outside !== null && area.residential > 0
                    ? h("p", { class: "text-xs" }, `${number(area.outside)} ${text("of")} ${number(area.residential)} ${text("housing")}`)
                    : undefined,
                diff === undefined ? undefined : h("p", { class: "text-xs text-muted" }, `${decimal(Math.abs(diff))} ${diff >= 0 ? text("pointsAbove") : text("pointsBelow")} ${text("vsHamburg")} (${percent(store.citywide.share)})`),
                area.kind === "unit" ? h("p", { class: "text-xs text-muted" }, text("unitHint")) : undefined,
            ]);
        };
    },
});
</script>

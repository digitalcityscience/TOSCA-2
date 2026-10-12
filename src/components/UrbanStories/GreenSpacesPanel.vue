<template>
    <section ref="root" class="grid gap-3" data-testid="green-spaces-panel" :data-scene="store.sceneKey" :data-theme="store.theme" :data-compare="store.compare">
        <UAlert
            v-if="store.dataStatus === 'error'"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            :title="tr('The neighbourhood values could not be loaded.', 'Die Stadtteilwerte konnten nicht geladen werden.')"
            data-testid="gs-data-error"
        />
        <p v-else-if="store.dataStatus === 'loading'" class="text-xs text-muted" role="status">{{ tr("Loading values…", "Werte werden geladen …") }}</p>

        <!-- Scene 1: what counts as a park? -->
        <template v-if="store.sceneKey === 'what-counts-as-a-park'">
            <section v-if="store.inventory !== undefined" class="grid gap-1.5" data-testid="gs-inventory">
                <h5 class="text-xs font-semibold text-highlighted">{{ tr("What the official inventory contains", "Was der amtliche Bestand enthält") }}</h5>
                <p class="text-xs" data-testid="gs-inventory-text">
                    {{ tr(
                        `${fmt(store.inventory.total)} official green polygons, of which ${fmt(store.inventory.counts.recreational_park)} are recreational parks and ${fmt(store.inventory.counts.playground)} are playgrounds.`,
                        `${fmt(store.inventory.total)} amtliche Grünflächen, davon ${fmt(store.inventory.counts.recreational_park)} Parkanlagen und ${fmt(store.inventory.counts.playground)} Spielplätze.`
                    ) }}
                </p>
                <FifteenMinuteBars :rows="inventoryRows" :label="tr('Official polygons by class', 'Amtliche Flächen nach Klasse')" />
                <p class="text-xs text-muted">{{ tr("Number of polygons, not area.", "Anzahl der Flächen, nicht Fläche.") }}</p>
            </section>
            <section v-if="coverageText !== undefined" class="grid gap-1" data-testid="gs-coverage-contrast">
                <h5 class="text-xs font-semibold text-highlighted">{{ tr("Green land is not recreation space", "Grünfläche ist nicht gleich Erholungsfläche") }}</h5>
                <p class="text-xs">{{ coverageText }}</p>
                <p class="text-xs text-muted">{{ tr("Medians of the Stadtteil values (land covered, overlaps counted once), not weighted by area or residents.", "Mediane der Stadtteilwerte (bedeckte Fläche, Überlappungen einmal gezählt), nicht nach Fläche oder Einwohnern gewichtet.") }}</p>
            </section>
            <p class="text-xs font-medium" data-testid="gs-takeaway-1">{{ tr("Green area on the map does not automatically mean a public recreational park.", "Grünfläche auf der Karte bedeutet nicht automatisch einen öffentlichen Erholungspark.") }}</p>
        </template>

        <!-- Scene 2: inside the park -->
        <template v-else-if="store.sceneKey === 'inside-the-park'">
            <div class="flex flex-wrap gap-2" data-testid="gs-park-buttons">
                <UButton size="xs" color="neutral" :variant="isSelected(HIRSCHPARK.areaId) ? 'solid' : 'outline'" icon="i-lucide-trees" data-testid="gs-select-park" @click="store.selectGreenArea(HIRSCHPARK.areaId)">
                    {{ tr("The park polygon", "Die Parkfläche") }}
                </UButton>
                <UButton size="xs" color="neutral" :variant="isSelected(HIRSCHPARK_PLAYGROUND.areaId) ? 'solid' : 'outline'" icon="i-lucide-blocks" data-testid="gs-select-playground" @click="store.selectGreenArea(HIRSCHPARK_PLAYGROUND.areaId)">
                    {{ tr("Its official playground", "Der offizielle Spielplatz darin") }}
                </UButton>
                <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-locate-fixed" data-testid="gs-fly-park" @click="store.flyToPark()">
                    {{ tr("Zoom to the park", "Zum Park zoomen") }}
                </UButton>
            </div>
            <GreenAreaCard v-if="store.selectedGreenArea !== undefined" :profile="store.selectedGreenArea.profile" />
            <section v-if="store.parkDetail !== undefined" class="grid gap-1.5" data-testid="gs-park-detail">
                <h5 class="text-xs font-semibold text-highlighted">{{ tr("Mapped inside the park polygon", "Innerhalb der Parkfläche kartiert") }}</h5>
                <p class="text-xs" data-testid="gs-park-detail-text">
                    {{ tr(
                        `${fmt(store.parkDetail.polygons)} area objects, ${fmt(store.parkDetail.lines)} lines and ${fmt(store.parkDetail.points)} points share the park's official number (dgp_idnr ${store.parkDetail.idnr}).`,
                        `${fmt(store.parkDetail.polygons)} Flächenobjekte, ${fmt(store.parkDetail.lines)} Linien und ${fmt(store.parkDetail.points)} Punkte tragen die amtliche Nummer des Parks (dgp_idnr ${store.parkDetail.idnr}).`
                    ) }}
                </p>
                <FifteenMinuteBars :rows="detailRows" :label="tr('Detailed objects by official category', 'Detailobjekte nach amtlicher Kategorie')" />
                <p v-if="playSurfaces > 0" class="text-xs text-muted" data-testid="gs-play-surface-note">
                    {{ tr(
                        `${fmt(playSurfaces)} mapped play surface${playSurfaces === 1 ? "" : "s"} inside the park is a mapped object. The park's official playground is a separate polygon in the green-area inventory.`,
                        `${fmt(playSurfaces)} kartierte Spielfläche${playSurfaces === 1 ? "" : "n"} im Park ${playSurfaces === 1 ? "ist ein kartiertes Objekt" : "sind kartierte Objekte"}. Der offizielle Spielplatz des Parks ist ein eigenes Polygon im Grünflächenbestand.`
                    ) }}
                </p>
            </section>
            <section v-if="store.selectedFeature !== undefined" class="grid gap-1 rounded-md border border-muted px-3 py-2 text-xs" data-testid="gs-feature-card">
                <h6 class="font-semibold text-highlighted">{{ store.selectedFeature.type ?? store.selectedFeature.group }}</h6>
                <p>{{ store.selectedFeature.group }}</p>
                <p v-if="store.selectedFeature.labels.length > 0" class="text-muted">{{ store.selectedFeature.labels.join(" › ") }}</p>
                <p v-if="store.selectedFeature.duplicates !== null && store.selectedFeature.duplicates > 1" class="text-warning">
                    {{ tr(`Mapped ${store.selectedFeature.duplicates} times with identical geometry.`, `${store.selectedFeature.duplicates}-mal mit identischer Geometrie erfasst.`) }}
                </p>
            </section>
            <p class="rounded-md border border-muted px-3 py-2 text-xs" data-testid="gs-entrance-note">
                {{ tr(
                    "Mapped paths and fences do not show where the public can enter. No entrance or gate layer was published, so none is drawn here.",
                    "Kartierte Wege und Zäune zeigen nicht, wo die Öffentlichkeit den Park betreten kann. Es wurde keine Eingangs- oder Torschicht veröffentlicht, daher wird hier keine gezeichnet."
                ) }}
            </p>
            <p class="text-xs font-medium" data-testid="gs-takeaway-2">{{ tr("A park is more than a green polygon, but mapped detail alone does not establish how residents can enter it.", "Ein Park ist mehr als eine grüne Fläche, aber kartiertes Detail allein zeigt nicht, wie Bewohner hineinkommen.") }}</p>
        </template>

        <!-- Scenes 3 and 4: access to one kind of destination -->
        <template v-else-if="store.sceneKey === 'park-nearby-how-far' || store.sceneKey === 'where-can-children-play'">
            <div class="flex flex-wrap gap-2" data-testid="gs-steps">
                <UButton size="xs" color="neutral" variant="outline" icon="i-lucide-map-pin" data-testid="gs-fly-area" @click="store.flyToArea(NIENSTEDTEN)">
                    {{ tr("Nienstedten", "Nienstedten") }}
                </UButton>
                <UButton
                    v-for="(example, index) in store.sceneExamples"
                    :key="example.id"
                    size="xs"
                    color="neutral"
                    :variant="store.selection?.profile.id === example.id ? 'solid' : 'outline'"
                    :aria-pressed="store.selection?.profile.id === example.id"
                    icon="i-lucide-locate-fixed"
                    :data-testid="`gs-example-${index}`"
                    @click="store.selectExample(example, true)"
                >
                    {{ letter(index) }} · {{ exampleLabel(example.role) }}
                </UButton>
            </div>
            <div class="grid gap-1 text-xs" data-testid="gs-metric">
                <h5 class="font-semibold text-highlighted">{{ measure.label }}</h5>
                <p>{{ measure.meaning }}</p>
                <details>
                    <summary class="cursor-pointer select-none text-muted">{{ tr("What this does not tell you", "Was das nicht aussagt") }}</summary>
                    <p class="mt-1 text-muted">{{ measure.caution }}</p>
                </details>
            </div>
            <section v-if="focusRow !== undefined" class="grid gap-1.5" data-testid="gs-focus-area">
                <h5 class="text-xs font-semibold text-highlighted">{{ focusRow.name }}</h5>
                <p class="text-xs" data-testid="gs-focus-text">
                    {{ focusText }}
                </p>
            </section>
            <div class="grid gap-2" data-testid="gs-examples">
                <template v-for="(example, index) in store.sceneExamples" :key="example.id">
                    <BuildingCard
                        v-if="store.examples[example.id] !== undefined"
                        :profile="store.examples[example.id].profile"
                        :title="exampleLabel(example.role)"
                        :marker="letter(index)"
                        :measure="store.buildingMeasure"
                        :show="store.sceneKey === 'where-can-children-play' ? 'playground' : 'park'"
                        :selected="store.selection?.profile.id === example.id"
                    />
                </template>
            </div>
            <section v-if="store.sceneKey === 'where-can-children-play'" class="grid gap-1" data-testid="gs-playground-note">
                <UButton size="xs" color="neutral" :variant="isSelected(HIRSCHPARK_PLAYGROUND.areaId) ? 'solid' : 'outline'" class="justify-self-start" icon="i-lucide-blocks" data-testid="gs-select-playground" @click="store.selectGreenArea(HIRSCHPARK_PLAYGROUND.areaId)">
                    {{ tr("Inspect the official playground", "Den offiziellen Spielplatz ansehen") }}
                </UButton>
                <p class="text-xs text-muted">
                    {{ tr(
                        "The orange areas are official playground polygons. The purple surfaces from the detailed Feinkartierung are mapped play surfaces: a different, finer object.",
                        "Die orangen Flächen sind offizielle Spielplatzpolygone. Die violetten Flächen der detaillierten Feinkartierung sind kartierte Spielflächen: ein anderes, feineres Objekt."
                    ) }}
                </p>
            </section>
            <p class="text-xs font-medium" data-testid="gs-takeaway-34">
                {{ store.sceneKey === "park-nearby-how-far"
                    ? tr("A park nearby on the map and convenient modelled access on foot are not necessarily the same thing.", "Ein Park in der Nähe auf der Karte und eine bequeme modellierte Erreichbarkeit zu Fuß sind nicht zwingend dasselbe.")
                    : tr("Access to a park is not the same as access to a children's playground.", "Der Zugang zu einem Park ist nicht dasselbe wie der Zugang zu einem Kinderspielplatz.") }}
            </p>
        </template>

        <!-- Scene 5: park against playground -->
        <template v-else-if="store.sceneKey === 'park-vs-playground'">
            <div class="flex gap-2" role="group" :aria-label="tr('Map view', 'Kartenansicht')" data-testid="gs-compare-toggle">
                <UButton size="xs" color="neutral" :variant="store.compare === 'park' ? 'solid' : 'outline'" :aria-pressed="store.compare === 'park'" data-testid="gs-compare-park" @click="store.setCompare('park')">
                    {{ tr("Park access", "Parkzugang") }}
                </UButton>
                <UButton size="xs" color="neutral" :variant="store.compare === 'playground' ? 'solid' : 'outline'" :aria-pressed="store.compare === 'playground'" data-testid="gs-compare-playground" @click="store.setCompare('playground')">
                    {{ tr("Playground access", "Spielplatzzugang") }}
                </UButton>
            </div>
            <div class="grid gap-1 text-xs" data-testid="gs-metric">
                <h5 class="font-semibold text-highlighted">{{ measure.label }}</h5>
                <p>{{ measure.direction }}</p>
            </div>
            <section class="grid gap-2" data-testid="gs-pair">
                <h5 class="text-xs font-semibold text-highlighted">{{ tr("Two buildings, two destinations", "Zwei Gebäude, zwei Ziele") }}</h5>
                <div class="flex flex-wrap gap-2">
                    <UButton
                        v-for="(example, index) in store.sceneExamples"
                        :key="example.id"
                        size="xs"
                        color="neutral"
                        :variant="store.selection?.profile.id === example.id ? 'solid' : 'outline'"
                        icon="i-lucide-locate-fixed"
                        :data-testid="`gs-example-${index}`"
                        @click="store.selectExample(example, true)"
                    >
                        {{ letter(index) }} · {{ exampleLabel(example.role) }}
                    </UButton>
                </div>
                <p class="flex flex-wrap gap-x-3 text-xs text-muted">
                    <span><span class="mr-1 inline-block size-2 rounded-full" :style="{ backgroundColor: AREA_CLASS_INFO.recreational_park.color }" />{{ tr("upper bar: walk to a park", "obere Leiste: Weg zum Park") }}</span>
                    <span><span class="mr-1 inline-block size-2 rounded-full" :style="{ backgroundColor: AREA_CLASS_INFO.playground.color }" />{{ tr("lower bar: walk to a playground", "untere Leiste: Weg zum Spielplatz") }}</span>
                </p>
                <FifteenMinuteBars :rows="pairRows" :label="tr('Modelled walking minutes to a park and to a playground', 'Modellierte Gehminuten zu Park und Spielplatz')" />
                <p v-if="pairText !== undefined" class="text-xs" data-testid="gs-pair-text">{{ pairText }}</p>

            </section>
            <section class="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1 text-xs" data-testid="gs-area-compare">
                <h5 class="col-span-3 font-semibold text-highlighted">{{ tr("The two Stadtteile (published statistics)", "Die beiden Stadtteile (veröffentlichte Statistiken)") }}</h5>
                <span />
                <span v-for="place in compared" :key="place.area.id" class="text-right font-semibold" :style="{ color: place.color }">{{ place.area.name }}</span>
                <template v-for="line in compareLines" :key="line.key">
                    <span class="text-muted">{{ line.label }}</span>
                    <span v-for="(value, index) in line.values" :key="index" class="text-right font-medium tabular-nums" :data-testid="`gs-compare-${line.key}-${index}`">{{ value }}</span>
                </template>
            </section>
            <p class="text-xs text-muted">{{ tr("There is no data on children or households here: the comparison describes places and buildings, not people.", "Hier gibt es keine Daten zu Kindern oder Haushalten: Der Vergleich beschreibt Orte und Gebäude, keine Menschen.") }}</p>
            <p class="text-xs font-medium" data-testid="gs-takeaway-5">{{ tr("A place can offer access to green recreation without offering equivalent access to children's play facilities.", "Ein Ort kann Zugang zu grüner Erholung bieten, ohne gleichwertigen Zugang zu Kinderspielangeboten.") }}</p>
        </template>

        <!-- Scene 6: explore -->
        <template v-else-if="store.sceneKey === 'explore-green-hamburg'">
            <div class="flex flex-wrap gap-1.5" role="group" :aria-label="tr('Theme', 'Thema')" data-testid="gs-themes">
                <UButton
                    v-for="item in themeOptions"
                    :key="item.id"
                    size="xs"
                    color="neutral"
                    :variant="store.theme === item.id ? 'solid' : 'outline'"
                    :aria-pressed="store.theme === item.id"
                    :data-testid="`gs-theme-${item.id}`"
                    @click="store.setTheme(item.id)"
                >
                    {{ item.label }}
                </UButton>
            </div>
            <div v-if="store.theme === 'coverage'" class="flex flex-wrap gap-1.5" role="group" :aria-label="tr('Coverage measure', 'Flächenmaß')" data-testid="gs-coverage-measures">
                <UButton
                    v-for="item in coverageOptions"
                    :key="item.id"
                    size="xs"
                    color="neutral"
                    :variant="store.coverage === item.id ? 'soft' : 'ghost'"
                    :aria-pressed="store.coverage === item.id"
                    :data-testid="`gs-coverage-${item.id}`"
                    @click="store.setCoverage(item.id)"
                >
                    {{ item.label }}
                </UButton>
            </div>
            <div class="grid gap-1 text-xs" data-testid="gs-theme-text">
                <h5 class="font-semibold text-highlighted">{{ themeText.title }}</h5>
                <p>{{ themeText.body }}</p>
                <p v-if="themeText.caution !== ''" class="text-muted">{{ themeText.caution }}</p>
            </div>
            <section v-if="store.selectedFeature !== undefined" class="grid gap-1 rounded-md border border-muted px-3 py-2 text-xs" data-testid="gs-feature-card">
                <h6 class="font-semibold text-highlighted">{{ store.selectedFeature.type ?? store.selectedFeature.group }}</h6>
                <p>{{ store.selectedFeature.group }}</p>
                <p v-if="store.selectedFeature.labels.length > 0" class="text-muted">{{ store.selectedFeature.labels.join(" › ") }}</p>
            </section>
        </template>

        <!-- The things the reader clicked -->
        <GreenAreaCard v-if="store.selectedGreenArea !== undefined && store.sceneKey !== 'inside-the-park'" :profile="store.selectedGreenArea.profile" />
        <AreaCard v-if="store.selectedArea !== undefined" :row="store.selectedArea" :measure="store.adminMeasure" />
        <BuildingCard
            v-if="clickedProfile !== undefined"
            :profile="clickedProfile"
            :title="tr('Selected building', 'Gewähltes Gebäude')"
            :measure="store.buildingMeasure"
            :show="store.sceneKey === 'park-nearby-how-far' ? 'park' : store.sceneKey === 'where-can-children-play' ? 'playground' : 'both'"
            selected
        />

        <GreenSpacesLegend v-for="legend in store.legends" :key="legend.styleName" :legend="legend" />

        <div v-if="store.sceneKey === 'explore-green-hamburg' || hasSelection" class="flex flex-wrap gap-2">
            <UButton v-if="hasSelection" size="xs" color="neutral" variant="ghost" icon="i-lucide-x" data-testid="gs-clear" @click="store.clearSelection()">
                {{ tr("Clear selection", "Auswahl aufheben") }}
            </UButton>
            <UButton v-if="store.sceneKey === 'explore-green-hamburg'" size="xs" color="neutral" variant="outline" icon="i-lucide-map" data-testid="gs-reset" @click="store.resetOverview()">
                {{ tr("Back to the Hamburg overview", "Zurück zur Hamburg-Übersicht") }}
            </UButton>
        </div>
    </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useGreenSpacesStore } from "@store/urbanStories.greenSpaces";
import { localize } from "../../config/urbanStories";
import {
    AREA_CLASSES,
    AREA_CLASS_INFO,
    FEATURE_GROUPS,
    formatMinutes,
    formatShare,
    measureText,
    type AccessMeasure,
    type AdminMeasure,
    type CoverageMeasure,
    type ThemeId,
} from "../../config/urbanStories/styles/greenSpaces";
import { AREA_COLORS } from "../../config/urbanStories/styles/fifteenMinute";
import { HIRSCHPARK, HIRSCHPARK_PLAYGROUND, NIENSTEDTEN, OTHMARSCHEN, type VerifiedBuilding } from "../../config/urbanStories/greenSpacesLocations";
import FifteenMinuteBars, { type BarRow } from "./FifteenMinuteBars.vue";
import AreaCard from "./GreenSpacesAreaCard.vue";
import BuildingCard from "./GreenSpacesBuildingCard.vue";
import GreenAreaCard from "./GreenSpacesGreenAreaCard.vue";
import GreenSpacesLegend from "./GreenSpacesLegend.vue";

const store = useGreenSpacesStore();
const { locale } = useI18n();

// The story intro and its caveats sit above the run section: bring the scene into view when the run starts.
const root = ref<HTMLElement>();
onMounted(() => {
    root.value?.closest<HTMLElement>("[data-testid='urban-story-run']")?.scrollIntoView?.({ block: "start", behavior: "smooth" });
});

const tr = (en: string, de: string): string => (locale.value === "de" ? de : en);
const fmt = (value: number, digits = 0): string => new Intl.NumberFormat(locale.value, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
const letter = (index: number): string => String.fromCharCode(65 + index);
const isSelected = (areaId: string): boolean => store.selectedGreenArea?.profile.id === areaId;

const measure = computed(() => {
    const active: AdminMeasure = store.sceneKey === "park-vs-playground" ? store.compare : store.sceneKey === "where-can-children-play" ? "playground" : "park";
    const text = measureText(active);
    return {
        label: localize(text.label, locale.value),
        meaning: localize(text.meaning, locale.value),
        direction: localize(text.direction, locale.value),
        caution: localize(text.caution, locale.value),
    };
});

const hasSelection = computed(() => (
    store.selection !== undefined || store.selectedArea !== undefined || store.selectedFeature !== undefined
    || (store.selectedGreenArea !== undefined && store.sceneKey !== "inside-the-park")
));

// --- scene 1 -------------------------------------------------------------------------------------------

const inventoryRows = computed<BarRow[]>(() => {
    const inventory = store.inventory;
    if (inventory === undefined) return [];
    const top = Math.max(1, ...Object.values(inventory.counts));
    return AREA_CLASSES.map((id) => ({
        key: id,
        label: localize(AREA_CLASS_INFO[id].label, locale.value),
        values: [{ share: inventory.counts[id] / top, color: AREA_CLASS_INFO[id].color, text: fmt(inventory.counts[id]) }],
    }));
});

const coverageText = computed(() => {
    const summary = store.summary;
    if (summary === undefined || summary.medianCoverageGreen === undefined || summary.medianCoverageRecreational === undefined) return undefined;
    const all = formatShare(summary.medianCoverageGreen, locale.value);
    const parks = formatShare(summary.medianCoverageRecreational, locale.value);
    return tr(
        `In a typical Stadtteil, official green areas of every class cover ${all} of the land, but recreational parks only ${parks}. The rest is allotments, cemeteries, sports grounds, protective and other green.`,
        `In einem typischen Stadtteil bedecken amtliche Grünflächen aller Klassen ${all} der Fläche, Parkanlagen aber nur ${parks}. Der Rest sind Kleingärten, Friedhöfe, Sportanlagen, Schutzgrün und sonstiges Grün.`
    );
});

// --- scene 2 -------------------------------------------------------------------------------------------

const groupLabel = (code: number, fallback: string): string => {
    const known = FEATURE_GROUPS.find((group) => group.code === code);
    return known === undefined ? fallback : localize(known.label, locale.value);
};

const detailRows = computed<BarRow[]>(() => {
    const groups = store.parkDetail?.groups ?? [];
    const top = Math.max(1, ...groups.map((group) => group.count));
    return groups.map((group) => ({
        key: `group-${group.code}`,
        label: groupLabel(group.code, group.group),
        note: group.types.slice(0, 2).map((type) => type.type).join(", "),
        values: [{ share: group.count / top, color: FEATURE_GROUPS.find((candidate) => candidate.code === group.code)?.color ?? "#bdbdbd", text: fmt(group.count) }],
    }));
});

/** Mapped play surfaces: the Feinkartierung objects of category 2 inside the park. */
const playSurfaces = computed(() => store.parkDetail?.groups.find((group) => group.code === 2)?.count ?? 0);

// --- scenes 3 to 5 ---------------------------------------------------------------------------------------

const EXAMPLE_LABELS: Record<VerifiedBuilding["role"], [string, string]> = {
    "near-park": ["Beside the park", "Neben dem Park"],
    "far-park": ["Farther from the park", "Weiter vom Park"],
    "near-playground": ["Beside the playground", "Neben dem Spielplatz"],
    "far-playground": ["Farther from the playground", "Weiter vom Spielplatz"],
};
const exampleLabel = (role: VerifiedBuilding["role"]): string => tr(...EXAMPLE_LABELS[role]);

const focusRow = computed(() => store.rowOf(NIENSTEDTEN.id));
const focusText = computed(() => {
    const row = focusRow.value;
    if (row === undefined) return "";
    const playground = store.sceneKey === "where-can-children-play";
    const median = playground ? row.playgroundMedian : row.parkMedian;
    const p90 = playground ? row.playgroundP90 : row.parkP90;
    return tr(
        `Median walk to the nearest ${playground ? "playground" : "park"}: ${formatMinutes(median, locale.value)}; for the farthest tenth of the buildings it is ${formatMinutes(p90, locale.value)} or more. Based on ${fmt(row.parkN)} residential buildings.`,
        `Median des Wegs zum nächsten ${playground ? "Spielplatz" : "Park"}: ${formatMinutes(median, locale.value)}; für das entfernteste Zehntel der Gebäude sind es ${formatMinutes(p90, locale.value)} oder mehr. Basiert auf ${fmt(row.parkN)} Wohngebäuden.`
    );
});

/** Bars of both times per example building on one scale, so the two destinations can be read against each other. */
const pairRows = computed<BarRow[]>(() => {
    const profiles = store.sceneExamples.map((example) => ({ example, profile: store.examples[example.id]?.profile }));
    const top = Math.max(5, ...profiles.flatMap(({ profile }) => [profile?.park.minutes ?? 0, profile?.playground.minutes ?? 0]));
    return profiles.map(({ example, profile }, index) => ({
        key: example.id,
        label: `${letter(index)} · ${exampleLabel(example.role)}`,
        highlight: store.selection?.profile.id === example.id,
        values: [
            { share: profile?.park.minutes == null ? null : profile.park.minutes / top, color: AREA_CLASS_INFO.recreational_park.color, text: formatMinutes(profile?.park.minutes ?? null, locale.value) },
            { share: profile?.playground.minutes == null ? null : profile.playground.minutes / top, color: AREA_CLASS_INFO.playground.color, text: formatMinutes(profile?.playground.minutes ?? null, locale.value) },
        ],
    }));
});

const pairText = computed(() => {
    const [a, b] = store.sceneExamples.map((example) => store.examples[example.id]?.profile);
    if (a === undefined || b === undefined) return undefined;
    const parks = [a.park.minutes, b.park.minutes];
    const playgrounds = [a.playground.minutes, b.playground.minutes];
    if (parks.includes(null) || playgrounds.includes(null)) return undefined;
    const [pa, pb] = parks as number[];
    const [ya, yb] = playgrounds as number[];
    return tr(
        `Both buildings are ${formatMinutes(Math.min(pa, pb), locale.value)} to ${formatMinutes(Math.max(pa, pb), locale.value)} from a park, but ${formatMinutes(Math.min(ya, yb), locale.value)} versus ${formatMinutes(Math.max(ya, yb), locale.value)} from a playground.`,
        `Beide Gebäude sind ${formatMinutes(Math.min(pa, pb), locale.value)} bis ${formatMinutes(Math.max(pa, pb), locale.value)} von einem Park entfernt, aber ${formatMinutes(Math.min(ya, yb), locale.value)} gegenüber ${formatMinutes(Math.max(ya, yb), locale.value)} von einem Spielplatz.`
    );
});

const compared = computed(() => [
    { area: NIENSTEDTEN, color: AREA_COLORS.a, row: store.rowOf(NIENSTEDTEN.id) },
    { area: OTHMARSCHEN, color: AREA_COLORS.b, row: store.rowOf(OTHMARSCHEN.id) },
]);

const compareLines = computed(() => [
    { key: "park-median", label: tr("Median walk to a park", "Median Weg zum Park"), values: compared.value.map((place) => formatMinutes(place.row?.parkMedian ?? null, locale.value)) },
    { key: "park-p90", label: tr("Park, 90th percentile", "Park, 90. Perzentil"), values: compared.value.map((place) => formatMinutes(place.row?.parkP90 ?? null, locale.value)) },
    { key: "playground-median", label: tr("Median walk to a playground", "Median Weg zum Spielplatz"), values: compared.value.map((place) => formatMinutes(place.row?.playgroundMedian ?? null, locale.value)) },
    { key: "playground-p90", label: tr("Playground, 90th percentile", "Spielplatz, 90. Perzentil"), values: compared.value.map((place) => formatMinutes(place.row?.playgroundP90 ?? null, locale.value)) },
    { key: "n", label: tr("Residential buildings", "Wohngebäude"), values: compared.value.map((place) => (place.row === undefined ? "–" : fmt(place.row.parkN))) },
]);

// --- scene 6 -------------------------------------------------------------------------------------------

const themeOptions = computed<{ id: ThemeId; label: string }[]>(() => [
    { id: "classes", label: tr("Green-area classes", "Grünflächenklassen") },
    { id: "parks", label: tr("Recreational parks", "Parkanlagen") },
    { id: "playgrounds", label: tr("Playgrounds", "Spielplätze") },
    { id: "park-access", label: tr("Walk to a park", "Weg zum Park") },
    { id: "playground-access", label: tr("Walk to a playground", "Weg zum Spielplatz") },
    { id: "coverage", label: tr("Coverage and large green", "Flächenanteil und große Grünflächen") },
    { id: "details", label: tr("Detailed objects", "Detailobjekte") },
    { id: "osm", label: tr("OSM park comparison", "OSM-Parkvergleich") },
]);

const coverageOptions = computed<{ id: CoverageMeasure; label: string }[]>(() => [
    { id: "coverage-recreational", label: tr("Recreational parks", "Parkanlagen") },
    { id: "coverage-green", label: tr("All official green", "Alles amtliche Grün") },
    { id: "large-green", label: tr("Large green within 15 min", "Große Grünfläche in 15 Min.") },
]);

const themeText = computed(() => {
    const access = (id: AccessMeasure): { title: string; body: string; caution: string } => {
        const text = measureText(id);
        return { title: localize(text.label, locale.value), body: `${localize(text.meaning, locale.value)} ${localize(text.direction, locale.value)}`, caution: localize(text.caution, locale.value) };
    };
    switch (store.theme) {
        case "parks":
            return { title: tr("Recreational parks", "Parkanlagen"), body: tr("The official parks of the Digitaler Grünplan: the destination of the park walking time.", "Die offiziellen Parks des Digitalen Grünplans: das Ziel der Park-Gehzeit."), caution: "" };
        case "playgrounds":
            return { title: tr("Playgrounds", "Spielplätze"), body: tr("The official playgrounds of the Digitaler Grünplan: the destination of the playground walking time.", "Die offiziellen Spielplätze des Digitalen Grünplans: das Ziel der Spielplatz-Gehzeit."), caution: "" };
        case "park-access": return access("park");
        case "playground-access": return access("playground");
        case "coverage": {
            const text = measureText(store.coverage);
            return { title: localize(text.label, locale.value), body: `${localize(text.meaning, locale.value)} ${localize(text.direction, locale.value)}`, caution: localize(text.caution, locale.value) };
        }
        case "details":
            return {
                title: tr("Detailed green objects", "Detaillierte Grünobjekte"),
                body: tr("Paths, planting, water, fences and more, from the Feinkartierung Grün, on top of the official parks. Zoom in beyond level 14 and click an object.", "Wege, Bepflanzung, Wasser, Zäune und mehr aus der Feinkartierung Grün, über den offiziellen Parks. Zoomen Sie über Stufe 14 hinaus und klicken Sie ein Objekt an."),
                caution: tr("Mapped objects, not verified facilities, entrances or routes.", "Kartierte Objekte, keine geprüften Einrichtungen, Eingänge oder Wege."),
            };
        case "osm":
            return {
                title: tr("Source comparison", "Quellenvergleich"),
                body: tr("Dashed purple outlines are parks from OpenStreetMap / ALKIS, drawn over the official parks. They overlap but are a different source: they are neither matched nor merged.", "Gestrichelte violette Umrisse sind Parks aus OpenStreetMap / ALKIS, über den offiziellen Parks gezeichnet. Sie überlappen, sind aber eine andere Quelle: Sie werden weder abgeglichen noch verschmolzen."),
                caution: tr("Neither source is the definitive truth.", "Keine der Quellen ist die endgültige Wahrheit."),
            };
        default:
            return { title: tr("Official green areas", "Amtliche Grünflächen"), body: tr("All seven classes of the official inventory. Click an area to read its class and category.", "Alle sieben Klassen des amtlichen Bestands. Ein Klick auf eine Fläche zeigt Klasse und Kategorie."), caution: "" };
    }
});

/** The selected building; in the example scenes the worked examples have their own cards. */
const clickedProfile = computed(() => {
    const profile = store.selection?.profile;
    if (profile === undefined) return undefined;
    return store.sceneExamples.some((example) => example.id === profile.id) ? undefined : profile;
});
</script>

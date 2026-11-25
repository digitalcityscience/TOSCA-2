<template>
    <BaseSlideoverSidebarComponent
        :id="sidebarID"
        side="left"
        :collapsed="route.meta.sidebar !== sidebarID"
        :unmount-on-hide="false"
        width-class="w-[min(38.75rem,calc(100vw-5rem))]"
    >
        <template #header>
            <div class="flex min-w-0 items-center gap-2">
                <UIcon name="i-lucide-radio-tower" class="size-4 shrink-0 text-primary" />
                <span class="truncate">{{ t("sionna.title") }}</span>
            </div>
        </template>

        <!-- Sections and their order follow the Sionna RT desktop window (sionna-rt-gui). -->
        <div class="grid gap-4">
            <UAlert
                v-if="health"
                :color="health.gpu ? 'success' : 'warning'"
                variant="subtle"
                :icon="health.gpu ? 'i-lucide-circle-check' : 'i-lucide-cpu'"
                :title="t(health.gpu ? 'sionna.runner.ready' : 'sionna.runner.cpu', { variant: health.variant })"
            />
            <UAlert
                v-else
                color="error"
                variant="subtle"
                icon="i-lucide-circle-alert"
                :title="t('sionna.runner.offline')"
                :description="t('sionna.runner.offlineHelp', { url: SIONNA_RUNNER_URL })"
                :actions="[{ label: t('sionna.runner.retry'), color: 'neutral', variant: 'outline', loading: connecting, onClick: connect }]"
            />
            <!-- The runner computes on the visitor's own GPU: how to start it for this site. -->
            <div v-if="!health" class="grid gap-1.5 text-xs text-muted">
                <p>{{ t("sionna.runner.startHelp", { origin: pageOrigin }) }}</p>
                <pre class="overflow-x-auto rounded-md border border-default p-2 text-toned select-all"><code>{{ startCommand }}</code></pre>
                <p>{{ t("sionna.runner.permissionHelp") }}</p>
            </div>

            <section v-if="health && model" class="grid gap-2">
                <h2 class="text-sm font-semibold text-highlighted">{{ t("sionna.scene.title") }}</h2>
                <UFormField :label="t('sionna.scene.select')">
                    <USelect
                        :model-value="selectedScene"
                        class="w-full"
                        :items="sceneItems"
                        value-key="value"
                        :loading="loading"
                        :disabled="loading"
                        :placeholder="t('sionna.scene.placeholder')"
                        @update:model-value="(id: unknown) => load(String(id))"
                    />
                </UFormField>
                <input ref="fileInput" type="file" class="hidden" accept=".zip,.json,.jsonl" @change="upload" />
                <div class="flex flex-wrap items-center gap-2">
                    <UButton
                        icon="i-lucide-upload"
                        color="neutral"
                        variant="outline"
                        size="sm"
                        :disabled="loading"
                        :label="t('sionna.scene.upload')"
                        @click="fileInput?.click()"
                    />
                    <span class="text-xs text-muted">{{ t("sionna.scene.uploadHint") }}</span>
                </div>
                <!-- A scene of its own from the Hamburg LoD3 tiles: the radio map covers the drawn area. -->
                <div class="grid gap-2 rounded-md border border-default p-2">
                    <h3 class="text-xs font-semibold text-highlighted">{{ t("sionna.area.title") }}</h3>
                    <p class="text-xs text-muted">{{ t("sionna.area.help") }}</p>
                    <div class="flex flex-wrap items-end gap-2">
                        <UFormField :label="t('sionna.area.buffer')" class="w-44">
                            <UInputNumber v-model="areaBuffer" size="sm" :min="0" :max="1000" :step="50" :disabled="loading" />
                        </UFormField>
                        <UButton
                            icon="i-lucide-square-dashed"
                            size="sm"
                            :color="drawing ? 'primary' : 'neutral'"
                            :variant="drawing ? 'solid' : 'outline'"
                            :disabled="loading"
                            :label="drawing ? t('sionna.area.cancel') : t('sionna.area.draw')"
                            @click="toggleDrawing"
                        />
                    </div>
                    <p v-if="drawing" class="text-xs text-primary">{{ t(areaStart ? "sionna.area.drawingEnd" : "sionna.area.drawing") }}</p>
                    <p v-else-if="loadingArea" class="text-xs text-muted">{{ t("sionna.area.loading") }}</p>
                </div>
                <UAlert v-if="sceneError" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="sceneError" />
                <p v-if="scene" class="text-sm text-toned">
                    {{ t("sionna.scene.loaded", { name: scene.name, objects: scene.objects, x: extent(0), y: extent(1), z: extent(2) }) }}
                </p>
                <p v-if="scene && !scene.georeference" class="text-xs text-muted">{{ t("sionna.scene.notOnMap") }}</p>
                <!-- Working files on the runner's machine; results are never written there. -->
                <div class="flex flex-wrap items-center gap-2">
                    <span class="text-xs text-muted">
                        {{ t("sionna.storage.used", { size: formatNumber(health.storage.bytes / 1_000_000, locale), files: health.storage.files }) }}
                    </span>
                    <UButton
                        icon="i-lucide-hard-drive"
                        color="neutral"
                        variant="outline"
                        size="xs"
                        :disabled="loading || running || (!scene && health.storage.bytes === 0)"
                        :label="t('sionna.storage.delete')"
                        @click="deleteFiles"
                    />
                </div>
                <p class="text-xs text-muted">{{ t("sionna.storage.help") }}</p>
            </section>

            <!-- One click to a result: each case sets parameters and devices, then computes. -->
            <details v-if="scene?.georeference && model" class="group-box" open>
                <summary class="cursor-pointer text-sm font-semibold text-highlighted">{{ t("sionna.useCases.title") }}</summary>
                <p class="mt-2 text-xs text-muted">{{ t("sionna.useCases.help") }}</p>
                <div class="mt-3 grid gap-2">
                    <details v-for="useCase in USE_CASES" :key="useCase.id" class="use-case">
                        <summary class="flex cursor-pointer items-center gap-2 text-sm font-medium text-highlighted">
                            <UIcon name="i-lucide-chevron-right" class="chevron size-3.5 shrink-0 text-muted" />
                            <UIcon :name="useCase.icon" class="size-4 shrink-0 text-primary" />
                            <span class="flex-1">{{ t(`sionna.useCases.cases.${useCase.id}.title`) }}</span>
                            <UButton
                                icon="i-lucide-play"
                                size="xs"
                                :loading="applying === useCase.id"
                                :disabled="running || applying !== undefined"
                                :label="t('sionna.useCases.run')"
                                @click.prevent="applyUseCase(useCase)"
                            />
                        </summary>
                        <dl class="mt-2 grid gap-1.5 text-xs">
                            <template v-for="part in ['question', 'setup', 'read']" :key="part">
                                <dt class="font-semibold text-toned">{{ t(`sionna.useCases.${part}`) }}</dt>
                                <dd class="text-muted">{{ t(`sionna.useCases.cases.${useCase.id}.${part}`) }}</dd>
                            </template>
                        </dl>
                    </details>
                </div>
            </details>

            <form v-if="scene && model" class="grid gap-4" novalidate @submit.prevent>
                <template v-for="group in groups" :key="group.title">
                    <details class="group-box" :open="group.title === 'Radio map' || group.title === 'Paths'">
                        <summary class="cursor-pointer text-sm font-semibold text-highlighted">{{ group.title }}</summary>
                        <div v-if="group.kind" class="mt-3 flex flex-wrap items-center gap-3">
                            <UButton
                                icon="i-lucide-play"
                                size="sm"
                                :loading="running && active[group.kind]"
                                :disabled="blocked(group.kind) !== undefined"
                                :label="t(`sionna.${group.kind}.compute`)"
                                @click="compute(group.kind)"
                            />
                            <UButton
                                color="neutral"
                                variant="outline"
                                size="sm"
                                :disabled="!active[group.kind]"
                                :label="t('sionna.remove')"
                                @click="remove(group.kind)"
                            />
                            <p v-if="blocked(group.kind)" class="w-full text-xs text-muted">{{ blocked(group.kind) }}</p>
                        </div>
                        <div class="mt-3 grid gap-3 sm:grid-cols-2">
                            <UFormField
                                v-for="field in group.fields"
                                :key="field.name"
                                :name="field.name"
                                :label="field.title"
                                :hint="rangeHint(field)"
                                :error="fieldError(field.name)"
                            >
                                <UInputNumber
                                    v-if="field.kind === 'integer' || field.kind === 'number'"
                                    :model-value="numberOf(field.name)"
                                    class="w-full"
                                    :min="field.minimum"
                                    :max="field.maximum"
                                    :step="field.kind === 'integer' ? 1 : 0.5"
                                    :format-options="{ maximumFractionDigits: field.kind === 'integer' ? 0 : 2 }"
                                    @update:model-value="(value: number | null | undefined) => setValue(field.name, value ?? null)"
                                />
                                <USelect
                                    v-else-if="field.kind === 'enum'"
                                    :model-value="values[field.name] as string"
                                    class="w-full"
                                    :items="(field.options ?? []).map((option) => ({ label: String(option), value: option }))"
                                    value-key="value"
                                    @update:model-value="(value: unknown) => setValue(field.name, value as ParameterValue)"
                                />
                                <USwitch
                                    v-else-if="field.kind === 'boolean'"
                                    :model-value="values[field.name] === true"
                                    @update:model-value="(value: boolean) => setValue(field.name, value)"
                                />
                            </UFormField>
                        </div>
                    </details>

                    <!-- The device list belongs to "Radio devices", after the two antenna arrays. -->
                    <section v-if="group.title === 'RX array'" class="grid gap-3">
                        <div class="grid gap-0.5">
                            <h2 class="text-sm font-semibold text-highlighted">{{ t("sionna.devices.title") }}</h2>
                            <p class="text-xs text-muted">{{ t(scene.georeference ? "sionna.devices.hintMap" : "sionna.devices.hint") }}</p>
                        </div>
                        <template v-for="kind in deviceKinds" :key="kind.key">
                            <div
                                v-for="(device, index) in kind.devices"
                                :key="index"
                                class="device-row"
                                :class="{ 'device-selected': selected === device }"
                            >
                                <button
                                    type="button"
                                    class="flex items-center gap-1 pb-2 text-xs font-medium"
                                    :style="{ color: kind.color }"
                                    :title="t('sionna.devices.select', { name: `${kind.prefix}-${index}` })"
                                    @click="select(device)"
                                >
                                    <UIcon :name="kind.icon" class="size-3.5 shrink-0" />{{ kind.prefix }}-{{ index }}
                                </button>
                                <UFormField v-for="axis in kind.axes" :key="axis" :label="t(`sionna.devices.${axis}`)" size="xs">
                                    <!-- No step buttons: five inputs share one row of the sidebar. -->
                                    <UInputNumber
                                        v-model="device[axis]"
                                        size="sm"
                                        class="w-full"
                                        :increment="false"
                                        :decrement="false"
                                        :format-options="{ maximumFractionDigits: 2 }"
                                        @focus="selected = device"
                                    />
                                </UFormField>
                                <UButton
                                    v-if="scene.georeference && kind.key === 'receivers'"
                                    class="route"
                                    icon="i-lucide-route"
                                    color="neutral"
                                    :variant="routing === device ? 'solid' : 'ghost'"
                                    size="sm"
                                    :aria-label="t('sionna.devices.route', { name: `${kind.prefix}-${index}` })"
                                    :title="t('sionna.devices.route', { name: `${kind.prefix}-${index}` })"
                                    @click="startRouting(device)"
                                />
                                <UButton
                                    v-if="scene.georeference"
                                    class="pick"
                                    icon="i-lucide-move-3d"
                                    color="neutral"
                                    :variant="moving === device ? 'solid' : 'ghost'"
                                    size="sm"
                                    :aria-label="t('sionna.devices.pick', { name: `${kind.prefix}-${index}` })"
                                    :title="t('sionna.devices.pick', { name: `${kind.prefix}-${index}` })"
                                    @click="startMoving(device)"
                                />
                                <UButton
                                    icon="i-lucide-trash-2"
                                    color="neutral"
                                    variant="ghost"
                                    size="sm"
                                    :aria-label="t('sionna.devices.remove', { name: `${kind.prefix}-${index}` })"
                                    @click="removeDevice(kind.devices, index)"
                                />
                            </div>
                        </template>
                        <div class="flex flex-wrap gap-2">
                            <UButton
                                v-for="kind in deviceKinds"
                                :key="kind.key"
                                :icon="kind.icon"
                                :color="placing === kind.key ? 'primary' : 'neutral'"
                                :variant="placing === kind.key ? 'solid' : 'outline'"
                                size="sm"
                                :label="t(`sionna.devices.add.${kind.key}`)"
                                @click="addDevice(kind.key)"
                            />
                            <UButton
                                icon="i-lucide-trash-2"
                                color="neutral"
                                variant="outline"
                                size="sm"
                                :disabled="transmitters.length + receivers.length === 0"
                                :label="t('sionna.devices.clear')"
                                @click="clearDevices"
                            />
                        </div>
                        <p v-if="placing" class="text-xs text-primary">{{ t(`sionna.devices.placing.${placing}`) }}</p>
                        <p v-else-if="moving" class="text-xs text-primary">{{ t("sionna.devices.moving", { name: nameOf(moving) }) }}</p>
                        <p v-else-if="routing" class="text-xs text-primary">{{ t("sionna.devices.routing", { name: nameOf(routing) }) }}</p>
                        <p v-else-if="selected && scene.georeference" class="text-xs text-muted">{{ t("sionna.devices.keys", { name: nameOf(selected) }) }}</p>
                    </section>
                </template>

                <UAlert
                    v-if="runError"
                    color="error"
                    variant="subtle"
                    icon="i-lucide-circle-alert"
                    :title="runError"
                    :description="otherErrors.join(' ')"
                />
            </form>

            <!-- Results are map layers; this explains them and is their legend. -->
            <section v-if="scene" class="grid gap-3">
                <h2 class="text-sm font-semibold text-highlighted">{{ t("sionna.result.title") }}</h2>
                <img
                    v-if="!scene.georeference && (result?.image ?? scene.image)"
                    :src="result?.image ?? scene.image ?? undefined"
                    :alt="t('sionna.result.alt')"
                    class="w-full rounded-md border border-default"
                />
                <p v-if="!result" class="text-xs text-muted">{{ t("sionna.result.empty") }}</p>
                <div v-if="result && routeLength > 0" class="grid gap-1.5">
                    <h3 class="text-xs font-semibold text-highlighted">{{ t("sionna.result.routeTitle") }}</h3>
                    <p class="text-xs text-muted">{{ t("sionna.result.routeHelp", { speed: ROUTE_SPEED }) }}</p>
                    <div class="flex items-center gap-3">
                        <UButton
                            :icon="routePlaying ? 'i-lucide-pause' : 'i-lucide-play'"
                            color="neutral"
                            variant="outline"
                            size="sm"
                            :aria-label="t(routePlaying ? 'sionna.result.pause' : 'sionna.result.play')"
                            @click="routePlaying = !routePlaying"
                        />
                        <USlider
                            v-model="routeDistance"
                            class="grow"
                            :min="0"
                            :max="routeLength"
                            :step="0.5"
                            :aria-label="t('sionna.result.routePosition')"
                        />
                        <span class="shrink-0 text-xs tabular-nums text-muted">{{ formatNumber(Math.round(routeDistance), locale) }} / {{ formatNumber(Math.round(routeLength), locale) }} m</span>
                    </div>
                </div>
                <div v-if="result?.radio_map" class="grid gap-1.5">
                    <h3 class="text-xs font-semibold text-highlighted">{{ t("sionna.result.radioMapTitle") }}</h3>
                    <p class="text-xs text-muted">{{ t("sionna.result.radioMapHelp", { height: decibels(numberOf("rm_height_above_ground") ?? null) }) }}</p>
                    <div class="grid gap-0.5 text-xs text-muted">
                        <img :src="result.radio_map.colorbar" alt="" class="h-3 w-full rounded-sm" />
                        <div class="flex justify-between">
                            <span>{{ decibels(numberOf("rm_vmin") ?? null) }} dB</span>
                            <span>{{ t("sionna.radioMap.scale") }}</span>
                            <span>{{ decibels(numberOf("rm_vmax") ?? null) }} dB</span>
                        </div>
                    </div>
                    <p class="text-sm text-toned">
                        {{ t("sionna.result.radioMap", {
                            coverage: formatNumber(result.radio_map.coverage * 100, locale),
                            min: decibels(result.radio_map.min_db),
                            max: decibels(result.radio_map.max_db),
                            median: decibels(result.radio_map.median_db),
                            nx: result.radio_map.cells[0],
                            ny: result.radio_map.cells[1],
                        }) }}
                    </p>
                </div>
                <div v-if="result?.paths" class="grid gap-1.5">
                    <h3 class="text-xs font-semibold text-highlighted">{{ t("sionna.result.pathsTitle") }}</h3>
                    <p class="text-sm text-toned">{{ t("sionna.result.paths", { count: pathLegend?.features.length ?? result.paths.count }) }}</p>
                    <template v-if="pathLegend">
                        <p class="text-xs text-muted">{{ t("sionna.result.pathsHelp") }}</p>
                        <ul class="grid gap-1 text-xs text-toned">
                            <li v-for="(entry, index) in pathLegend.classes" :key="index" class="flex items-center gap-2">
                                <span class="w-8 shrink-0 rounded-full" :style="{ height: `${PATH_CLASSES[index].width}px`, backgroundColor: rgba(entry.color) }" />
                                <span class="flex-1">
                                    {{ entry.min === null
                                        ? t("sionna.result.pathClassLast", { max: decibels(entry.max) })
                                        : t("sionna.result.pathClass", { max: decibels(entry.max), min: decibels(entry.min) }) }}
                                </span>
                                <span class="tabular-nums text-muted">{{ entry.count }}</span>
                            </li>
                        </ul>
                        <p class="text-xs text-muted">
                            {{ pathLegend.types.map(([type, count]) => `${t(`sionna.result.type.${type}`)}: ${count}`).join(" · ") }}
                        </p>
                        <USwitch v-model="flow" :label="t('sionna.result.flow')" :description="t('sionna.result.flowHelp')" />
                    </template>
                </div>
                <p v-if="result" class="text-xs text-muted">{{ t("sionna.result.seconds", { seconds: formatNumber(result.seconds, locale) }) }}</p>
            </section>
        </div>
    </BaseSlideoverSidebarComponent>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from "vue";
import type { MapMouseEvent } from "maplibre-gl";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import BaseSlideoverSidebarComponent from "@components/Base/BaseSlideoverSidebarComponent.vue";
import {
    initialParameterValues,
    type ParameterField,
    type ParameterProblem,
    type ParameterValue,
    parameterFields,
    serverParameterErrors,
    submittedParameters,
    validateParameterValues,
} from "@helpers/simulationParameters";
import { formatNumber } from "@helpers/simulationFormat";
import { classifyPaths, DEVICE_COLORS, PATH_CLASSES, pathTimes, type Rgba, type SionnaContent } from "@helpers/deckSionnaLayer";
import { inArea, type UseCase, USE_CASES } from "@helpers/sionnaUseCases";
import { useMapStore } from "@store/map";
import {
    deleteRunnerFiles,
    type LngLat,
    localPosition,
    localScenes,
    openArea,
    openLocalScene,
    runnerHealth,
    runnerModel,
    runScene,
    SIONNA_RUNNER_URL,
    type SionnaDevice,
    type SionnaHealth,
    type SionnaLocalScene,
    type SionnaModel,
    SionnaRunnerError,
    type SionnaRunResult,
    type SionnaScene,
    uploadScene,
} from "@helpers/sionnaRunner";

type DeviceKind = "transmitters" | "receivers";
/** What can be computed: each has Compute, Remove and "Automatic update", as in the desktop window. */
type Computation = "radioMap" | "paths";
type Axis = "x" | "y" | "z" | "yaw" | "pitch";
/** A route point: its map position and scene position (z is receiver height). */
interface Waypoint { at: LngLat; x: number; y: number; z: number }
/** A receiver with a route is computed at points along it, starting at its own position. */
type Device = Record<Axis, number | null> & { route?: Waypoint[] };
/** A map position and the scene x, y it belongs to: other x, y are placed relative to it. */
interface Anchor { at: LngLat; x: number; y: number }
/** The runner receivers a route became: indices first … first + count - 1, `step` metres apart. */
interface RouteRun { first: number; count: number; step: number }

const sidebarID = "sionna";
/** The desktop app puts a new device this far above the clicked surface. */
const HEIGHT_ABOVE_SURFACE = 1.5;
/** Map layer ids: each is its own entry in the layer list. */
const LAYERS: Record<SionnaContent, string> = {
    buildings: "sionna-buildings",
    radioMap: "sionna-radio-map",
    paths: "sionna-paths",
    area: "sionna-area",
    receivers: "sionna-receivers",
    transmitters: "sionna-transmitters",
};
const METRES_PER_DEGREE = 111_320;
/** Route points: every 5 m, at most 100 (then farther apart). */
const ROUTE_STEP = 5;
const ROUTE_POINTS = 100;
/** Playback: the receiver walks the route at 10 m/s; one pulse cycle takes 2 s. */
const ROUTE_SPEED = 10;
const FLOW_SECONDS = 2;
const { t, locale } = useI18n();
const route = useRoute();
const mapStore = useMapStore();

const health = ref<SionnaHealth>();
const model = ref<SionnaModel>();
const connecting = ref(false);
const available = ref<SionnaLocalScene[]>([]);
const selectedScene = ref<string>();
const scene = ref<SionnaScene>();
const loading = ref(false);
const sceneError = ref("");
const fileInput = ref<HTMLInputElement>();

const values = reactive<Record<string, ParameterValue>>({});
const problems = ref<Record<string, ParameterProblem>>({});
const serverErrors = ref<Record<string, string>>({});
const otherErrors = ref<string[]>([]);
const transmitters = ref<Device[]>([]);
const receivers = ref<Device[]>([]);
const active = reactive<Record<Computation, boolean>>({ radioMap: false, paths: false });
const running = ref(false);
const runError = ref("");
const result = ref<SionnaRunResult>();
/** The device the arrow keys move; drawn larger on the map. */
const selected = ref<Device>();
/** The device the next map click moves. */
const moving = ref<Device>();
/** While set, every map click adds a device of this kind. */
const placing = ref<DeviceKind>();
/** The receiver whose route the next map clicks extend. */
const routing = ref<Device>();
/** While set, the next two map clicks are opposite corners of an area of interest; `areaStart` is the first. */
const drawing = ref(false);
const areaStart = ref<LngLat>();
/** Metres around the area whose buildings still block and reflect. */
const areaBuffer = ref<number | null>(300);
const loadingArea = ref(false);
/** The last run's receivers by runner index, and the routes among them. */
const sentReceivers = shallowRef<Device[]>([]);
const routeRuns = shallowRef(new Map<Device, RouteRun>());
/** Metres along the routes; every routed receiver shows its point nearest to it. */
const routeDistance = ref(0);
const routePlaying = ref(false);
/** The use case being set up and computed. */
const applying = ref<UseCase["id"]>();
/** Pulses flow along the paths, arriving in the order of their delay. */
const flow = ref(true);
// Kept outside the devices: writing a map position must not look like a changed parameter.
const anchors = new WeakMap<Device, Anchor>();
let frame: number | undefined;
let lastFrame = 0;
let flowTime = 0;
let pointer: { x: number; y: number; lng: number; lat: number } | undefined;
let mapBound = false;
let rerun = false;

const pageOrigin = window.location.origin;
/** How to start the runner so that this site may call it: PowerShell on Windows, a POSIX shell elsewhere. */
const startCommand = computed(() => {
    const { hostname, port } = new URL(SIONNA_RUNNER_URL);
    const serve = `uv run uvicorn app:app --host ${hostname.replace(/^\[|\]$/g, "")} --port ${port || "8770"}`;
    const windows = navigator.userAgent.includes("Windows");
    return [
        "cd TOSCA-Sionna-Runner",
        windows ? `$env:SIONNA_RUNNER_ORIGINS = "${pageOrigin}"` : `export SIONNA_RUNNER_ORIGINS="${pageOrigin}"`,
        serve,
    ].join("\n");
});
const fields = computed(() => parameterFields(model.value?.parameter_schema));
/** The runner's `x-groups`: the same sections as the Sionna RT desktop window. */
const groups = computed(() => {
    const listed = (model.value?.parameter_schema["x-groups"] ?? {}) as Record<string, string[]>;
    const computations: Record<string, Computation> = { "Radio map": "radioMap", Paths: "paths" };
    return Object.entries(listed).map(([title, names]) => ({
        title,
        kind: computations[title],
        fields: fields.value.filter((field) => names.includes(field.name)),
    }));
});
const sceneItems = computed(() =>
    (["area", "cityjson", "mitsuba", "builtin"] as const)
        .map((kind) => available.value.filter((entry) => entry.kind === kind))
        .filter((entries) => entries.length > 0)
        .map((entries) => [
            { type: "label" as const, label: t(`sionna.scene.kind.${entries[0].kind}`) },
            ...entries.map((entry) => ({ label: entry.name, value: entry.id })),
        ])
);
const deviceKinds = computed(() => [
    {
        key: "transmitters" as const,
        prefix: "tx",
        icon: "i-lucide-radio-tower",
        color: DEVICE_COLORS.transmitters,
        devices: transmitters.value,
        axes: ["x", "y", "z", "yaw", "pitch"] as Axis[],
    },
    {
        key: "receivers" as const,
        prefix: "rx",
        icon: "i-lucide-smartphone",
        color: DEVICE_COLORS.receivers,
        devices: receivers.value,
        axes: ["x", "y", "z"] as Axis[],
    },
]);
/** Longest route of the last run, in metres; 0 without routes. */
const routeLength = computed(() => Math.max(0, ...[...routeRuns.value.values()].map((run) => (run.count - 1) * run.step)));

function routePoint(run: RouteRun): number {
    return Math.min(run.count - 1, Math.round(routeDistance.value / run.step));
}

/** Runner receivers shown now: fixed ones, and each route's current point. A string, so it only changes per point. */
const shownKey = computed(() => sentReceivers.value
    .flatMap((device, index) => {
        const run = routeRuns.value.get(device);
        return run === undefined || index === run.first + routePoint(run) ? [index] : [];
    })
    .join(","));

/** All paths of the last run, classified once (so colours do not jump along a route), with their runner receiver. */
const classifiedPaths = computed(() => {
    const features = result.value?.paths?.features?.features;
    if (features === undefined || features.length === 0) return undefined;
    const { features: classified, classes } = classifyPaths(features);
    const paths = classified.map((feature) => {
        const runner = Number(String(feature.properties.rx).slice(3));
        const device = sentReceivers.value[runner];
        const run = device === undefined ? undefined : routeRuns.value.get(device);
        const rx = device === undefined ? feature.properties.rx : `rx-${receivers.value.indexOf(device)}`;
        const properties: Record<string, unknown> = { ...feature.properties, rx, ...(run === undefined ? {} : { route_point: runner - run.first }) };
        return { runner, feature: { ...feature, properties } };
    });
    return { paths, classes };
});

/** The paths shown now, for the map and the legend; only scenes on the map have them. */
const pathLegend = computed(() => {
    const all = classifiedPaths.value;
    if (all === undefined) return undefined;
    const shown = new Set(shownKey.value.split(",").filter(Boolean).map(Number));
    const features = all.paths.filter((path) => shown.has(path.runner)).map((path) => path.feature);
    const types = new Map<string, number>();
    features.forEach((feature) => types.set(String(feature.properties.type), (types.get(String(feature.properties.type)) ?? 0) + 1));
    const classes = all.classes.map((entry, index) => ({ ...entry, count: features.filter((feature) => feature.properties.class === index).length }));
    // How long the slowest pulse takes: one flow cycle.
    const longest = Math.max(0, ...features.map((feature) => pathTimes((feature.geometry as GeoJSON.LineString).coordinates).at(-1) ?? 0));
    return { features, classes, types: [...types.entries()], longest };
});

/** Why a computation cannot start; the desktop app silently skips these cases. */
function blocked(kind: Computation): string | undefined {
    if (transmitters.value.length === 0) return t("sionna.blocked.transmitter");
    if (kind === "paths" && receivers.value.length === 0) return t("sionna.blocked.receiver");
    return undefined;
}

function extent(axis: 0 | 1 | 2): string {
    const bounds = scene.value?.bounds;
    return bounds === undefined ? "" : formatNumber(bounds.max[axis] - bounds.min[axis], locale.value);
}

function decibels(value: number | null): string {
    return value === null ? "–" : formatNumber(value, locale.value);
}

function rgba(color: Rgba): string {
    return `rgba(${color[0]},${color[1]},${color[2]},${color[3] / 255})`;
}

function numberOf(name: string): number | undefined {
    const value = values[name];
    return typeof value === "number" ? value : undefined;
}

function setValue(name: string, value: ParameterValue): void {
    values[name] = value;
    // A changed field drops its old error until the next run.
    Reflect.deleteProperty(problems.value, name);
    Reflect.deleteProperty(serverErrors.value, name);
}

function rangeHint(field: ParameterField): string | undefined {
    if (field.minimum === undefined || field.maximum === undefined) return undefined;
    return t("geosimulations.newRun.range", {
        min: formatNumber(field.minimum, locale.value),
        max: formatNumber(field.maximum, locale.value),
    });
}

function fieldError(name: string): string | undefined {
    const problem = problems.value[name];
    if (problem !== undefined) {
        return t(`geosimulations.newRun.problem.${problem.code}`, "limit" in problem ? { limit: formatNumber(problem.limit, locale.value) } : {});
    }
    return serverErrors.value[name];
}

function round(value: number): number {
    return Math.round(value * 10) / 10;
}

function report(error: unknown): void {
    if (!(error instanceof SionnaRunnerError)) throw error;
    if (error.status === 0) health.value = undefined;
    else runError.value = error.message;
}

function nameOf(device: Device): string {
    const index = transmitters.value.indexOf(device);
    return index >= 0 ? `tx-${index}` : `rx-${receivers.value.indexOf(device)}`;
}

// -- map ------------------------------------------------------------------------

function onMap(): boolean {
    return scene.value?.georeference != null && route.meta.sidebar === sidebarID;
}

/** Adds, updates or (without props) removes one Sionna layer of the layer list. */
function showLayer(content: SionnaContent, props?: Record<string, unknown>): void {
    const id = LAYERS[content];
    const listed = mapStore.layersOnMap.some((layer) => layer.id === id);
    if (props === undefined) {
        if (listed) void mapStore.deleteMapLayer(id, false);
        return;
    }
    if (listed) {
        mapStore.setDeckLayerProps(id, props);
        return;
    }
    // Below the Sionna layers that come later in LAYERS: devices stay drawn over results.
    const above = Object.values(LAYERS).slice(Object.values(LAYERS).indexOf(id) + 1);
    const index = mapStore.layersOnMap.findIndex((layer) => above.includes(layer.id));
    mapStore.addDeckReplayLayer({
        identifier: id,
        displayName: t(`sionna.layers.${content}`),
        kind: "sionna",
        index: index >= 0 ? index : undefined,
        props: { content, features: [], selected: null, image: null, corners: null, height: 0, ...(content === "radioMap" ? { opacity: 0.8 } : {}), ...props },
    });
    // A layer added while a click is being taken does not open a popup either.
    suppressPopups();
}

/** Where a device is on the map: its anchor, moved by how far x, y changed since. */
function mapPosition(device: Device): LngLat | undefined {
    const anchor = anchors.get(device);
    if (anchor === undefined) return undefined;
    const [lng, lat] = anchor.at;
    // shortcut: metres to degrees on a sphere, ignoring the UTM grid's rotation (< 1° here); each run returns the exact position.
    return [
        lng + ((device.x ?? 0) - anchor.x) / (METRES_PER_DEGREE * Math.cos((lat * Math.PI) / 180)),
        lat + ((device.y ?? 0) - anchor.y) / METRES_PER_DEGREE,
    ];
}

/** Devices as GeoJSON points: lon, lat and height above ground, with their scene values. */
function deviceFeatures(kind: DeviceKind): GeoJSON.Feature[] {
    const devices = kind === "transmitters" ? transmitters.value : receivers.value;
    return devices.flatMap((device, index): GeoJSON.Feature[] => {
        const at = mapPosition(device);
        if (at === undefined) return [];
        const name = `${kind === "transmitters" ? "tx" : "rx"}-${index}`;
        const properties: Record<string, unknown> = {
            name,
            kind: kind === "transmitters" ? "transmitter" : "receiver",
            x: device.x,
            y: device.y,
            z: device.z,
            ...(kind === "transmitters" ? { yaw_deg: device.yaw, pitch_deg: device.pitch } : {}),
        };
        let coordinates = [...at, device.z ?? 0];
        // On a computed route, the receiver stands at its current route point.
        const run = routeRuns.value.get(device);
        const point = run === undefined ? undefined : result.value?.devices?.receivers[run.first + routePoint(run)];
        if (run !== undefined && point !== undefined) {
            coordinates = point;
            Object.assign(properties, { route_point: routePoint(run), z: point[2] });
            // x, y are where the route starts, not where the receiver is now.
            Reflect.deleteProperty(properties, "x");
            Reflect.deleteProperty(properties, "y");
        }
        const features: GeoJSON.Feature[] = [{ type: "Feature", geometry: { type: "Point", coordinates }, properties }];
        if (device.route !== undefined && device.route.length > 1) {
            features.push({
                type: "Feature",
                geometry: { type: "LineString", coordinates: device.route.map((waypoint) => [...waypoint.at, waypoint.z]) },
                properties: { name: `${name} route`, kind: "route", waypoints: device.route.length, length_m: Math.round(routeSamples(device.route).length) },
            });
        }
        return features;
    });
}

function showDevices(): void {
    if (scene.value?.georeference == null) return;
    const highlighted = selected.value === undefined ? null : nameOf(selected.value);
    for (const kind of ["receivers", "transmitters"] as const) {
        const features = deviceFeatures(kind);
        showLayer(kind, features.length > 0 ? { features, selected: highlighted } : undefined);
    }
}

/** Georeferenced scenes: radio map and paths are map layers of their own. */
function showResult(): void {
    const radioMap = result.value?.radio_map;
    showLayer(
        "radioMap",
        radioMap?.image !== undefined && radioMap.corners !== undefined
            ? { image: radioMap.image, corners: radioMap.corners, height: numberOf("rm_height_above_ground") ?? 0 }
            : undefined
    );
    showLayer("paths", pathLegend.value !== undefined ? { features: pathLegend.value.features } : undefined);
}

function showScene(): void {
    const georeference = scene.value?.georeference;
    for (const content of Object.keys(LAYERS) as SionnaContent[]) showLayer(content);
    if (georeference == null) return;
    showLayer("buildings", { features: georeference.buildings.features });
    showAreaOutline();
    bindMap();
    const bounds = scene.value?.bounds;
    const size = bounds === undefined ? 600 : Math.max(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1]);
    // The open sidebar covers the left of the map: centre the scene in what is left.
    const covered = document.getElementById(sidebarID)?.getBoundingClientRect().right ?? 0;
    mapStore.map.flyTo({ center: georeference.center, zoom: 15.5 - Math.log2(size / 600), pitch: 50, padding: { left: covered } });
}

/** While a click places or moves a device, it does not also open the attribute popup. */
function suppressPopups(): void {
    const on = placing.value !== undefined || moving.value !== undefined || routing.value !== undefined || drawing.value;
    const ids = Object.values(LAYERS);
    mapStore.layersOnMap.forEach((layer) => {
        if (ids.includes(layer.id)) layer.attributePopupSuppressed = on;
    });
    mapStore.map.getCanvas().style.cursor = on ? "crosshair" : "";
}

/** The roof or ground point under the pointer: buildings are 3D, so the map's own ground point is wrong on a roof. */
function surfaceAt(point: { x: number; y: number }, ground: { lng: number; lat: number }): { lng: number; lat: number } {
    const coordinate = mapStore.pickDeckInfo(point, [LAYERS.buildings])?.coordinate;
    return coordinate === undefined ? ground : { lng: coordinate[0], lat: coordinate[1] };
}

function deviceAt(point: { x: number; y: number }): Device | undefined {
    const name = (mapStore.pickDeckInfo(point, [LAYERS.transmitters, LAYERS.receivers])?.object as GeoJSON.Feature | undefined)?.properties?.name;
    if (typeof name !== "string") return undefined;
    const index = Number(name.slice(3));
    return (name.startsWith("tx") ? transmitters.value : receivers.value)[index];
}

/** A lon/lat rectangle between two opposite corners, as a closed GeoJSON polygon. */
function rectangle(a: LngLat, b: LngLat): GeoJSON.Feature {
    const [west, east] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
    const [south, north] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
    return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] } };
}

/** The open scene's area of interest, or none. */
function showAreaOutline(): void {
    const aoi = scene.value?.georeference?.aoi;
    showLayer("area", aoi == null ? undefined : { features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[...aoi, aoi[0]]] } }] });
}

function toggleDrawing(): void {
    drawing.value = !drawing.value;
    areaStart.value = undefined;
    placing.value = moving.value = routing.value = undefined;
    if (drawing.value) bindMap();
    else showAreaOutline();
}

/** The second corner: the area becomes the open scene. */
async function finishArea(end: LngLat): Promise<void> {
    const start = areaStart.value;
    drawing.value = false;
    areaStart.value = undefined;
    if (start === undefined) return;
    const bounds = rectangle(start, end).geometry as GeoJSON.Polygon;
    const [[west, south], , [east, north]] = bounds.coordinates[0];
    selectedScene.value = undefined;
    loadingArea.value = true;
    try {
        await open(() => openArea([west, south, east, north], areaBuffer.value ?? 300));
    } finally {
        loadingArea.value = false;
    }
}

function onMapClick(event: MapMouseEvent): void {
    if (drawing.value) {
        // Works before any scene is open: the area is what opens one.
        if (route.meta.sidebar !== sidebarID) return;
        const at: LngLat = [event.lngLat.lng, event.lngLat.lat];
        if (areaStart.value === undefined) areaStart.value = at;
        else void finishArea(at);
        return;
    }
    if (!onMap()) return;
    if (routing.value !== undefined) {
        void addWaypoint(routing.value, surfaceAt(event.point, event.lngLat));
        return;
    }
    const kind = placing.value ?? (event.originalEvent.ctrlKey ? "transmitters" : undefined);
    const device = moving.value;
    if (device === undefined && kind === undefined) {
        // A click on a device icon selects it (the popup shows its attributes).
        const hit = deviceAt(event.point);
        if (hit !== undefined) selected.value = hit;
        return;
    }
    const surface = surfaceAt(event.point, event.lngLat);
    if (device !== undefined) {
        moving.value = undefined;
        void moveDevice(device, surface);
    } else if (kind !== undefined) {
        void placeDevice(kind, surface);
    }
}

function onMapContextMenu(event: MapMouseEvent): void {
    if (!onMap() || !event.originalEvent.ctrlKey) return;
    event.originalEvent.preventDefault();
    void placeDevice("receivers", surfaceAt(event.point, event.lngLat));
}

function onMapMove(event: MapMouseEvent): void {
    pointer = { ...event.point, ...event.lngLat };
    // The area follows the pointer until its second corner is clicked.
    if (drawing.value && areaStart.value !== undefined) showLayer("area", { features: [rectangle(areaStart.value, [event.lngLat.lng, event.lngLat.lat])] });
}

function onMapOut(): void {
    pointer = undefined;
}

/** Height and position steps of the arrow keys: 1 m, 10 m with Shift. */
const KEY_STEPS: Record<string, [number, number, number]> = {
    ArrowLeft: [-1, 0, 0],
    ArrowRight: [1, 0, 0],
    ArrowUp: [0, 1, 0],
    ArrowDown: [0, -1, 0],
    PageUp: [0, 0, 1],
    PageDown: [0, 0, -1],
};

/** K and L add a device under the mouse (as in the desktop app); keys edit the selected device. */
function onKey(event: KeyboardEvent): void {
    if (event.key === "Escape" && drawing.value) {
        toggleDrawing();
        event.preventDefault();
        event.stopPropagation();
        return;
    }
    if (!onMap() || event.ctrlKey || event.metaKey || event.altKey) return;
    if ((event.target as HTMLElement).closest("input, textarea, select, [contenteditable], [role=combobox]") !== null) return;
    const handled = (): void => {
        // Captured before MapLibre: the arrow keys would also pan the map.
        event.preventDefault();
        event.stopPropagation();
    };
    const mode = placing.value ?? moving.value ?? routing.value;
    if (event.key === "Escape" && (mode !== undefined || selected.value !== undefined)) {
        if (mode === undefined) selected.value = undefined;
        placing.value = moving.value = routing.value = undefined;
        handled();
        return;
    }
    const router = routing.value;
    if (event.key === "Backspace" && router?.route !== undefined) {
        // Removes the last route point; the start point alone is no route, so that ends it.
        router.route.pop();
        if (router.route.length <= 1) {
            router.route = undefined;
            routing.value = undefined;
        }
        handled();
        return;
    }
    const kind = ({ k: "transmitters", l: "receivers" } as Record<string, DeviceKind | undefined>)[event.key.toLowerCase()];
    if (kind !== undefined && pointer !== undefined) {
        void placeDevice(kind, surfaceAt(pointer, pointer));
        handled();
        return;
    }
    const device = selected.value;
    if (device === undefined) return;
    const step = KEY_STEPS[event.key];
    if (step !== undefined) {
        const scale = event.shiftKey ? 10 : 1;
        device.x = round((device.x ?? 0) + step[0] * scale);
        device.y = round((device.y ?? 0) + step[1] * scale);
        device.z = round(Math.max(0, (device.z ?? 0) + step[2] * scale));
        handled();
    } else if (event.key === "Delete") {
        const devices = transmitters.value.includes(device) ? transmitters.value : receivers.value;
        removeDevice(devices, devices.indexOf(device));
        handled();
    }
}

function bindMap(): void {
    if (mapBound) return;
    mapBound = true;
    const map = mapStore.map;
    map.on("click", onMapClick);
    map.on("contextmenu", onMapContextMenu);
    map.on("mousemove", onMapMove);
    map.on("mouseout", onMapOut);
    window.addEventListener("keydown", onKey, true);
}

function unbindMap(): void {
    if (!mapBound) return;
    const map = mapStore.map;
    map.off("click", onMapClick);
    map.off("contextmenu", onMapContextMenu);
    map.off("mousemove", onMapMove);
    map.off("mouseout", onMapOut);
    window.removeEventListener("keydown", onKey, true);
    drawing.value = false;
    areaStart.value = undefined;
    for (const content of Object.keys(LAYERS) as SionnaContent[]) showLayer(content);
}

// -- devices --------------------------------------------------------------------

/** A new device above the roof or ground at a map position, 1.5 m unless told otherwise. */
async function placeDevice(kind: DeviceKind, position: { lng: number; lat: number }, above = HEIGHT_ABOVE_SURFACE): Promise<Device | undefined> {
    const sceneId = scene.value?.id;
    if (sceneId === undefined) return undefined;
    try {
        const local = await localPosition(sceneId, position.lng, position.lat);
        const devices = kind === "transmitters" ? transmitters.value : receivers.value;
        devices.push({ x: round(local.x), y: round(local.y), z: round(local.z + above), yaw: 0, pitch: 0 });
        // The reactive proxy, not the plain object: that is what everything else looks up.
        const device = devices[devices.length - 1];
        anchors.set(device, { at: [position.lng, position.lat], x: device.x ?? 0, y: device.y ?? 0 });
        selected.value = device;
        return device;
    } catch (error) {
        report(error);
        return undefined;
    }
}

/** Moves a device onto the roof or ground at a map position, 1.5 m above it. */
async function moveDevice(device: Device, position: { lng: number; lat: number }): Promise<void> {
    const sceneId = scene.value?.id;
    if (sceneId === undefined) return;
    try {
        const local = await localPosition(sceneId, position.lng, position.lat);
        anchors.set(device, { at: [position.lng, position.lat], x: round(local.x), y: round(local.y) });
        Object.assign(device, { x: round(local.x), y: round(local.y), z: round(local.z + HEIGHT_ABOVE_SURFACE) });
        selected.value = device;
    } catch (error) {
        report(error);
    }
}

function select(device: Device): void {
    selected.value = selected.value === device ? undefined : device;
}

function startMoving(device: Device): void {
    placing.value = routing.value = undefined;
    moving.value = moving.value === device ? undefined : device;
    selected.value = device;
}

function addDevice(kind: DeviceKind): void {
    const bounds = scene.value?.bounds;
    if (bounds === undefined) return;
    if (scene.value?.georeference != null) {
        // A toggle: every click adds one, until the button or Esc stops it.
        moving.value = routing.value = undefined;
        placing.value = placing.value === kind ? undefined : kind;
        return;
    }
    // No map to click: the middle of the scene, transmitters above the roofs, receivers at street level.
    const middle = (axis: 0 | 1): number => Math.round((bounds.min[axis] + bounds.max[axis]) / 2);
    if (kind === "transmitters") {
        transmitters.value.push({ x: middle(0), y: middle(1), z: Math.round(bounds.max[2] + 5), yaw: 0, pitch: 0 });
    } else {
        receivers.value.push({ x: middle(0) + 20, y: middle(1) + 20, z: round(bounds.min[2] + HEIGHT_ABOVE_SURFACE), yaw: 0, pitch: 0 });
    }
}

function removeDevice(devices: Device[], index: number): void {
    const [removed] = devices.splice(index, 1);
    if (selected.value === removed) selected.value = undefined;
    if (moving.value === removed) moving.value = undefined;
    if (routing.value === removed) routing.value = undefined;
}

function clearDevices(): void {
    transmitters.value = [];
    receivers.value = [];
    selected.value = moving.value = routing.value = undefined;
}

/** Points every ROUTE_STEP m along a route (farther apart beyond ROUTE_POINTS), and its end point. */
function routeSamples(route: Waypoint[]): { points: Array<[number, number, number]>; step: number; length: number } {
    const legs = route.slice(1).map((end, index) => ({ start: route[index], end, length: Math.hypot(end.x - route[index].x, end.y - route[index].y) }));
    const length = legs.reduce((sum, leg) => sum + leg.length, 0);
    const step = Math.max(ROUTE_STEP, length / (ROUTE_POINTS - 1));
    const points: Array<[number, number, number]> = [];
    // Where the next point is, on the current leg.
    let along = 0;
    for (const { start, end, length: legLength } of legs) {
        for (; along < legLength; along += step) {
            const share = along / legLength;
            points.push([start.x + (end.x - start.x) * share, start.y + (end.y - start.y) * share, start.z + (end.z - start.z) * share]);
        }
        along -= legLength;
    }
    const last = route[route.length - 1];
    points.push([last.x, last.y, last.z]);
    return { points, step, length };
}

/** Starts or ends drawing a receiver's route; it starts where the receiver is. */
function startRouting(device: Device): void {
    placing.value = moving.value = undefined;
    selected.value = device;
    if (routing.value === device) {
        routing.value = undefined;
        return;
    }
    const at = mapPosition(device);
    if (at === undefined) return;
    if (device.route === undefined || device.route.length === 0) {
        device.route = [{ at, x: device.x ?? 0, y: device.y ?? 0, z: device.z ?? 0 }];
    }
    routing.value = device;
}

/** Adds a route point at a map position, at the receiver's height above the roof or ground there. */
async function addWaypoint(device: Device, position: { lng: number; lat: number }): Promise<void> {
    const sceneId = scene.value?.id;
    if (sceneId === undefined || device.route === undefined) return;
    try {
        const local = await localPosition(sceneId, position.lng, position.lat);
        device.route.push({ at: [position.lng, position.lat], x: round(local.x), y: round(local.y), z: round(local.z + HEIGHT_ABOVE_SURFACE) });
    } catch (error) {
        report(error);
    }
}

function toRunnerDevice(device: Device): SionnaDevice {
    return {
        position: [device.x ?? 0, device.y ?? 0, device.z ?? 0],
        yaw_deg: device.yaw ?? 0,
        pitch_deg: device.pitch ?? 0,
    };
}

// -- use cases ------------------------------------------------------------------

/** Sets up a ready-made case on the open scene (defaults, its parameters, its devices) and computes it. */
async function applyUseCase(useCase: UseCase): Promise<void> {
    const georeference = scene.value?.georeference;
    if (georeference == null || model.value === undefined || running.value) return;
    applying.value = useCase.id;
    try {
        // Nothing is computed while the case is being set up.
        active.radioMap = active.paths = false;
        routePlaying.value = false;
        Object.assign(values, initialParameterValues(fields.value, model.value.default_parameters), useCase.parameters);
        clearDevices();
        placing.value = undefined;
        // For an area, devices go inside it: the buffer's buildings only block and reflect.
        const buildings = georeference.buildings.features;
        const plan = useCase.plan(georeference.aoi != null ? inArea(buildings, georeference.aoi) : buildings);
        let receiver: Device | undefined;
        for (const { kind, at, above } of plan.devices) {
            const device = await placeDevice(kind, { lng: at[0], lat: at[1] }, above);
            if (kind === "receivers") receiver ??= device;
        }
        if (receiver !== undefined && plan.route !== undefined) {
            const start = mapPosition(receiver);
            if (start !== undefined) receiver.route = [{ at: start, x: receiver.x ?? 0, y: receiver.y ?? 0, z: receiver.z ?? 0 }];
            for (const at of plan.route) await addWaypoint(receiver, { lng: at[0], lat: at[1] });
        }
        selected.value = undefined;
        // Let "Automatic update" see the changes while nothing is active, so it does not run twice.
        await nextTick();
        active.radioMap = useCase.radioMap;
        active.paths = useCase.paths;
        await run();
        if (useCase.play === true && routeLength.value > 0) {
            routeDistance.value = 0;
            routePlaying.value = true;
        }
    } finally {
        applying.value = undefined;
    }
}

// -- runner ---------------------------------------------------------------------

/** Closes the scene and deletes the runner's working files; results only ever lived in this page. */
async function deleteFiles(): Promise<void> {
    try {
        const storage = await deleteRunnerFiles();
        if (health.value !== undefined) health.value.storage = storage;
    } catch (error) {
        report(error);
        return;
    }
    scene.value = undefined;
    selectedScene.value = undefined;
    result.value = undefined;
    routeRuns.value = new Map();
    routePlaying.value = false;
    active.radioMap = active.paths = false;
    clearDevices();
    showScene();
}

async function refreshStorage(): Promise<void> {
    try {
        health.value = await runnerHealth();
    } catch (error) {
        report(error);
    }
}

async function connect(): Promise<void> {
    connecting.value = true;
    try {
        health.value = await runnerHealth();
        model.value = await runnerModel();
        available.value = await localScenes();
        if (Object.keys(values).length === 0) {
            Object.assign(values, initialParameterValues(fields.value, model.value.default_parameters));
        }
    } catch (error) {
        if (!(error instanceof SionnaRunnerError)) throw error;
        health.value = undefined;
    } finally {
        connecting.value = false;
    }
}

async function open(source: () => Promise<SionnaScene>): Promise<void> {
    sceneError.value = "";
    runError.value = "";
    loading.value = true;
    try {
        scene.value = await source();
        result.value = undefined;
        routeRuns.value = new Map();
        routePlaying.value = false;
        active.radioMap = active.paths = false;
        clearDevices();
        placing.value = undefined;
        showScene();
        // One transmitter to start with: in the middle of the scene (of the area, for areas), 5 m above
        // the roof or ground there, on a mast of at least 30 m; not above the tallest building, often a spire.
        if (scene.value.georeference !== null) {
            const [lng, lat] = scene.value.georeference.center;
            const device = await placeDevice("transmitters", { lng, lat }, 5);
            if (device !== undefined) device.z = Math.max(device.z ?? 0, 30);
        } else {
            addDevice("transmitters");
        }
        void refreshStorage();
    } catch (error) {
        if (!(error instanceof SionnaRunnerError)) throw error;
        if (error.status === 0) health.value = undefined;
        else sceneError.value = t("sionna.scene.failed", { detail: error.message });
        scene.value = undefined;
        selectedScene.value = undefined;
        showScene();
    } finally {
        loading.value = false;
    }
}

async function load(id: string): Promise<void> {
    selectedScene.value = id;
    await open(() => openLocalScene(id));
}

async function upload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Cleared so picking the same file again fires "change".
    input.value = "";
    if (file === undefined) return;
    selectedScene.value = undefined;
    await open(() => uploadScene(file));
}

async function compute(kind: Computation): Promise<void> {
    if (blocked(kind) !== undefined) return;
    active[kind] = true;
    await run();
}

/** Hides one result; the other stays as it was computed, not recomputed. */
function remove(kind: Computation): void {
    active[kind] = false;
    if (result.value !== undefined) result.value = { ...result.value, [kind === "radioMap" ? "radio_map" : "paths"]: undefined };
    showResult();
}

/** Computes everything that is switched on; one call, so the result has both. */
async function run(): Promise<void> {
    if (scene.value === undefined) return;
    if (running.value) {
        rerun = true;
        return;
    }
    // As in the desktop app: without a transmitter (or receiver) the result goes away.
    if (blocked("radioMap") !== undefined) active.radioMap = false;
    if (blocked("paths") !== undefined) active.paths = false;
    serverErrors.value = {};
    otherErrors.value = [];
    runError.value = "";
    if (!active.radioMap && !active.paths) {
        result.value = undefined;
        routeRuns.value = new Map();
        showResult();
        return;
    }
    problems.value = validateParameterValues(fields.value, values);
    if (Object.keys(problems.value).length > 0) return;
    running.value = true;
    // What was sent: the returned map positions belong to these x, y, not to later edits.
    const sent = { transmitters: transmitters.value.map(toRunnerDevice), receivers: [] as SionnaDevice[] };
    const owners = { transmitters: [...transmitters.value], receivers: [] as Device[] };
    // A receiver with a route is one runner receiver per route point, all computed at once.
    const runs = new Map<Device, RouteRun>();
    for (const device of receivers.value) {
        const route = device.route !== undefined && device.route.length > 1 ? routeSamples(device.route) : undefined;
        const positions = route?.points ?? [toRunnerDevice(device).position];
        if (route !== undefined) runs.set(device, { first: sent.receivers.length, count: positions.length, step: route.step });
        positions.forEach((position) => {
            sent.receivers.push({ position, yaw_deg: 0, pitch_deg: 0 });
            owners.receivers.push(device);
        });
    }
    try {
        result.value = await runScene(scene.value.id, {
            parameters: submittedParameters(values),
            ...sent,
            radio_map: active.radioMap,
            paths: active.paths,
        });
        for (const kind of ["transmitters", "receivers"] as const) {
            owners[kind].forEach((device, index) => {
                const at = result.value?.devices?.[kind][index];
                const { position } = sent[kind][index];
                if (at !== undefined && !runs.has(device)) anchors.set(device, { at: [at[0], at[1]], x: position[0], y: position[1] });
            });
        }
        sentReceivers.value = owners.receivers;
        routeRuns.value = runs;
        routeDistance.value = Math.min(routeDistance.value, routeLength.value);
        showDevices();
        showResult();
    } catch (error) {
        if (!(error instanceof SionnaRunnerError)) throw error;
        if (error.status === 0) {
            health.value = undefined;
            return;
        }
        const split = serverParameterErrors(error.details, fields.value);
        serverErrors.value = split.byField;
        otherErrors.value = split.other;
        runError.value = t("sionna.runFailed");
    } finally {
        running.value = false;
        if (rerun) {
            rerun = false;
            void run();
        }
    }
}

// No automatic recompute: devices and parameters are designed first, then computed with the buttons.
watch([transmitters, receivers, selected], showDevices, { deep: true });
watch([placing, moving, routing, drawing], suppressPopups);
// A new route point: the receivers move and other paths show.
watch(shownKey, () => {
    showDevices();
    showResult();
});

// -- animation ------------------------------------------------------------------

/** One frame: the receivers walk their routes, pulses flow along the paths. */
function tick(now: number): void {
    const elapsed = Math.min((now - lastFrame) / 1000, 0.25);
    lastFrame = now;
    if (routePlaying.value) {
        const next = routeDistance.value + elapsed * ROUTE_SPEED;
        routeDistance.value = next > routeLength.value ? 0 : next;
    }
    const longest = pathLegend.value?.longest ?? 0;
    if (flow.value && longest > 0) {
        // A short pause after the slowest pulse arrives, then the next pulse.
        const cycle = longest * 1.3;
        flowTime = (flowTime + (elapsed * cycle) / FLOW_SECONDS) % cycle;
        // Only while listed: removing the layer from the layer list must not bring it back.
        mapStore.setDeckLayerProps(LAYERS.paths, { time: flowTime, trail: longest * 0.3 });
    }
    frame = requestAnimationFrame(tick);
}

function stopAnimation(): void {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
}

watch(
    // Also with the sidebar closed: the layers stay on the map.
    () => scene.value?.georeference != null && ((flow.value && pathLegend.value !== undefined) || routePlaying.value),
    (animate) => {
        if (!flow.value) mapStore.setDeckLayerProps(LAYERS.paths, { time: null });
        if (!animate) {
            stopAnimation();
        } else if (frame === undefined) {
            lastFrame = performance.now();
            frame = requestAnimationFrame(tick);
        }
    },
    { immediate: true }
);

onMounted(connect);
onBeforeUnmount(() => {
    stopAnimation();
    unbindMap();
});
</script>

<style scoped>
.device-row {
    display: grid;
    grid-template-columns: 3rem repeat(5, minmax(0, 1fr)) 2rem 2rem;
    align-items: end;
    gap: 0.5rem;
    margin: 0 -0.375rem;
    padding: 0.125rem 0.375rem;
    border-radius: 0.375rem;
}

.device-selected {
    background: rgb(148 163 184 / 0.15);
}

.device-row > :last-child {
    grid-column: -2;
}

.device-row > .pick {
    grid-column: -3;
}

.device-row > .route {
    grid-column: -4;
    justify-self: end;
}

.use-case {
    padding: 0.4rem 0.6rem;
    border-radius: 0.375rem;
    background: rgb(148 163 184 / 0.08);
}

.use-case > summary {
    list-style: none;
}

.use-case .chevron {
    transition: transform 0.15s;
}

.use-case[open] .chevron {
    transform: rotate(90deg);
}

.group-box {
    padding: 0.6rem 0.75rem;
    border: 1px solid rgb(148 163 184 / 0.2);
    border-radius: 0.4rem;
}
</style>

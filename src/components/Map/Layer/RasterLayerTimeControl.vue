<template>
    <div v-if="domain !== undefined" class="raster-time-control">
        <div class="flex items-center gap-2">
            <Button
                class="w-7 h-7 p-0 shrink-0"
                :icon="isPlaying ? 'pi pi-pause' : 'pi pi-play'"
                :aria-label="isPlaying ? 'Pause time animation' : 'Play time animation'"
                text
                rounded
                @click="togglePlay"
            />
            <Slider
                class="flex-grow"
                v-model="index"
                :min="0"
                :max="domain.values.length - 1"
                :step="1"
                @mousedown.capture="beginPointerInteraction"
                @touchstart.capture="beginPointerInteraction"
                @update:model-value="onIndexChange"
                @slideend="onSlideEnd"
            />
        </div>
        <div class="flex justify-between text-xs opacity-60 mt-1">
            <span>{{ formatLabel(domain.values[0]) }}</span>
            <span class="font-medium opacity-100" :title="domain.values[index]">{{ formatLabel(domain.values[index]) }}</span>
            <span>{{ formatLabel(domain.values[domain.values.length - 1]) }}</span>
        </div>
        <div v-if="sharedDate !== undefined" class="text-xs opacity-60 mt-1">
            Date: <span class="font-medium">{{ sharedDate }}</span>
        </div>
    </div>
    <div v-else-if="loading" class="text-xs opacity-70">Loading time domain…</div>
    <div v-else-if="error !== undefined" class="text-xs text-red-500">{{ error }}</div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue"
import Slider from "primevue/slider"
import Button from "primevue/button"
import {
    type GeoserverRasterTypeLayerDetail,
    type ResolvedTimeDomain,
    resolveTimeDomain,
    useGeoserverStore,
} from "@store/geoserver"
import { type LayerObjectWithAttributes, useMapStore } from "@store/map"

interface Props {
    layer: LayerObjectWithAttributes
    autoPlay?: boolean
}
const props = defineProps<Props>()
const geoserver = useGeoserverStore()
const mapStore = useMapStore()
const domain = ref<ResolvedTimeDomain>()
const index = ref(0)
const loading = ref(false)
const error = ref<string>()
const isPlaying = ref(false)
/** Milliseconds between auto-advance steps when playing. */
const PLAY_INTERVAL_MS = 800
let playTimer: ReturnType<typeof setInterval> | undefined
let commitTimer: ReturnType<typeof setTimeout> | undefined
let isPointerInteracting = false

function splitIso(iso: string): { date: string, time: string } {
    const tIndex = iso.indexOf("T")
    if (tIndex === -1) return { date: iso, time: "" }
    const date = iso.slice(0, tIndex)
    // Strip trailing zone marker ("Z") and milliseconds for compact display.
    let time = iso.slice(tIndex + 1).replace(/Z$/, "")
    const dotIndex = time.indexOf(".")
    if (dotIndex !== -1) time = time.slice(0, dotIndex)
    // Trim seconds when they add no information ("HH:MM:00" -> "HH:MM").
    time = time.replace(/:00$/, "")
    return { date, time }
}

/** When every value in the domain shares the same calendar date, surface that
 *  date once outside the slider and reduce per-tick labels to the time-of-day.
 *  Otherwise, fall back to date-only labels (the slider would be too cramped
 *  for full timestamps). */
const sharedDate = computed<string | undefined>(() => {
    if (domain.value === undefined || domain.value.values.length === 0) return undefined
    const first = splitIso(domain.value.values[0]).date
    if (first === "") return undefined
    for (const v of domain.value.values) {
        if (splitIso(v).date !== first) return undefined
    }
    // Only meaningful if at least one value carries a time component.
    const anyTime = domain.value.values.some((v) => splitIso(v).time !== "")
    return anyTime ? first : undefined
})

function formatLabel(iso: string | undefined): string {
    if (iso === undefined) return ""
    const { date, time } = splitIso(iso)
    if (sharedDate.value !== undefined) return time
    return time === "" ? date : `${date} ${time}`
}

function clampIndex(i: number): number {
    if (domain.value === undefined) return 0
    const max = domain.value.values.length - 1
    return Math.min(Math.max(Math.round(i), 0), max)
}

function previewIndex(i: number): void {
    index.value = clampIndex(i)
}

function applyTime(i: number): void {
    if (domain.value === undefined) return
    const nextIndex = clampIndex(i)
    const nextTime = domain.value.values[nextIndex]
    index.value = nextIndex
    if (props.layer.time === nextTime) return
    mapStore.setRasterLayerTime(props.layer.id, nextTime)
}

function onIndexChange(value: number | number[] | undefined): void {
    if (typeof value !== "number") return
    stopPlayback()
    previewIndex(value)
    if (!isPointerInteracting) {
        scheduleCommit()
    }
}

function beginPointerInteraction(): void {
    isPointerInteracting = true
    clearScheduledCommit()
    document.addEventListener("mouseup", endPointerInteraction, { once: true })
    document.addEventListener("touchend", endPointerInteraction, { once: true })
    document.addEventListener("touchcancel", endPointerInteraction, { once: true })
}

function endPointerInteraction(): void {
    document.removeEventListener("mouseup", endPointerInteraction)
    document.removeEventListener("touchend", endPointerInteraction)
    document.removeEventListener("touchcancel", endPointerInteraction)
    scheduleCommit()
}

async function onSlideEnd(): Promise<void> {
    isPointerInteracting = false
    clearScheduledCommit()
    await nextTick()
    applyTime(index.value)
}

function scheduleCommit(): void {
    clearScheduledCommit()
    commitTimer = setTimeout(() => {
        commitTimer = undefined
        isPointerInteracting = false
        applyTime(index.value)
    }, 0)
}

function clearScheduledCommit(): void {
    if (commitTimer !== undefined) {
        clearTimeout(commitTimer)
        commitTimer = undefined
    }
}

function stopPlayback(): void {
    if (playTimer !== undefined) {
        clearInterval(playTimer)
        playTimer = undefined
    }
    isPlaying.value = false
}

function togglePlay(): void {
    if (domain.value === undefined) return
    if (isPlaying.value) {
        stopPlayback()
        return
    }
    isPlaying.value = true
    playTimer = setInterval(() => {
        if (domain.value === undefined) return
        const max = domain.value.values.length - 1
        index.value = index.value >= max ? 0 : index.value + 1
        applyTime(index.value)
    }, PLAY_INTERVAL_MS)
}

async function load(): Promise<void> {
    const details = props.layer.details as GeoserverRasterTypeLayerDetail | undefined
    if (details?.coverage === undefined || props.layer.workspaceName === undefined) return
    loading.value = true
    error.value = undefined
    try {
        const resolved = await resolveTimeDomain(
            async (ws) => await geoserver.fetchWmsCapabilities(ws),
            props.layer.workspaceName,
            details.coverage.name,
            details.coverage
        )
        domain.value = resolved
        // Seed the slider position: prefer the layer's current TIME (single
        // value or first half of a "start/end" range), otherwise the server's
        // advertised default.
        const seedIso = props.layer.time !== undefined && props.layer.time !== ""
            ? props.layer.time.split("/")[0]
            : resolved.default
        const seedIdx = resolved.values.indexOf(seedIso)
        index.value = seedIdx >= 0 ? seedIdx : resolved.values.length - 1
        if (props.autoPlay && !isPlaying.value) {
            index.value = 0
            applyTime(0)
            togglePlay()
        }
    } catch (e) {
        error.value = `Could not load time domain: ${(e as Error).message}`
    } finally {
        loading.value = false
    }
}

watch(() => props.layer.id, () => {
    stopPlayback()
    void load()
}, { immediate: true })

onBeforeUnmount(() => {
    stopPlayback()
    clearScheduledCommit()
    document.removeEventListener("mouseup", endPointerInteraction)
    document.removeEventListener("touchend", endPointerInteraction)
    document.removeEventListener("touchcancel", endPointerInteraction)
})
</script>

<style scoped>
.raster-time-control {
    width: 100%;
}
</style>

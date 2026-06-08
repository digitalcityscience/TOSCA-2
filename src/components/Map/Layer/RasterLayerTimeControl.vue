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
                @update:model-value="onIndexChange"
            />
        </div>
        <div class="flex justify-between text-xs opacity-60 mt-1">
            <span>{{ formatLabel(domain.values[0]) }}</span>
            <span class="font-medium opacity-100" :title="domain.values[index]">{{ formatLabel(domain.values[index]) }}</span>
            <span>{{ formatLabel(domain.values[domain.values.length - 1]) }}</span>
        </div>
    </div>
    <div v-else-if="loading" class="text-xs opacity-70">Loading time domain…</div>
    <div v-else-if="error !== undefined" class="text-xs text-red-500">{{ error }}</div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue"
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
/** Debounce window for manual slider drags so we don't refetch every step. */
const DRAG_DEBOUNCE_MS = 200
let playTimer: ReturnType<typeof setInterval> | undefined
let dragTimer: ReturnType<typeof setTimeout> | undefined

function formatLabel(iso: string | undefined): string {
    if (iso === undefined) return ""
    const tIndex = iso.indexOf("T")
    return tIndex === -1 ? iso : iso.slice(0, tIndex)
}

function applyTime(i: number): void {
    if (domain.value === undefined) return
    mapStore.setRasterLayerTime(props.layer.id, domain.value.values[i])
}

function onIndexChange(value: number | number[] | undefined): void {
    if (typeof value !== "number") return
    if (dragTimer !== undefined) clearTimeout(dragTimer)
    dragTimer = setTimeout(() => { applyTime(value) }, DRAG_DEBOUNCE_MS)
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
    if (dragTimer !== undefined) clearTimeout(dragTimer)
})
</script>

<style scoped>
.raster-time-control {
    width: 100%;
}
</style>

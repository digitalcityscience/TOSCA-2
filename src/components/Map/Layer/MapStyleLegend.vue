<template>
    <ul class="map-style-legend" :aria-label="t('map.layerItem.legendAlt')">
        <li v-for="entry in props.entries" :key="entry.id" class="map-style-legend-entry">
            <span class="map-style-legend-swatch" aria-hidden="true">
                <img
                    v-if="spriteMarks[spriteKey(entry)]"
                    :src="spriteMarks[spriteKey(entry)]"
                    alt=""
                    class="map-style-legend-sprite"
                    :style="{ opacity: String(entry.opacity) }"
                />
                <span
                    v-else
                    class="map-style-legend-mark"
                    :class="`map-style-legend-mark-${entry.kind}`"
                    :style="markStyle(entry)"
                ></span>
            </span>
            <span class="map-style-legend-copy">
                <span v-if="entry.memberLabel" class="map-style-legend-member">{{ entry.memberLabel }}</span>
                <span class="map-style-legend-label">{{ entry.label }}</span>
            </span>
        </li>
    </ul>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { ref, watch } from "vue";
import type { MapStyleLegendEntry } from "@helpers/mapStyleLegend";

const props = defineProps<{ entries: MapStyleLegendEntry[] }>();
const { t } = useI18n();
const spriteMarks = ref<Record<string, string>>({});
const indexCache = new Map<string, Promise<Record<string, SpriteIndexEntry>>>();
const imageCache = new Map<string, Promise<HTMLImageElement>>();

interface SpriteIndexEntry {
    width: number;
    height: number;
    x: number;
    y: number;
    pixelRatio: number;
    sdf?: boolean;
}

watch(
    () => props.entries,
    async (entries) => {
        const next: Record<string, string> = {};
        await Promise.all(entries.map(async (entry) => {
            if (entry.sprite === undefined) return;
            const key = spriteKey(entry);
            try {
                next[key] = await cropSprite(entry);
            } catch (error) {
                console.warn(`Could not load legend sprite ${entry.sprite.name}`, error);
            }
        }));
        spriteMarks.value = next;
    },
    { immediate: true, deep: true }
);

function spriteKey(entry: MapStyleLegendEntry): string {
    return entry.sprite === undefined
        ? `none:${entry.id}`
        : `${entry.sprite.url}:${entry.sprite.name}:${entry.sprite.tint ?? ""}`;
}

async function cropSprite(entry: MapStyleLegendEntry): Promise<string> {
    const sprite = entry.sprite!;
    const indexPromise = indexCache.get(sprite.url) ?? fetch(`${sprite.url}.json`).then(async (response) => {
        if (!response.ok) throw new Error(`Sprite index request failed (${response.status})`);
        return await response.json() as Record<string, SpriteIndexEntry>;
    });
    indexCache.set(sprite.url, indexPromise);
    const imagePromise = imageCache.get(sprite.url) ?? loadImage(`${sprite.url}.png`);
    imageCache.set(sprite.url, imagePromise);
    const [index, image] = await Promise.all([indexPromise, imagePromise]);
    const metadata = index[sprite.name];
    if (metadata === undefined) throw new Error(`Sprite image '${sprite.name}' is missing`);

    const canvas = document.createElement("canvas");
    canvas.width = metadata.width;
    canvas.height = metadata.height;
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("Canvas is unavailable");
    context.drawImage(
        image,
        metadata.x,
        metadata.y,
        metadata.width,
        metadata.height,
        0,
        0,
        metadata.width,
        metadata.height
    );
    if (metadata.sdf === true && sprite.tint !== undefined) {
        context.globalCompositeOperation = "source-in";
        context.fillStyle = sprite.tint;
        context.fillRect(0, 0, metadata.width, metadata.height);
    }
    return canvas.toDataURL("image/png");
}

async function loadImage(url: string): Promise<HTMLImageElement> {
    return await new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Sprite image request failed: ${url}`));
        image.src = url;
    });
}

function markStyle(entry: MapStyleLegendEntry): Record<string, string> {
    const background = entry.colors.length === 1
        ? entry.colors[0]
        : `linear-gradient(90deg, ${entry.colors.join(", ")})`;
    const style: Record<string, string> = {
        background,
        opacity: String(entry.opacity),
    };
    if (entry.kind === "circle" && entry.size !== undefined) {
        const diameter = `${Math.max(6, entry.size * 2)}px`;
        style.width = diameter;
        style.height = diameter;
    }
    if (entry.kind === "line" && entry.size !== undefined) {
        style.height = `${entry.size}px`;
    }
    return style;
}
</script>

<style scoped>
.map-style-legend {
    display: grid;
    gap: 0.35rem;
    margin: 0;
    padding: 0;
    list-style: none;
}

.map-style-legend-entry {
    display: grid;
    grid-template-columns: 2.75rem minmax(0, 1fr);
    align-items: center;
    gap: 0.7rem;
    min-height: 2.5rem;
    padding: 0.45rem 0.55rem;
    border: 1px solid rgb(148 163 184 / 0.16);
    border-radius: 0.4rem;
    background: rgb(15 23 42 / 0.12);
}

.map-style-legend-swatch {
    display: grid;
    width: 2.75rem;
    height: 2rem;
    place-items: center;
}

.map-style-legend-sprite {
    display: block;
    width: auto;
    max-width: 2.25rem;
    height: auto;
    max-height: 2rem;
    object-fit: contain;
}

.map-style-legend-mark {
    display: block;
    width: 1.65rem;
    height: 1rem;
    border: 1px solid rgb(15 23 42 / 0.22);
}

.map-style-legend-mark-circle {
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 9999px;
}

.map-style-legend-mark-line {
    width: 1.8rem;
    height: 3px;
    border: 0;
    border-radius: 9999px;
}

.map-style-legend-mark-symbol {
    width: 0.72rem;
    height: 0.72rem;
    border-radius: 0.15rem 0.15rem 0.15rem 50%;
    transform: rotate(-45deg);
}

.map-style-legend-mark-heatmap {
    width: 1.8rem;
    height: 0.7rem;
    border-radius: 9999px;
}

.map-style-legend-label {
    min-width: 0;
    overflow-wrap: anywhere;
    font-size: 0.8rem;
    line-height: 1.25;
    color: var(--ui-text);
}

.map-style-legend-copy {
    display: grid;
    gap: 0.12rem;
    min-width: 0;
}

.map-style-legend-member {
    overflow: hidden;
    font-size: 0.67rem;
    font-weight: 650;
    line-height: 1.1;
    color: var(--ui-text-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>

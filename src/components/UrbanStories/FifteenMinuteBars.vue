<template>
    <div class="grid gap-1" role="img" :aria-label="props.label" data-testid="fm-bars">
        <div v-for="row in props.rows" :key="row.key" class="grid gap-0.5" :data-testid="`fm-bar-${row.key}`" :data-highlight="row.highlight ? 'true' : undefined">
            <div class="flex items-baseline justify-between gap-2 text-xs">
                <span :class="row.highlight ? 'font-semibold text-highlighted' : 'text-muted'">{{ row.label }}</span>
                <span v-if="row.note !== undefined" class="text-xs text-muted">{{ row.note }}</span>
            </div>
            <div v-for="(value, index) in row.values" :key="index" class="grid grid-cols-[1fr_4.5rem] items-center gap-2 text-xs">
                <span class="h-2.5 overflow-hidden rounded-sm bg-elevated">
                    <span
                        class="block h-full rounded-sm"
                        :style="{ width: value.share === null ? '0%' : `${Math.max(value.share * 100, value.share > 0 ? 1 : 0)}%`, backgroundColor: value.color }"
                        :data-color="value.color"
                        data-testid="fm-bar-fill"
                    />
                </span>
                <span class="text-right tabular-nums" data-testid="fm-bar-text">{{ value.text }}</span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
export interface BarValue {
    /** 0–1 width of the bar; `null` = no value (an empty bar). */
    share: number | null
    color: string
    text: string
}

export interface BarRow {
    key: string
    label: string
    values: BarValue[]
    /** The row the reader is looking at. */
    highlight?: boolean
    note?: string
}

interface Props {
    rows: BarRow[]
    label: string
}

const props = defineProps<Props>();
</script>

<template>
    <div class="grid gap-1" role="img" :aria-label="props.label" data-testid="equity-bars">
        <div v-for="row in props.rows" :key="row.key" class="grid grid-cols-[7.5rem_1fr_auto] items-center gap-2 text-xs" data-testid="equity-bar-row">
            <span class="truncate text-muted" :title="row.label">{{ row.label }}</span>
            <span class="h-3.5 overflow-hidden rounded-sm bg-elevated">
                <span class="block h-full rounded-sm" :style="{ width: `${Math.max(row.share * 100, row.share > 0 ? 1 : 0)}%`, backgroundColor: row.color }" :data-color="row.color" />
            </span>
            <span class="tabular-nums">{{ row.text }}</span>
        </div>
    </div>
</template>

<script setup lang="ts">
export interface EquityBarRow {
    key: string
    label: string
    /** 0–1 width of the bar. */
    share: number
    color: string
    text: string
}

interface Props {
    rows: EquityBarRow[]
    label: string
}

const props = defineProps<Props>();
</script>

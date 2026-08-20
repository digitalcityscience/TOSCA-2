<template>
    <div class="layer-detail">
        <UCard class="workspace-layer-card bg-default/95 dark:bg-elevated/80" :ui="{ header: 'p-3 pb-2', body: 'p-3 pt-1', footer: 'p-3 pt-2' }">
            <template #header>
                <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0 space-y-1">
                        <p class="layer-card-title font-semibold text-highlighted capitalize">{{ props.title }}</p>
                        <div class="flex flex-wrap items-center gap-2">
                            <UBadge color="neutral" variant="soft" size="sm" :label="t('workspace.demo3d.badge')" />
                        </div>
                    </div>
                </div>
            </template>
            <div class="space-y-2">
                <p class="text-sm text-muted">{{ props.description }}</p>
            </div>
            <template #footer>
                <div class="flex justify-end gap-2 flex-wrap">
                    <UButton size="sm" @click="add2Map">{{ t('workspace.layerItem.addToMap') }}</UButton>
                </div>
            </template>
        </UCard>
    </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { createMapRuntimeId, useMapStore } from "@store/map";
import { useToast } from "@helpers/toast";

export interface Props {
    identifier: string
    title: string
    description: string
    tilesetUrl: string
}
const props = defineProps<Props>()
const { t } = useI18n();
const toast = useToast()
const mapStore = useMapStore()

function add2Map(): void {
    const runtimeId = createMapRuntimeId("layer", props.identifier)
    try {
        mapStore.addDeckTilesetLayer({
            identifier: runtimeId,
            displayName: props.title,
            tilesetUrl: props.tilesetUrl,
        })
    } catch (error) {
        toast.add({ severity: "error", summary: t("toast.error"), detail: error, life: 3000 })
    }
}
</script>

<style scoped>
.layer-card-title {
    min-width: 0;
    overflow-wrap: anywhere;
    line-height: 1.35;
}
</style>

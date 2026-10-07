<template>
    <div class="workspace-detail space-y-3 pt-1">
        <div v-if="isLoading" class="space-y-2">
            <USkeleton class="h-16 w-full rounded-md" />
            <USkeleton class="h-28 w-full rounded-md" />
            <USkeleton class="h-28 w-full rounded-md" />
        </div>
        <UAlert
            v-else-if="loadError !== ''"
            color="error"
            variant="soft"
            :description="loadError"
        >
            <template #actions>
                <UButton
                    :label="t('workspace.external.retry')"
                    icon="i-lucide-refresh-cw"
                    color="error"
                    variant="soft"
                    size="sm"
                    :loading="isLoading"
                    @click="loadCategory"
                />
            </template>
        </UAlert>
        <template v-else-if="detail !== undefined">
            <div class="flex items-start justify-between gap-3">
                <p v-if="detail.description !== ''" class="text-sm text-muted">{{ detail.description }}</p>
                <UBadge
                    class="shrink-0"
                    color="neutral"
                    variant="soft"
                    size="sm"
                    :label="t('workspace.external.category.itemCount', { count: detail.items.length })"
                />
            </div>
            <UAlert
                v-if="detail.items.length === 0"
                color="info"
                variant="soft"
                :description="t('workspace.external.category.noItems')"
            />
            <div v-else class="external-scroll-list space-y-2 pr-1">
                <ExternalCategoryItem
                    v-for="item in detail.items"
                    :key="item.id"
                    :item="item"
                    :source="sourceFor(item.service)"
                />
            </div>
        </template>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import type { ExternalDataSourceConfig } from "../../../config/externalDataSources";
import {
    useExternalDataSourcesStore,
    type ExternalCategorySummary,
} from "@store/externalDataSources";
import ExternalCategoryItem from "./ExternalCategoryItem.vue";

export interface Props {
    category: ExternalCategorySummary
}
const props = defineProps<Props>()
const { t } = useI18n()
const externalSources = useExternalDataSourcesStore()

const detail = computed(() => externalSources.categoryDetails[props.category.slug])
const isLoading = computed(() => externalSources.categoryLoading[props.category.slug] === true)
const loadError = computed(() => externalSources.categoryErrors[props.category.slug] ?? "")

function sourceFor(slug: string): ExternalDataSourceConfig | undefined {
    return externalSources.sources.find((source) => source.id === slug)
}

function loadCategory(): void {
    void externalSources.getExternalCategory(props.category.slug).catch(() => undefined)
}

onMounted(loadCategory)
</script>

<style scoped>
.external-scroll-list {
    max-height: 22rem;
    overflow-y: auto;
    overscroll-behavior: contain;
}
</style>

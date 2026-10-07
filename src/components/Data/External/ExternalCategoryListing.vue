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
            <UInput
                v-if="isLargeCategory"
                v-model="searchQuery"
                class="w-full"
                icon="i-lucide-search"
                :placeholder="t('workspace.external.searchPlaceholder')"
            />
            <UAlert
                v-if="filteredItems.length === 0 && detail.items.length > 0"
                color="neutral"
                variant="soft"
                :description="t('workspace.external.noResults')"
            />
            <div v-else-if="isLargeCategory" class="external-scroll-list space-y-2 pr-1">
                <section v-for="group in groupedItems" :key="group.key" class="category-group">
                    <UButton
                        class="w-full justify-between"
                        color="neutral"
                        variant="soft"
                        :trailing-icon="isGroupOpen(group.key) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                        :label="`${group.title} (${group.items.length.toLocaleString(locale)})`"
                        :aria-expanded="isGroupOpen(group.key)"
                        @click="toggleGroup(group.key)"
                    />
                    <div v-if="isGroupOpen(group.key)" class="space-y-2 pt-2">
                        <ExternalCategoryItem
                            v-for="item in visibleGroupItems(group)"
                            :key="item.id"
                            :item="item"
                            :source="sourceFor(item.service)"
                        />
                        <div v-if="remainingInGroup(group) > 0" class="flex justify-center">
                            <UButton
                                size="sm"
                                color="neutral"
                                variant="ghost"
                                :label="t('workspace.external.showMore', { count: remainingInGroup(group) })"
                                @click="showMore(group.key)"
                            />
                        </div>
                    </div>
                </section>
            </div>
            <div v-else class="external-scroll-list space-y-2 pr-1">
                <ExternalCategoryItem
                    v-for="item in filteredItems"
                    :key="item.id"
                    :item="item"
                    :source="sourceFor(item.service)"
                />
            </div>
        </template>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { ExternalDataSourceConfig } from "../../../config/externalDataSources";
import {
    useExternalDataSourcesStore,
    type ExternalCategorySummary,
    type ExternalCategoryItem as ExternalCategoryItemType,
} from "@store/externalDataSources";
import ExternalCategoryItem from "./ExternalCategoryItem.vue";

export interface Props {
    category: ExternalCategorySummary
}
const props = defineProps<Props>()
const { t, locale } = useI18n()
const externalSources = useExternalDataSourcesStore()

const detail = computed(() => externalSources.categoryDetails[props.category.slug])
const isLoading = computed(() => externalSources.categoryLoading[props.category.slug] === true)
const loadError = computed(() => externalSources.categoryErrors[props.category.slug] ?? "")
const searchQuery = ref("")
const openGroups = ref(new Set<string>())
const visibleCounts = ref<Record<string, number>>({})
const LARGE_CATEGORY_SIZE = 20
const GROUP_PAGE_SIZE = 20

interface CategoryGroup {
    key: string
    title: string
    items: ExternalCategoryItemType[]
}

function itemSubtitle(item: ExternalCategoryItemType): string {
    if (item.service_type === "ogc_api_features") return item.ogc?.dataset_title ?? ""
    return item.sensorthings?.service_name ?? ""
}

const isLargeCategory = computed(() => (detail.value?.items.length ?? 0) > LARGE_CATEGORY_SIZE)
const filteredItems = computed(() => {
    const items = detail.value?.items ?? []
    const query = searchQuery.value.trim().toLocaleLowerCase(locale.value)
    if (query === "") return items
    return items.filter((item) => [item.title, item.description, itemSubtitle(item)]
        .some((value) => value.toLocaleLowerCase(locale.value).includes(query)))
})
const groupedItems = computed<CategoryGroup[]>(() => {
    const groups = new Map<string, CategoryGroup>()
    for (const item of filteredItems.value) {
        const title = itemSubtitle(item) || sourceFor(item.service)?.title || t("workspace.external.category.otherGroup")
        const key = `${item.service_type}:${title}`
        const group = groups.get(key) ?? { key, title, items: [] }
        group.items.push(item)
        groups.set(key, group)
    }
    return [...groups.values()]
})

watch(groupedItems, (groups) => {
    if (!isLargeCategory.value || groups.length === 0) return
    const visibleKeys = new Set(groups.map((group) => group.key))
    const next = new Set([...openGroups.value].filter((key) => visibleKeys.has(key)))
    if (next.size === 0) next.add(groups[0].key)
    openGroups.value = next
}, { immediate: true })

function isGroupOpen(key: string): boolean {
    return openGroups.value.has(key)
}

function toggleGroup(key: string): void {
    const next = new Set(openGroups.value)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    openGroups.value = next
}

function visibleGroupItems(group: CategoryGroup): ExternalCategoryItemType[] {
    return group.items.slice(0, visibleCounts.value[group.key] ?? GROUP_PAGE_SIZE)
}

function remainingInGroup(group: CategoryGroup): number {
    return Math.max(0, group.items.length - visibleGroupItems(group).length)
}

function showMore(key: string): void {
    visibleCounts.value = {
        ...visibleCounts.value,
        [key]: (visibleCounts.value[key] ?? GROUP_PAGE_SIZE) + GROUP_PAGE_SIZE,
    }
}

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
.category-group {
    border-radius: 0.375rem;
}
</style>

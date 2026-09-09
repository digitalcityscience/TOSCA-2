<template>
    <UCard
        variant="subtle"
        :ui="{ body: 'p-3 sm:p-3' }"
    >
        <div class="grid gap-3">
            <div v-if="hasActiveFilters" class="flex justify-end">
                <UBadge color="primary" variant="subtle">
                    {{ t("events.filters.filtered") }}
                </UBadge>
            </div>

            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <UFormField :label="t('events.filters.startAfter')">
                    <UInput v-model="startAfter" type="datetime-local" class="w-full" :min="minDateTime" />
                </UFormField>
                <UFormField :label="t('events.filters.startBefore')">
                    <UInput v-model="startBefore" type="datetime-local" class="w-full" :min="minDateTime" />
                </UFormField>
            </div>

            <UFormField :label="t('events.filters.eventType')">
                <USelect
                    v-model="eventTypeId"
                    class="w-full"
                    :items="eventTypeItems"
                    :placeholder="t('events.filters.allEventTypes')"
                    @update:model-value="handleEventTypeChange"
                />
            </UFormField>

            <UCollapsible>
                <template #default="{ open }">
                    <UButton
                        block
                        color="neutral"
                        variant="ghost"
                        :trailing-icon="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                        class="justify-between"
                    >
                        <span class="flex items-center gap-2">
                            <UIcon name="i-lucide-tags" class="size-4" />
                            {{ t("events.filters.categoryFilters") }}
                        </span>
                    </UButton>
                </template>
                <template #content>
                    <div class="grid gap-3 border-t border-muted pt-3">
                        <div
                            v-for="(categoryFilter, index) in categoryFilters"
                            :key="categoryFilter.id"
                            class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2"
                        >
                            <UFormField :label="t('events.filters.category')">
                                <USelect
                                    v-model="categoryFilter.dimensionCode"
                                    class="w-full"
                                    :items="dimensionItems"
                                    :placeholder="t('events.filters.anyCategory')"
                                    @update:model-value="categoryFilter.termCode = ''"
                                />
                            </UFormField>
                            <UFormField :label="t('events.filters.value')">
                                <USelect
                                    v-model="categoryFilter.termCode"
                                    class="w-full"
                                    :items="termItemsFor(categoryFilter.dimensionCode)"
                                    :placeholder="t('events.filters.anyValue')"
                                    :disabled="termItemsFor(categoryFilter.dimensionCode).length === 0"
                                />
                            </UFormField>
                            <UButton
                                :aria-label="t('events.filters.removeCategory')"
                                icon="i-lucide-trash-2"
                                color="neutral"
                                variant="ghost"
                                square
                                @click="removeCategoryFilter(index)"
                            />
                        </div>
                        <UButton
                            :label="t('events.filters.addCategory')"
                            icon="i-lucide-plus"
                            color="neutral"
                            variant="outline"
                            size="sm"
                            class="w-fit"
                            @click="addCategoryFilter"
                        />
                    </div>
                </template>
            </UCollapsible>

            <div class="flex justify-end gap-2">
                <UButton
                    :label="t('common.reset')"
                    icon="i-lucide-filter-x"
                    color="neutral"
                    variant="outline"
                    size="sm"
                    :loading="loading"
                    @click="resetFilters"
                />
                <UButton
                    :label="t('common.apply')"
                    icon="i-lucide-filter"
                    size="sm"
                    :loading="loading"
                    @click="applyFilters"
                />
            </div>
        </div>
    </UCard>
</template>

<script setup lang="ts">
import bbox from "@turf/bbox";
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { type EventFilters, useEventsStore } from "@store/events";
import { useMapStore } from "@store/map";
import { useToast } from "@helpers/toast";

const events = useEventsStore();
const { t } = useI18n();
const mapStore = useMapStore();
const toast = useToast();

const minDateTime = toDatetimeLocal(new Date().toISOString());
const startAfter = ref(toDatetimeLocal(events.filters.start_after));
const startBefore = ref(toDatetimeLocal(events.filters.start_before));
const eventTypeId = ref(events.filters.event_type_id ?? "");
const profileKey = ref(events.filters.profile_key ?? "public_health");
interface CategoryFilterRow {
    id: number;
    dimensionCode: string;
    termCode: string;
}
let nextCategoryFilterId = 0;
const initialDimensions = toStringArray(events.filters.dimension_code);
const initialTerms = toStringArray(events.filters.term_code);
const categoryFilters = ref<CategoryFilterRow[]>(
    initialDimensions.length === 0
        ? [createCategoryFilter()]
        : initialDimensions.map((dimensionCode, index) => {
            return createCategoryFilter(dimensionCode, initialTerms[index] ?? "");
        })
);
const loading = computed(() => events.loadingList || events.loadingMap || events.loadingRegistries);

const taxonomyRegistry = computed(() => {
    return events.taxonomyRegistriesByProfile[profileKey.value];
});
const taxonomyDimensions = computed(() => taxonomyRegistry.value?.dimensions ?? []);
const eventTypeItems = computed(() => [
    ...events.eventTypes.map((eventType) => ({
        label: eventType.label,
        value: eventType.id,
    })),
]);
const dimensionItems = computed(() => [
    ...taxonomyDimensions.value.map((dimension) => ({
        label: dimension.label,
        value: dimension.code,
    })),
]);
const hasActiveFilters = computed(() => {
    return startAfter.value !== "" ||
        startBefore.value !== "" ||
        eventTypeId.value !== "" ||
        categoryFilters.value.some((filter) => filter.dimensionCode !== "" || filter.termCode !== "");
});

onMounted(() => {
    const registryRequests: Array<Promise<unknown>> = [events.loadEventTypes()];
    if (profileKey.value !== "") {
        registryRequests.push(events.loadEventTaxonomy(profileKey.value));
    }
    Promise.all(registryRequests).catch(showError);
});

watch(profileKey, (nextProfileKey) => {
    if (nextProfileKey !== "") {
        events.loadEventTaxonomy(nextProfileKey).catch(showError);
    }
});

async function applyFilters(): Promise<void> {
    const completeCategoryFilters = categoryFilters.value.filter((filter) => {
        return filter.dimensionCode !== "" && filter.termCode !== "";
    });
    const filters: EventFilters = {
        event_type_id: emptyToUndefined(eventTypeId.value),
        profile_key: emptyToUndefined(profileKey.value),
        dimension_code: emptyArrayToUndefined(completeCategoryFilters.map((filter) => filter.dimensionCode)),
        term_code: emptyArrayToUndefined(completeCategoryFilters.map((filter) => filter.termCode)),
        start_after: datetimeLocalToIso(startAfter.value),
        start_before: datetimeLocalToIso(startBefore.value),
    };
    events.setFilters(filters);
    try {
        await events.loadEvents();
        fitMapToEvents();
    } catch {
        showError();
    }
}

async function resetFilters(): Promise<void> {
    startAfter.value = "";
    startBefore.value = "";
    eventTypeId.value = "";
    profileKey.value = "";
    categoryFilters.value = [createCategoryFilter()];
    events.setFilters({});
    try {
        await events.loadEvents();
        fitMapToEvents();
    } catch {
        showError();
    }
}

function handleEventTypeChange(): void {
    const selectedEventType = events.eventTypes.find((eventType) => {
        return eventType.id === eventTypeId.value;
    });
    const nextProfileKey = selectedEventType?.profile_key ?? "";
    if (nextProfileKey !== profileKey.value) {
        categoryFilters.value = [createCategoryFilter()];
    }
    profileKey.value = nextProfileKey;
}

function emptyToUndefined(value: string): string | undefined {
    const trimmedValue = value.trim();
    return trimmedValue === "" ? undefined : trimmedValue;
}

function emptyArrayToUndefined(value: string[]): string[] | undefined {
    return value.length === 0 ? undefined : value;
}

function toStringArray(value?: string | string[]): string[] {
    if (value === undefined) {
        return [];
    }
    return Array.isArray(value) ? value : [value];
}

function termItemsFor(dimensionCode: string): Array<{ label: string; value: string }> {
    const terms = dimensionCode === ""
        ? []
        : taxonomyDimensions.value.find((dimension) => dimension.code === dimensionCode)?.terms ?? [];
    return terms.map((term) => ({ label: term.label, value: term.code }));
}

function addCategoryFilter(): void {
    categoryFilters.value.push(createCategoryFilter());
}

function removeCategoryFilter(index: number): void {
    categoryFilters.value.splice(index, 1);
}

function createCategoryFilter(dimensionCode = "", termCode = ""): CategoryFilterRow {
    return { id: nextCategoryFilterId++, dimensionCode, termCode };
}

function datetimeLocalToIso(value: string): string | undefined {
    if (value === "") {
        return undefined;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function toDatetimeLocal(value?: string): string {
    if (value === undefined || value === "") {
        return "";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "";
    }
    const offsetMs = date.getTimezoneOffset() * 60 * 1000;
    return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function showError(): void {
    toast.add({
        severity: "warning",
        summary: t("events.filters.errorTitle"),
        detail: t("events.filters.errorDetail"),
        life: 4000,
    });
}

function fitMapToEvents(): void {
    if (mapStore.map === undefined || events.spatialEvents.features.length === 0) {
        return;
    }

    const bounds = bbox(events.spatialEvents);
    if (!bounds.every(Number.isFinite)) {
        return;
    }

    const [minLng, minLat, maxLng, maxLat] = bounds;
    if (minLng === maxLng && minLat === maxLat) {
        mapStore.map.flyTo({
            center: [minLng, minLat],
            zoom: 14,
            essential: true,
        });
        return;
    }

    mapStore.map.fitBounds(bounds, {
        padding: 80,
        maxZoom: 14,
    });
}
</script>
